from __future__ import annotations

from app.algorithms.soil_score import HIGH_EC_THRESHOLD_DS_M, IDEAL_PH_MAX, IDEAL_PH_MIN
from app.models.schemas import (
    EnvironmentalAnalysisResponse,
    FieldProfile,
    SoilHealthDimension,
    SoilHealthResponse,
)
from app.services.crops.punjab_data import PUNJAB_CROPS


def evaluate_soil_health(
    field: FieldProfile,
    analysis: EnvironmentalAnalysisResponse | None = None,
) -> SoilHealthResponse:
    if analysis is not None and analysis.field_id != field.id:
        raise ValueError(f"analysis.field_id ({analysis.field_id}) does not match field.id ({field.id}).")

    lab = field.soil_lab
    has_lab = bool(
        lab
        and any(
            v is not None
            for v in (
                lab.ph,
                lab.organic_matter_pct,
                lab.nitrogen_ppm,
                lab.phosphorus_ppm,
                lab.potassium_ppm,
                lab.texture,
                lab.salinity_status,
                lab.ec_ds_m,
            )
        )
    )

    dimensions: list[SoilHealthDimension] = []

    if analysis and analysis.water.moisture_proxy_status != "unknown":
        m_status = analysis.water.moisture_proxy_status
        wb = analysis.water.water_balance_30d_mm
        wb_txt = f"{wb:+.0f} mm 30d" if wb is not None else "balance n/a"
        dimensions.append(
            SoilHealthDimension(
                dimension="Surface Moisture & Water Balance Proxy",
                source_type="satellite_derived",
                status="good" if m_status == "adequate" else ("fair" if m_status == "wet" else "attention"),
                value_label=f"{m_status.replace('_', ' ').title()} ({wb_txt})",
                farmer_explanation=analysis.water.farmer_summary,
                technical_explanation=analysis.water.agronomist_summary,
            )
        )
    else:
        dimensions.append(
            SoilHealthDimension(
                dimension="Surface Moisture & Water Balance Proxy",
                source_type="satellite_derived",
                status="missing",
                value_label="Waiting for data",
                farmer_explanation="Satellite weather data has not finished loading yet.",
                technical_explanation="NASA POWER water-balance series unavailable.",
            )
        )

    if analysis and analysis.vegetation.latest_ndvi is not None:
        bare = analysis.vegetation.bare_soil_fraction_estimate or 0.0
        cov_status = "good" if bare < 0.25 else ("fair" if bare < 0.6 else "attention")
        dimensions.append(
            SoilHealthDimension(
                dimension="Vegetation Cover & Bare-Soil Exposure",
                source_type="satellite_derived",
                status=cov_status,  # type: ignore[arg-type]
                value_label=f"NDVI {analysis.vegetation.latest_ndvi:.2f} ({analysis.vegetation.latest_ndvi_date})",
                farmer_explanation=(
                    "Ground cover helps shade the soil and hold moisture."
                    if cov_status == "good"
                    else "Low plant cover leaves soil exposed; a short cover crop like Mung bean helps."
                ),
                technical_explanation=analysis.vegetation.agronomist_summary,
            )
        )

    if analysis and analysis.terrain.slope_mean_pct is not None:
        ero = analysis.terrain.erosion_risk
        dimensions.append(
            SoilHealthDimension(
                dimension="Terrain Runoff & Erosion Susceptibility",
                source_type="satellite_derived",
                status="good" if ero == "low" else ("fair" if ero == "moderate" else "attention"),
                value_label=f"{analysis.terrain.slope_mean_pct:.1f}% slope ({ero} risk)",
                farmer_explanation=analysis.terrain.farmer_summary,
                technical_explanation=analysis.terrain.agronomist_summary,
            )
        )

    cur = PUNJAB_CROPS.get(field.current_crop.lower())
    prev = PUNJAB_CROPS.get(field.previous_crop.lower()) if field.previous_crop else None
    same_family = bool(cur and prev and cur.crop_family == prev.crop_family)
    legume_used = bool((cur and cur.nitrogen_fixer) or (prev and prev.nitrogen_fixer))

    dimensions.append(
        SoilHealthDimension(
            dimension="Crop Diversity & Nitrogen-Fixing History",
            source_type="field_history",
            status="good" if legume_used and not same_family else ("attention" if same_family else "fair"),
            value_label=f"{prev.name if prev else 'Not set'} -> {cur.name if cur else field.current_crop}",
            farmer_explanation=(
                "Growing the same crop family back-to-back tires the topsoil. Add a pulse like Chickpea or Mung bean."
                if same_family
                else (
                    "Your recent rotation includes a nitrogen-fixing legume, which enriches soil."
                    if legume_used
                    else "Add a legume like Mung bean or Chickpea to improve natural nitrogen."
                )
            ),
            technical_explanation=f"Same-family succession: {same_family}. Legume presence: {legume_used}.",
        )
    )

    if lab and lab.ph is not None:
        ph_ok = IDEAL_PH_MIN <= lab.ph <= IDEAL_PH_MAX
        dimensions.append(
            SoilHealthDimension(
                dimension="Measured Soil pH",
                source_type="measured_lab",
                status="good" if ph_ok else "attention",
                value_label=f"pH {lab.ph:.1f}",
                farmer_explanation=(
                    "Soil pH is in a healthy range for Punjab crops."
                    if ph_ok
                    else "Soil pH is outside 6.5-8.2; gypsum or organic matter may help."
                ),
                technical_explanation=f"Lab soil pH = {lab.ph:.2f}.",
            )
        )

    if lab and lab.organic_matter_pct is not None:
        om_status = "good" if lab.organic_matter_pct >= 1.0 else ("fair" if lab.organic_matter_pct >= 0.6 else "attention")
        dimensions.append(
            SoilHealthDimension(
                dimension="Measured Organic Matter",
                source_type="measured_lab",
                status=om_status,  # type: ignore[arg-type]
                value_label=f"{lab.organic_matter_pct:.2f}%",
                farmer_explanation=(
                    "Organic matter helps soil hold water well."
                    if om_status == "good"
                    else "Organic matter is low. Add compost, crop straw, or Dhaincha green manure."
                ),
                technical_explanation=f"Lab SOM = {lab.organic_matter_pct:.2f}%.",
            )
        )

    if lab and (lab.ec_ds_m is not None or lab.salinity_status is not None):
        sal_high = (lab.ec_ds_m is not None and lab.ec_ds_m >= HIGH_EC_THRESHOLD_DS_M) or lab.salinity_status in ("moderate", "high")
        dimensions.append(
            SoilHealthDimension(
                dimension="Measured Salinity / EC",
                source_type="measured_lab",
                status="attention" if sal_high else "good",
                value_label=f"EC {lab.ec_ds_m:.1f} dS/m" if lab.ec_ds_m is not None else f"{lab.salinity_status} salinity",
                farmer_explanation=(
                    "Salt levels are high. Dhaincha green manure and clean irrigation leaching help reclaim the soil."
                    if sal_high
                    else "Salt levels are within safe limits."
                ),
                technical_explanation=f"Lab EC={lab.ec_ds_m} dS/m, status={lab.salinity_status}.",
            )
        )

    cannot_conclude: list[str] = []
    if not lab or lab.ph is None:
        cannot_conclude.append("Exact soil acidity or alkalinity (pH) cannot be measured from satellites.")
    if not lab or lab.organic_matter_pct is None:
        cannot_conclude.append("Organic matter percentage requires a lab soil test.")
    missing_npk = [
        label
        for label, val in (
            ("Nitrogen (N)", lab.nitrogen_ppm if lab else None),
            ("Phosphorus (P)", lab.phosphorus_ppm if lab else None),
            ("Potassium (K)", lab.potassium_ppm if lab else None),
        )
        if val is None
    ]
    if len(missing_npk) == 3:
        cannot_conclude.append("Exact Nitrogen (N), Phosphorus (P), and Potassium (K) fertilizer doses cannot be inferred from satellite imagery.")
    elif missing_npk:
        cannot_conclude.append(
            f"Exact {' and '.join(missing_npk)} fertilizer doses cannot be inferred from satellite imagery without lab results."
        )
    if not lab or (lab.ec_ds_m is None and lab.salinity_status is None):
        cannot_conclude.append("Subsurface salinity (EC) requires a soil or water lab test.")

    actions = [
        "Mix crop straw into the soil or sow Mung bean instead of burning stubble.",
        "Grow a legume (Chickpea, Lentil, Mung bean, or Berseem) every 3 to 4 seasons.",
    ]
    if not has_lab:
        actions.append("Get a topsoil lab test before sowing for exact fertilizer doses.")

    summary = (
        "Lab test results and satellite checks combined."
        if has_lab
        else "Based on satellite moisture, cover, slope, and crop history. Add a soil lab test for exact fertilizer checks."
    )

    return SoilHealthResponse(
        field_id=field.id,
        measured_lab_present=has_lab,
        overall_farmer_summary=summary,
        dimensions=dimensions,
        cannot_conclude_without_lab=cannot_conclude,
        practical_actions=actions,
    )
