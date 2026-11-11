"""Persian/English text normalization and attribute extraction.

Everything that reads a title or a query goes through here, so a listing and a
search query that mean the same thing end up as the same canonical tokens.
"""
import re

from rapidfuzz import fuzz, process

from . import kb

_ARABIC = str.maketrans({"ي": "ی", "ك": "ک", "ة": "ه", "أ": "ا", "إ": "ا", "ؤ": "و", "ٔ": "", "ـ": ""})
_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
_ZWNJ = "‌"


def normalize(s: str) -> str:
    """Unify letters, digits, half-spaces and case. 'رويال‌كنين ۲كيلو' -> 'رویال کنین 2 کیلو'."""
    s = (s or "").translate(_ARABIC).translate(_DIGITS).lower()
    s = s.replace(_ZWNJ, " ").replace("٬", ",").replace("،", ",")
    s = re.sub(r"(\d)\s*[/٫]\s*(\d)", r"\1.\2", s)          # 1/5 or 1٫5 -> 1.5
    s = re.sub(r"(\d)([^\d\s.,x×])", r"\1 \2", s)            # 2kg -> 2 kg
    s = re.sub(r"([^\d\s.,])(\d)", r"\1 \2", s)              # کیلو2 -> کیلو 2
    s = re.sub(r"[()\[\]{}|\"'“”«»!?؟:;+\-_/\\]", " ", s)
    s = re.sub(r"&", " and ", s)
    return re.sub(r"\s+", " ", s).strip()


# ---------------------------------------------------------------- quantities
_UNIT = r"(kg|kilo|کیلوگرم|کیلویی|کیلو|gr|g|gram|گرمی|گرم|l|lit|liter|litre|لیتری|لیتر|ml|میلی ?لیتر)"
_QTY_RE = re.compile(r"(?<![\w.])(\d+(?:\.\d+)?)\s*" + _UNIT + r"(?![a-z])")
_WORD_QTY_RE = re.compile(r"(یک و نیم|دو و نیم|نیم|یک|دو|سه|چهار|پنج|ده|پانزده)\s*(کیلویی|کیلوگرم|کیلو|لیتری|لیتر)")
_PACK_RE = re.compile(r"(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*" + _UNIT)
_WORDS = {"نیم": .5, "یک": 1, "یک و نیم": 1.5, "دو": 2, "دو و نیم": 2.5, "سه": 3, "چهار": 4, "پنج": 5, "ده": 10, "پانزده": 15}


def _to_base(n: float, unit: str):
    u = unit.replace(" ", "")
    if u in ("kg", "kilo", "کیلوگرم", "کیلویی", "کیلو"):
        return round(n * 1000), "g"
    if u in ("g", "gr", "gram", "گرم", "گرمی"):
        return round(n), "g"
    if u in ("l", "lit", "liter", "litre", "لیتر", "لیتری"):
        return round(n * 1000), "ml"
    return round(n), "ml"


def parse_quantity(text: str):
    """Returns (amount, 'g'|'ml', matched_span) or (None, None, None). Text must be normalized."""
    m = _PACK_RE.search(text)
    if m:
        amount, unit = _to_base(float(m.group(2)), m.group(3))
        return amount * int(m.group(1)), unit, m.group(0)
    m = _QTY_RE.search(text)
    if m:
        amount, unit = _to_base(float(m.group(1)), m.group(2))
        return amount, unit, m.group(0)
    m = _WORD_QTY_RE.search(text)
    if m:
        amount, unit = _to_base(_WORDS[m.group(1)], m.group(2))
        return amount, unit, m.group(0)
    return None, None, None


# ---------------------------------------------------------------- tokens
def _phrase_map(text: str, table: dict) -> tuple[str, list]:
    """Replace multi-word phrases (longest first) with canonical tokens."""
    found = []
    for phrase in sorted(table, key=len, reverse=True):
        pat = r"(?<![\w])" + re.escape(phrase) + r"(?![\w])"
        if re.search(pat, text):
            text = re.sub(pat, " ", text)
            found.append(table[phrase])
    return text, found


def canonical_tokens(text: str, fuzzy: bool = False) -> tuple[list, list]:
    """Map a normalized string to canonical tokens. Returns (tokens, unknown_words).

    With fuzzy=True unknown words are snapped to the closest vocabulary word
    (typo tolerance for user queries: 'رویل کنین' -> royal_canin)."""
    rest, tokens = _phrase_map(text, kb.PHRASES)
    unknown = []
    for w in rest.split():
        if w in kb.PHRASES:
            tokens.append(kb.PHRASES[w])
        elif re.fullmatch(r"\d+(\.\d+)?", w):
            tokens.append(w)
        elif w in kb.STOPWORDS or len(w) < 2:
            continue
        elif fuzzy and len(w) >= 3:
            hit = process.extractOne(w, kb.VOCAB, scorer=fuzz.ratio, score_cutoff=78)
            if hit:
                tokens.append(kb.PHRASES[hit[0]])
            else:
                unknown.append(w)
        else:
            unknown.append(w)
    return tokens, unknown


def extract(title: str, extra: str = "") -> dict:
    """Pull structured attributes out of a free-text listing title."""
    norm = normalize(f"{title} {extra}")
    amount, unit, span = parse_quantity(norm)
    body = norm.replace(span, " ") if span else norm
    tokens, unknown = canonical_tokens(body)
    toks = set(tokens)

    attrs = {
        "brand": next((t for t in tokens if t in kb.BRANDS), None),
        "species": next((t for t in tokens if t in kb.SPECIES), None),
        "type": next((t for t in tokens if t in kb.TYPES), None),
        "stage": next((t for t in tokens if t in kb.STAGES), None),
        "size": sorted(toks & kb.SIZES),
        "flavor": sorted(toks & kb.FLAVORS),
        "variant": sorted(toks & kb.VARIANTS),
        "line": sorted(toks & kb.LINES),
        "numbers": sorted(t for t in toks if t.isdigit()),
        "grain_free": "grainfree" in toks,
        "amount": amount,
        "unit": unit,
        "inferred": [],
    }
    # Brand implies species for single-species brands (Dreamies is always cat).
    if not attrs["species"] and attrs["brand"] in kb.BRAND_SPECIES:
        attrs["species"] = kb.BRAND_SPECIES[attrs["brand"]]
        attrs["inferred"].append("species")
    if not attrs["type"]:
        attrs["type"] = _infer_type(attrs)
        if attrs["type"]:
            attrs["inferred"].append("type")
    attrs["tokens"] = sorted(toks)
    attrs["unknown"] = unknown
    attrs["normalized"] = norm
    return attrs


def _infer_type(a):
    if a["brand"] in kb.BRAND_TYPE:
        return kb.BRAND_TYPE[a["brand"]]
    if set(a["line"]) & {"pouch", "gravy"}:
        return "wet"
    if a["unit"] == "g" and a["amount"] and a["amount"] >= 300:
        return "dry"
    return None
