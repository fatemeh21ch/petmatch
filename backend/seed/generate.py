"""
Generates *messy* raw feeds for 5 fictional pet shops, the way real feeds look:
different formats (CSV / JSON / nested JSON), languages (fa / en / mixed),
currencies (Toman / Rial / "هزار تومان"), Arabic vs Persian letters, Persian
digits, typos, missing attributes, stale prices and one suspicious price.

All stores, prices and URLs are FICTIONAL demo data.

The generator also writes ground_truth.json (listing -> real product). The
pipeline never reads it; it is only used to measure matching precision/recall.
"""
import csv
import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

random.seed(42)
OUT = Path(__file__).resolve().parents[1] / "data" / "raw"
OUT.mkdir(parents=True, exist_ok=True)
NOW = datetime.now(timezone.utc)

FA_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")

BRANDS = {
    "royal_canin": ("Royal Canin", ["رویال کنین", "رویال‌کنین"], "رویال کانین"),
    "reflex": ("Reflex Plus", ["رفلکس پلاس"], "رفلکس پلاص"),
    "josera": ("Josera", ["جوسرا"], "جوزرا"),
    "brit": ("Brit Care", ["بریت کر"], "بریت کیر"),
    "farmina": ("Farmina N&D", ["فارمینا"], "فارمینا"),
    "monge": ("Monge", ["مونژ"], "مونژه"),
    "ever_clean": ("Ever Clean", ["اورکلین", "اور کلین"], "اور کلین"),
    "cats_best": ("Cat's Best", ["کتس بست"], "کت بست"),
    "pars_litter": ("ParsLitter", ["پارس لیتر"], "پارس لیتر"),
    "dreamies": ("Dreamies", ["دریمیز"], "دریمز"),
    "catit": ("Catit", ["کت ایت"], "کتیت"),
    "pedigree": ("Pedigree", ["پدیگری"], "پدیگری"),
    "gimcat": ("GimCat", ["جیم کت"], "جیمکت"),
}

TYPE_FA = {"dry": "غذای خشک", "wet": "غذای تر", "litter": "خاک", "treat": "تشویقی"}
TYPE_EN = {"dry": "Dry Food", "wet": "Wet Food", "litter": "Litter", "treat": "Treat"}
SPECIES_FA = {"cat": "گربه", "dog": "سگ"}
SPECIES_EN = {"cat": "Cat", "dog": "Dog"}

# key, brand, line_en, line_fa, species, type, qty, unit(g|ml), base_price(Toman), _
PRODUCTS = [
    ("rc_kitten_2k", "royal_canin", "Kitten", "کیتن", "cat", "dry", 2000, "g", 3450000, 98),
    ("rc_kitten_400", "royal_canin", "Kitten", "کیتن", "cat", "dry", 400, "g", 890000, 80),
    ("rc_indoor27_2k", "royal_canin", "Indoor 27", "ایندور 27", "cat", "dry", 2000, "g", 3300000, 90),
    ("rc_fit32_2k", "royal_canin", "Fit 32", "فیت 32", "cat", "dry", 2000, "g", 3250000, 85),
    ("rc_steril37_2k", "royal_canin", "Sterilised 37", "استریلایز 37", "cat", "dry", 2000, "g", 3400000, 88),
    ("reflex_adult_chicken_15", "reflex", "Adult Chicken", "ادالت مرغ", "cat", "dry", 1500, "g", 1350000, 92),
    ("reflex_kitten_chicken_15", "reflex", "Kitten Chicken", "کیتن مرغ", "cat", "dry", 1500, "g", 1380000, 86),
    ("reflex_adult_salmon_15k", "reflex", "Adult Salmon", "ادالت سالمون", "cat", "dry", 15000, "g", 9800000, 70),
    ("josera_catelux_2k", "josera", "Catelux Duck", "کتلوکس اردک", "cat", "dry", 2000, "g", 2600000, 60),
    ("brit_kitten_gf_2k", "brit", "Grain Free Kitten Chicken", "کیتن بدون غلات مرغ", "cat", "dry", 2000, "g", 2450000, 72),
    ("brit_adult_salmon_gf_2k", "brit", "Grain Free Adult Salmon", "ادالت بدون غلات سالمون", "cat", "dry", 2000, "g", 2350000, 74),
    ("farmina_pumpkin_15", "farmina", "Pumpkin Chicken Adult", "کدو حلوایی مرغ ادالت", "cat", "dry", 1500, "g", 3900000, 55),
    ("monge_tuna_80", "monge", "Natural Tuna", "نچرال تن ماهی", "cat", "wet", 80, "g", 145000, 66),
    ("rc_kitten_gravy_85", "royal_canin", "Kitten Gravy Pouch", "کیتن گریوی پوچ", "cat", "wet", 85, "g", 125000, 82),
    ("rc_mini_adult_2k", "royal_canin", "Mini Adult", "مینی ادالت", "dog", "dry", 2000, "g", 2950000, 84),
    ("rc_medium_adult_4k", "royal_canin", "Medium Adult", "مدیوم ادالت", "dog", "dry", 4000, "g", 5200000, 76),
    ("reflex_dog_lamb_3k", "reflex", "Medium Large Adult Lamb", "مدیوم لارج ادالت بره", "dog", "dry", 3000, "g", 2100000, 78),
    ("brit_puppy_lamb_3k", "brit", "Puppy Lamb Rice", "پاپی بره برنج", "dog", "dry", 3000, "g", 2900000, 64),
    ("josera_minijunior_900", "josera", "Mini Junior Duck", "مینی جونیور اردک", "dog", "dry", 900, "g", 980000, 50),
    ("everclean_unscented_6l", "ever_clean", "Extra Strong Unscented", "اکسترا استرانگ بدون عطر", "cat", "litter", 6000, "ml", 1650000, 81),
    ("everclean_lavender_6l", "ever_clean", "Extra Strong Lavender", "اکسترا استرانگ اسطوخودوس", "cat", "litter", 6000, "ml", 1700000, 69),
    ("catsbest_original_10l", "cats_best", "Original Unscented", "اورجینال بدون عطر", "cat", "litter", 10000, "ml", 1150000, 71),
    ("pars_unscented_10k", "pars_litter", "Bentonite Unscented", "بنتونیت بدون عطر", "cat", "litter", 10000, "g", 420000, 93),
    ("pars_babypowder_10k", "pars_litter", "Bentonite Baby Powder", "بنتونیت پودر بچه", "cat", "litter", 10000, "g", 450000, 77),
    ("dreamies_chicken_60", "dreamies", "Chicken", "مرغ", "cat", "treat", 60, "g", 180000, 89),
    ("catit_salmon_75", "catit", "Creamy Salmon", "کرمی سالمون", "cat", "treat", 75, "g", 210000, 75),
    ("dentastix_small_110", "pedigree", "Dentastix Mini", "دنتاستیکس مینی", "dog", "treat", 110, "g", 260000, 79),
    ("gimcat_malt_50", "gimcat", "Malt Soft Paste", "مالت پیست", "cat", "treat", 50, "g", 330000, 58),
]

SELLERS = [
    {"id": "petkade", "name": "پت‌کده", "website": "https://petkade.example", "rating": 4.6, "verified": True,
     "shipping": {"flat": 60000, "free_over": 3000000}, "accuracy": 0.97, "format": "csv/fa/toman"},
    {"id": "zoomall", "name": "زومال", "website": "https://zoomall.example", "rating": 4.3, "verified": True,
     "shipping": {"flat": 0, "free_over": 0}, "accuracy": 0.95, "format": "json/en/rial"},
    {"id": "miomall", "name": "میومال", "website": "https://miomall.example", "rating": 4.1, "verified": True,
     "shipping": {"flat": 75000, "free_over": 5000000}, "accuracy": 0.93, "format": "csv/fa-arabic/formatted"},
    {"id": "haposhop", "name": "هاپوشاپ", "website": "https://haposhop.example", "rating": 4.4, "verified": True,
     "shipping": {"flat": 45000, "free_over": 2500000}, "accuracy": 0.96, "format": "json-nested/mixed"},
    {"id": "pashmaloo", "name": "دنیای پشمالو", "website": "https://pashmaloo.example", "rating": 3.4, "verified": False,
     "shipping": {"flat": 120000, "free_over": 0}, "accuracy": 0.81, "format": "csv/mixed/typos"},
]


def qty_en(q, unit):
    if unit == "ml":
        return random.choice([f"{q // 1000}L", f"{q // 1000} Liter"])
    if q >= 1000:
        kg = q / 1000
        kg_s = f"{kg:g}"
        return random.choice([f"{kg_s}kg", f"{q}g", f"{kg_s} KG"])
    return random.choice([f"{q}g", f"{q} gr"])


def qty_fa(q, unit):
    if unit == "ml":
        return f"{q // 1000} لیتری".translate(FA_DIGITS)
    if q >= 1000:
        kg = f"{q / 1000:g}"
        words = {"2": "دو", "1.5": "یک و نیم", "3": "سه", "4": "چهار"}
        if kg in words and random.random() < 0.3:
            return f"{words[kg]} کیلویی"
        return random.choice([f"{kg} کیلوگرم", f"{kg} کیلویی", f"{kg}کیلو"]).translate(FA_DIGITS)
    return random.choice([f"{q} گرم", f"{q} گرمی"]).translate(FA_DIGITS)


def arabicize(s):
    return s.replace("ی", "ي").replace("ک", "ك")


def fa_line(line):
    return line.translate(FA_DIGITS)


def price_noise(base, lo=-0.08, hi=0.10):
    return int(round(base * (1 + random.uniform(lo, hi)), -4))


def checked_at(stale=False):
    hours = random.uniform(72, 130) if stale else random.uniform(0.3, 26)
    return (NOW - timedelta(hours=hours)).isoformat(timespec="minutes")


def availability():
    return random.choices(["in_stock", "out_of_stock"], weights=[87, 13])[0]


def build():
    carriers = {}
    for p in PRODUCTS:
        stores = [s["id"] for s in SELLERS if random.random() < 0.72]
        while len(stores) < 3:
            extra = random.choice(SELLERS)["id"]
            if extra not in stores:
                stores.append(extra)
        carriers[p[0]] = stores

    truth, history = {}, {}
    rows = {s["id"]: [] for s in SELLERS}
    counters = {s["id"]: 0 for s in SELLERS}

    def nid(store):
        counters[store] += 1
        return f"{store[:3]}-{counters[store]:03d}"

    for (key, brand, l_en, l_fa, sp, typ, q, unit, base, pop) in PRODUCTS:
        b_en, b_fa_list, b_typo = BRANDS[brand]
        for store in carriers[key]:
            lid = nid(store)
            truth[lid] = key
            price = price_noise(base)
            avail = availability()
            if store == "petkade":
                title = f"{TYPE_FA[typ]} {SPECIES_FA[sp]} {random.choice(b_fa_list)} {fa_line(l_fa)} {qty_fa(q, unit)}"
                rows[store].append({"sku": lid, "title": title, "price_toman": price,
                                    "stock": "موجود" if avail == "in_stock" else "ناموجود",
                                    "url": f"https://petkade.example/p/{lid}", "updated": checked_at()})
            elif store == "zoomall":
                title = f"{b_en} {l_en} {SPECIES_EN[sp]} {TYPE_EN[typ]} {qty_en(q, unit)}"
                rows[store].append({"id": lid, "name": title, "price_irr": price * 10,
                                    "available": avail == "in_stock",
                                    "link": f"https://zoomall.example/item/{lid}", "last_seen": checked_at()})
            elif store == "miomall":
                title = arabicize(f"{TYPE_FA[typ]} {random.choice(b_fa_list)} {fa_line(l_fa)} مخصوص {SPECIES_FA[sp]}")
                rows[store].append({"code": lid, "product_name": title,
                                    "weight": arabicize(qty_fa(q, unit)),
                                    "price": f"{price:,}".replace(",", "٬").translate(FA_DIGITS) + " تومان",
                                    "status": "موجود" if avail == "in_stock" else "اتمام موجودی",
                                    "url": f"https://miomall.example/{lid}", "checked": checked_at()})
            elif store == "haposhop":
                unit_s = "ml" if unit == "ml" else "gr"
                rows[store].append({"id": lid, "title": f"{b_en} {fa_line(l_fa)} مخصوص {SPECIES_FA[sp]}",
                                    "specs": {"weight": f"{q} {unit_s}", "category": TYPE_EN[typ].lower()},
                                    "price": {"amount": price, "currency": "IRT"},
                                    "inventory": 0 if avail == "out_of_stock" else random.randint(1, 40),
                                    "url": f"https://haposhop.example/products/{lid}", "synced_at": checked_at()})
            else:  # pashmaloo: mixed language, typos, "هزار تومان", sometimes stale
                b = b_typo if random.random() < 0.5 else random.choice(b_fa_list)
                title = f"{b} {l_en.lower()} {SPECIES_FA[sp]} {qty_en(q, unit)}"
                if typ in ("litter", "treat"):
                    title = f"{TYPE_FA[typ]} {title}"
                rows[store].append({"ref": lid, "title": title, "price": f"{price // 1000:,} هزار تومان",
                                    "stock": "yes" if avail == "in_stock" else "no",
                                    "url": f"https://pashmaloo.example/{lid}",
                                    "updated": checked_at(stale=random.random() < 0.35)})
            history[lid] = make_history(price)

    # --- Deliberately hard cases -------------------------------------------
    # 1) Missing product line -> matcher must NOT auto-merge, should ask a human.
    lid = nid("pashmaloo")
    truth[lid] = "rc_fit32_2k"
    rows["pashmaloo"].append({"ref": lid, "title": "غذای گربه رویال کنین ۲ کیلو", "price": "3,190 هزار تومان",
                              "stock": "yes", "url": f"https://pashmaloo.example/{lid}", "updated": checked_at()})
    history[lid] = make_history(3190000)
    # 2) Missing life stage
    lid = nid("miomall")
    truth[lid] = "brit_adult_salmon_gf_2k"
    rows["miomall"].append({"code": lid, "product_name": arabicize("غذای خشک بریت کر بدون غلات سالمون مخصوص گربه"),
                            "weight": "۲ کیلوگرم", "price": "۲٬۲۹۰٬۰۰۰ تومان", "status": "موجود",
                            "url": f"https://miomall.example/{lid}", "checked": checked_at()})
    history[lid] = make_history(2290000)
    # 3) Suspicious price (probably a 400g pack priced as 2kg, or a bait price)
    lid = nid("pashmaloo")
    truth[lid] = "rc_indoor27_2k"
    rows["pashmaloo"].append({"ref": lid, "title": "رویال کانین indoor 27 گربه 2kg", "price": "1,150 هزار تومان",
                              "stock": "yes", "url": f"https://pashmaloo.example/{lid}", "updated": checked_at()})
    history[lid] = make_history(1150000)

    # --- write in each store's own format ------------------------------------
    def write_csv(name, data):
        with open(OUT / name, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(data[0].keys()))
            w.writeheader()
            w.writerows(data)

    write_csv("petkade.csv", rows["petkade"])
    write_csv("miomall.csv", rows["miomall"])
    write_csv("pashmaloo.csv", rows["pashmaloo"])
    (OUT / "zoomall.json").write_text(json.dumps({"items": rows["zoomall"]}, ensure_ascii=False, indent=1), "utf-8")
    (OUT / "haposhop.json").write_text(json.dumps(rows["haposhop"], ensure_ascii=False, indent=1), "utf-8")
    (OUT / "sellers.json").write_text(json.dumps(SELLERS, ensure_ascii=False, indent=1), "utf-8")
    (OUT.parent / "ground_truth.json").write_text(json.dumps(truth, indent=1), "utf-8")
    (OUT.parent / "price_history.json").write_text(json.dumps(history), "utf-8")
    print(f"wrote {len(truth)} raw listings from {len(SELLERS)} stores -> {OUT}")


def make_history(current, days=90):
    """Random walk backwards from today's price, with a couple of promo dips."""
    pts, p = [], current
    for d in range(days):
        day = (NOW - timedelta(days=d)).date().isoformat()
        pts.append([day, int(round(p, -4))])
        p = p / (1 + random.uniform(-0.004, 0.006))  # ~10% drift per quarter: older = cheaper
        if random.random() < 0.03:
            pts[-1][1] = int(round(pts[-1][1] * 0.88, -4))
    return list(reversed(pts))


if __name__ == "__main__":
    build()
