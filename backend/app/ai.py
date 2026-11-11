"""Claude is used in two narrow places where rules fall short:
1. understanding free-form queries the rule parser could not fully parse;
2. writing a short, grounded explanation of why the top result is the best pick.

Both are optional: without credentials the product still works on rules +
templates. The model only sees computed facts and must not invent anything.
"""
import json
import os

try:
    import anthropic
except ImportError:  # pragma: no cover
    anthropic = None

MODEL = "claude-opus-5-5"
_client = None


def available() -> bool:
    return anthropic is not None and bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def _get():
    global _client
    if _client is None:
        _client = anthropic.Anthropic(timeout=20, max_retries=1)
    return _client


def _call(system, user, schema=None, max_tokens=1500):
    kwargs = dict(
        model=MODEL, max_tokens=max_tokens, system=system,
        messages=[{"role": "user", "content": user}],
        betas=["server-side-fallback-2026-07-01"], fallbacks="default",
        output_config={"effort": "low", **({"format": {"type": "json_schema", "schema": schema}} if schema else {})},
    )
    resp = _get().beta.messages.create(**kwargs)
    if resp.stop_reason == "refusal":
        return None
    return next((b.text for b in resp.content if b.type == "text"), None)


INTENT_SCHEMA = {
    "type": "object",
    "properties": {
        "species": {"type": "string", "enum": ["none", "cat", "dog"]},
        "type": {"type": "string", "enum": ["none", "dry", "wet", "litter", "treat"]},
        "stage": {"type": "string", "enum": ["none", "kitten", "puppy", "junior", "adult", "senior"]},
        "brand": {"type": "string", "enum": ["none", "royal_canin", "reflex", "josera", "brit", "farmina", "monge",
                                                      "ever_clean", "cats_best", "pars_litter", "dreamies", "catit",
                                                      "pedigree", "gimcat"]},
        "sizes": {"type": "array", "items": {"type": "string", "enum": ["mini", "medium", "large"]}},
        "flavors": {"type": "array", "items": {"type": "string", "enum": ["chicken", "salmon", "lamb", "tuna", "duck", "pumpkin", "rice", "malt"]}},
        "exclude_flavors": {"type": "array", "items": {"type": "string", "enum": ["chicken", "salmon", "lamb", "tuna", "duck", "pumpkin", "rice", "malt"]}},
        "variants": {"type": "array", "items": {"type": "string", "enum": ["unscented", "lavender", "babypowder"]}},
        "lines": {"type": "array", "items": {"type": "string", "enum": ["indoor", "fit", "sterilised", "gravy", "pouch", "dentastix", "paste"]}},
        "grain_free": {"type": "boolean"},
        "amount_grams_or_ml": {"type": "integer", "description": "0 if not specified"},
        "max_price_toman": {"type": "integer", "description": "0 if not specified"},
        "sort": {"type": "string", "enum": ["best", "cheapest", "unit_price", "rating"]},
    },
    "required": ["species", "type", "stage", "brand", "sizes", "flavors", "exclude_flavors", "variants", "lines",
                 "grain_free", "amount_grams_or_ml", "max_price_toman", "sort"],
    "additionalProperties": False,
}

INTENT_SYSTEM = """You convert Persian or English shopping queries for a pet-products price comparison site into a structured filter.
Only set a field when the user clearly asked for it; otherwise use "none", 0, false or an empty list. Map health/lifestyle descriptions to product attributes when the mapping is standard
(e.g. "گربه‌ام عقیم شده" -> lines ["sterilised"], "آپارتمانی" -> lines ["indoor"], "توله" -> puppy, "به مرغ حساسیت دارد" -> exclude_flavors ["chicken"],
"بو نده" for litter -> variants ["unscented"]). Prices are in Toman; "۲ میلیون" = 2000000. sort: "cheapest" for cheapest, "unit_price" for best value per kg,
"rating" for most reliable shop, otherwise "best". Never infer medical diagnoses."""


def parse_intent(query: str):
    if not available():
        return None
    try:
        text = _call(INTENT_SYSTEM, query, INTENT_SCHEMA, max_tokens=1200)
        return json.loads(text) if text else None
    except Exception as e:  # network, auth, rate limit: degrade to rules
        print("AI intent failed:", type(e).__name__, e)
        return None


EXPLAIN_SYSTEM = """تو دستیار خرید یک سایت مقایسه قیمت محصولات حیوانات خانگی هستی.
فقط با استفاده از «داده‌ها»ی داده‌شده، در ۲ تا ۳ جمله کوتاه فارسی توضیح بده چرا این پیشنهاد بهترین انتخاب برای این جست‌وجوست.
عدد یا ادعایی که در داده‌ها نیست نساز. توصیه پزشکی یا درمانی نکن. لحن صمیمی و دقیق. قیمت‌ها را با جداکننده هزارگان و واحد تومان بنویس."""


def explain(query: str, facts: dict):
    if not available() or not facts:
        return None
    try:
        payload = {k: v for k, v in facts.items() if k != "reasons"}
        return _call(EXPLAIN_SYSTEM, f"جست‌وجوی کاربر: {query}\n\nداده‌ها:\n{json.dumps(payload, ensure_ascii=False)}", max_tokens=1500)
    except Exception as e:
        print("AI explain failed:", type(e).__name__, e)
        return None
