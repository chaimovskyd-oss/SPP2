from __future__ import annotations

import platform
import time
from pathlib import Path
from typing import Any


def preferred_onnx_providers(available: list[str] | set[str], requested: list[str] | None = None) -> list[str]:
    available_set = set(available)
    if requested:
        chosen = [provider for provider in requested if provider in available_set]
        if chosen:
            return chosen

    if platform.system() == "Windows":
        preferred = [
            "DmlExecutionProvider",
            "CUDAExecutionProvider",
            "CPUExecutionProvider",
        ]
    else:
        preferred = [
            "CUDAExecutionProvider",
            "CoreMLExecutionProvider",
            "CPUExecutionProvider",
        ]
    return [provider for provider in preferred if provider in available_set] or ["CPUExecutionProvider"]


def selected_provider(session: Any) -> str | None:
    providers = session.get_providers() if hasattr(session, "get_providers") else []
    return providers[0] if providers else None


# ─── Acceleration detection & diagnostics ─────────────────────────────────────
# These helpers give the UI a single, unambiguous answer to "is the GPU actually
# being used?" — independent of which models happen to be downloaded. They are
# safe to call in both dev (system Python) and packaged (bundled venv) builds.

# Providers that mean real hardware acceleration (anything but plain CPU).
ACCELERATED_PROVIDERS = (
    "DmlExecutionProvider",
    "CUDAExecutionProvider",
    "CoreMLExecutionProvider",
    "ROCMExecutionProvider",
    "TensorrtExecutionProvider",
)

# Friendly labels for the diagnostics panel.
PROVIDER_LABELS = {
    "DmlExecutionProvider": "GPU (DirectML)",
    "CUDAExecutionProvider": "GPU (CUDA)",
    "CoreMLExecutionProvider": "GPU (CoreML)",
    "ROCMExecutionProvider": "GPU (ROCm)",
    "TensorrtExecutionProvider": "GPU (TensorRT)",
    "CPUExecutionProvider": "CPU",
    "AzureExecutionProvider": "Azure",
}


def provider_label(provider: str | None) -> str:
    if not provider:
        return "unknown"
    return PROVIDER_LABELS.get(provider, provider)


def is_accelerated(provider: str | None) -> bool:
    return bool(provider) and provider in ACCELERATED_PROVIDERS


def benchmark_model_path() -> Path:
    """Tiny conv model shipped beside this package, used to time inference."""
    return Path(__file__).resolve().parent / "accel_benchmark.onnx"


def acceleration_status(requested: list[str] | None = None) -> dict[str, Any]:
    """Report what onnxruntime is installed and whether a GPU provider is active.

    Never raises — returns a structured dict the UI can render verbatim. This is
    the single source of truth for the "AI acceleration enabled/unavailable"
    badge in Settings.
    """
    import importlib.metadata as md

    status: dict[str, Any] = {
        "ok": True,
        "platform": platform.system(),
        "onnxruntimePackage": None,
        "onnxruntimeVersion": None,
        "onnxruntimeCpuInstalled": False,
        "onnxruntimeDirectmlInstalled": False,
        "conflict": False,
        "availableProviders": [],
        "selectedProvider": None,
        "accelerationEnabled": False,
        "device": "CPU",
        "message": "",
    }

    def _ver(pkg: str) -> str | None:
        try:
            return md.version(pkg)
        except Exception:
            return None

    cpu_ver = _ver("onnxruntime")
    dml_ver = _ver("onnxruntime-directml")
    gpu_ver = _ver("onnxruntime-gpu")
    status["onnxruntimeCpuInstalled"] = cpu_ver is not None
    status["onnxruntimeDirectmlInstalled"] = dml_ver is not None
    status["onnxruntimeGpuInstalled"] = gpu_ver is not None
    # onnxruntime, -directml and -gpu all install the same `onnxruntime` import
    # namespace; having more than one is the classic "falls back to CPU" trap.
    installed_variants = [v for v in (cpu_ver, dml_ver, gpu_ver) if v]
    status["conflict"] = len(installed_variants) > 1

    try:
        import onnxruntime as ort  # type: ignore

        providers = list(ort.get_available_providers())
        selected = preferred_onnx_providers(providers, requested)[0] if providers else None
        status["onnxruntimePackage"] = (
            "onnxruntime-directml" if dml_ver and platform.system() == "Windows"
            else "onnxruntime-gpu" if gpu_ver
            else "onnxruntime"
        )
        status["onnxruntimeVersion"] = getattr(ort, "__version__", None)
        status["availableProviders"] = providers
        status["selectedProvider"] = selected
        status["accelerationEnabled"] = is_accelerated(selected)
        status["device"] = provider_label(selected)
    except Exception as exc:
        status["ok"] = False
        status["message"] = f"onnxruntime import failed: {exc}"
        return status

    if status["conflict"]:
        status["message"] = (
            "Conflicting onnxruntime packages installed "
            f"({', '.join(p for p, v in (('onnxruntime', cpu_ver), ('onnxruntime-directml', dml_ver), ('onnxruntime-gpu', gpu_ver)) if v)}). "
            "Reinstall Smart Selection to keep only the DirectML build."
        )
    elif status["accelerationEnabled"]:
        status["message"] = f"AI acceleration enabled — running on {status['device']}."
    else:
        status["message"] = "AI acceleration unavailable — running on CPU."
    return status


def torch_sd_status() -> dict[str, Any]:
    """Diagnostics for the Stable Diffusion (torch/CUDA) content-aware fill path.

    Independent of the onnxruntime/DirectML path used by Smart Selection — SD runs
    on torch, which only uses the GPU when the CUDA build of torch is installed (the
    optional "NVIDIA AI Acceleration" component). Never raises.
    """
    status: dict[str, Any] = {
        "ok": True,
        "torchInstalled": False,
        "torchVersion": None,
        "cudaAvailable": False,
        "cudaDeviceName": None,
        "diffusersInstalled": False,
        "sdDevice": None,
        "estimatedMode": "unavailable",  # fast (CUDA) | slow (CPU) | unavailable (no diffusers)
        "message": "",
    }
    import importlib.util

    status["diffusersInstalled"] = importlib.util.find_spec("diffusers") is not None
    try:
        import torch  # type: ignore

        status["torchInstalled"] = True
        status["torchVersion"] = getattr(torch, "__version__", None)
        status["cudaAvailable"] = bool(torch.cuda.is_available())
        if status["cudaAvailable"]:
            try:
                status["cudaDeviceName"] = torch.cuda.get_device_name(0)
            except Exception:  # noqa: BLE001
                status["cudaDeviceName"] = "CUDA device"
    except Exception as exc:  # noqa: BLE001
        status["message"] = f"torch unavailable: {exc}"

    if not status["diffusersInstalled"]:
        status["sdDevice"] = None
        status["estimatedMode"] = "unavailable"
        status["message"] = status["message"] or "SD inpaint unavailable — diffusers is not installed."
    elif status["cudaAvailable"]:
        status["sdDevice"] = "cuda"
        status["estimatedMode"] = "fast"
        status["message"] = f"SD inpaint runs on GPU ({status['cudaDeviceName']}) — fast."
    else:
        status["sdDevice"] = "cpu"
        status["estimatedMode"] = "slow"
        status["message"] = "SD inpaint acceleration unavailable — running on CPU (slow). Install NVIDIA AI Acceleration for GPU speed."
    return status


def benchmark_acceleration(iterations: int = 8, requested: list[str] | None = None) -> dict[str, Any]:
    """Time a tiny conv model on the active provider and on CPU for comparison.

    Returns per-provider timings plus the resulting speedup. Designed to finish
    in well under a second on GPU and a few seconds on CPU. Never raises.
    """
    result: dict[str, Any] = {
        "ok": False,
        "results": [],
        "selectedProvider": None,
        "accelerationEnabled": False,
        "device": "CPU",
        "speedup": None,
        "message": "",
    }
    model_path = benchmark_model_path()
    if not model_path.exists():
        result["message"] = f"Benchmark model not found: {model_path.name}"
        return result
    try:
        import numpy as np
        import onnxruntime as ort  # type: ignore
    except Exception as exc:
        result["message"] = f"onnxruntime unavailable: {exc}"
        return result

    available = list(ort.get_available_providers())
    selected = preferred_onnx_providers(available, requested)[0] if available else "CPUExecutionProvider"
    result["selectedProvider"] = selected
    result["accelerationEnabled"] = is_accelerated(selected)
    result["device"] = provider_label(selected)

    # Always benchmark the active provider; add CPU as a baseline if it differs.
    to_test: list[str] = [selected]
    if selected != "CPUExecutionProvider" and "CPUExecutionProvider" in available:
        to_test.append("CPUExecutionProvider")

    data = np.random.randn(1, 3, 1024, 1024).astype(np.float32)
    timings: dict[str, float] = {}
    for provider in to_test:
        try:
            so = ort.SessionOptions()
            so.log_severity_level = 3
            chain = [provider] if provider == "CPUExecutionProvider" else [provider, "CPUExecutionProvider"]
            sess = ort.InferenceSession(str(model_path), sess_options=so, providers=chain)
            actual = sess.get_providers()[0]
            input_name = sess.get_inputs()[0].name
            for _ in range(2):  # warmup
                sess.run(None, {input_name: data})
            n = max(1, int(iterations))
            start = time.perf_counter()
            for _ in range(n):
                sess.run(None, {input_name: data})
            ms = (time.perf_counter() - start) / n * 1000.0
            timings[actual] = ms
            result["results"].append({
                "requested": provider,
                "provider": actual,
                "device": provider_label(actual),
                "msPerInference": round(ms, 1),
            })
        except Exception as exc:
            result["results"].append({
                "requested": provider,
                "provider": None,
                "device": provider_label(provider),
                "error": str(exc),
            })

    accel_ms = next((t for p, t in timings.items() if is_accelerated(p)), None)
    cpu_ms = timings.get("CPUExecutionProvider")
    if accel_ms is not None and cpu_ms:
        result["speedup"] = round(cpu_ms / accel_ms, 1)

    result["ok"] = any(r.get("provider") for r in result["results"])
    if not result["ok"]:
        result["message"] = "Benchmark failed on all providers."
    elif result["accelerationEnabled"] and result["speedup"]:
        result["message"] = f"GPU is {result['speedup']}× faster than CPU on this machine."
    elif result["accelerationEnabled"]:
        result["message"] = f"Running on {result['device']}."
    else:
        result["message"] = "AI acceleration unavailable — running on CPU."
    return result
