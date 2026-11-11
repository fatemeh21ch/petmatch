import json

import pytest
from fastapi.testclient import TestClient

from app import pipeline
from app.main import app
from app.search import parse_rules
from app.text import extract, normalize, parse_quantity

client = TestClient(app)


# ---------------------------------------------------------------- normalization
@pytest.mark.parametrize("raw,expected", [
    ("رويال‌كنين", "رویال کنین"),          # Arabic letters + half-space
    ("۲كيلو", "2 کیلو"),                    # Persian digits glued to unit
    ("Royal Canin 2KG", "royal canin 2 kg"),
    ("۱/۵ کیلوگرم", "1.5 کیلوگرم"),
])
def test_normalize(raw, expected):
    assert normalize(raw) == expected


@pytest.mark.parametrize("text,amount,unit", [
    ("2 kg", 2000, "g"), ("2000 gr", 2000, "g"), ("دو کیلویی", 2000, "g"), ("1.5 kg", 1500, "g"),
    ("6 لیتری", 6000, "ml"), ("5x15 g", 75, "g"), ("400 گرمی", 400, "g"),
])
def test_quantity(text, amount, unit):
    a, u, _ = parse_quantity(normalize(text))
    assert (a, u) == (amount, unit)


def test_extract_cross_language_same_attributes():
    fa = extract("غذای خشک گربه رویال کنین کیتن ۲ کیلوگرم")
    en = extract("Royal Canin Kitten Cat Dry Food 2000g")
    for k in ("brand", "species", "type", "stage", "amount", "unit"):
        assert fa[k] == en[k], k


# ---------------------------------------------------------------- matching rules
def test_different_weight_never_merges():
    s, conflicts, _ = pipeline.compare(extract("Royal Canin Kitten 2kg"), extract("Royal Canin Kitten 400g"))
    assert conflicts


def test_different_formula_never_merges():
    _, conflicts, _ = pipeline.compare(extract("Royal Canin Indoor 27 Cat 2kg"), extract("Royal Canin Fit 32 Cat 2kg"))
    assert conflicts


def test_missing_attribute_goes_to_review_not_auto():
    s, conflicts, unc = pipeline.compare(extract("غذای گربه رویال کنین ۲ کیلو"), extract("Royal Canin Fit 32 Cat Dry Food 2kg"))
    assert not conflicts and unc and s < pipeline.AUTO_MERGE


def test_catalog_matching_quality():
    ev = pipeline.build_catalog()["stats"]["evaluation"]
    assert ev["precision"] >= 0.98      # false merges are the expensive error
    assert ev["recall"] >= 0.9


# ---------------------------------------------------------------- intent
def test_intent_budget_typo_and_sort():
    it = parse_rules("خاک گربه بدون عطر ارزون‌ترین زیر ۹۰۰ هزار")
    assert (it.type, it.species, it.sort, it.max_price) == ("litter", "cat", "cheapest", 900_000)
    assert it.variants == ["unscented"]


def test_intent_typo_tolerance():
    it = parse_rules("رویل کنین ایندور")
    assert it.brand == "royal_canin" and "indoor" in it.lines


def test_intent_exclusion():
    it = parse_rules("غذای خشک گربه بدون مرغ")
    assert it.exclude_flavors == ["chicken"] and not it.flavors


def test_fish_means_salmon_or_tuna():
    r = client.get("/api/v1/search", params={"q": "ماهی"}).json()
    assert r["results"]
    for x in r["results"]:
        flavors = client.get(f"/api/v1/products/{x['id']}").json()["product"]["flavor"]
        assert set(flavors) & {"salmon", "tuna"}, x["name_fa"]


def test_no_fish_excludes_both():
    it = parse_rules("غذای گربه بدون ماهی")
    assert set(it.exclude_flavors) == {"salmon", "tuna"} and not it.flavors


def test_unknown_word_does_not_return_whole_catalog():
    r = client.get("/api/v1/search", params={"q": "زرافه"}).json()
    assert r["total"] == 0 and r["not_understood"]


def test_feeding_estimate_is_plausible():
    from app import feeding
    # adult neutered 4 kg cat on dry food: about 60–75 g/day on typical labels
    p = {"species": "cat", "type": "dry", "unit": "g", "amount": 2000}
    f = feeding.estimate({"species": "cat", "weight_kg": 4, "age_months": 36, "sterilised": True}, p, {"total": 3_000_000})
    assert 55 <= f["grams_per_day"] <= 80
    assert 25 <= f["days_per_pack"] <= 36
    # kittens eat more per kg than adults; treats and litter get no estimate
    kit = feeding.estimate({"species": "cat", "weight_kg": 4, "age_months": 6}, p, {"total": 3_000_000})
    assert kit["grams_per_day"] > f["grams_per_day"]
    assert feeding.estimate({"species": "cat", "weight_kg": 4}, {**p, "type": "treat"}, {"total": 1}) is None
    assert feeding.estimate({"species": "cat"}, p, {"total": 1}) is None   # no weight → no guess


def test_monthly_sort_orders_by_monthly_cost():
    pet = json.dumps({"species": "cat", "age_months": 36, "weight_kg": 4, "sterilised": True})
    r = client.get("/api/v1/search", params={"q": "غذای خشک گربه", "sort": "monthly", "pet": pet}).json()
    # suitable products first (wrong life stage is demoted on purpose), cheapest per month within that group
    fits = [x for x in r["results"] if x["feeding"] and all(ok for _, ok in x["fit_notes"])]
    costs = [x["feeding"]["monthly_cost"] for x in fits]
    assert r["feeding_available"] and len(costs) > 3 and costs == sorted(costs)


def test_monthly_sort_from_query_text():
    assert parse_rules("غذای گربه کمترین هزینه ماهانه").sort == "monthly"


def test_weight_is_not_a_budget():
    it = parse_rules("غذای سگ تا 3 کیلو")
    assert it.max_price is None and it.amount == 3000


# ---------------------------------------------------------------- API
def test_search_api_and_pet_profile_excludes_allergen():
    pet = json.dumps({"species": "cat", "age_months": 6, "allergies": ["chicken"]})
    r = client.get("/api/v1/search", params={"q": "غذای خشک گربه", "pet": pet}).json()
    assert r["results"]
    assert all("chicken" not in client.get(f"/api/v1/products/{x['id']}").json()["product"]["flavor"] for x in r["results"])
    # a kitten food must rank above adult food for a 6-month-old cat
    assert r["results"][0]["fit_notes"][0][1] is True


def test_suspicious_price_is_never_recommended():
    r = client.get("/api/v1/search", params={"q": "royal canin indoor 27"}).json()
    p = client.get(f"/api/v1/products/{r['results'][0]['id']}").json()
    flagged = [o for o in p["offers"] if o["anomaly"]]
    assert flagged and p["best_id"] not in {o["listing_id"] for o in flagged}


def test_admin_requires_token():
    assert client.get("/api/v1/admin/pipeline").status_code == 401
    assert client.get("/api/v1/admin/pipeline", headers={"X-Admin-Token": "petmatch-admin"}).status_code == 200


def test_input_validation():
    assert client.get("/api/v1/search", params={"q": "x" * 500}).status_code == 422
    assert client.get("/api/v1/search", params={"q": "a", "pet": "{bad json"}).status_code == 400
