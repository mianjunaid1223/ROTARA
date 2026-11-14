from __future__ import annotations

from datetime import date

from app.algorithms.rotation_score import (
    compute_priority_weights,
    score_crop_climate_fit,
    score_crop_water_demand,
    score_planting_window,
    score_sequence_market,
)
from app.algorithms.soil_score import LOW_LAB_OM_THRESHOLD_PCT, score_rotation_soil_health
from app.models.schemas import (
    CriterionScore,
    EnvironmentalAnalysisResponse,
    FarmerPriorities,
    FieldProfile,
    RotationResponse,
    RotationStrategy,
    SeasonName,
    SeasonStep,
)
from app.services.crops.punjab_data import PUNJAB_CROPS, get_punjab_season_context
from app.services.geo import analyze_field_geometry


def _next_planting_ym(crop_id: str, ref_date: date) -> tuple[int, int]:
    """Return earliest (year, month) on or after `ref_date` when the crop can be planted."""
    months = sorted(PUNJAB_CROPS[crop_id].planting_months)
    for m in months:
        if m >= ref_date.month:
            return (ref_date.year, m)
    return (ref_date.year + 1, months[0])


def _pick_zone_sequences(
    current_crop: str,
    zone_id: str,
    water_avail: str,
    moisture_status: str,
    ref_date: date,
) -> tuple[list[str], list[str], list[str]]:
    c_id = current_crop.lower().strip()
    if c_id not in PUNJAB_CROPS:
        c_id = "wheat"

    if zone_id == "rice_wheat" or c_id == "rice":
        seq_a = ["wheat", "rice", "wheat", "rice"]
    elif zone_id == "cotton_wheat" or c_id == "cotton":
        seq_a = ["wheat", "cotton", "wheat", "cotton"]
    elif zone_id == "barani_potohar":
        seq_a = ["wheat", "sorghum_millet", "wheat", "sorghum_millet"]
    elif zone_id == "thal_sandy":
        seq_a = ["chickpea", "sorghum_millet", "wheat", "sorghum_millet"]
    elif c_id == "sugarcane":
        seq_a = ["sugarcane", "wheat", "maize", "wheat"]
    else:
        seq_a = ["wheat", "maize", "wheat", "maize"]

    if zone_id in ("barani_potohar", "thal_sandy") or water_avail in ("limited", "scarce") or moisture_status == "very_dry":
        seq_b = ["chickpea", "sorghum_millet", "mustard", "mung_bean"]
    elif zone_id == "cotton_wheat":
        seq_b = ["mustard", "cotton", "chickpea", "sorghum_millet"]
    else:
        seq_b = ["mustard", "maize", "wheat", "sorghum_millet"]

    if zone_id == "rice_wheat":
        seq_c = ["mustard", "dhaincha", "maize", "berseem"]
    elif zone_id == "cotton_wheat":
        seq_c = ["chickpea", "cotton", "wheat", "mung_bean"]
    elif zone_id == "barani_potohar":
        seq_c = ["lentil", "mung_bean", "sorghum_millet", "mustard"]
    else:
        seq_c = ["wheat", "mung_bean", "maize", "chickpea"]

    def align(seq: list[str]) -> list[str]:
        idx = min(range(len(seq)), key=lambda i: _next_planting_ym(seq[i], ref_date))
        return seq[idx:] + seq[:idx]

    return align(seq_a), align(seq_b), align(seq_c)


def _build_steps(
    crop_ids: list[str],
    upcoming_season: SeasonName,
    ref_date: date,
    zone_id: str,
) -> list[SeasonStep]:
    steps: list[SeasonStep] = []
    for idx, cid in enumerate(crop_ids):
        c = PUNJAB_CROPS[cid]
        if idx == 0:
            _, note = score_planting_window(c, upcoming_season, ref_date)
        elif c.nitrogen_fixer:
            note = "Adds natural soil nitrogen and breaks cereal pest cycles."
        elif zone_id in c.suitable_zones:
            note = f"Well suited to {zone_id.replace('_', ' ')} conditions."
        else:
            note = "Monitor irrigation closely for local zone conditions."

        steps.append(
            SeasonStep(
                slot_label=f"Season {idx + 1}",
                season=c.season,
                crop_id=c.id,
                crop_name=c.name,
                local_name=c.local_name,
                planting_window=c.planting_window_label,
                harvest_window=c.harvest_window_label,
                water_demand_level=c.water_demand_level,
                nitrogen_fixer=c.nitrogen_fixer,
                root_depth=c.root_depth,
                suitability_note=note,
            )
        )
    return steps


def _score_strategy(
    strategy_id: str,
    title: str,
    subtitle: str,
    seq_ids: list[str],
    field: FieldProfile,
    zone_id: str,
    priorities: FarmerPriorities,
    ref_date: date,
    upcoming_season: SeasonName,
    analysis: EnvironmentalAnalysisResponse | None,
) -> RotationStrategy:
    crops = [PUNJAB_CROPS[cid] for cid in seq_ids]
    water_status = analysis.water.moisture_proxy_status if analysis else "unknown"
    rain_anom = analysis.water.rainfall_anomaly_pct if analysis else None
    wb_30 = analysis.water.water_balance_30d_mm if analysis else None
    heat_days = analysis.climate.heat_stress_days_90d if analysis else None
    tmax_30 = analysis.climate.temp_max_30d_c if analysis else None
    slope_pct = analysis.terrain.slope_mean_pct if analysis else None

    has_low_om = bool(
        field.soil_lab
        and field.soil_lab.organic_matter_pct is not None
        and field.soil_lab.organic_matter_pct < LOW_LAB_OM_THRESHOLD_PCT
    )

    water_score = sum(
        score_crop_water_demand(c, field.water_availability, water_status, rain_anom, wb_30)
        for c in crops
    ) / len(crops)
    climate_score = sum(
        score_crop_climate_fit(c, zone_id, heat_days, slope_pct, tmax_30) for c in crops
    ) / len(crops)
    soil_score = score_rotation_soil_health(crops, has_low_om)
    market_score = score_sequence_market(crops)
    timing_score, _ = score_planting_window(crops[0], upcoming_season, ref_date)

    w_water, w_climate, w_soil, w_market, w_timing = compute_priority_weights(priorities)
    n_fixers = sum(1 for c in crops if c.nitrogen_fixer)

    criteria = [
        CriterionScore(
            criterion="Water Conservation & Moisture Fit",
            score=round(water_score, 1),
            weight=round(w_water, 3),
            weighted_contribution=round(water_score * w_water, 1),
            evidence=f"Field water '{field.water_availability}', moisture proxy '{water_status}'.",
        ),
        CriterionScore(
            criterion="Climate & Zone Resilience",
            score=round(climate_score, 1),
            weight=round(w_climate, 3),
            weighted_contribution=round(climate_score * w_climate, 1),
            evidence=f"Zone '{zone_id}', 90d heat days: {heat_days if heat_days is not None else 'n/a'}.",
        ),
        CriterionScore(
            criterion="Soil Health & Crop Diversity",
            score=round(soil_score, 1),
            weight=round(w_soil, 3),
            weighted_contribution=round(soil_score * w_soil, 1),
            evidence=f"{n_fixers} legume(s), {len({c.crop_family for c in crops})} plant families.",
        ),
        CriterionScore(
            criterion="Local Market Demand",
            score=round(market_score, 1),
            weight=round(w_market, 3),
            weighted_contribution=round(market_score * w_market, 1),
            evidence="Punjab staple, pulse, and fodder demand.",
        ),
        CriterionScore(
            criterion="Current Planting Window Fit",
            score=round(timing_score, 1),
            weight=round(w_timing, 3),
            weighted_contribution=round(timing_score * w_timing, 1),
            evidence=f"Reference date {ref_date.isoformat()} ({upcoming_season}).",
        ),
    ]

    overall = round(sum(c.weighted_contribution for c in criteria), 1)
    steps = _build_steps(seq_ids, upcoming_season, ref_date, zone_id)

    missing: list[str] = []
    if not field.soil_lab or field.soil_lab.ph is None or field.soil_lab.organic_matter_pct is None:
        missing.append("Soil lab test (pH, organic matter, NPK) not entered; nutrient notes are general.")
    if analysis is None or not analysis.weather_series:
        missing.append("Live NASA POWER weather observations not loaded yet.")

    supporting: list[str] = []
    if analysis:
        if analysis.water.rainfall_30d_mm is not None:
            bal = (
                f"water balance {analysis.water.water_balance_30d_mm:+.0f} mm"
                if analysis.water.water_balance_30d_mm is not None
                else "water balance unavailable"
            )
            supporting.append(f"30-day rainfall: {analysis.water.rainfall_30d_mm:.0f} mm ({bal}).")
        if analysis.climate.heat_stress_days_90d is not None:
            supporting.append(f"90-day heat-stress days (>=38 C): {analysis.climate.heat_stress_days_90d}.")
        if analysis.vegetation.latest_ndvi is not None:
            supporting.append(
                f"Latest NDVI: {analysis.vegetation.latest_ndvi:.2f} ({analysis.vegetation.latest_ndvi_sensor} on {analysis.vegetation.latest_ndvi_date})."
            )
    else:
        supporting.append("Scored using Punjab agro-ecological zone and farmer water inputs.")

    narratives = {
        "A": (
            [
                "Matches familiar machinery, seed supply, and local mandi buyers.",
                "Predictable seasonal calendar around your current crop.",
            ],
            [
                "Repeated cereals in the same family increase weed pressure and deplete topsoil nutrients.",
                "Higher irrigation risk if rainfall drops or groundwater levels fall.",
            ],
            "Keeps your current farming pattern as a baseline so you can compare water and soil gains.",
            f"Prepare land for {steps[0].crop_name} ({steps[0].local_name}) in {steps[0].planting_window}.",
        ),
        "B": (
            [
                "Lowers total irrigation demand by replacing high-water crops with hardy options.",
                "Handles hot spells and dry periods better under changing weather.",
            ],
            [
                "Pulses or oilseeds may require lining up local grain buyers before harvest.",
                "Lower tolerance to standing water if heavy monsoon flooding occurs.",
            ],
            f"Matches '{field.water_availability}' water supply and '{water_status}' moisture with heat-hardy crops.",
            f"Plant {steps[0].crop_name} ({steps[0].local_name}) next ({steps[0].planting_window}) to save water.",
        ),
        "C": (
            [
                f"Includes {n_fixers} nitrogen-fixing legume or green-manure crop(s) to rebuild soil fertility.",
                "Mixes shallow and deep roots to loosen compacted soil and shade bare spring ground.",
            ],
            [
                "Short catch crops leave a tighter turnaround between Rabi harvest and Kharif sowing.",
                "Green manure improves future harvests rather than yielding immediate cash grain.",
            ],
            "Rebuilds soil fertility with legumes and protects bare spring soil between main crops.",
            f"Prepare seed for {steps[0].crop_name} ({steps[0].local_name}) and keep the spring gap for legumes.",
        ),
    }
    benefits, risks, farmer_reason, farmer_next = narratives[strategy_id]

    return RotationStrategy(
        strategy_id=strategy_id,  # type: ignore[arg-type]
        title=title,
        subtitle=subtitle,
        overall_score=overall,
        steps=steps,
        criteria_breakdown=criteria,
        benefits=benefits,
        risks_and_limitations=risks,
        supporting_observations=supporting,
        missing_information=missing,
        farmer_reason=farmer_reason,
        farmer_next_step=farmer_next,
        agronomist_notes=f"Weighted deterministic score across {len(seq_ids)} seasons (suitability index, not yield).",
    )


def generate_rotation_recommendations(
    field: FieldProfile,
    priorities: FarmerPriorities,
    ref_date_str: str | None = None,
    analysis: EnvironmentalAnalysisResponse | None = None,
) -> RotationResponse:
    if analysis is not None and analysis.field_id != field.id:
        raise ValueError(f"analysis.field_id ({analysis.field_id}) does not match field.id ({field.id}).")

    ref_date = date.fromisoformat(ref_date_str) if ref_date_str else date.today()
    current_season, upcoming_season = get_punjab_season_context(ref_date)

    if analysis:
        zone_id = analysis.geometry_summary.agro_zone_id
        zone_name = analysis.geometry_summary.agro_zone_name
        water_status = analysis.water.moisture_proxy_status
    else:
        geom_summary = analyze_field_geometry(field.geometry)
        zone_id = geom_summary.agro_zone_id
        zone_name = geom_summary.agro_zone_name
        water_status = "unknown"

    seq_a, seq_b, seq_c = _pick_zone_sequences(
        field.current_crop, zone_id, field.water_availability, water_status, ref_date
    )

    strategies = sorted(
        [
            _score_strategy(
                "A", "Existing Rotation (Baseline)", "Your current regional pattern",
                seq_a, field, zone_id, priorities, ref_date, upcoming_season, analysis,
            ),
            _score_strategy(
                "B", "Water & Climate Resilience", "Lower water use and stronger heat tolerance",
                seq_b, field, zone_id, priorities, ref_date, upcoming_season, analysis,
            ),
            _score_strategy(
                "C", "Soil Improvement & Diversity", "Legumes, deep-root mixing, and soil cover",
                seq_c, field, zone_id, priorities, ref_date, upcoming_season, analysis,
            ),
        ],
        key=lambda s: s.overall_score,
        reverse=True,
    )

    return RotationResponse(
        field_id=field.id,
        reference_date=ref_date.isoformat(),
        current_punjab_season=current_season,
        upcoming_planting_season=upcoming_season,
        agro_zone_id=zone_id,
        agro_zone_name=zone_name,
        strategies=strategies,
        disclaimer="Suitability scores compare environmental fit from NASA/Copernicus data and Punjab crop rules; they are not yield guarantees.",
    )
