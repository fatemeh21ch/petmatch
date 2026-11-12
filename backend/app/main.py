import json
import secrets
import statistics
import threading
from datetime import datetime, timezone

from fastapi import Cookie, Depends, FastAPI, HTTPException, Query, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from . import ai, analytics, auth, feeding, kb, pipeline
from .search import (Intent, apply_profile, explain_facts, filter_products, fuzzy_fallback, intent_dict, offer_view,
                     parse_rules, rank)

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
    analytics.log_search(q, len(rows), it.understood())
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
def product(pid: str, pet: str | None = Query(None, max_length=500), track: bool = False):
    p = catalog()["products"].get(pid)
    if not p:
        raise HTTPException(404, "not found")
    pet_d = pet_from_query(pet)
    best, cheapest, caveat = offer_view(p)
    if track:
        for o in p["offers"]:
            analytics.record("view", o["listing_id"])
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


# ------------------------------------------------------------------ auth (phone + OTP)
class OtpRequest(BaseModel):
    phone: str = Field(max_length=20)


class OtpVerify(BaseModel):
    phone: str = Field(max_length=20)
    code: str = Field(max_length=8)


class Signup(BaseModel):
    phone: str = Field(max_length=20)
    name: str = Field(min_length=2, max_length=40)
    role: str = Field(pattern="^(buyer|seller)$")   # admins are never created from the public form
    store_name: str | None = Field(None, max_length=40)
    website: str | None = Field(None, max_length=80)


@app.get("/api/v1/auth/demo-accounts")
def demo_accounts():
    """Only exposed in demo mode: lets the login page offer one-click autofill per role."""
    if not auth.DEMO_MODE:
        return []
    return [auth.public_user(u) for u in auth.DEMO_ACCOUNTS]


@app.post("/api/v1/auth/otp/request")
def otp_request(r: OtpRequest):
    phone = auth.normalize_phone(r.phone)
    if not auth.get_user(phone):
        raise HTTPException(404, "با این شماره ثبت‌نام نکرده‌اید")
    return auth.request_otp(phone, "login")


@app.post("/api/v1/auth/signup")
def signup(s: Signup):
    phone = auth.normalize_phone(s.phone)
    if auth.get_user(phone):
        raise HTTPException(409, "این شماره قبلاً ثبت‌نام کرده؛ وارد شوید")
    if s.role == "seller" and not (s.store_name or "").strip():
        raise HTTPException(422, "نام فروشگاه را وارد کنید")
    if s.website and not s.website.startswith("https://"):
        raise HTTPException(422, "آدرس سایت باید با https:// شروع شود")
    return auth.request_otp(phone, "signup", s.model_dump())


@app.post("/api/v1/auth/otp/verify")
def otp_verify(v: OtpVerify, response: Response):
    phone = auth.normalize_phone(v.phone)
    out = auth.verify_otp(phone, v.code)
    response.set_cookie(auth.COOKIE, out["token"], max_age=auth.SESSION_TTL, httponly=True, samesite="lax", path="/")
    return {"user": out["user"]}


class DemoLogin(BaseModel):
    phone: str = Field(max_length=20)


@app.post("/api/v1/auth/demo-login")
def demo_login(d: DemoLogin, response: Response):
    out = auth.demo_login(auth.normalize_phone(d.phone))
    response.set_cookie(auth.COOKIE, out["token"], max_age=auth.SESSION_TTL, httponly=True, samesite="lax", path="/")
    return {"user": out["user"]}


@app.get("/api/v1/auth/me")
def me(user: dict | None = Depends(auth.current_user)):
    return {"user": auth.public_user(user) if user else None}


@app.post("/api/v1/auth/logout")
def logout(response: Response, pm_session: str | None = Cookie(None)):
    auth.logout(pm_session)
    response.delete_cookie(auth.COOKIE, path="/")
    return {"ok": True}


# ------------------------------------------------------------------ outbound clicks & demo store page
@app.get("/api/v1/go/{listing_id}")
def go(listing_id: str):
    """Every "buy" click passes through here so it can be counted (the seller dashboard's clicks).
    In production this redirects to the shop's real URL; the demo has fictional shops, so it opens
    a demo store page instead."""
    L = catalog()["listings"].get(listing_id)
    if not L:
        raise HTTPException(404, "unknown listing")
    analytics.record("click", listing_id)
    return RedirectResponse(f"/store/{L['seller']}/{listing_id}", status_code=307)


@app.get("/api/v1/store/{seller_id}/{listing_id}")
def store_page(seller_id: str, listing_id: str):
    cat = catalog()
    L = cat["listings"].get(listing_id)
    seller = cat["sellers"].get(seller_id)
    if not L or not seller or L["seller"] != seller_id:
        raise HTTPException(404, "not found")
    pid = cat["log"][listing_id]["product"]
    p = cat["products"].get(pid)
    offer = next((o for o in p["offers"] if o["listing_id"] == listing_id), None) if p else None
    others = []
    for x in cat["listings"].values():
        if x["seller"] == seller_id and x["id"] != listing_id and len(others) < 4:
            xp = cat["products"].get(cat["log"][x["id"]]["product"])
            if xp:
                others.append({"listing_id": x["id"], "title": x["title"], "price": x["price"], "type": xp["type"],
                               "species": xp["species"], "brand": xp["brand"], "brand_en": kb.BRANDS.get(xp["brand"]),
                               "qty_label": xp["qty_label"]})
    return {"seller": seller, "listing": {"id": L["id"], "title": L["title"], "price": L["price"], "available": L["available"],
                                          "url": L["url"]},
            "offer": offer and {k: offer[k] for k in ("price", "shipping", "total", "checked_at")},
            "product": p and {k: p[k] for k in ("id", "name_fa", "name_en", "brand", "brand_fa", "qty_label", "species", "type", "unit")}
            | {"brand_en": kb.BRANDS.get(p["brand"])},
            "others": others}


# ------------------------------------------------------------------ seller dashboard
@app.get("/api/v1/seller/dashboard")
def seller_dashboard(user: dict = Depends(auth.require_role("seller"))):
    cat = catalog()
    sid = user.get("seller_id")
    if not sid:
        return {"status": "pending", "user": auth.public_user(user),
                "message": "حساب فروشنده شما ثبت شد و پس از بررسی هویت کسب‌وکار، فید محصولات به فروشگاهتان وصل می‌شود."}
    seller = cat["sellers"][sid]
    mine = [L for L in cat["listings"].values() if L["seller"] == sid]
    ids = [L["id"] for L in mine]
    series = analytics.daily_series(ids, 30)
    totals = analytics.per_listing_totals(ids, 30)
    rows, alerts = [], []
    for L in mine:
        entry = cat["log"][L["id"]]
        pid = entry["product"]
        p = cat["products"].get(pid)
        if not p or entry["decision"] == "review":   # waiting for a human: not in the comparison yet
            rows.append({"listing_id": L["id"], "title": L["title"], "status": "review", "price": L["price"],
                         "available": L["available"], "manual": bool(L.get("manual"))})
            continue
        me_ = next(o for o in p["offers"] if o["listing_id"] == L["id"])
        rivals = [o for o in p["offers"] if o["available"] and not o["anomaly"] and o["seller_id"] != sid]
        best_rival = min(rivals, key=lambda o: o["total"]) if rivals else None
        ranked = sorted([o for o in p["offers"] if o["available"] and not o["anomaly"]], key=lambda o: o["total"])
        position = next((i + 1 for i, o in enumerate(ranked) if o["listing_id"] == L["id"]), None)
        v, c = totals.get(L["id"], [0, 0])
        gap = round((me_["total"] - best_rival["total"]) / best_rival["total"] * 100, 1) if best_rival else None
        row = {"listing_id": L["id"], "product_id": pid, "name_fa": p["name_fa"], "price": me_["price"],
               "shipping": me_["shipping"], "total": me_["total"], "available": me_["available"],
               "stale": me_["stale"], "anomaly": me_["anomaly"], "position": position, "competitors": len(ranked),
               "best_rival": best_rival and {"seller": best_rival["seller"], "total": best_rival["total"]},
               "gap_pct": gap, "views": v, "clicks": c, "ctr": round(c / v * 100, 1) if v else 0,
               "type": p["type"], "species": p["species"], "brand": p["brand"], "brand_en": kb.BRANDS.get(p["brand"]),
               "qty_label": p["qty_label"], "manual": bool(L.get("manual"))}
        rows.append(row)
        if me_["anomaly"]:
            alerts.append({"level": "bad", "text": f"قیمت «{p['name_fa']}» با بازار نمی‌خواند و در پیشنهادها نمایش داده نمی‌شود."})
        elif gap is not None and gap > 8 and me_["available"]:
            alerts.append({"level": "warn", "text": f"«{p['name_fa']}» {gap:g}٪ گران‌تر از ارزان‌ترین رقیب ({best_rival['seller']}) است."})
        if me_["stale"]:
            alerts.append({"level": "warn", "text": f"قیمت «{p['name_fa']}» بیش از ۴۸ ساعت به‌روز نشده؛ تا به‌روزرسانی پیشنهاد اول نمی‌شود."})
        if not me_["available"] and v > 200:
            alerts.append({"level": "info", "text": f"«{p['name_fa']}» ناموجود است ولی {v} بار دیده شده؛ موجودی را بررسی کنید."})
    views30 = sum(r[1] for r in series)
    clicks30 = sum(r[2] for r in series)
    rows.sort(key=lambda r: -r.get("clicks", 0))
    return {
        "status": "active", "user": auth.public_user(user), "seller": seller,
        "kpis": {"listings": len(mine), "in_stock": sum(L["available"] for L in mine),
                 "views_30d": views30, "clicks_30d": clicks30, "ctr": round(clicks30 / views30 * 100, 1) if views30 else 0,
                 "clicks_today": series[-1][2], "clicks_yesterday": series[-2][2],
                 "first_place": sum(1 for r in rows if r.get("position") == 1)},
        "series": series, "listings": rows, "alerts": alerts[:8],
    }


# ------------------------------------------------------------------ seller: add / edit products by hand
# A hand-added product is just one more feed: it goes through the same normalisation, validation and
# matching as the CSV/JSON feeds, so the seller sees immediately whether it joined an existing product,
# became a new one, or went to the admin's review queue.
SELLER_CATEGORIES = [f"{t} {s}" for s in ("گربه", "سگ") for t in ("غذای خشک", "غذای تر", "تشویقی", "خاک")
                     if not (t == "خاک" and s == "سگ")]


class NewListing(BaseModel):
    title: str = Field(min_length=5, max_length=120)
    category: str = Field(max_length=30)
    weight: str = Field("", max_length=30)
    price_toman: int = Field(ge=1000, le=500_000_000)
    available: bool = True
    url: str | None = Field(None, max_length=200)


class ListingPatch(BaseModel):
    title: str | None = Field(None, min_length=5, max_length=120)
    category: str | None = Field(None, max_length=30)
    weight: str | None = Field(None, max_length=30)
    price_toman: int | None = Field(None, ge=1000, le=500_000_000)
    available: bool | None = None
    url: str | None = Field(None, max_length=200)
    hidden: bool | None = None   # feed products: hide from PetMatch / restore


class Preview(NewListing):
    replaces: str | None = Field(None, max_length=20)   # editing: leave the old version out of the dry run


def _active_seller(user: dict) -> str:
    sid = user.get("seller_id")
    if not sid:
        raise HTTPException(403, "فروشگاه شما هنوز تأیید نشده است")
    return sid


def _listing_record(n: NewListing, sid: str, lid: str) -> dict:
    if n.category not in SELLER_CATEGORIES:
        raise HTTPException(422, "دسته نامعتبر است")
    url = (n.url or "").strip() or f'{catalog()["sellers"][sid]["website"]}/p/{lid}'
    if not url.startswith("https://"):
        raise HTTPException(422, "لینک محصول باید با https:// شروع شود")
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    return dict(id=lid, seller=sid, title=n.title.strip(), category=n.category, weight=n.weight.strip(),
                price_toman=n.price_toman, available=n.available, url=url, created_at=now, updated_at=now)


def _match_report(cat: dict, lid: str, preview: bool = False) -> dict:
    """What the pipeline did with this listing, in words a seller understands."""
    L = cat["listings"].get(lid)
    if not L:
        bad = next((r for r in cat["stats"]["rejected"] if r["id"] == lid), None)
        return {"decision": "rejected", "text": "آگهی رد شد: " + "، ".join((bad or {}).get("problems", [])),
                "understood": {}, "missing": []}
    a, entry = L["attrs"], cat["log"][lid]
    p = cat["products"].get(entry["product"])
    understood = {}
    if a["brand"]: understood["برند"] = kb.BRAND_FA.get(a["brand"], a["brand"])
    if a["species"]: understood["حیوان"] = kb.FA_LABEL.get(a["species"], a["species"])
    if a["type"]: understood["نوع"] = kb.FA_LABEL.get(a["type"], a["type"])
    if a["stage"]: understood["سن"] = kb.FA_LABEL.get(a["stage"], a["stage"])
    if a["amount"]: understood["وزن/حجم"] = pipeline.fmt_qty(a["amount"], a["unit"])
    extra = [kb.FA_LABEL.get(t, t) for t in a["line"] + a["numbers"] + a["flavor"] + a["variant"] + a["size"]]
    if extra: understood["ویژگی"] = "، ".join(dict.fromkeys(extra))
    missing = [lbl for k, lbl in (("brand", "برند"), ("species", "گربه یا سگ"), ("type", "نوع محصول"), ("amount", "وزن یا حجم"))
               if not a[k]]
    d = entry["decision"]
    name = p["name_fa"] if p else ""
    rivals = len({o["seller_id"] for o in p["offers"] if o["seller_id"] != L["seller"]}) if p else 0
    dup = bool(p) and d in ("auto", "approved") and any(o["seller_id"] == L["seller"] and o["listing_id"] != lid for o in p["offers"])
    will = "وصل می‌شود و" if preview else "وصل شد و از همین حالا"
    text = {
        "auto": f"به محصول «{name}» {will} کنار {rivals} فروشگاه دیگر مقایسه می‌شود.",
        "approved": f"با تأیید مدیر به «{name}» وصل شده است.",
        "new": "محصول مشابهی در کاتالوگ نیست؛ به‌عنوان محصول جدید ساخته " + ("می‌شود." if preview else "شد و در جست‌وجو دیده می‌شود."),
        "review": f"شبیه «{name}» است ولی مطمئن نیستیم ({'، '.join(entry['reasons'][:2]) or 'شباهت متوسط'}). "
                  "به صف بررسی مدیر می‌رود و تا تأیید در مقایسه نمی‌آید.",
    }[d]
    return {"decision": d, "text": text, "product_id": p["id"] if p and d != "review" else None, "product_name": name,
            "score": entry["score"], "understood": understood, "missing": missing,
            "duplicate": "همین محصول را از فید فروشگاهتان هم داریم؛ دو پیشنهاد از یک فروشگاه کنار هم دیده می‌شود." if dup else None}


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _own_listing(cat: dict, lid: str, sid: str) -> dict:
    L = cat["listings"].get(lid) or next((h for h in cat["hidden"] if h["id"] == lid), None)
    if not L or L["seller"] != sid:   # never touch another store's products
        raise HTTPException(404, "محصول پیدا نشد")
    return L


def _item(cat: dict, L: dict) -> dict:
    """One row of the seller's product table: feed products and hand-added ones alike."""
    manual, hidden = bool(L.get("manual")), bool(L.get("hidden"))
    r = L["raw"]
    return dict(id=L["id"], source="manual" if manual else "feed", title=L["title"],
                category=r.get("category") if manual else None, weight=r.get("weight") if manual else None,
                price_toman=int(L["price"]), available=bool(L["available"]), url=L["url"], updated_at=L["checked"],
                edited=bool(L.get("edited")), hidden=hidden, match=None if hidden else _match_report(cat, L["id"]))


@app.get("/api/v1/seller/listings")
def seller_listings(user: dict = Depends(auth.require_role("seller"))):
    sid = _active_seller(user)
    cat = catalog()
    mine = [L for L in cat["listings"].values() if L["seller"] == sid] + [h for h in cat["hidden"] if h["seller"] == sid]
    order = {r["id"]: i for i, r in enumerate(pipeline.load_seller_listings())}
    # newest hand-added first, then the feed alphabetically, removed ones last
    mine.sort(key=lambda L: (bool(L.get("hidden")), not L.get("manual"), -order.get(L["id"], 0), L["title"]))
    return {"categories": SELLER_CATEGORIES, "website": cat["sellers"][sid]["website"],
            "feed_format": cat["sellers"][sid]["format"], "items": [_item(cat, L) for L in mine]}


@app.post("/api/v1/seller/listings/preview")
def seller_listing_preview(n: Preview, user: dict = Depends(auth.require_role("seller"))):
    """Dry run: the real pipeline on the catalog plus this one unsaved listing. Nothing is stored."""
    sid = _active_seller(user)
    if n.replaces:
        _own_listing(catalog(), n.replaces, sid)
    rec = _listing_record(n, sid, "preview")
    dry = pipeline.build_catalog(extra=[rec], exclude=(n.replaces,) if n.replaces else ())
    return _match_report(dry, "preview", preview=True)


@app.post("/api/v1/seller/listings", status_code=201)
def seller_listing_create(n: NewListing, user: dict = Depends(auth.require_role("seller"))):
    sid = _active_seller(user)
    with _lock:
        items = pipeline.load_seller_listings()
        if sum(r["seller"] == sid for r in items) >= 100:
            raise HTTPException(429, "حداکثر ۱۰۰ محصول دستی؛ برای بیشتر، فید CSV یا API وصل کنید")
        lid = f"man-{sid[:9]}-{secrets.token_hex(2)}"
        rec = _listing_record(n, sid, lid)
        pipeline.SELLER_LISTINGS.write_text(json.dumps(items + [rec], ensure_ascii=False, indent=1), "utf-8")
    rebuild()
    return _item(catalog(), catalog()["listings"][lid])


@app.patch("/api/v1/seller/listings/{lid}")
def seller_listing_update(lid: str, patch: ListingPatch, user: dict = Depends(auth.require_role("seller"))):
    """Hand-added products: every field. Feed products: title, price and stock, stored as an override
    on top of the feed (in production the next feed sync would win), plus hide / restore."""
    sid = _active_seller(user)
    L = _own_listing(catalog(), lid, sid)
    changes = patch.model_dump(exclude_none=True)
    if not changes:
        raise HTTPException(422, "تغییری فرستاده نشد")
    if "title" in changes:
        changes["title"] = changes["title"].strip()
    with _lock:
        if L.get("manual"):
            if "hidden" in changes:
                raise HTTPException(422, "محصول دستی را حذف کنید، نه پنهان")
            items = pipeline.load_seller_listings()
            rec = next(r for r in items if r["id"] == lid)
            for k in ("title", "category", "weight", "price_toman", "available", "url"):
                if k in changes:
                    rec[k] = changes[k]
            if rec["category"] not in SELLER_CATEGORIES:
                raise HTTPException(422, "دسته نامعتبر است")
            if not rec["url"].startswith("https://"):
                raise HTTPException(422, "لینک محصول باید با https:// شروع شود")
            rec["updated_at"] = _now()   # the price is fresh again
            pipeline.SELLER_LISTINGS.write_text(json.dumps(items, ensure_ascii=False, indent=1), "utf-8")
        else:
            if {"category", "weight", "url"} & changes.keys():
                raise HTTPException(422, "برای محصولات فید فقط عنوان، قیمت و موجودی قابل ویرایش است")
            ov = pipeline.load_overrides()
            o = ov.get(lid, {})
            o.update({"price" if k == "price_toman" else k: v for k, v in changes.items()})
            o["updated_at"] = _now()
            ov[lid] = o
            pipeline.SELLER_OVERRIDES.write_text(json.dumps(ov, ensure_ascii=False, indent=1), "utf-8")
    rebuild()
    return _item(catalog(), _own_listing(catalog(), lid, sid))


@app.delete("/api/v1/seller/listings/{lid}")
def seller_listing_delete(lid: str, user: dict = Depends(auth.require_role("seller"))):
    """Hand-added: deleted. Feed product: hidden from PetMatch (restorable), since the feed still sends it."""
    sid = _active_seller(user)
    L = _own_listing(catalog(), lid, sid)
    with _lock:
        if L.get("manual"):
            items = [r for r in pipeline.load_seller_listings() if r["id"] != lid]
            pipeline.SELLER_LISTINGS.write_text(json.dumps(items, ensure_ascii=False, indent=1), "utf-8")
        else:
            ov = pipeline.load_overrides()
            ov[lid] = ov.get(lid, {}) | {"hidden": True, "updated_at": _now()}
            pipeline.SELLER_OVERRIDES.write_text(json.dumps(ov, ensure_ascii=False, indent=1), "utf-8")
    rebuild()
    return {"ok": True, "hidden": not L.get("manual")}


# ------------------------------------------------------------------ admin API (server-side access control)
require_admin = auth.require_role("admin")


@app.get("/api/v1/admin/analytics", dependencies=[Depends(require_admin)])
def admin_analytics():
    cat = catalog()
    products = list(cat["products"].values())
    offers = [o for p in products for o in p["offers"]]
    per_seller = {}
    totals = analytics.per_listing_totals(None, 30)
    for s in cat["sellers"].values():
        mine = [o for o in offers if o["seller_id"] == s["id"]]
        clicks = sum(totals.get(o["listing_id"], [0, 0])[1] for o in mine)
        per_seller[s["id"]] = {"name": s["name"], "color": s.get("color", "#13566c"), "listings": len(mine),
                               "in_stock": sum(o["available"] for o in mine), "stale": sum(o["stale"] for o in mine),
                               "anomalies": sum(bool(o["anomaly"]) for o in mine), "clicks": clicks, "rating": s["rating"]}
    ages = [o["age_hours"] for o in offers]
    buckets = [("< ۶ ساعت", 0, 6), ("۶–۲۴ ساعت", 6, 24), ("۱–۲ روز", 24, 48), ("> ۲ روز", 48, 10 ** 6)]
    cats = {}
    for p in products:
        k = f'{kb.FA_LABEL[p["type"]]} {kb.FA_LABEL[p["species"]]}' if p["type"] != "litter" else "خاک گربه"
        cats[k] = cats.get(k, 0) + 1
    users = auth.all_users()
    s = cat["stats"]
    return {
        "traffic": analytics.daily_series(None, 30),
        "search": analytics.search_stats(30),
        "sellers": list(per_seller.values()),
        "freshness": [{"label": lbl, "count": sum(lo <= a < hi for a in ages)} for lbl, lo, hi in buckets],
        "matching": [{"label": "ادغام خودکار", "count": s["auto"]}, {"label": "محصول جدید (مرجع)", "count": s["new"]},
                     {"label": "تأیید انسانی", "count": s["approved"]}, {"label": "در صف بررسی", "count": s["review"]}],
        "categories": sorted([{"label": k, "count": v} for k, v in cats.items()], key=lambda x: -x["count"]),
        "users": {"total": len(users), "by_role": {r: sum(u["role"] == r for u in users) for r in auth.ROLES},
                  "pending_sellers": [auth.public_user(u) for u in users if u.get("status") == "pending"]},
        "offers": {"total": len(offers), "in_stock": sum(o["available"] for o in offers),
                   "anomalies": sum(bool(o["anomaly"]) for o in offers), "stale": sum(o["stale"] for o in offers)},
    }


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
    seen = set()
    for L in cat["listings"].values():   # one or two examples from every store format
        if sum(1 for x in seen if x[0] == L["seller"]) >= 2:
            continue
        seen.add((L["seller"], L["id"]))
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
    for k in ("price_toman", "price_irr", "price", "gheymat"):
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
    """Back to the recorded demo state: no human decisions, no seller-added or seller-edited products."""
    for f in (pipeline.DECISIONS, pipeline.SELLER_LISTINGS, pipeline.SELLER_OVERRIDES):
        if f.exists():
            f.unlink()
    rebuild()
    return {"ok": True}


@app.get("/")
def index():
    return {"name": "PetMatch API", "docs": "/docs", "frontend": "http://localhost:3000"}
