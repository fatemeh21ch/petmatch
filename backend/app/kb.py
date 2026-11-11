"""Knowledge base: the curated dictionary that turns messy fa/en words into
canonical attribute tokens. In production this grows from the admin matching
review queue (every human decision teaches a new alias)."""

BRANDS = {
    "royal_canin": "Royal Canin", "reflex": "Reflex Plus", "josera": "Josera", "brit": "Brit Care",
    "farmina": "Farmina N&D", "monge": "Monge", "ever_clean": "Ever Clean", "cats_best": "Cat's Best",
    "pars_litter": "ParsLitter", "dreamies": "Dreamies", "catit": "Catit", "pedigree": "Pedigree",
    "gimcat": "GimCat", "whiskas": "Whiskas", "proplan": "Pro Plan", "hills": "Hill's",
}
BRAND_FA = {
    "royal_canin": "رویال کنین", "reflex": "رفلکس پلاس", "josera": "جوسرا", "brit": "بریت کر",
    "farmina": "فارمینا", "monge": "مونژ", "ever_clean": "اورکلین", "cats_best": "کتس بست",
    "pars_litter": "پارس لیتر", "dreamies": "دریمیز", "catit": "کت ایت", "pedigree": "پدیگری", "gimcat": "جیم کت",
    "whiskas": "ویسکاس", "proplan": "پروپلن", "hills": "هیلز",
}
BRAND_SPECIES = {"dreamies": "cat", "catit": "cat", "gimcat": "cat", "cats_best": "cat", "ever_clean": "cat",
                 "pars_litter": "cat", "pedigree": "dog", "whiskas": "cat"}
BRAND_TYPE = {"ever_clean": "litter", "cats_best": "litter", "pars_litter": "litter", "dreamies": "treat",
              "catit": "treat", "gimcat": "treat"}

SPECIES = {"cat", "dog"}
TYPES = {"dry", "wet", "litter", "treat"}
STAGES = {"kitten", "puppy", "junior", "adult", "senior"}
SIZES = {"mini", "medium", "large"}
FLAVORS = {"chicken", "salmon", "lamb", "tuna", "duck", "pumpkin", "rice", "malt", "beef"}
# words that mean a family of proteins: "ماهی" (fish) = salmon or tuna
FLAVOR_GROUPS = {"fish": {"salmon", "tuna"}}
VARIANTS = {"unscented", "lavender", "babypowder", "extrastrong", "bentonite", "creamy", "natural", "original"}
# product lines that are, by definition, for adult animals
LINE_STAGE = {"indoor": "adult", "fit": "adult", "sterilised": "adult", "catelux": "adult", "persian": "adult",
              "carismo": "senior"}
LINES = {"indoor", "fit", "sterilised", "catelux", "gravy", "pouch", "dentastix", "paste", "persian", "carismo"}

_SURFACE = {
    # brands (incl. common misspellings seen in feeds)
    "royal_canin": ["royal canin", "royalcanin", "رویال کنین", "رویالکنین", "رویال کانین", "رویال", "royal"],
    "reflex": ["reflex plus", "reflex", "رفلکس پلاس", "رفلکس پلاص", "رفلکس"],
    "josera": ["josera", "جوسرا", "جوزرا"],
    "brit": ["brit care", "brit", "بریت کر", "بریت کیر", "بریت"],
    "farmina": ["farmina n and d", "farmina", "n and d", "فارمینا"],
    "monge": ["monge", "مونژ", "مونژه"],
    "ever_clean": ["ever clean", "everclean", "اورکلین", "اور کلین"],
    "cats_best": ["cat s best", "cats best", "کتس بست", "کت بست"],
    "pars_litter": ["parslitter", "pars litter", "پارس لیتر"],
    "dreamies": ["dreamies", "دریمیز", "دریمز"],
    "catit": ["catit", "کت ایت", "کتیت"],
    "pedigree": ["pedigree", "پدیگری"],
    "gimcat": ["gimcat", "جیم کت", "جیمکت"],
    "whiskas": ["whiskas", "ویسکاس", "ویسکاز"],
    "proplan": ["purina pro plan", "pro plan", "proplan", "پروپلن", "پرو پلن", "پروپلان"],
    "hills": ["hill s science plan", "hills science plan", "hill s", "hills", "هیلز", "هیلس"],
    # species
    "cat": ["cat", "cats", "گربه", "گربه ها", "پیشی"],
    "dog": ["dog", "dogs", "سگ", "سگ ها"],
    # product type
    "dry": ["dry food", "dry", "غذای خشک", "غذا خشک", "خشک"],
    "wet": ["wet food", "wet", "غذای تر", "غذای مرطوب", "کنسرو", "تر"],
    "litter": ["litter", "خاک گربه", "خاک"],
    "treat": ["treat", "treats", "تشویقی", "اسنک", "تریت"],
    # life stage
    "kitten": ["kitten", "کیتن", "بچه گربه"],
    "puppy": ["puppy", "پاپی", "توله سگ", "توله"],
    "junior": ["junior", "جونیور"],
    "adult": ["adult", "ادالت", "بالغ"],
    "senior": ["senior", "سینیور", "مسن"],
    # size
    "mini": ["mini", "مینی", "نژاد کوچک", "small", "اسمال"],
    "medium": ["medium", "مدیوم", "نژاد متوسط"],
    "large": ["large", "maxi", "لارج", "مکسی", "نژاد بزرگ"],
    # flavor / protein
    "chicken": ["chicken", "مرغ", "چیکن", "طعم مرغ"],
    "salmon": ["salmon", "سالمون", "ماهی سالمون", "سالمن"],
    "lamb": ["lamb", "بره", "گوشت بره"],
    "tuna": ["tuna", "تن ماهی", "تن", "ماهی تن"],
    "fish": ["fish", "ماهی", "طعم ماهی", "ماهی دار", "ماهی‌دار"],
    "duck": ["duck", "اردک"],
    "pumpkin": ["pumpkin", "کدو حلوایی", "کدو"],
    "rice": ["rice", "برنج"],
    "malt": ["malt", "مالت"],
    "beef": ["beef", "گوشت گاو", "گوساله", "گوشت گوساله", "بیف"],
    # variants
    "unscented": ["unscented", "fragrance free", "بدون عطر", "بی عطر", "بی بو", "بدون بو"],
    "lavender": ["lavender", "اسطوخودوس", "لاوندر"],
    "babypowder": ["baby powder", "پودر بچه"],
    "extrastrong": ["extra strong", "اکسترا استرانگ"],
    "bentonite": ["bentonite", "بنتونیت"],
    "creamy": ["creamy", "کرمی"],
    "natural": ["natural", "نچرال"],
    "original": ["original", "اورجینال"],
    "grainfree": ["grain free", "grainfree", "بدون غلات", "گرین فری"],
    # product lines
    "indoor": ["indoor", "ایندور", "آپارتمانی"],
    "fit": ["fit", "فیت"],
    "sterilised": ["sterilised", "sterilized", "استریلایز", "عقیم", "عقیم شده"],
    "catelux": ["catelux", "کتلوکس"],
    "gravy": ["gravy", "گریوی"],
    "pouch": ["pouch", "پوچ"],
    "dentastix": ["dentastix", "دنتاستیکس"],
    "paste": ["paste", "soft paste", "پیست", "خمیر"],
    "persian": ["persian", "پرشین", "پرشیان"],
    "carismo": ["carismo", "کریسمو"],
}

PHRASES = {surface: canon for canon, forms in _SURFACE.items() for surface in forms}
VOCAB = [k for k in PHRASES if len(k) >= 3]

STOPWORDS = {
    "مخصوص", "برای", "مناسب", "و", "با", "از", "به", "غذای", "غذا", "food", "for", "and", "with", "of", "the",
    "care", "plus", "پلاس", "کر", "soft", "soft", "pack", "بسته", "عدد", "عددی", "تومان", "toman", "kg", "g",
    "می", "خواهم", "میخوام", "یه", "یک", "یا", "که", "هست", "باشه", "ای", "ام", "اش", "شده", "دارم", "داره", "دارد",
    "زندگی", "کنه", "میکنه", "کند", "هستش", "خوب", "خوبه", "بهترین", "چی", "چه", "میخواهم", "لطفا", "من", "برام",
}

FA_LABEL = {
    "cat": "گربه", "dog": "سگ", "dry": "غذای خشک", "wet": "غذای تر", "litter": "خاک گربه", "treat": "تشویقی",
    "kitten": "بچه‌گربه", "puppy": "توله‌سگ", "junior": "جونیور", "adult": "بالغ", "senior": "مسن",
    "mini": "نژاد کوچک", "medium": "نژاد متوسط", "large": "نژاد بزرگ", "chicken": "مرغ", "salmon": "سالمون",
    "lamb": "بره", "tuna": "تن ماهی", "fish": "ماهی", "duck": "اردک", "pumpkin": "کدو حلوایی", "rice": "برنج", "malt": "مالت", "beef": "گوشت گاو",
    "unscented": "بدون عطر", "lavender": "اسطوخودوس", "babypowder": "پودر بچه", "extrastrong": "اکسترا استرانگ",
    "bentonite": "بنتونیت", "creamy": "کرمی", "natural": "نچرال", "original": "اورجینال", "grainfree": "بدون غلات",
    "indoor": "ایندور", "fit": "فیت", "sterilised": "استریلایز", "catelux": "کتلوکس", "gravy": "گریوی",
    "pouch": "پوچ", "dentastix": "دنتاستیکس", "paste": "خمیر", "persian": "پرشین", "carismo": "کریسمو",
}
EN_LABEL = {
    "kitten": "Kitten", "puppy": "Puppy", "junior": "Junior", "adult": "Adult", "senior": "Senior",
    "mini": "Mini", "medium": "Medium", "large": "Large", "chicken": "Chicken", "salmon": "Salmon",
    "lamb": "Lamb", "tuna": "Tuna", "duck": "Duck", "pumpkin": "Pumpkin", "rice": "Rice", "malt": "Malt",
    "unscented": "Unscented", "lavender": "Lavender", "babypowder": "Baby Powder", "extrastrong": "Extra Strong",
    "bentonite": "Bentonite", "creamy": "Creamy", "natural": "Natural", "original": "Original",
    "grainfree": "Grain Free", "indoor": "Indoor", "fit": "Fit", "sterilised": "Sterilised", "catelux": "Catelux",
    "gravy": "Gravy", "pouch": "Pouch", "dentastix": "Dentastix", "paste": "Paste", "beef": "Beef",
    "persian": "Persian", "carismo": "Carismo",
}
