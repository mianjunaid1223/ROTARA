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
HISTORY_TRANSITION_PENALTY = 5.0
HISTORY_LEGUME_RECOVERY_BONUS = 5.0
FALLOW_COVER_RECOVERY_BONUS = 4.0

IDEAL_PH_MIN = 6.5
IDEAL_PH_MAX = 8.2
HIGH_EC_THRESHOLD_DS_M = 4.0

NONE_CROP_IDS = {"none", "fallow", "empty", ""}


def is_none_or_fallow(crop_id: str | None) -> bool:
    if crop_id is None:
        return True
    return crop_id.strip().lower() in NONE_CROP_IDS


def score_rotation_soil_health(
    crops: list[CropInfo],
    has_lab_low_om: bool,
    current_crop: CropInfo | None = None,
    previous_crop: CropInfo | None = None,
    current_is_fallow: bool = False,
    previous_is_fallow: bool = False,
) -> float:
    """Compute crop-sequence soil health & diversity score (15 to 100).

    Equation:
        S_soil = 40 + min(24, 8*F) + min(15, 5*R) + min(18, 9*N) + min(8, 4*O)
                 - 8*P_same (- 8 if low OM & N=0) + history_adjustment
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

    # Account for field crop history and fallow ("none") state
    anchor_crop = current_crop if current_crop is not None else previous_crop
    if anchor_crop is not None and crops:
        if crops[0].crop_family == anchor_crop.crop_family and not crops[0].nitrogen_fixer:
            score -= HISTORY_TRANSITION_PENALTY

    if current_crop is not None and previous_crop is not None:
        if current_crop.crop_family == previous_crop.crop_family and n_fixers == 0:
            score -= 4.0

    if current_is_fallow and previous_is_fallow:
        # Extended bare fallow risks topsoil organic matter oxidation and crusting
        if n_fixers > 0 and high_om > 0:
            score += FALLOW_COVER_RECOVERY_BONUS
        elif n_fixers == 0:
            score -= FALLOW_COVER_RECOVERY_BONUS
    elif current_is_fallow or previous_is_fallow:
        if n_fixers == 0 and high_om == 0:
            score -= 3.0
        elif crops and crops[0].organic_matter_contribution == "high":
            score += 2.0

    if has_lab_low_om and n_fixers == 0:
        score -= LOW_LAB_OM_NO_LEGUME_PENALTY

    return max(SOIL_SCORE_MIN, min(SOIL_SCORE_MAX, score))
