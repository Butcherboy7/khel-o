from typing import Optional, Tuple, Dict
from app.models.hardware_tier import PlatformType
from app.constants import PLATFORM_MODELS, _PC_GPU_LABELS, _CONSOLE_LABELS


def derive_tier_display(
    platform: Optional[PlatformType],
    model: Optional[str]
) -> Tuple[Dict[str, str], str]:
    """Derive the customer-facing specs dict and a suggested tier name from
    an owner's platform+model selection. This is the single place both
    tier-creation code paths call, so the customer-facing spec string is
    never independently re-typed/re-guessed in two places again — that
    divergence is what let BUG #3 happen."""
    if platform is None or model is None:
        return {}, "Gaming Station"

    if platform == PlatformType.OTHER:
        label = model.strip() or "Custom Station"
        return {"other": label}, label

    allowed = PLATFORM_MODELS.get(platform.value, [])
    if model not in allowed and model != "Custom":
        raise ValueError(f"'{model}' is not a valid model for platform '{platform.value}'")

    if platform == PlatformType.PC:
        gpu_label = _PC_GPU_LABELS.get(model, model)
        return {"gpu": gpu_label}, f"{model} PC"

    console_label = _CONSOLE_LABELS.get(model, model)
    return {"console": console_label}, console_label
