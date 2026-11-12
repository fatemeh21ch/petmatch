"""Data pipeline: raw store feeds -> validated listings -> attributes -> product
matching -> canonical catalog with offers, unit prices and price anomalies.

Runs at startup and whenever an admin resolves a matching decision. With ~100
listings this takes milliseconds; in production the same stages run as
background jobs per feed.
"""
import csv
import hashlib
import itertools
import json
import re
import statistics
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from rapidfuzz import fuzz

from . import kb
from .text import extract, normalize

DATA = Path(__file__).resolve().parents[1] / "data"
RAW = DATA / "raw"
DECISIONS = DATA / "decisions.json"
SELLER_LISTINGS = DATA / "seller_listings.json"   # products sellers add by hand in their panel

AUTO_MERGE = 0.95
REVIEW = 0.75
STALE_HOURS = 48
# attribute groups that must agree for two listings to be the same product
GROUPS = ("stage", "line", "numbers", "flavor", "variant", "size")
# groups where "only the new listing mentions it" means a different, more specific product
SPECIFIC_GROUPS = {"line", "numbers", "flavor", "variant"}
GROUP_FA = {"stage": "رده سنی", "line": "مدل", "numbers": "شماره مدل", "flavor": "طعم", "variant": "ویژگی",
            "size": "سایز نژاد"}


# ------------------------------------------------------------------ ingest
def _digits(s) -> int:
    return int(re.sub(r"[^\d]", "", normalize(str(s))) or 0)


def _read_csv(name):
    with open(RAW / name, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_seller_listings() -> list:
    return json.loads(SELLER_LISTINGS.read_text("utf-8")) if SELLER_LISTINGS.exists() else []


def manual_listing(r: dict) -> dict:
    """A product a seller typed into the panel: just another feed, same shape, same matching."""
    return dict(id=r["id"], seller=r["seller"], title=r["title"], extra=f'{r.get("weight", "")} {r.get("category", "")}'.strip(),
                price=int(r["price_toman"]), available=bool(r["available"]), url=r["url"], checked=r["updated_at"],
                raw=r, manual=True)


def _ingest(extra=None):
    """One adapter per store: each speaks its own format, all emit the same shape."""
    out = []
    for r in _read_csv("petkade.csv"):
        out.append(dict(id=r["sku"], seller="petkade", title=r["title"], extra="", price=_digits(r["price_toman"]),
                        available=r["stock"] == "موجود", url=r["url"], checked=r["updated"], raw=r))
    for r in json.loads((RAW / "zoomall.json").read_text("utf-8"))["items"]:
        out.append(dict(id=r["id"], seller="zoomall", title=r["name"], extra="", price=int(r["price_irr"]) // 10,
                        available=bool(r["available"]), url=r["link"], checked=r["last_seen"], raw=r))
    for r in _read_csv("miomall.csv"):
        out.append(dict(id=r["code"], seller="miomall", title=r["product_name"], extra=r["weight"],
                        price=_digits(r["price"]), available=normalize(r["status"]) == "موجود", url=r["url"],
                        checked=r["checked"], raw=r))
    for r in json.loads((RAW / "haposhop.json").read_text("utf-8")):
        out.append(dict(id=r["id"], seller="haposhop", title=r["title"],
                        extra=f'{r["specs"]["weight"]} {r["specs"]["category"]}',
                        price=int(r["price"]["amount"]) * (1 if r["price"]["currency"] == "IRT" else 0.1),
                        available=r["inventory"] > 0, url=r["url"], checked=r["synced_at"], raw=r))
    for r in _read_csv("panjetala.csv"):
        out.append(dict(id=r["kala_id"], seller="panjetala", title=r["onvan"], extra="",
                        price=_digits(r["gheymat"]) // (10 if "ریال" in r["gheymat"] else 1),
                        available=normalize(r["mojoodi"]) == "در انبار", url=r["link"], checked=r["zaman"], raw=r))
    for r in json.loads((RAW / "koochepet.json").read_text("utf-8"))["products"]:
        pack = r["pack"]
        out.append(dict(id=r["sku"], seller="koochepet", title=r["product"], extra=f'{pack["value"]:g} {pack["unit"]} {r["category"]}',
                        price=int(r["price_toman"]), available=bool(r["in_stock"]), url=r["url"], checked=r["updated_at"], raw=r))
    for r in _read_csv("pashmaloo.csv"):
        mult = 1000 if "هزار" in r["price"] else 1
        out.append(dict(id=r["ref"], seller="pashmaloo", title=r["title"], extra="", price=_digits(r["price"]) * mult,
                        available=r["stock"] == "yes", url=r["url"], checked=r["updated"], raw=r))
    out += [manual_listing(r) for r in load_seller_listings() + list(extra or [])]
    return out


def _validate(listing):
    problems = []
    if not listing["title"].strip():
        problems.append("empty title")
    if not 1000 <= listing["price"] <= 500_000_000:
        problems.append(f"price out of range: {listing['price']}")
    if not str(listing["url"]).startswith("https://"):
        problems.append("non-https url")
    return problems


# ------------------------------------------------------------------ matching
@dataclass
class Cluster:
    pid: str
    attrs: dict
    members: list = field(default_factory=list)


def _signature(a):
    parts = [a["brand"], a["species"], a["type"], a["stage"], "+".join(a["line"] + a["numbers"]),
             "+".join(a["flavor"]), "+".join(a["variant"]), "+".join(a["size"]), f'{a["amount"]}{a["unit"]}']
    return "|".join(str(p or "") for p in parts)


def _pid(a):
    return hashlib.sha1(_signature(a).encode()).hexdigest()[:8]


def _completeness(a):
    return sum(bool(a[g]) for g in GROUPS) + bool(a["amount"]) + bool(a["brand"]) - len(a["inferred"]) * 0.5


def _descriptor(a):
    return " ".join(sorted(set(a["tokens"]) - kb.SPECIES - kb.TYPES - set(kb.BRANDS)))


def compare(a, b):
    """Similarity S = 0.40·name + 0.20·brand + 0.25·weight + 0.15·type, plus hard rules.

    Returns (score, conflicts, uncertain_reasons)."""
    conflicts, uncertain = [], []
    if a["amount"] and b["amount"] and abs(a["amount"] - b["amount"]) / max(a["amount"], b["amount"]) > 0.02:
        conflicts.append(f'وزن متفاوت ({a["amount"]} در برابر {b["amount"]})')
    if not a["amount"] or not b["amount"]:
        uncertain.append("وزن یکی از آگهی‌ها مشخص نیست")
    for g in GROUPS:
        va, vb = a[g], b[g]
        va = [va] if isinstance(va, str) else (va or [])
        vb = [vb] if isinstance(vb, str) else (vb or [])
        if va and vb and set(va) != set(vb):
            conflicts.append(f"{GROUP_FA[g]} متفاوت ({'/'.join(va)} ≠ {'/'.join(vb)})")
        elif va and not vb and g in SPECIFIC_GROUPS:
            # the new listing names a line/flavor/variant the existing product doesn't have:
            # it is a *more specific* product (Sterilised Chicken vs Adult Chicken), not a vaguer copy
            conflicts.append(f"«{GROUP_FA[g]}» فقط در آگهی جدید آمده ({'/'.join(va)})؛ محصول مشخص‌تری است")
        elif bool(va) != bool(vb):
            uncertain.append(f"«{GROUP_FA[g]}» در یکی از آگهی‌ها ذکر نشده")
    if not a["type"] or not b["type"]:
        uncertain.append("نوع محصول (خشک/تر/...) در یکی از آگهی‌ها مشخص نیست")
    if a["grain_free"] != b["grain_free"] and (a["line"] or b["line"]):
        uncertain.append("بدون‌غلات بودن فقط در یکی ذکر شده")

    da, db = _descriptor(a), _descriptor(b)
    # an empty descriptor means "unknown", not "different"
    name = fuzz.token_set_ratio(da, db) / 100 if da and db else 0.5
    brand = 1.0 if a["brand"] == b["brand"] else 0.0
    weight = 1.0 if a["amount"] and a["amount"] == b["amount"] else (0.5 if not (a["amount"] and b["amount"]) else 0)
    typ = 1.0 if a["type"] == b["type"] else 0.0
    if typ and ("type" in a["inferred"] or "type" in b["inferred"]):
        typ = 0.8
    score = 0.40 * name + 0.20 * brand + 0.25 * weight + 0.15 * typ
    if uncertain:
        score = min(score, 0.90)  # never auto-merge on missing critical attributes
    return round(score, 3), conflicts, uncertain


def _load_decisions():
    return json.loads(DECISIONS.read_text("utf-8")) if DECISIONS.exists() else {}


def match(listings):
    decisions = _load_decisions()
    clusters: dict[str, Cluster] = {}
    log, review, blocked = {}, [], []
    for L in sorted(listings, key=lambda x: (-_completeness(x["attrs"]), x["id"])):
        a = L["attrs"]
        cands = []
        for c in clusters.values():
            ca = c.attrs
            if (ca["brand"], ca["species"], ca["unit"]) != (a["brand"], a["species"], a["unit"]):
                continue  # blocking: only compare inside the same brand/species/unit bucket
            s, conflicts, unc = compare(a, ca)
            if conflicts:
                if fuzz.token_set_ratio(L["title_norm"], c.members[0]["title_norm"]) > 80:
                    blocked.append({"listing": L["id"], "title": L["title"], "vs": c.members[0]["title"],
                                    "why": conflicts})
                continue
            cands.append((s, c, unc))
        cands.sort(key=lambda x: -x[0])
        best_score, best, best_unc = cands[0] if cands else (0.0, None, [])

        d = decisions.get(L["id"])
        if d and d["action"] == "approve" and d.get("product_id") in clusters:
            clusters[d["product_id"]].members.append(L)
            log[L["id"]] = dict(decision="approved", score=best_score, product=d["product_id"], reasons=best_unc)
            continue
        if d and d["action"] == "reject":
            best = None  # a human said "this is a different product"
        if best and best_score >= AUTO_MERGE and (len(cands) < 2 or cands[1][0] < AUTO_MERGE):
            best.members.append(L)
            log[L["id"]] = dict(decision="auto", score=best_score, product=best.pid, reasons=[])
        elif best and best_score >= REVIEW:
            log[L["id"]] = dict(decision="review", score=best_score, product=best.pid, reasons=best_unc)
            review.append({"listing": L, "score": best_score, "reasons": best_unc,
                           "candidates": [{"pid": c.pid, "score": s} for s, c, _ in cands[:3] if s >= REVIEW]})
        else:
            pid = _pid(a)
            while pid in clusters:
                pid = hashlib.sha1((pid + L["id"]).encode()).hexdigest()[:8]
            clusters[pid] = Cluster(pid, a, [L])
            log[L["id"]] = dict(decision="new", score=best_score, product=pid, reasons=[])
    return clusters, log, review, blocked


# ------------------------------------------------------------------ catalog
def _hours_since(iso):
    t = datetime.fromisoformat(iso)
    return (datetime.now(timezone.utc) - t).total_seconds() / 3600


def _shipping(seller, price):
    rule = seller["shipping"]
    if rule["free_over"] and price >= rule["free_over"]:
        return 0
    return rule["flat"]


def product_names(a):
    labels = [kb.FA_LABEL.get(t, t) for t in (a["line"] + a["numbers"] + ([a["stage"]] if a["stage"] else [])
                                               + a["size"] + a["flavor"] + a["variant"])]
    if a["grain_free"]:
        labels.append("بدون غلات")
    qty = fmt_qty(a["amount"], a["unit"])
    typ = {"dry": "غذای خشک", "wet": "غذای تر", "litter": "خاک", "treat": "تشویقی"}.get(a["type"], "")
    qty_part = (("حجم " if a["unit"] == "ml" else "وزن ") + qty) if qty else ""
    fa = " ".join(x for x in [typ, kb.FA_LABEL.get(a["species"], ""), kb.BRAND_FA.get(a["brand"], ""),
                              " ".join(dict.fromkeys(labels)), qty_part] if x)
    en_bits = [kb.BRANDS.get(a["brand"], "")] + [kb.EN_LABEL.get(t, t) for t in a["line"] + a["numbers"]] + \
              ([kb.EN_LABEL[a["stage"]]] if a["stage"] else []) + [kb.EN_LABEL[t] for t in a["size"] + a["flavor"] + a["variant"]]
    if a["grain_free"]:
        en_bits.append("Grain Free")
    en = " ".join(dict.fromkeys(b for b in en_bits if b))
    return fa, en


def fmt_qty(amount, unit):
    if not amount:
        return ""
    if unit == "ml":
        return f"{amount / 1000:g} لیتر"
    return f"{amount / 1000:g} کیلوگرم" if amount >= 1000 else f"{amount} گرم"


def build_catalog(extra=None):
    """`extra`: unsaved seller listings for a dry run (the add-product preview)."""
    sellers = {s["id"]: s for s in json.loads((RAW / "sellers.json").read_text("utf-8"))}
    history = json.loads((DATA / "price_history.json").read_text("utf-8"))

    raw = _ingest(extra)
    listings, rejected = [], []
    for L in raw:
        problems = _validate(L)
        if problems:
            rejected.append({"id": L["id"], "problems": problems})
            continue
        L["price"] = int(L["price"])
        L["attrs"] = extract(L["title"], L["extra"])
        L["title_norm"] = L["attrs"]["normalized"]
        listings.append(L)

    clusters, log, review, blocked = match(listings)

    products = {}
    for c in clusters.values():
        rep = max(c.members, key=lambda m: _completeness(m["attrs"]))["attrs"]
        fa, en = product_names(rep)
        offers = []
        for m in c.members:
            s = sellers[m["seller"]]
            ship = _shipping(s, m["price"])
            age = _hours_since(m["checked"])
            offers.append(dict(listing_id=m["id"], seller_id=s["id"], seller=s["name"], seller_rating=s["rating"],
                               seller_verified=s["verified"], seller_accuracy=s["accuracy"], price=m["price"],
                               shipping=ship, total=m["price"] + ship, available=m["available"], url=m["url"],
                               checked_at=m["checked"], age_hours=round(age, 1), stale=age > STALE_HOURS,
                               raw_title=m["title"], match=log[m["id"]], history=history.get(m["id"], [])))
        _flag_anomalies(offers)
        qty_kg = (rep["amount"] or 0) / 1000
        for o in offers:
            o["unit_price"] = round(o["total"] / qty_kg) if qty_kg else None
        stage = rep["stage"] or next((kb.LINE_STAGE[l] for l in rep["line"] if l in kb.LINE_STAGE), None)
        products[c.pid] = dict(id=c.pid, name_fa=fa, name_en=en, brand=rep["brand"], brand_fa=kb.BRAND_FA.get(rep["brand"]),
                               species=rep["species"], type=rep["type"], stage=stage, size=rep["size"],
                               flavor=rep["flavor"], variant=rep["variant"], line=rep["line"],
                               grain_free=rep["grain_free"], amount=rep["amount"], unit=rep["unit"],
                               qty_label=fmt_qty(rep["amount"], rep["unit"]), tokens=rep["tokens"], offers=offers)

    stats = _stats(raw, listings, rejected, log, review, blocked, products)
    return dict(products=products, review=review, blocked=blocked, log=log, stats=stats,
                listings={L["id"]: L for L in listings}, sellers=sellers)


def _flag_anomalies(offers):
    """A price far below the market median is more often a data error or bait than a deal."""
    prices = [o["price"] for o in offers]
    for i, o in enumerate(offers):
        others = [p for j, p in enumerate(prices) if j != i] or prices
        med = statistics.median(others) if len(prices) > 1 else o["price"]
        o["market_median"] = med
        ratio = o["price"] / med if med else 1
        o["anomaly"] = None
        if len(prices) >= 3 and ratio < 0.65:
            o["anomaly"] = f"{round((1 - ratio) * 100)}٪ زیر میانه بازار — احتمال خطای داده یا قیمت طعمه"
        elif len(prices) >= 3 and ratio > 1.5:
            o["anomaly"] = f"{round((ratio - 1) * 100)}٪ بالاتر از میانه بازار"


def _stats(raw, listings, rejected, log, review, blocked, products):
    truth_file = DATA / "ground_truth.json"
    evaluation = None
    if truth_file.exists():
        truth = json.loads(truth_file.read_text("utf-8"))
        merged = {lid: v["product"] for lid, v in log.items() if v["decision"] != "review"}
        tp = fp = fn = 0
        for x, y in itertools.combinations(sorted(merged), 2):
            same_pred, same_true = merged[x] == merged[y], truth.get(x) == truth.get(y)
            tp += same_pred and same_true
            fp += same_pred and not same_true
            fn += same_true and not same_pred
        p = tp / (tp + fp) if tp + fp else 1.0
        r = tp / (tp + fn) if tp + fn else 1.0
        evaluation = dict(precision=round(p, 3), recall=round(r, 3), f1=round(2 * p * r / (p + r), 3) if p + r else 0,
                          pairs_true_positive=tp, pairs_false_positive=fp, pairs_false_negative=fn)
    decisions = [v["decision"] for v in log.values()]
    filled = lambda k: round(100 * sum(1 for L in listings if L["attrs"][k]) / max(len(listings), 1))
    return dict(raw=len(raw), valid=len(listings), rejected=rejected, products=len(products),
                auto=decisions.count("auto"), new=decisions.count("new"), review=len(review),
                approved=decisions.count("approved"), blocked=len(blocked),
                fill_rate={k: filled(k) for k in ("brand", "species", "type", "amount", "stage")},
                evaluation=evaluation)
