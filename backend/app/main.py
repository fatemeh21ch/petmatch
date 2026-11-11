import json
import os
import secrets
import statistics
import threading
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import ai, feeding, kb, pipeline
from .search import (Intent, apply_profile, explain_facts, filter_products, fuzzy_fallback, intent_dict, offer_view,
                     parse_rules, rank)

FRONTEND = Path(__file__).resolve().parents[2] / "frontend"
ADMIN_TOKEN = os.environ.get("PETMATCH_ADMIN_TOKEN", "petmatch-admin")

app = FastAPI(title="PetMatch API", version="1.0")
_lock = threading.Lock()
STATE = {"catalog": pipeline.build_catalog()}


def catalog():
    return STATE["catalog"]


def rebuild():
    with _lock:
        STATE["catalog"] = pipeline.build_catalog()


# ------------------------------------------------------------------ helpers
class Pet(BaseModel):
    species: str | None = None
    age_months: int | None = Field(None, ge=0, le=400)
    weight_kg: float | None = Field(None, gt=0, le=120)
    allergies: list[str] = []
    sterilised: bool = False


def pet_from_query(pet: str | None) -> dict | None:
    if not pet:
        return None
    try:
        return Pet(**json.loads(pet)).model_dump()
    except Exception:
        raise HTTPException(400, "invalid pet profile")


def from_ai(d: dict, base: Intent) -> Intent:
    none = lambda v: None if v in ("none", 0, "") else v
    amount = none(d["amount_grams_or_ml"])
    return Intent(species=none(d["species"]), type=none(d["type"]), stage=none(d["stage"]), brand=none(d["brand"]),
                  sizes=d["sizes"], flavors=d["flavors"], variants=d["variants"], lines=d["lines"],
                  exclude_flavors=d["exclude_flavors"], grain_free=d["grain_free"],
                  amount=amount, unit=(base.unit or "g") if amount else None,
                  max_price=none(d["max_price_toman"]), sort=d["sort"], source="ai")


def chips(it: Intent):
    out = []
    L = kb.FA_LABEL
    if it.species: out.append(("species", L[it.species], "species" in it.from_profile))
    if it.type: out.append(("type", L[it.type], False))
    if it.brand: out.append(("brand", kb.BRAND_FA[it.brand], False))
    if it.stage: out.append(("stage", L[it.stage], False))
    for s in it.sizes: out.append(("size", L[s], False))
    grouped = {g for kind, g in it.groups if kind == "flavor"}
    shown = set()
    for g in grouped:
        members = kb.FLAVOR_GROUPS[g]
        out.append(("flavor", f"طعم {L[g]} ({'، '.join(L[m] for m in sorted(members))})", False))
        shown |= members
    for f in it.flavors:
        if f not in shown: out.append(("flavor", "طعم " + L[f], False))
    for v in it.variants: out.append(("variant", L[v], False))
    for l in it.lines: out.append(("line", L.get(l, l), False))
    if it.grain_free: out.append(("grain_free", "بدون غلات", False))
    if it.amount: out.append(("amount", pipeline.fmt_qty(it.amount, it.unit), False))
    ex_groups = {g for kind, g in it.groups if kind == "exclude"}
    ex_shown = set()
    for g in ex_groups:
        out.append(("exclude", f"بدون {L[g]}", False))
        ex_shown |= kb.FLAVOR_GROUPS[g]
    for f in it.exclude_flavors:
        if f not in ex_shown: out.append(("exclude", "بدون " + L[f], f"exclude:{f}" in it.from_profile))
    if it.max_price: out.append(("max_price", f"تا {it.max_price:,} تومان", False))
    sort_fa = {"monthly": "کمترین هزینه ماهانه", "cheapest": "ارزان‌ترین قیمت نهایی", "unit_price": "ارزان‌ترین قیمت هر کیلو", "rating": "معتبرترین فروشنده"}
    if it.sort in sort_fa: out.append(("sort", sort_fa[it.sort], False))
    return [dict(key=k, label=l, from_profile=p) for k, l, p in out]


def card(row):
    p, b, c = row["product"], row["best"], row["cheapest"]
    hist = _daily_min(p)
    return dict(
        id=p["id"], name_fa=p["name_fa"], name_en=p["name_en"], brand=p["brand"], brand_fa=p["brand_fa"],
        brand_en=kb.BRANDS.get(p["brand"]), qty_label=p["qty_label"],
        type=p["type"], species=p["species"], unit=p["unit"], offers_count=len(p["offers"]),
        available_count=sum(o["available"] for o in p["offers"]),
        best=_offer_brief(b), cheapest=_offer_brief(c), value=row.get("value"), parts=row.get("parts"),
        relevance=row.get("relevance"), fit_notes=row.get("fit_notes", []), caveat=row.get("caveat"),
        trend=_trend(hist), feeding=row.get("feeding"),
    )


def _offer_brief(o):
    if not o:
        return None
    return {k: o[k] for k in ("listing_id", "seller", "seller_id", "seller_rating", "seller_verified", "price",
                              "shipping", "total", "unit_price", "age_hours", "url")}


def _daily_min(p):
    days = {}
    for o in p["offers"]:
        if o["anomaly"]:
            continue  # a suspicious price would distort the market trend
        for d, price in o["history"]:
            days[d] = min(days.get(d, price), price)
    return sorted(days.items())


def _trend(hist):
    if len(hist) < 31:
        return None
    now, before = hist[-1][1], hist[-31][1]
    return round((now - before) / before * 100, 1)


def run_search(q: str, sort: str | None, pet: dict | None, use_ai: bool = True):
    cat = catalog()
    products = list(cat["products"].values())
    it = parse_rules(q)
    ai_used = False
    if use_ai and it.unknown and ai.available():
        parsed = ai.parse_intent(q)
        if parsed:
            it, ai_used = from_ai(parsed, it), True
    if sort:
        it.sort = sort
    understood = it.understood()   # before the pet profile adds its own constraints
    prefs = apply_profile(it, pet)
    if not understood and q.strip():
        # nothing recognised: an empty intent would match the entire catalog, which is misleading
        hits, relaxed = fuzzy_fallback(products, q), []
    else:
        hits, relaxed = filter_products(products, it)
        if not hits:
            hits, relaxed = fuzzy_fallback(products, q), ["همه معیارها"]
    rows = rank(hits, it, prefs, pet)
    return it, prefs, relaxed, rows, ai_used


# ------------------------------------------------------------------ public API
@app.get("/api/v1/search")
def search(q: str = Query("", max_length=200), sort: str | None = Query(None, pattern="^(best|cheapest|unit_price|rating|monthly)$"),
           pet: str | None = Query(None, max_length=500)):
    pet_d = pet_from_query(pet)
    it, prefs, relaxed, rows, ai_used = run_search(q, sort, pet_d)
    facts = explain_facts(rows, it)
    return dict(query=q, intent=intent_dict(it), chips=chips(it), prefs=prefs, relaxed=relaxed, ai_used=ai_used,
                not_understood=bool(q.strip()) and not it.understood() and not it.from_profile,
                feeding_available=bool(feeding.daily_need(pet_d)),
                pet_needs_weight=bool(pet_d) and not (pet_d or {}).get("weight_kg"),
                ai_available=ai.available(), total=len(rows), results=[card(r) for r in rows[:60]],
                top_pick=dict(id=rows[0]["product"]["id"], reasons=facts["reasons"]) if facts else None)


@app.get("/api/v1/explain")
def explain(q: str = Query("", max_length=200), sort: str | None = Query(None, pattern="^(best|cheapest|unit_price|rating|monthly)$"),
            pet: str | None = Query(None, max_length=500)):
    it, prefs, relaxed, rows, _ = run_search(q, sort, pet_from_query(pet))
    facts = explain_facts(rows, it)
    return dict(text=ai.explain(q, facts), reasons=(facts or {}).get("reasons", []))


@app.get("/api/v1/home")
def home():
    cat = catalog()
    products = list(cat["products"].values())
    counts = {}
    for p in products:
        counts[(p["species"], p["type"])] = counts.get((p["species"], p["type"]), 0) + 1
    deals = []
    for p in products:
        live = [o for o in p["offers"] if o["available"] and not o["anomaly"] and not o["stale"]]
        if len(live) >= 2:
            lo, med = min(o["total"] for o in live), statistics.median(o["total"] for o in live)
            deals.append((med - lo) / med if med else 0)
        else:
            deals.append(-1)
    order = sorted(range(len(products)), key=lambda i: -deals[i])[:10]
    rows = []
    for i in order:
        p = products[i]
        best, cheapest, caveat = offer_view(p)
        rows.append(card(dict(product=p, best=best, cheapest=cheapest, caveat=caveat)))
        rows[-1]["saving_pct"] = round(deals[i] * 100)
    popular = sorted(products, key=lambda p: (-sum(o["available"] for o in p["offers"]), p["name_fa"]))[:10]
    pop_rows = [card(dict(product=p, **dict(zip(("best", "cheapest", "caveat"), offer_view(p))))) for p in popular]
    brands = {}
    for p in products:
        brands[p["brand"]] = brands.get(p["brand"], 0) + 1
    return dict(popular=pop_rows, max_saving=max((r["saving_pct"] for r in rows), default=0),
                brands=[dict(key=k, fa=kb.BRAND_FA[k], en=kb.BRANDS[k], count=n) for k, n in sorted(brands.items(), key=lambda x: -x[1])],
                categories=[dict(species=s, type=t, label=f"{kb.FA_LABEL[t]} {kb.FA_LABEL[s]}", count=n)
                            for (s, t), n in sorted(counts.items(), key=lambda x: -x[1])],
                deals=rows, stats=dict(products=len(products), sellers=len(cat["sellers"]),
                                       offers=sum(len(p["offers"]) for p in products)),
                ai_available=ai.available())


@app.get("/api/v1/nav")
def nav():
    """Menus are built from the catalog, so both animals follow the same structure and a menu
    entry only exists when there are products behind it (no dog litter, no cat body sizes)."""
    products = list(catalog()["products"].values())
    out = {}
    for sp, sp_fa in (("cat", "گربه"), ("dog", "سگ")):
        ps = [p for p in products if p["species"] == sp]
        young = "kitten" if sp == "cat" else "puppy"
        young_fa = "بچه‌گربه" if sp == "cat" else "توله‌سگ"
        food = [p for p in ps if p["type"] in ("dry", "wet")]
        groups = [
            ("نوع محصول", [(t, lbl, lbl, sum(p["type"] == t for p in ps))
                           for t, lbl in (("dry", f"غذای خشک {sp_fa}"), ("wet", f"غذای تر {sp_fa}"),
                                          ("treat", f"تشویقی {sp_fa}"), ("litter", f"خاک {sp_fa}"))]),
            ("سن", [(sp, f"غذای {young_fa}", f"غذای {young_fa}", sum(p["stage"] in (young, "junior") for p in food)),
                    (sp, f"غذای {sp_fa} بالغ", f"غذای {sp_fa} بالغ", sum(p["stage"] == "adult" for p in food))]),
        ]
        if sp == "dog":
            groups.append(("جثه", [("dog", f"نژاد {lbl}", f"غذای سگ نژاد {lbl}", sum(s in p["size"] for p in ps))
                                   for s, lbl in (("mini", "کوچک"), ("medium", "متوسط"), ("large", "بزرگ"))]))
        else:
            groups.append(("شرایط", [("cat", "گربه عقیم‌شده", "غذای گربه عقیم", sum("sterilised" in p["line"] for p in food)),
                                     ("cat", "گربه آپارتمانی", "غذای گربه آپارتمانی", sum("indoor" in p["line"] for p in food))]))
        out[sp] = [dict(title=g, items=[dict(icon=i, label=l, q=q, count=n) for i, l, q, n in items if n])
                   for g, items in groups if any(n for *_, n in items)]
    brands = {}
    for p in products:
        brands[p["brand"]] = brands.get(p["brand"], 0) + 1
    main_type = {p["brand"]: p["type"] for p in products}
    out["brands"] = [dict(title="پرمحصول‌ترین برندها",
                          items=[dict(icon=main_type[k], label=kb.BRAND_FA[k], q=kb.BRAND_FA[k], count=n)
                                 for k, n in sorted(brands.items(), key=lambda x: -x[1])[:6]])]
    return out


@app.get("/api/v1/products/{pid}")
def product(pid: str, pet: str | None = Query(None, max_length=500)):
    p = catalog()["products"].get(pid)
    if not p:
        raise HTTPException(404, "not found")
    pet_d = pet_from_query(pet)
    best, cheapest, caveat = offer_view(p)
    offers = sorted(p["offers"], key=lambda o: (not o["available"], o["anomaly"] is not None, o["stale"], o["total"]))
    hist = _daily_min(p)
    prices = [h[1] for h in hist]
    return dict(
        product={k: p[k] for k in ("id", "name_fa", "name_en", "brand", "brand_fa", "qty_label", "species", "type", "stage",
                                   "size", "flavor", "variant", "line", "grain_free", "unit")},
        feeding=feeding.estimate(pet_d, p, best),
        feeding_for_offers={o["listing_id"]: feeding.estimate(pet_d, p, o)["monthly_cost"]
                            for o in p["offers"] if o["available"] and feeding.estimate(pet_d, p, o)},
        pet_needs_weight=bool(pet_d) and not (pet_d or {}).get("weight_kg") and p["type"] in ("dry", "wet"),
        brand_en=kb.BRANDS.get(p["brand"]), best_id=best and best["listing_id"], cheapest_id=cheapest and cheapest["listing_id"], caveat=caveat,
        offers=[{k: o[k] for k in o if k not in ("history",)} for o in offers],
        history=hist, history_stats=dict(min=min(prices), max=max(prices), now=prices[-1]) if prices else None,
        attributes=[(kb.FA_LABEL.get(x, x)) for x in [p["stage"], *p["size"], *p["flavor"], *p["variant"], *p["line"]] if x]
        + (["بدون غلات"] if p["grain_free"] else []),
    )


class Report(BaseModel):
    listing_id: str = Field(max_length=20)
    reason: str = Field(max_length=40)


@app.post("/api/v1/reports", status_code=201)
def report(r: Report):
    if r.listing_id not in catalog()["listings"]:
        raise HTTPException(404, "unknown listing")
    path = pipeline.DATA / "reports.json"
    items = json.loads(path.read_text("utf-8")) if path.exists() else []
    items.append(dict(listing_id=r.listing_id, reason=r.reason, at=datetime.now(timezone.utc).isoformat(timespec="seconds")))
    path.write_text(json.dumps(items[-500:], ensure_ascii=False, indent=1), "utf-8")
    return {"ok": True}


# ------------------------------------------------------------------ admin API (server-side access control)
def require_admin(x_admin_token: str = Header("")):
    if not secrets.compare_digest(x_admin_token, ADMIN_TOKEN):
        raise HTTPException(401, "admin token required")


@app.get("/api/v1/admin/pipeline", dependencies=[Depends(require_admin)])
def admin_pipeline():
    cat = catalog()
    prods = cat["products"]
    review = []
    for r in cat["review"]:
        L = r["listing"]
        review.append(dict(listing_id=L["id"], seller=cat["sellers"][L["seller"]]["name"], title=L["title"],
                           price=L["price"], score=r["score"], reasons=r["reasons"],
                           attrs={k: L["attrs"][k] for k in ("brand", "species", "type", "stage", "line", "numbers",
                                                              "flavor", "variant", "amount", "unit")},
                           candidates=[dict(pid=c["pid"], score=c["score"], name=prods[c["pid"]]["name_fa"],
                                            offers=len(prods[c["pid"]]["offers"]),
                                            titles=[o["raw_title"] for o in prods[c["pid"]]["offers"][:3]])
                                       for c in r["candidates"]]))
    samples = []
    for L in list(cat["listings"].values())[::7][:14]:
        a = L["attrs"]
        samples.append(dict(seller=cat["sellers"][L["seller"]]["name"], raw=L["title"], extra=L["extra"],
                            raw_price=_raw_price(L), price=L["price"], normalized=a["normalized"],
                            attrs={k: a[k] for k in ("brand", "species", "type", "stage", "amount", "unit")},
                            inferred=a["inferred"], decision=cat["log"][L["id"]]["decision"]))
    reports_path = pipeline.DATA / "reports.json"
    return dict(stats=cat["stats"], review=review, blocked=cat["blocked"][:12], samples=samples,
                sellers=list(cat["sellers"].values()), thresholds=dict(auto=pipeline.AUTO_MERGE, review=pipeline.REVIEW),
                reports=json.loads(reports_path.read_text("utf-8"))[-10:] if reports_path.exists() else [])


def _raw_price(L):
    r = L["raw"]
    for k in ("price_toman", "price_irr", "price"):
        if k in r:
            v = r[k]
            return f'{v["amount"]} {v["currency"]}' if isinstance(v, dict) else f"{v}" + (" ریال" if k == "price_irr" else "")
    return ""


class Decision(BaseModel):
    listing_id: str = Field(max_length=20)
    action: str = Field(pattern="^(approve|reject)$")
    product_id: str | None = Field(None, max_length=16)


@app.post("/api/v1/admin/decisions", dependencies=[Depends(require_admin)])
def decide(d: Decision):
    if d.listing_id not in catalog()["listings"]:
        raise HTTPException(404, "unknown listing")
    if d.action == "approve" and d.product_id not in catalog()["products"]:
        raise HTTPException(400, "unknown product")
    decisions = json.loads(pipeline.DECISIONS.read_text("utf-8")) if pipeline.DECISIONS.exists() else {}
    decisions[d.listing_id] = dict(action=d.action, product_id=d.product_id,
                                   at=datetime.now(timezone.utc).isoformat(timespec="seconds"))
    pipeline.DECISIONS.write_text(json.dumps(decisions, indent=1), "utf-8")
    rebuild()
    return {"ok": True, "stats": catalog()["stats"]}


@app.post("/api/v1/admin/reset", dependencies=[Depends(require_admin)])
def reset():
    if pipeline.DECISIONS.exists():
        pipeline.DECISIONS.unlink()
    rebuild()
    return {"ok": True}


# ------------------------------------------------------------------ frontend
app.mount("/static", StaticFiles(directory=FRONTEND), name="static")


@app.get("/")
def index():
    return FileResponse(FRONTEND / "index.html")
