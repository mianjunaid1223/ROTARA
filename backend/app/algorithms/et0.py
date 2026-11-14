"""FAO-56 Penman-Monteith reference evapotranspiration (ET0)."""

from __future__ import annotations

import math

DEFAULT_ELEVATION_M = 180.0
SEA_LEVEL_PRESSURE_KPA = 101.3
STANDARD_TEMP_K = 293.0
LAPSE_RATE_K_PER_M = 0.0065
HYDROSTATIC_EXPONENT = 5.26
PSYCHROMETRIC_COEFF = 0.000665

SATURATION_VP_SCALE_KPA = 0.6108
TETENS_COEFF_A = 17.27
TETENS_TEMP_OFFSET_C = 237.3
VAPOR_SLOPE_FACTOR = 4098.0

ALBEDO_SHORTWAVE_ABSORPTION = 0.77  # 1 - 0.23 standard green crop albedo
STEFAN_BOLTZMANN_MJ = 4.903e-9     # MJ / (K^4 * m^2 * day)
BRUNT_INTERCEPT = 0.34
BRUNT_HUMIDITY_COEFF = 0.14
LONGWAVE_ATTENUATION_FACTOR = 0.55

KELVIN_OFFSET = 273.16
MEAN_KELVIN_OFFSET = 273.0
LATENT_HEAT_CONVERSION = 0.408     # 1 / 2.45 MJ/kg latent heat of vaporization
AERODYNAMIC_C1 = 900.0
AERODYNAMIC_C2 = 0.34
MIN_WIND_SPEED_MS = 0.2
MIN_RELATIVE_HUMIDITY_RATIO = 0.05


def saturation_vapor_pressure(temp_c: float) -> float:
    """Compute saturation vapor pressure (kPa) at air temperature `temp_c` (C) using Tetens formula."""
    return SATURATION_VP_SCALE_KPA * math.exp((TETENS_COEFF_A * temp_c) / (temp_c + TETENS_TEMP_OFFSET_C))


def compute_fao56_et0(
    t_mean: float | None,
    t_max: float | None,
    t_min: float | None,
    rs_mj: float | None,
    rh_mean: float | None,
    u2_ms: float | None,
    elevation_m: float = DEFAULT_ELEVATION_M,
) -> float | None:
    """Compute FAO-56 Penman-Monteith grass reference evapotranspiration (ET0, mm/day).

    Inputs:
        t_mean, t_max, t_min: daily mean, max, min 2m air temperature (C)
        rs_mj: incoming shortwave solar radiation (MJ/m^2/day)
        rh_mean: 2m relative humidity (%)
        u2_ms: 2m wind speed (m/s)
        elevation_m: field mean elevation from 30m DEM (m), default 180.0 m

    Equations:
        P = 101.3 * ((293 - 0.0065 * z) / 293)^5.26
        gamma = 0.000665 * P
        es = (e0(Tmax) + e0(Tmin)) / 2,  ea = es * clamp(RH / 100, 0.05, 1.0)
        Rn = max(0, 0.77 * Rs - sigma * ((Tmax_K^4 + Tmin_K^4)/2) * (0.34 - 0.14*sqrt(ea)) * 0.55)
        ET0 = (0.408 * delta * Rn + gamma * (900 / (Tmean + 273)) * u2 * (es - ea)) / (delta + gamma * (1 + 0.34 * u2))

    Output:
        Reference evapotranspiration ET0 rounded to 2 decimal places (mm/day), or None if any input is missing.
    """
    if None in (t_mean, t_max, t_min, rs_mj, rh_mean, u2_ms):
        return None
    assert t_mean is not None and t_max is not None and t_min is not None
    assert rs_mj is not None and rh_mean is not None and u2_ms is not None

    pressure_kpa = SEA_LEVEL_PRESSURE_KPA * (
        (STANDARD_TEMP_K - LAPSE_RATE_K_PER_M * elevation_m) / STANDARD_TEMP_K
    ) ** HYDROSTATIC_EXPONENT
    gamma = PSYCHROMETRIC_COEFF * pressure_kpa

    delta = (VAPOR_SLOPE_FACTOR * saturation_vapor_pressure(t_mean)) / (
        (t_mean + TETENS_TEMP_OFFSET_C) ** 2
    )

    es = (saturation_vapor_pressure(t_max) + saturation_vapor_pressure(t_min)) / 2.0
    ea = es * max(MIN_RELATIVE_HUMIDITY_RATIO, min(1.0, rh_mean / 100.0))

    rns = ALBEDO_SHORTWAVE_ABSORPTION * rs_mj
    t_max_k4 = (t_max + KELVIN_OFFSET) ** 4
    t_min_k4 = (t_min + KELVIN_OFFSET) ** 4
    rnl = (
        STEFAN_BOLTZMANN_MJ
        * ((t_max_k4 + t_min_k4) / 2.0)
        * (BRUNT_INTERCEPT - BRUNT_HUMIDITY_COEFF * math.sqrt(max(0.0, ea)))
        * LONGWAVE_ATTENUATION_FACTOR
    )
    rn = max(0.0, rns - rnl)

    u2 = max(MIN_WIND_SPEED_MS, u2_ms)
    numerator = LATENT_HEAT_CONVERSION * delta * rn + gamma * (
        AERODYNAMIC_C1 / (t_mean + MEAN_KELVIN_OFFSET)
    ) * u2 * max(0.0, es - ea)
    denominator = delta + gamma * (1.0 + AERODYNAMIC_C2 * u2)
    et0 = numerator / denominator if denominator > 0 else 0.0
    return round(max(0.0, et0), 2)
