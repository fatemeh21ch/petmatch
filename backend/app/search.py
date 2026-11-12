"""Intent understanding + ranking.

P = unit-price competitiveness among comparable products, Q = fit for the pet,
R = seller rating x historical price accuracy, C = final cost vs market median.

Query  ->  Intent (species, type, stage, brand, flavors, exclusions, budget, sort)
       ->  filter catalog (relax step by step if nothing matches)
       ->  ValueScore = 0.35·P + 0.25·Q + 0.20·R + 0.20·C
       ->  facts for "why is #1 the best choice"
"""
import re
import statistics
from dataclasses import asdict, dataclass, field

from rapidfuzz import fuzz

from . import feeding, kb
from .text import canonical_tokens, normalize, parse_quantity

STAGE_EQUIV = {"puppy": {"puppy", "junior"}, "junior": {"puppy", "junior"}, "kitten": {"kitten"},
               "adult": {"adult"}, "senior": {"senior", "adult"}}


@dataclass
class Intent:
    species: str | None = None
    type: str | None = None
    stage: str | None = None
    brand: str | None = None
    sizes: list = field(default_factory=list)
    flavors: list = field(default_factory=list)
    variants: list = field(default_factory=list)
    lines: list = field(default_factory=list)
    exclude_flavors: list = field(default_factory=list)
    grain_free: bool = False
    amount: int | None = None
    unit: str | None = None
    max_price: int | None = None
    sort: str = "best"          # best | cheapest | unit_price | rating | monthly
    unknown: list = field(default_factory=list)
    source: str = "rules"       # rules | ai
    from_profile: list = field(default_factory=list)
    groups: list = field(default_factory=list)   # e.g. ("flavor", "fish") so the UI shows one chip

    def understood(self) -> bool:
        """True when at least one real constraint was recognised in the query."""
        return any([self.species, self.type, self.stage, self.brand, self.sizes, self.flavors, self.variants,
                    self.lines, self.exclude_flavors, self.grain_free, self.amount, self.max_price])


_BUDGET = re.compile(r"(زیر|تا|کمتر از|حداکثر|ارزان تر از|under|below|max)\s*(\d+(?:\.\d+)?)(?!\s*(?:کیلو|kg|گرم|gr|g\b|لیتر|l\b|\d))\s*(میلیون|م|هزار|تومن|تومان|m|k)?")
_EXCLUDE = re.compile(r"(بدون|غیر از|به جز|حساسیت به|آلرژی به|حساس به|without|no)\s+(\S+(?:\s\S+)?)")
_SORT = [("monthly", r"هزینه ماهانه|ماهانه|در ماه|هزینه تغذیه"),
         # plain "ارزان" also means cheapest-first; "ارزان تر از ۳ میلیون" is a budget, handled by _BUDGET
         ("cheapest", r"ارزان ?ترین|ارزون ?ترین|cheapest|کمترین قیمت|ارزان(?! ?تر)|ارزون(?! ?تر)|کم ?قیمت|قیمت (?:پایین|کم)|\bcheap\b"),
         ("unit_price", r"به ?صرفه|اقتصادی|صرفه|قیمت هر کیلو"),
         ("rating", r"معتبر ?ترین|مطمئن|بهترین فروشگاه")]


def parse_rules(query: str) -> Intent:
    q = normalize(query)
    it = Intent()
    for name, pat in _SORT:
        if re.search(pat, q):
            it.sort = name
            q = re.sub(pat, " ", q)
            break
    m = _BUDGET.search(q)
    if m:
        n, unit = float(m.group(2)), m.group(3) or ""
        mult = 1_000_000 if unit in ("میلیون", "م", "m") or n < 100 else 1000 if unit in ("هزار", "k") or n < 100_000 else 1
        it.max_price = int(n * mult)
        q = q.replace(m.group(0), " ")
    for m in list(_EXCLUDE.finditer(q)):
        toks, _ = canonical_tokens(m.group(2), fuzzy=True)
        bad = [t for t in toks if t in kb.FLAVORS]
        group = next((kb.FLAVOR_GROUPS[t] for t in toks if t in kb.FLAVOR_GROUPS), None)
        if group:
            it.exclude_flavors += sorted(group)
            it.groups.append(("exclude", next(t for t in toks if t in kb.FLAVOR_GROUPS)))
            q = q.replace(m.group(0), " ")
        elif bad:
            it.exclude_flavors += bad[:1]
            q = q.replace(m.group(0), " ")
    amount, unit, span = parse_quantity(q)
    if span:
        it.amount, it.unit = amount, unit
        q = q.replace(span, " ")
    tokens, unknown = canonical_tokens(q, fuzzy=True)
    t = set(tokens)
    it.species = next((x for x in tokens if x in kb.SPECIES), None)
    it.type = next((x for x in tokens if x in kb.TYPES), None)
    it.stage = next((x for x in tokens if x in kb.STAGES), None)
    it.brand = next((x for x in tokens if x in kb.BRANDS), None)
    it.sizes = sorted(t & kb.SIZES)
    flav = t & kb.FLAVORS
    for g in t & set(kb.FLAVOR_GROUPS):
        flav |= kb.FLAVOR_GROUPS[g]
        it.groups.append(("flavor", g))
    it.flavors = sorted(flav - set(it.exclude_flavors))
    it.variants = sorted(t & kb.VARIANTS)
    it.lines = sorted((t & kb.LINES) | {x for x in t if x.isdigit()})
    it.grain_free = "grainfree" in t
    it.unknown = [w for w in unknown if not w.isdigit()]
    if not it.species:
        if it.stage == "kitten" or it.type == "litter" or "indoor" in t or (it.brand in kb.BRAND_SPECIES and kb.BRAND_SPECIES[it.brand] == "cat"):
            it.species = "cat"
        elif it.stage in ("puppy", "junior") or it.brand == "pedigree":
            it.species = "dog"
    return it


def apply_profile(it: Intent, pet: dict | None) -> dict:
    """Pet profile fills gaps in the query; it never overrides what the user typed.
    Returns soft preferences used by the Q (fit) component."""
    prefs = {}
    if not pet or not pet.get("species"):
        return prefs
    if not it.species:
        it.species = pet["species"]
        it.from_profile.append("species")
    if it.species != pet["species"]:
        return prefs  # searching for another animal; ignore this profile
    br = kb.BREEDS.get(pet.get("breed") or "", {})
    if br.get("species") != pet["species"]:
        br = {}
    if br:
        prefs["breed"] = pet["breed"]
    months = pet.get("age_months")
    if months is not None:
        if months < br.get("adult_at", 12):
            prefs["stage"] = "kitten" if pet["species"] == "cat" else "puppy"
        elif months >= 84:
            prefs["stage"] = "senior"
        else:
            prefs["stage"] = "adult"
    w = pet.get("weight_kg")
    if br.get("size"):   # the breed's adult size, so a growing large-breed puppy still gets large-breed food
        prefs["size"] = br["size"]
    elif pet["species"] == "dog" and w:
        prefs["size"] = "mini" if w < 10 else "medium" if w < 25 else "large"
    if pet.get("sterilised") and pet["species"] == "cat":
        prefs["line"] = "sterilised"
    for a in pet.get("allergies", []) if it.type != "litter" else []:
        if a in kb.FLAVORS and a not in it.exclude_flavors:
            it.exclude_flavors.append(a)
            it.from_profile.append(f"exclude:{a}")
    return prefs


# ------------------------------------------------------------------ filtering
def _matches(p, it: Intent, skip=()):
    checks = {
        "species": lambda: not it.species or p["species"] == it.species,
        "type": lambda: not it.type or p["type"] == it.type or (it.type == "dry" and p["type"] is None),
        "brand": lambda: not it.brand or p["brand"] == it.brand,
        "stage": lambda: not it.stage or p["stage"] in STAGE_EQUIV.get(it.stage, {it.stage}),
        "size": lambda: not it.sizes or bool(set(it.sizes) & set(p["size"])),
        "flavor": lambda: not it.flavors or bool(set(it.flavors) & set(p["flavor"])),
        "variant": lambda: all(v in p["variant"] for v in it.variants),
        "line": lambda: not it.lines or any(l in p["tokens"] for l in it.lines),
        "grain_free": lambda: not it.grain_free or p["grain_free"],
        "amount": lambda: not it.amount or (p["unit"] == it.unit and abs(p["amount"] - it.amount) / it.amount < 0.1),
        "exclude": lambda: not set(it.exclude_flavors) & set(p["flavor"]),
    }
    return all(fn() for k, fn in checks.items() if k not in skip)


RELAX_ORDER = [("amount", "وزن"), ("line", "مدل"), ("size", "سایز نژاد"), ("flavor", "طعم"),
               ("stage", "رده سنی"), ("brand", "برند"), ("variant", "ویژگی")]


def filter_products(products, it: Intent):
    skip, relaxed = [], []
    hits = [p for p in products if _matches(p, it)]
    is_set = {"amount": it.amount, "line": it.lines, "size": it.sizes, "flavor": it.flavors, "stage": it.stage,
              "brand": it.brand, "variant": it.variants}
    for key, label in RELAX_ORDER:
        if hits:
            break
        if not is_set[key]:
            continue
        skip.append(key)
        relaxed.append(label)
        hits = [p for p in products if _matches(p, it, skip)]
    return hits, relaxed


# ------------------------------------------------------------------ ranking
def offer_view(p):
    """Choose which offers are trustworthy enough to recommend."""
    usable = [o for o in p["offers"] if o["available"] and not o["anomaly"] and not o["stale"]]
    caveat = None
    if not usable:
        usable = [o for o in p["offers"] if o["available"] and not o["anomaly"]]
        caveat = "قیمت‌ها بیش از ۴۸ ساعت پیش بررسی شده‌اند" if usable else None
    if not usable:
        return None, None, "فعلاً در هیچ فروشگاهی موجود نیست"
    for o in usable:
        o["offer_score"] = 0.65 * min(x["total"] for x in usable) / o["total"] + 0.35 * (o["seller_rating"] / 5) * o["seller_accuracy"]
    best = max(usable, key=lambda o: o["offer_score"])
    cheapest = min(usable, key=lambda o: o["total"])
    return best, cheapest, caveat


def rank(products, it: Intent, prefs: dict, pet: dict | None = None):
    rows = []
    for p in products:
        best, cheapest, caveat = offer_view(p)
        if it.max_price and (not cheapest or cheapest["total"] > it.max_price):
            continue
        rows.append(dict(product=p, best=best, cheapest=cheapest, caveat=caveat,
                         feeding=feeding.estimate(pet, p, best)))
    live = [r for r in rows if r["best"]]
    if live:
        # compare value only against comparable products (same type and unit kind)
        grp = lambda p: (p["type"], p["unit"])
        min_unit = {}
        for r in live:
            g = grp(r["product"])
            min_unit[g] = min(min_unit.get(g, 1e18), r["best"]["unit_price"] or 1)
    for r in rows:
        p, b = r["product"], r["best"]
        q, fit_notes = _fit(p, it, prefs)
        # wrong life stage / body size for *this* pet is a hard demotion, not a small penalty
        r["mismatch"] = any(not ok for text, ok in fit_notes if text in MISMATCH_NOTES)
        r["breed_pick"] = any(text.startswith(BREED_FORMULA) for text, _ in fit_notes)
        rel = _relevance(p, it)
        if not b:
            r.update(value=0, score=rel * 0.3, parts={}, fit_notes=fit_notes, relevance=rel)
            continue
        P = min_unit[grp(p)] / (b["unit_price"] or 1)
        R = (b["seller_rating"] / 5) * b["seller_accuracy"]
        # C: how good the final cost (incl. shipping) is versus this product's market median
        med = statistics.median(o["total"] for o in p["offers"] if o["available"] and not o["anomaly"])
        C = min(max((med / b["total"] - 0.7) / 0.45, 0), 1)
        value = 0.35 * P + 0.25 * q + 0.20 * R + 0.20 * C
        r.update(value=round(value * 100), parts=dict(P=round(P, 2), Q=round(q, 2), R=round(R, 2), C=round(C, 2)),
                 fit_notes=fit_notes, relevance=round(rel, 2), score=0.45 * rel + 0.55 * value)
    key = {
        "best": lambda r: (r["mismatch"], not r["breed_pick"], -r["score"]),
        "cheapest": lambda r: (r["cheapest"] is None, r["cheapest"]["total"] if r["cheapest"] else 0),
        "unit_price": lambda r: (r["best"] is None, (r["best"] or {}).get("unit_price") or 0),
        "rating": lambda r: (r["best"] is None, -((r["best"] or {}).get("seller_rating") or 0), -r["score"]),
        # monthly cost only exists for main meals with a pet weight; the rest follow, best-value first
        "monthly": lambda r: (r["feeding"] is None, r["mismatch"], (r["feeding"] or {}).get("monthly_cost", 0), -r["score"]),
    }[it.sort]
    rows.sort(key=key)
    return rows


MISMATCH_NOTES = {"برای رده سنی دیگری است", "برای جثه دیگری طراحی شده"}
BREED_FORMULA = "فرمول مخصوص نژاد"   # note prefix: a breed-specific formula is listed first under "best"


def _fit(p, it, prefs):
    """Q: how well the product fits the specific pet (from profile), 0..1."""
    notes, checks = [], []
    if prefs.get("stage") and not it.stage:
        ok = p["stage"] in STAGE_EQUIV.get(prefs["stage"], {prefs["stage"]}) or (p["stage"] is None and p["type"] in ("litter",))
        if p["type"] in ("dry", "wet"):
            checks.append(ok)
            notes.append(("مناسب سن حیوان شما" if ok else "برای رده سنی دیگری است", ok))
    if prefs.get("size") and p["size"] and not it.sizes:
        ok = prefs["size"] in p["size"]
        checks.append(ok)
        notes.append(("مناسب جثه سگ شما" if ok else "برای جثه دیگری طراحی شده", ok))
    if prefs.get("line") and p["type"] == "dry":
        ok = prefs["line"] in p["line"]
        checks.append(ok)
        if ok:
            notes.append(("فرمول مخصوص گربه عقیم‌شده", True))
    br = kb.BREEDS.get(prefs.get("breed") or "", {})
    if br:
        name = br["fa"]
        if br.get("lines") and p["type"] == "dry":
            ok = any(l in p["line"] for l in br["lines"])
            checks.append(ok)   # breed formula ranks first; no visible "not for this breed" note on the rest
            if ok:
                notes.append((f"{BREED_FORMULA} {name}", True))
        if br.get("soft_lines") and p["type"] in ("dry", "wet") and any(l in p["line"] for l in br["soft_lines"]):
            checks.append(True)
            notes.append((f"مناسب نژاد {name} (کنترل وزن)", True))
        if br.get("litter") and p["type"] == "litter":
            ok = any(v in p["variant"] for v in br["litter"])
            checks.append(ok)
            if ok:
                notes.append((f"خاک مناسب نژاد {name}", True))
        if br.get("treat_flavors") and p["type"] == "treat" and any(f in p["flavor"] for f in br["treat_flavors"]):
            checks.append(True)
            notes.append((f"مالت برای گلوله موی نژاد {name}", True))
    if it.exclude_flavors and p["type"] in ("dry", "wet", "treat"):
        if p["flavor"]:
            notes.append(("بدون " + "، ".join(kb.FA_LABEL[f] for f in it.exclude_flavors) + " در پروتئین اصلی", True))
            checks.append(True)
        else:
            notes.append(("پروتئین اصلی در داده فروشگاه‌ها مشخص نیست؛ برچسب ترکیبات را چک کنید", False))
            checks.append(False)
    return (sum(checks) / len(checks) if checks else 1.0), notes


def _relevance(p, it):
    asked = [x for x in [it.species, it.type, it.stage, it.brand] if x] + it.flavors + it.variants + it.lines + it.sizes
    if not asked:
        return 1.0
    have = {p["species"], p["type"], p["stage"], p["brand"], *p["flavor"], *p["variant"], *p["tokens"], *p["size"]}
    if p["stage"] in ("puppy", "junior"):
        have |= {"puppy", "junior"}
    return sum(a in have for a in asked) / len(asked)


def fuzzy_fallback(products, query, limit=12):
    """Last resort for words we don't know: only close matches on whole words of the product name.
    Returning loosely related products is worse than an honest empty result."""
    words = [w for w in normalize(query).split() if len(w) >= 3]
    if not words:
        return []
    scored = []
    for p in products:
        name_words = normalize(p["name_fa"]).split() + p["name_en"].lower().split()
        s = min(max(fuzz.ratio(w, n) for n in name_words) for w in words)  # every query word must match something
        scored.append((s, p))
    return [p for s, p in sorted(scored, key=lambda x: -x[0]) if s >= 85][:limit]


# ------------------------------------------------------------------ explanation facts
def explain_facts(rows, it: Intent):
    live = [r for r in rows if r["best"]]
    if not live:
        return None
    top = live[0]
    p, b = top["product"], top["best"]
    alts = [r for r in live[1:] if (r["product"]["type"], r["product"]["unit"]) == (p["type"], p["unit"])][:3]
    facts = {
        "product": p["name_fa"], "seller": b["seller"], "price": b["price"], "shipping": b["shipping"],
        "total": b["total"], "unit_price": b["unit_price"], "unit": "کیلو" if p["unit"] == "g" else "لیتر",
        "seller_rating": b["seller_rating"], "checked_hours_ago": b["age_hours"], "value_score": top["value"],
        "offers_compared": len(p["offers"]), "fit": [n for n, ok in top["fit_notes"]],
        "cheapest_is_different": top["cheapest"]["listing_id"] != b["listing_id"],
    }
    if facts["cheapest_is_different"]:
        c = top["cheapest"]
        facts["cheapest_alt"] = {"seller": c["seller"], "total": c["total"], "rating": c["seller_rating"]}
    excluded = [o for o in p["offers"] if o["anomaly"]]
    if excluded:
        facts["excluded_suspicious"] = [{"seller": o["seller"], "price": o["price"], "why": o["anomaly"]} for o in excluded]
    if alts:
        a = alts[0]
        facts["runner_up"] = {"product": a["product"]["name_fa"], "total": a["best"]["total"],
                              "unit_price": a["best"]["unit_price"], "value_score": a["value"],
                              "monthly_cost": (a.get("feeding") or {}).get("monthly_cost")}
    if top.get("feeding"):
        f = top["feeding"]
        facts["feeding_estimate"] = {"monthly_cost": f["monthly_cost"], "weeks_per_pack": f["weeks_per_pack"],
                                     "freshness_warning": f["freshness_warning"],
                                     "grams_per_day": f["grams_per_day"], "note": "تخمینی، با میانگین انرژی غذای خشک/تر"}
    facts["reasons"] = _reasons(facts)
    return facts


def _reasons(f):
    out = []
    ru = f.get("runner_up")
    if ru and ru["unit_price"] and f["unit_price"] and ru["unit_price"] > f["unit_price"]:
        pct = round((1 - f["unit_price"] / ru["unit_price"]) * 100)
        if pct >= 3:
            out.append(f"قیمت هر {f['unit']} {pct}٪ ارزان‌تر از گزینه بعدی")
    out.append(f"قیمت نهایی با ارسال: {f['total']:,} تومان" + (" (ارسال رایگان)" if f["shipping"] == 0 else ""))
    fe = f.get("feeding_estimate")
    if fe:
        line = f"هزینه تغذیه تقریبی: حدود {fe['monthly_cost']:,} تومان در ماه (هر بسته حدود {fe['weeks_per_pack']:g} هفته)"
        if ru and ru.get("monthly_cost") and ru["monthly_cost"] > fe["monthly_cost"]:
            line += f"؛ ماهانه {ru['monthly_cost'] - fe['monthly_cost']:,} تومان کمتر از گزینه بعدی"
        out.append(line)
        if fe.get("freshness_warning"):
            out.append("بسته بزرگ است؛ غذای خشک بعد از باز شدن معمولاً ۶ تا ۸ هفته بهترین کیفیت را دارد")
    if f.get("cheapest_is_different"):
        c = f["cheapest_alt"]
        out.append(f"ارزان‌ترین پیشنهاد ({c['seller']}، {c['total']:,}) فروشنده کم‌اعتبارتری دارد (امتیاز {c['rating']})")
    out.append(f"فروشنده {f['seller']} با امتیاز {f['seller_rating']} از ۵ — قیمت {_ago(f['checked_hours_ago'])} بررسی شده")
    for s in f.get("excluded_suspicious", [])[:1]:
        out.append(f"پیشنهاد {s['seller']} به دلیل قیمت مشکوک کنار گذاشته شد")
    out += f["fit"][:2]
    return out


def _ago(h):
    if h < 1:
        return "کمتر از یک ساعت پیش"
    if h < 24:
        return f"{round(h)} ساعت پیش"
    return f"{round(h / 24)} روز پیش"


def intent_dict(it: Intent):
    return asdict(it)
