"""Soil diversity scoring and soil status thresholds."""

from __future__ import annotations

from app.models.schemas import CropInfo

SOIL_SCORE_BASE = 40.0
SOIL_SCORE_MIN = 15.0
SOIL_SCORE_MAX = 100.0

FAMILY_POINTS_EACH = 8.0
FAMILY_POINTS_CAP = 24.0
ROOT_POINTS_EACH = 5.0
ROOT_POINTS_CAP = 15.0
LEGUME_POINTS_EACH = 9.0
LEGUME_POINTS_CAP = 18.0
HIGH_OM_POINTS_EACH = 4.0
HIGH_OM_POINTS_CAP = 8.0
SAME_FAMILY_PAIR_PENALTY = 8.0
LOW_LAB_OM_THRESHOLD_PCT = 0.8
LOW_LAB_OM_NO_LEGUME_PENALTY = 8.0

IDEAL_PH_MIN = 6.5
IDEAL_PH_MAX = 8.2
HIGH_EC_THRESHOLD_DS_M = 4.0


def score_rotation_soil_health(crops: list[CropInfo], has_lab_low_om: bool) -> float:
    """Compute crop-sequence soil health & diversity score (15 to 100).

    Equation:
        S_soil = 40 + min(24, 8*F) + min(15, 5*R) + min(18, 9*N) + min(8, 4*O) - 8*P_same (- 8 if low OM & N=0)
        where F = unique botanical families, R = unique root depths,
        N = nitrogen-fixing legumes, O = high organic-matter crops,
        P_same = consecutive crops sharing the same family.
    """
    unique_families = len({c.crop_family for c in crops})
    unique_roots = len({c.root_depth for c in crops})
    n_fixers = sum(1 for c in crops if c.nitrogen_fixer)
    high_om = sum(1 for c in crops if c.organic_matter_contribution == "high")

    score = SOIL_SCORE_BASE
    score += min(FAMILY_POINTS_CAP, unique_families * FAMILY_POINTS_EACH)
    score += min(ROOT_POINTS_CAP, unique_roots * ROOT_POINTS_EACH)
    score += min(LEGUME_POINTS_CAP, n_fixers * LEGUME_POINTS_EACH)
    score += min(HIGH_OM_POINTS_CAP, high_om * HIGH_OM_POINTS_EACH)

    same_family_pairs = sum(
        1 for i in range(len(crops) - 1) if crops[i].crop_family == crops[i + 1].crop_family
    )
    score -= same_family_pairs * SAME_FAMILY_PAIR_PENALTY

    if has_lab_low_om and n_fixers == 0:
        score -= LOW_LAB_OM_NO_LEGUME_PENALTY

    return max(SOIL_SCORE_MIN, min(SOIL_SCORE_MAX, score))
