"""
Generates *messy* raw feeds for 7 fictional pet shops, the way real feeds look:
different formats (CSV / JSON / nested JSON), languages (fa / en / mixed),
currencies (Toman / Rial / "هزار تومان"), Arabic vs Persian letters, Persian
digits, typos, missing attributes, stale prices and a few suspicious prices.

It also writes 30 days of synthetic analytics (views / clicks per listing and a
search log) so the seller and admin dashboards have something to show.

All stores, prices, URLs and analytics are FICTIONAL demo data.

ground_truth.json (listing -> real product) is never read by the pipeline; it
is only used to measure matching precision/recall.
"""
import csv
import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

random.seed(42)
DATA = Path(__file__).resolve().parents[1] / "data"
OUT = DATA / "raw"
OUT.mkdir(parents=True, exist_ok=True)
NOW = datetime.now(timezone.utc)

FA_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")

# brand key: (English name, Persian spellings, a typo some feeds use)
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
    "whiskas": ("Whiskas", ["ویسکاس"], "ویسکاز"),
    "proplan": ("Pro Plan", ["پروپلن", "پرو پلن"], "پروپلان"),
    "hills": ("Hill's", ["هیلز"], "هیلس"),
}

TYPE_FA = {"dry": "غذای خشک", "wet": "غذای تر", "litter": "خاک", "treat": "تشویقی"}
TYPE_EN = {"dry": "Dry Food", "wet": "Wet Food", "litter": "Litter", "treat": "Treat"}
SPECIES_FA = {"cat": "گربه", "dog": "سگ"}
SPECIES_EN = {"cat": "Cat", "dog": "Dog"}

# key, brand, line_en, line_fa, species, type, qty, unit(g|ml), base_price(Toman), popularity(1-100)
PRODUCTS = [
    # ---- cat dry
    ("rc_kitten_2k", "royal_canin", "Kitten", "کیتن", "cat", "dry", 2000, "g", 3450000, 98),
    ("rc_kitten_400", "royal_canin", "Kitten", "کیتن", "cat", "dry", 400, "g", 890000, 80),
    ("rc_indoor27_2k", "royal_canin", "Indoor 27", "ایندور 27", "cat", "dry", 2000, "g", 3300000, 90),
    ("rc_indoor27_400", "royal_canin", "Indoor 27", "ایندور 27", "cat", "dry", 400, "g", 860000, 62),
    ("rc_fit32_2k", "royal_canin", "Fit 32", "فیت 32", "cat", "dry", 2000, "g", 3250000, 85),
    ("rc_steril37_2k", "royal_canin", "Sterilised 37", "استریلایز 37", "cat", "dry", 2000, "g", 3400000, 88),
    ("rc_persian_2k", "royal_canin", "Persian Adult", "پرشین ادالت", "cat", "dry", 2000, "g", 3600000, 57),
    ("reflex_adult_chicken_15", "reflex", "Adult Chicken", "ادالت مرغ", "cat", "dry", 1500, "g", 1350000, 92),
    ("reflex_kitten_chicken_15", "reflex", "Kitten Chicken", "کیتن مرغ", "cat", "dry", 1500, "g", 1380000, 86),
    ("reflex_adult_salmon_15k", "reflex", "Adult Salmon", "ادالت سالمون", "cat", "dry", 15000, "g", 9800000, 70),
    ("reflex_steril_chicken_15", "reflex", "Sterilised Chicken", "استریلایز مرغ", "cat", "dry", 1500, "g", 1420000, 74),
    ("josera_catelux_2k", "josera", "Catelux Duck", "کتلوکس اردک", "cat", "dry", 2000, "g", 2600000, 60),
    ("josera_carismo_2k", "josera", "Carismo Senior", "کریسمو سینیور", "cat", "dry", 2000, "g", 2700000, 44),
    ("brit_kitten_gf_2k", "brit", "Grain Free Kitten Chicken", "کیتن بدون غلات مرغ", "cat", "dry", 2000, "g", 2450000, 72),
    ("brit_adult_salmon_gf_2k", "brit", "Grain Free Adult Salmon", "ادالت بدون غلات سالمون", "cat", "dry", 2000, "g", 2350000, 74),
    ("farmina_pumpkin_15", "farmina", "Pumpkin Chicken Adult", "کدو حلوایی مرغ ادالت", "cat", "dry", 1500, "g", 3900000, 55),
    ("whiskas_adult_tuna_14", "whiskas", "Adult Tuna", "ادالت تن ماهی", "cat", "dry", 1400, "g", 1050000, 83),
    ("whiskas_kitten_chicken_14", "whiskas", "Kitten Chicken", "کیتن مرغ", "cat", "dry", 1400, "g", 1090000, 78),
    ("proplan_steril_salmon_15", "proplan", "Sterilised Adult Salmon", "استریلایز ادالت سالمون", "cat", "dry", 1500, "g", 2850000, 76),
    ("proplan_kitten_chicken_15", "proplan", "Kitten Chicken", "کیتن مرغ", "cat", "dry", 1500, "g", 2900000, 69),
    ("hills_cat_adult_chicken_15", "hills", "Adult Chicken", "ادالت مرغ", "cat", "dry", 1500, "g", 3300000, 58),
    # ---- cat wet
    ("monge_tuna_80", "monge", "Natural Tuna", "نچرال تن ماهی", "cat", "wet", 80, "g", 145000, 66),
    ("monge_chicken_80", "monge", "Natural Chicken", "نچرال مرغ", "cat", "wet", 80, "g", 140000, 61),
    ("rc_kitten_gravy_85", "royal_canin", "Kitten Gravy Pouch", "کیتن گریوی پوچ", "cat", "wet", 85, "g", 125000, 82),
    ("rc_steril_gravy_85", "royal_canin", "Sterilised Gravy Pouch", "استریلایز گریوی پوچ", "cat", "wet", 85, "g", 128000, 67),
    ("whiskas_pouch_tuna_85", "whiskas", "Adult Tuna Pouch", "ادالت تن ماهی پوچ", "cat", "wet", 85, "g", 65000, 88),
    ("whiskas_pouch_chicken_85", "whiskas", "Adult Chicken Pouch", "ادالت مرغ پوچ", "cat", "wet", 85, "g", 65000, 84),
    ("proplan_pouch_salmon_85", "proplan", "Adult Salmon Pouch", "ادالت سالمون پوچ", "cat", "wet", 85, "g", 120000, 59),
    # ---- cat litter
    ("everclean_unscented_6l", "ever_clean", "Extra Strong Unscented", "اکسترا استرانگ بدون عطر", "cat", "litter", 6000, "ml", 1650000, 81),
    ("everclean_unscented_10l", "ever_clean", "Extra Strong Unscented", "اکسترا استرانگ بدون عطر", "cat", "litter", 10000, "ml", 2500000, 64),
    ("everclean_lavender_6l", "ever_clean", "Extra Strong Lavender", "اکسترا استرانگ اسطوخودوس", "cat", "litter", 6000, "ml", 1700000, 69),
    ("catsbest_original_10l", "cats_best", "Original Unscented", "اورجینال بدون عطر", "cat", "litter", 10000, "ml", 1150000, 71),
    ("catsbest_original_20l", "cats_best", "Original Unscented", "اورجینال بدون عطر", "cat", "litter", 20000, "ml", 2050000, 52),
    ("pars_unscented_10k", "pars_litter", "Bentonite Unscented", "بنتونیت بدون عطر", "cat", "litter", 10000, "g", 420000, 93),
    ("pars_babypowder_10k", "pars_litter", "Bentonite Baby Powder", "بنتونیت پودر بچه", "cat", "litter", 10000, "g", 450000, 77),
    ("pars_lavender_5k", "pars_litter", "Bentonite Lavender", "بنتونیت اسطوخودوس", "cat", "litter", 5000, "g", 260000, 68),
    # ---- cat treats
    ("dreamies_chicken_60", "dreamies", "Chicken", "مرغ", "cat", "treat", 60, "g", 180000, 89),
    ("dreamies_salmon_60", "dreamies", "Salmon", "سالمون", "cat", "treat", 60, "g", 180000, 81),
    ("catit_salmon_75", "catit", "Creamy Salmon", "کرمی سالمون", "cat", "treat", 75, "g", 210000, 75),
    ("catit_chicken_75", "catit", "Creamy Chicken", "کرمی مرغ", "cat", "treat", 75, "g", 205000, 70),
    ("gimcat_malt_50", "gimcat", "Malt Soft Paste", "مالت پیست", "cat", "treat", 50, "g", 330000, 58),
    ("gimcat_malt_100", "gimcat", "Malt Soft Paste", "مالت پیست", "cat", "treat", 100, "g", 560000, 49),
    # ---- dog dry
    ("rc_mini_adult_2k", "royal_canin", "Mini Adult", "مینی ادالت", "dog", "dry", 2000, "g", 2950000, 84),
    ("rc_mini_puppy_2k", "royal_canin", "Mini Puppy", "مینی پاپی", "dog", "dry", 2000, "g", 3050000, 73),
    ("rc_medium_adult_4k", "royal_canin", "Medium Adult", "مدیوم ادالت", "dog", "dry", 4000, "g", 5200000, 76),
    ("rc_maxi_adult_4k", "royal_canin", "Maxi Adult", "مکسی ادالت", "dog", "dry", 4000, "g", 4900000, 63),
    ("reflex_dog_lamb_3k", "reflex", "Medium Large Adult Lamb", "مدیوم لارج ادالت بره", "dog", "dry", 3000, "g", 2100000, 78),
    ("reflex_dog_puppy_chicken_3k", "reflex", "Medium Large Puppy Chicken", "مدیوم لارج پاپی مرغ", "dog", "dry", 3000, "g", 2200000, 66),
    ("brit_puppy_lamb_3k", "brit", "Puppy Lamb Rice", "پاپی بره برنج", "dog", "dry", 3000, "g", 2900000, 64),
    ("brit_adult_medium_lamb_3k", "brit", "Adult Medium Lamb Rice", "ادالت مدیوم بره برنج", "dog", "dry", 3000, "g", 2800000, 60),
    ("josera_minijunior_900", "josera", "Mini Junior Duck", "مینی جونیور اردک", "dog", "dry", 900, "g", 980000, 50),
    ("proplan_puppy_medium_3k", "proplan", "Puppy Medium Chicken", "پاپی مدیوم مرغ", "dog", "dry", 3000, "g", 3900000, 57),
    ("hills_puppy_medium_25", "hills", "Puppy Medium Chicken", "پاپی مدیوم مرغ", "dog", "dry", 2500, "g", 3500000, 48),
    # ---- dog wet & treats
    ("pedigree_pouch_beef_100", "pedigree", "Adult Beef Pouch", "ادالت گوشت گاو پوچ", "dog", "wet", 100, "g", 55000, 72),
    ("rc_mini_adult_pouch_85", "royal_canin", "Mini Adult Pouch", "مینی ادالت پوچ", "dog", "wet", 85, "g", 110000, 56),
    ("dentastix_small_110", "pedigree", "Dentastix Mini", "دنتاستیکس مینی", "dog", "treat", 110, "g", 260000, 79),
    ("dentastix_medium_180", "pedigree", "Dentastix Medium", "دنتاستیکس مدیوم", "dog", "treat", 180, "g", 380000, 67),
]

SELLERS = [
    {"id": "petkade", "name": "پت‌کده", "website": "https://petkade.example", "rating": 4.6, "verified": True,
     "shipping": {"flat": 60000, "free_over": 3000000}, "accuracy": 0.97, "format": "csv/fa/toman", "color": "#0e7c66"},
    {"id": "zoomall", "name": "زومال", "website": "https://zoomall.example", "rating": 4.3, "verified": True,
     "shipping": {"flat": 0, "free_over": 0}, "accuracy": 0.95, "format": "json/en/rial", "color": "#2f6fb5"},
    {"id": "miomall", "name": "میومال", "website": "https://miomall.example", "rating": 4.1, "verified": True,
     "shipping": {"flat": 75000, "free_over": 5000000}, "accuracy": 0.93, "format": "csv/fa-arabic/formatted", "color": "#b5487a"},
    {"id": "haposhop", "name": "هاپوشاپ", "website": "https://haposhop.example", "rating": 4.4, "verified": True,
     "shipping": {"flat": 45000, "free_over": 2500000}, "accuracy": 0.96, "format": "json-nested/mixed", "color": "#d97a1c"},
    {"id": "pashmaloo", "name": "دنیای پشمالو", "website": "https://pashmaloo.example", "rating": 3.4, "verified": False,
     "shipping": {"flat": 120000, "free_over": 0}, "accuracy": 0.81, "format": "csv/mixed/typos", "color": "#7a5a3a"},
    {"id": "panjetala", "name": "پنجه طلا", "website": "https://panjetala.example", "rating": 4.5, "verified": True,
     "shipping": {"flat": 55000, "free_over": 4000000}, "accuracy": 0.94, "format": "csv/fa/rial-formatted", "color": "#c79a1e"},
    {"id": "koochepet", "name": "کوچه پت", "website": "https://koochepet.example", "rating": 4.0, "verified": True,
     "shipping": {"flat": 50000, "free_over": 2000000}, "accuracy": 0.9, "format": "json/en/kg-float", "color": "#5a4fc4"},
]


def qty_en(q, unit):
    if unit == "ml":
        return random.choice([f"{q // 1000}L", f"{q // 1000} Liter"])
    if q >= 1000:
        kg_s = f"{q / 1000:g}"
        return random.choice([f"{kg_s}kg", f"{q}g", f"{kg_s} KG"])
    return random.choice([f"{q}g", f"{q} gr"])


def qty_fa(q, unit):
    if unit == "ml":
        return f"{q // 1000} لیتری".translate(FA_DIGITS)
    if q >= 1000:
        kg = f"{q / 1000:g}"
        words = {"2": "دو", "1.5": "یک و نیم", "3": "سه", "4": "چهار", "5": "پنج"}
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
        # popular products are carried by more shops
        prob = 0.42 + p[9] / 300
        stores = [s["id"] for s in SELLERS if random.random() < prob]
        while len(stores) < 3:
            extra = random.choice(SELLERS)["id"]
            if extra not in stores:
                stores.append(extra)
        carriers[p[0]] = stores

    truth, history, popularity = {}, {}, {}
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
            popularity[lid] = pop
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
            elif store == "panjetala":
                # Persian titles, price in RIAL with Persian separators, stock words
                title = f"{random.choice(b_fa_list)} {fa_line(l_fa)} {TYPE_FA[typ]} {SPECIES_FA[sp]} {qty_fa(q, unit)}"
                rows[store].append({"kala_id": lid, "onvan": title,
                                    "gheymat": f"{price * 10:,}".replace(",", "٬").translate(FA_DIGITS) + " ریال",
                                    "mojoodi": "در انبار" if avail == "in_stock" else "تمام شد",
                                    "link": f"https://panjetala.example/kala/{lid}", "zaman": checked_at()})
            elif store == "koochepet":
                # English titles without the weight; weight as a float in kg or liters
                rows[store].append({"sku": lid, "product": f"{b_en} {l_en} for {SPECIES_EN[sp]}s",
                                    "category": TYPE_EN[typ], "pack": {"value": q / 1000, "unit": "L" if unit == "ml" else "kg"},
                                    "price_toman": price, "in_stock": avail == "in_stock",
                                    "url": f"https://koochepet.example/shop/{lid}", "updated_at": checked_at()})
            else:  # pashmaloo: mixed language, typos, "هزار تومان", sometimes stale
                b = b_typo if random.random() < 0.5 else random.choice(b_fa_list)
                title = f"{b} {l_en.lower()} {SPECIES_FA[sp]} {qty_en(q, unit)}"
                if typ in ("litter", "treat", "wet"):
                    title = f"{TYPE_FA[typ]} {title}"
                rows[store].append({"ref": lid, "title": title, "price": f"{price // 1000:,} هزار تومان",
                                    "stock": "yes" if avail == "in_stock" else "no",
                                    "url": f"https://pashmaloo.example/{lid}",
                                    "updated": checked_at(stale=random.random() < 0.35)})
            history[lid] = make_history(price)

    # --- deliberately hard cases ------------------------------------------
    def extra(store, row, key, price, pop=40):
        truth[row[next(iter(row))]] = key
        popularity[row[next(iter(row))]] = pop
        rows[store].append(row)
        history[row[next(iter(row))]] = make_history(price)

    lid = nid("pashmaloo")   # 1) missing product line -> must go to human review
    extra("pashmaloo", {"ref": lid, "title": "غذای گربه رویال کنین ۲ کیلو", "price": "3,190 هزار تومان",
                        "stock": "yes", "url": f"https://pashmaloo.example/{lid}", "updated": checked_at()}, "rc_fit32_2k", 3190000)
    lid = nid("miomall")     # 2) missing life stage
    extra("miomall", {"code": lid, "product_name": arabicize("غذای خشک بریت کر بدون غلات سالمون مخصوص گربه"),
                      "weight": "۲ کیلوگرم", "price": "۲٬۲۹۰٬۰۰۰ تومان", "status": "موجود",
                      "url": f"https://miomall.example/{lid}", "checked": checked_at()}, "brit_adult_salmon_gf_2k", 2290000)
    lid = nid("pashmaloo")   # 3) suspicious price (probably a 400g pack priced as 2kg, or bait)
    extra("pashmaloo", {"ref": lid, "title": "رویال کانین indoor 27 گربه 2kg", "price": "1,150 هزار تومان",
                        "stock": "yes", "url": f"https://pashmaloo.example/{lid}", "updated": checked_at()}, "rc_indoor27_2k", 1150000)
    lid = nid("koochepet")   # 4) suspicious price on a different shop
    extra("koochepet", {"sku": lid, "product": "Whiskas Adult Tuna for Cats", "category": "Dry Food",
                        "pack": {"value": 1.4, "unit": "kg"}, "price_toman": 590000, "in_stock": True,
                        "url": f"https://koochepet.example/shop/{lid}", "updated_at": checked_at()}, "whiskas_adult_tuna_14", 590000)

    def write_csv(name, data):
        with open(OUT / name, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(data[0].keys()))
            w.writeheader()
            w.writerows(data)

    write_csv("petkade.csv", rows["petkade"])
    write_csv("miomall.csv", rows["miomall"])
    write_csv("pashmaloo.csv", rows["pashmaloo"])
    write_csv("panjetala.csv", rows["panjetala"])
    (OUT / "zoomall.json").write_text(json.dumps({"items": rows["zoomall"]}, ensure_ascii=False, indent=1), "utf-8")
    (OUT / "haposhop.json").write_text(json.dumps(rows["haposhop"], ensure_ascii=False, indent=1), "utf-8")
    (OUT / "koochepet.json").write_text(json.dumps({"products": rows["koochepet"]}, ensure_ascii=False, indent=1), "utf-8")
    (OUT / "sellers.json").write_text(json.dumps(SELLERS, ensure_ascii=False, indent=1), "utf-8")
    (DATA / "ground_truth.json").write_text(json.dumps(truth, indent=1), "utf-8")
    (DATA / "price_history.json").write_text(json.dumps(history), "utf-8")
    (DATA / "traffic_history.json").write_text(json.dumps(make_traffic(popularity)), "utf-8")
    (DATA / "search_log_seed.json").write_text(json.dumps(make_search_log(), ensure_ascii=False), "utf-8")
    print(f"wrote {len(truth)} raw listings from {len(SELLERS)} stores, {len(PRODUCTS)} real products -> {OUT}")


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


def make_traffic(popularity, days=30):
    """Synthetic daily views and outbound clicks per listing (weekends busier, slow growth)."""
    out = {}
    for lid, pop in popularity.items():
        ctr = random.uniform(0.05, 0.16)
        series = []
        for d in range(days, -1, -1):          # d == 0 is today, only partly over
            day = NOW - timedelta(days=d)
            weekend = 1.35 if day.weekday() in (3, 4) else 1.0   # Thu/Fri in Iran
            growth = 1 + (days - d) * 0.012
            part = 0.55 if d == 0 else 1.0
            views = max(0, int(random.gauss(pop * 0.9, pop * 0.25) * weekend * growth * part))
            clicks = sum(random.random() < ctr for _ in range(views))
            series.append([day.date().isoformat(), views, clicks])
        out[lid] = series
    return out


QUERIES = [  # (query, relative frequency, finds products?)
    ("غذای خشک گربه", 30, True), ("رویال کنین", 26, True), ("خاک گربه", 22, True), ("غذای گربه عقیم", 14, True),
    ("غذای بچه گربه", 13, True), ("رفلکس پلاس", 12, True), ("غذای سگ", 11, True), ("خاک بدون عطر", 10, True),
    ("تشویقی گربه", 9, True), ("ویسکاس", 9, True), ("پوچ گربه", 8, True), ("غذای توله سگ", 7, True),
    ("دریمیز", 7, True), ("غذای گربه ماهی", 6, True), ("مالت گربه", 5, True), ("پروپلن", 5, True),
    ("قلاده سگ", 6, False), ("اسباب بازی گربه", 6, False), ("شامپو سگ", 5, False), ("ظرف غذا گربه", 4, False),
    ("ویتامین گربه", 4, False), ("جای خواب سگ", 3, False), ("رویل کنن", 3, True), ("غذای همستر", 3, False),
]


def make_search_log(days=30):
    log = []
    for d in range(days, -1, -1):
        day = NOW - timedelta(days=d)
        volume = int(random.gauss(60, 10) * (1 + (days - d) * 0.015) * (0.55 if d == 0 else 1))
        picks = random.choices(QUERIES, weights=[w for _, w, _ in QUERIES], k=max(volume, 10))
        for q, _, ok in picks:
            minute = random.randint(0, 1439) if d else -random.randint(1, 600)   # today: earlier than now
            ts = ((day.replace(hour=0, minute=0) if d else day) + timedelta(minutes=minute)).isoformat(timespec="minutes")
            log.append({"ts": ts, "q": q, "results": random.randint(3, 20) if ok else 0, "understood": ok, "seed": True})
    return log


if __name__ == "__main__":
    build()
