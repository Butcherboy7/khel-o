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
    "ps5": 4.0, "xbox series x": 4.0,
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
