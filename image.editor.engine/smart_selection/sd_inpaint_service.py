from __future__ import annotations

import gc
import importlib.util
import os
import threading
from typing import Any, Callable

from PIL import Image


ProgressCallback = Callable[[dict[str, Any]], None]

# Two local diffusion tiers share one service (only one pipeline is resident at a
# time — an 8 GB GPU can't hold both):
#   sd15 — fast. SD 1.5 inpainting, trained at 512px; coherent up to ~640.
#   sdxl — quality. SDXL inpainting, trained at 1024px; ~6.5 GB fp16, streamed
#          from CPU via enable_model_cpu_offload so it fits 6-8 GB GPUs.
# The original `runwayml/stable-diffusion-inpainting` repo was removed from the
# Hub, so sd15 uses the community-maintained v1-5 repo (and a mirror).
# Order = preference; the first that loads wins. Override per kind with
# SPP2_SD_INPAINT_MODEL / SPP2_SDXL_INPAINT_MODEL.
_MODEL_CANDIDATES_BY_KIND: dict[str, list[str]] = {
    "sd15": [
        os.environ.get("SPP2_SD_INPAINT_MODEL") or "",
        "stable-diffusion-v1-5/stable-diffusion-inpainting",
        "botp/stable-diffusion-v1-5-inpainting",
    ],
    "sdxl": [
        os.environ.get("SPP2_SDXL_INPAINT_MODEL") or "",
        "diffusers/stable-diffusion-xl-1.0-inpainting-0.1",
    ],
}

# SD 1.5 degrades badly above its training resolution; SDXL is native at 1024.
_DEFAULT_WORKING_SIZE = {"sd15": 576, "sdxl": 1024}

# Models whose id marks them as SDXL — they need CPU offload to fit a 6 GB GPU.
def _is_sdxl(model_id: str) -> bool:
    return "xl" in model_id.lower()


def _kind_from_options(options: dict[str, Any]) -> str:
    return "sdxl" if str(options.get("sdModel") or "").lower() in ("sdxl", "xl", "quality") else "sd15"


_DEFAULT_PROMPT = "seamless natural background, photorealistic, high detail"


class SdInpaintService:
    """High-quality generative inpainting via local Stable Diffusion (diffusers). Heavier/slower
    than LaMa but far better on dense textures (grass, foliage, gravel). Lazy-loaded; never warmed
    on startup (the weights are ~2 GB and load is slow)."""

    def __init__(self) -> None:
        self._pipe: Any | None = None
        self._device: str | None = None
        self._model_id: str | None = None
        self._kind: str | None = None
        self._last_error: str | None = None
        self._lock = threading.Lock()

    def available(self) -> bool:
        return importlib.util.find_spec("diffusers") is not None and importlib.util.find_spec("torch") is not None

    def warm(self) -> dict[str, Any]:
        try:
            self._ensure_pipe("sd15")
            return {"ok": True, "ready": True, "device": self._device, "modelId": self._model_id}
        except Exception as exc:  # noqa: BLE001
            self._last_error = str(exc)
            return {"ok": True, "ready": False, "error": str(exc)}

    def _unload(self) -> None:
        if self._pipe is None:
            return
        self._pipe = None
        self._model_id = None
        self._kind = None
        gc.collect()
        try:
            import torch  # type: ignore

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:  # noqa: BLE001
            pass

    def _ensure_pipe(self, kind: str = "sd15") -> Any:
        if self._pipe is not None and self._kind == kind:
            return self._pipe
        with self._lock:
            if self._pipe is not None and self._kind == kind:
                return self._pipe
            # Swapping tiers: free the resident pipeline first (VRAM headroom).
            self._unload()
            import torch  # type: ignore
            from diffusers import AutoPipelineForInpainting  # type: ignore

            device = "cuda" if torch.cuda.is_available() else "cpu"
            dtype = torch.float16 if device == "cuda" else torch.float32
            last_exc: Exception | None = None
            for model_id in [m for m in _MODEL_CANDIDATES_BY_KIND.get(kind, []) if m]:
                # Prefer the fp16 weight variant (≈half the download / VRAM); fall back to
                # the default precision if the repo doesn't publish an fp16 variant.
                for variant in (("fp16", None) if device == "cuda" else (None,)):
                    try:
                        kwargs: dict[str, Any] = {"torch_dtype": dtype, "safety_checker": None}
                        if variant is not None:
                            kwargs["variant"] = variant
                        pipe = AutoPipelineForInpainting.from_pretrained(model_id, **kwargs)
                        try:
                            pipe.set_progress_bar_config(disable=True)
                        except Exception:  # noqa: BLE001
                            pass
                        if device == "cuda" and _is_sdxl(model_id):
                            # SDXL weights (~6.5 GB fp16) don't fit a 6 GB GPU alongside
                            # activations — stream layers from CPU instead of pinning to VRAM.
                            try:
                                pipe.enable_model_cpu_offload()
                            except Exception:  # noqa: BLE001
                                pipe = pipe.to(device)
                        else:
                            pipe = pipe.to(device)
                        if device == "cuda":
                            for tune in (pipe.enable_attention_slicing, pipe.enable_vae_tiling):
                                try:
                                    tune()
                                except Exception:  # noqa: BLE001
                                    pass
                        self._pipe = pipe
                        self._device = device
                        self._model_id = model_id
                        self._kind = kind
                        return pipe
                    except Exception as exc:  # noqa: BLE001
                        last_exc = exc
                        continue
            raise RuntimeError(f"SD inpaint unavailable ({kind}): {last_exc}")

    def fill(
        self,
        image_patch: Image.Image,
        mask_patch: Image.Image,
        options: dict[str, Any],
        *,
        progress: ProgressCallback | None = None,
    ) -> Image.Image:
        import torch  # type: ignore

        kind = _kind_from_options(options)
        pipe = self._ensure_pipe(kind)
        prompt = str(options.get("prompt") or "").strip() or _DEFAULT_PROMPT
        negative = str(options.get("negativePrompt") or "").strip() or None
        steps = max(8, min(50, int(options.get("sdSteps") or 24)))
        guidance = float(options.get("sdGuidance") or 7.5)
        work = max(256, min(1024, int(options.get("sdWorkingSize") or _DEFAULT_WORKING_SIZE.get(kind, 576))))

        w0, h0 = image_patch.size
        scale = work / max(w0, h0)
        wt = max(64, int(round(w0 * scale / 8)) * 8)
        ht = max(64, int(round(h0 * scale / 8)) * 8)
        img_r = image_patch.convert("RGB").resize((wt, ht), Image.Resampling.LANCZOS)
        mask_r = mask_patch.convert("L").resize((wt, ht), Image.Resampling.NEAREST)

        generator = None
        seed = options.get("sdSeed")
        if seed is not None:
            generator = torch.Generator(device=self._device or "cpu").manual_seed(int(seed))

        step_cb = None
        if progress is not None:
            def _on_step(_pipe: Any, step: int, _t: Any, kwargs: dict[str, Any]) -> dict[str, Any]:
                pct = 10 + int((step / max(1, steps)) * 80)
                progress({"operation": "inpaint_remove", "phase": "inpaint", "message": "SD איכותי...", "percent": pct, "modelId": "sd_inpaint"})
                return kwargs
            step_cb = _on_step

        # strength 1.0 = pure-noise init in the masked area. Anything below noises
        # the INPUT pixels instead — and for outpainting the masked input is a
        # synthetic underlay, which at <1.0 visibly leaks into the fill (white
        # underlay → gray/white fills). Keep 1.0; color grounding comes from the
        # blurred-image underlay + downstream color adaptation.
        strength = 1.0
        kwargs: dict[str, Any] = {
            "prompt": prompt,
            "negative_prompt": negative,
            "image": img_r,
            "mask_image": mask_r,
            "num_inference_steps": steps,
            "guidance_scale": guidance,
            "strength": strength,
            "generator": generator,
        }
        if step_cb is not None:
            kwargs["callback_on_step_end"] = step_cb
        result = pipe(**kwargs).images[0]
        return result.resize((w0, h0), Image.Resampling.LANCZOS)
