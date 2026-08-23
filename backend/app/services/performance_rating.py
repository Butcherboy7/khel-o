import re

GPU_SCORES = {
    "gtx 1050": 1.0, "gtx 1050 ti": 1.0,
    "gtx 1060": 1.5, "gtx 1650": 1.5,
    "gtx 1660": 2.5, "gtx 1660 ti": 2.5, "gtx 1660 super": 2.5,
    "rtx 2060": 3.0, "rtx 3050": 3.0,
    "rtx 3060": 3.5, "rtx 4060": 3.5,
    "rtx 3070": 4.0, "rtx 3070 ti": 4.0, "rtx 4060 ti": 4.0,
    "rtx 3080": 4.5, "rtx 4070": 4.5, "rtx 4070 ti": 4.5,
    "rtx 3090": 5.0, "rtx 4080": 5.0, "rtx 4090": 5.0,
    # Consoles — the onboarding preset strings spell platforms out in full
    # ("PlayStation 4 Pro Console"), but an owner typing a custom entry might
    # write the short form ("PS4 Pro") instead, so both are listed. Order
    # matters: `in name` is a substring check, so a more specific string (e.g.
    # "playstation 5 pro") must come before a substring of it
    # ("playstation 5") or the shorter/less specific key wins first.
    "playstation 5 pro": 4.5, "ps5 pro": 4.5,
    "xbox series x": 4.0, "playstation 5": 4.0, "ps5": 4.0,
    "xbox series s": 3.0,
    "switch oled": 2.0, "switch lite": 1.6, "nintendo switch": 1.8, "switch": 1.8,
    "xbox one x": 2.0, "playstation 4 pro": 2.0, "ps4 pro": 2.0,
    "xbox one s": 1.5, "playstation 4": 1.5, "ps4": 1.5,
    "xbox 360": 1.0, "playstation 3": 1.0, "ps3": 1.0,
    "playstation 2": 0.5, "ps2": 0.5,
}

def _score_gpu(gpu_name: str) -> float:
    name = gpu_name.lower().strip()
    # Direct match check
    for key, val in GPU_SCORES.items():
        if key in name:
            return val
    return 1.0  # Default fallback for unknown budget GPUs

def _score_ram(ram_str: str) -> float:
    match = re.search(r'(\d+)', ram_str)
    if not match:
        return 1.0
    gb = int(match.group(1))
    if gb >= 32:
        return 5.0
    elif gb >= 16:
        return 3.5
    elif gb >= 8:
        return 2.0
    return 1.0

def _score_hz(hz_str: str) -> float:
    match = re.search(r'(\d+)', hz_str)
    if not match:
        return 1.0
    hz = int(match.group(1))
    if hz >= 360:
        return 5.0
    elif hz >= 240:
        return 4.5
    elif hz >= 144:
        return 3.0
    return 1.0

def _score_cpu(cpu_name: str) -> float:
    name = cpu_name.lower().strip()
    if "i9" in name or "ryzen 9" in name or "i7" in name or "ryzen 7" in name:
        return 5.0
    elif "i5" in name or "ryzen 5" in name:
        return 3.5
    elif "i3" in name or "ryzen 3" in name:
        return 2.0
    return 1.5

def compute_rating(specs: dict) -> float:
    gpu = _score_gpu(specs.get("gpu", ""))
    ram = _score_ram(specs.get("ram", ""))
    monitor = _score_hz(specs.get("monitor", ""))
    cpu = _score_cpu(specs.get("cpu", ""))
    
    raw = 0.50 * gpu + 0.20 * ram + 0.20 * monitor + 0.10 * cpu
    return round(min(max(raw, 1.0), 5.0), 1)
