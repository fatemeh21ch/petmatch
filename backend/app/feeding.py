"""Estimated monthly feeding cost: "how many weeks does this bag last for *my* pet, and what does that cost per month?"

Daily energy uses the standard veterinary formula
    RER = 70 × weight_kg^0.75            (resting energy, kcal/day)
    daily kcal = RER × life-stage factor  (activity / growth / neutering)
and grams per day = daily kcal ÷ energy density of the food.

We do NOT have the energy value printed on each product's label, so the demo uses typical category averages
(dry ≈ 3.7 kcal/g, wet ≈ 0.95 kcal/g). The UI says so explicitly. In production the kcal value comes from the
store feed or the package, and the label's own feeding guide wins when available.
"""

ENERGY_DENSITY = {"dry": 3.7, "wet": 0.95}   # kcal per gram — category averages, not product labels
DAYS_PER_MONTH = 30
# an opened bag of dry food is usually best used within ~6–8 weeks; very large packs may go stale first
FRESHNESS_WEEKS = 10


def life_factor(species: str, age_months: int | None, sterilised: bool) -> tuple[float, str]:
    if species == "cat":
        if age_months is not None and age_months < 12:
            return 2.5, "بچه‌گربه در حال رشد"
        if age_months is not None and age_months >= 84:
            return 1.1, "گربه مسن"
        return (1.2, "گربه بالغ عقیم‌شده") if sterilised else (1.4, "گربه بالغ")
    if age_months is not None and age_months < 4:
        return 3.0, "توله زیر ۴ ماه"
    if age_months is not None and age_months < 12:
        return 2.0, "توله در حال رشد"
    if age_months is not None and age_months >= 84:
        return 1.4, "سگ مسن"
    return (1.6, "سگ بالغ عقیم‌شده") if sterilised else (1.8, "سگ بالغ")


def daily_need(pet: dict) -> dict | None:
    w = pet.get("weight_kg") if pet else None
    if not w or pet.get("species") not in ("cat", "dog"):
        return None
    rer = 70 * w ** 0.75
    factor, label = life_factor(pet["species"], pet.get("age_months"), bool(pet.get("sterilised")))
    return dict(kcal_per_day=round(rer * factor), rer=round(rer), factor=factor, factor_label=label, weight_kg=w)


def estimate(pet: dict | None, product: dict, offer: dict | None) -> dict | None:
    """None when it doesn't apply: no weight in the profile, other species, not a main meal (treats, litter)."""
    if not pet or not offer or product["species"] != pet.get("species"):
        return None
    density = ENERGY_DENSITY.get(product["type"])
    need = daily_need(pet)
    if not density or not need or product["unit"] != "g" or not product["amount"]:
        return None
    grams_per_day = need["kcal_per_day"] / density
    days = product["amount"] / grams_per_day
    monthly = offer["total"] / days * DAYS_PER_MONTH
    return dict(
        grams_per_day=round(grams_per_day),
        days_per_pack=round(days, 1),
        weeks_per_pack=round(days / 7, 1),
        packs_per_month=round(DAYS_PER_MONTH / days, 2),
        monthly_cost=int(round(monthly, -3)),
        daily_cost=int(round(offer["total"] / days, -2)),
        kcal_per_day=need["kcal_per_day"],
        factor=need["factor"],
        factor_label=need["factor_label"],
        rer=need["rer"],
        density=density,
        weight_kg=need["weight_kg"],
        basis="category_average",
        freshness_warning=product["type"] == "dry" and days / 7 > FRESHNESS_WEEKS,
    )
