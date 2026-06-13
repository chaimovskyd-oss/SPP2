"""Process-global registry that owns AI model session lifecycle.

The registry is the single coordinator for loading, warming and reporting the
status of every local AI model used by the smart-selection sidecar. Concrete
loaders/warmers are registered by ``sidecar.py`` (which knows the services) so
this module stays free of circular imports.

Design goals (see plan add-an-ai-model-jiggly-locket):
  * Each model is loaded at most once per app session (``get`` is load-once).
  * ONNX ``InferenceSession`` objects are kept alive for the process lifetime.
  * ``preload(level)`` runs on a background daemon thread so the JSON-RPC loop
    (and ``status`` polls) are never blocked.
  * A failed model never crashes the app: it is marked ``failed`` with a
    ``fallback_reason`` and preload continues with the next model.
  * After each load a tiny dummy inference warms the kernels.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable


# Which models each AI Performance Mode preloads, in load order.
# Heaviest model last so the lighter, most-used tools become ready first.
LEVELS: dict[str, list[str]] = {
    "lazy": [],
    # Fast daily work: keep Object Select hot and avoid competing heavy loads.
    "balanced": ["scrfd_2.5g_kps", "birefnet"],
    # Interactive selection only. Content-aware fill stays on-demand.
    "advanced": ["scrfd_2.5g_kps", "birefnet", "sam2_hiera_small"],
    # Explicit heavy mode only. Default startup never reaches this unless the
    # user deliberately selects Full in settings.
    "full": ["scrfd_2.5g_kps", "birefnet", "sam2_hiera_small", "lama", "sd_inpaint"],
}

# Models that make the app "usable enough" to dismiss the loading splash.
ESSENTIAL_MODELS: tuple[str, ...] = ("birefnet",)

LogFn = Callable[..., None]
EmitFn = Callable[[dict[str, Any]], None]
# loader() -> {"handle": <session/service>, "provider": <str|None>}
LoaderFn = Callable[[], dict[str, Any]]
# warmer(handle) -> None  (raises on failure; warmup failure does not fail load)
WarmerFn = Callable[[Any], None]


@dataclass
class ModelSpec:
    name: str
    loader: LoaderFn
    warmer: WarmerFn | None = None
    label: str = ""


@dataclass
class ModelState:
    name: str
    status: str = "idle"  # idle | loading | ready | failed | fallback
    provider: str | None = None
    load_ms: float | None = None
    warmup_ms: float | None = None
    memory_mb: float | None = None
    loaded_at: float | None = None
    error: str | None = None
    fallback_reason: str | None = None
    warmup_error: str | None = None

    def to_json(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "status": self.status,
            "provider": self.provider,
            "loadMs": self.load_ms,
            "warmupMs": self.warmup_ms,
            "memoryMb": self.memory_mb,
            "loadedAt": self.loaded_at,
            "error": self.error,
            "fallbackReason": self.fallback_reason,
            "warmupError": self.warmup_error,
        }


def _process_memory_mb() -> float | None:
    """Resident memory of this process in MB, or None if psutil is unavailable."""
    try:
        import psutil  # type: ignore

        return round(psutil.Process().memory_info().rss / (1024 * 1024), 1)
    except Exception:
        return None


class ModelRegistry:
    def __init__(self, *, log: LogFn | None = None, emit: EmitFn | None = None) -> None:
        self._log: LogFn = log or (lambda *a, **k: None)
        self._emit: EmitFn = emit or (lambda payload: None)
        self._lock = threading.RLock()
        self._specs: dict[str, ModelSpec] = {}
        self._handles: dict[str, Any] = {}
        self._states: dict[str, ModelState] = {}
        self._load_locks: dict[str, threading.Lock] = {}
        self._level = "lazy"
        self._preload_thread: threading.Thread | None = None

    # -- registration -------------------------------------------------------
    def register(self, name: str, *, loader: LoaderFn, warmer: WarmerFn | None = None, label: str = "") -> None:
        with self._lock:
            self._specs[name] = ModelSpec(name=name, loader=loader, warmer=warmer, label=label or name)
            self._states.setdefault(name, ModelState(name=name))
            self._load_locks.setdefault(name, threading.Lock())

    # -- public api ---------------------------------------------------------
    def get(self, name: str) -> Any:
        """Return the live session/service for ``name``, loading it once on demand.

        This is the only sanctioned entry point for obtaining a model handle.
        Raises ``RuntimeError`` if the model is unknown or fails to load so the
        caller can fall back gracefully.
        """
        with self._lock:
            if name in self._handles:
                return self._handles[name]
            spec = self._specs.get(name)
            if spec is None:
                raise RuntimeError(f"Unknown model: {name}")
            load_lock = self._load_locks[name]

        # Serialize concurrent loads of the same model without holding the main
        # lock (so status() stays responsive while a slow load is in flight).
        with load_lock:
            with self._lock:
                if name in self._handles:
                    return self._handles[name]
            self._load_and_warm(spec)
            with self._lock:
                handle = self._handles.get(name)
                state = self._states[name]
            if handle is None:
                raise RuntimeError(state.error or f"{name} is unavailable")
            return handle

    def preload(self, level: str) -> dict[str, Any]:
        """Kick off a background preload of every model in ``level``. Non-blocking."""
        level = level if level in LEVELS else "balanced"
        with self._lock:
            self._level = level
            names = list(LEVELS[level])
            # Mark queued models as loading up-front so the UI shows progress
            # immediately, before the worker thread reaches them.
            for name in names:
                if name in self._handles:
                    continue
                state = self._states.setdefault(name, ModelState(name=name))
                state.status = "loading"

        if not names:
            return {"ok": True, "started": False, "level": level, "models": names}

        thread = threading.Thread(
            target=self._preload_worker,
            args=(level, names),
            name=f"ai-preload-{level}",
            daemon=True,
        )
        with self._lock:
            self._preload_thread = thread
        thread.start()
        return {"ok": True, "started": True, "level": level, "models": names}

    def reset(self) -> dict[str, Any]:
        """Drop cached handles so a subsequent preload/get reloads from scratch."""
        with self._lock:
            self._handles.clear()
            for name, state in self._states.items():
                self._states[name] = ModelState(name=name)
        self._log("ai model registry reset")
        return {"ok": True}

    def status(self) -> dict[str, Any]:
        with self._lock:
            models = {name: state.to_json() for name, state in self._states.items()}
            level = self._level
        # Overall is computed only over the models the current level preloads, so
        # registered-but-out-of-level models (e.g. sd_inpaint in "advanced") that
        # sit idle never drag the overall status down.
        level_names = [n for n in LEVELS.get(level, []) if n in models]
        statuses = [models[n]["status"] for n in level_names]
        if not statuses:
            overall = "idle"
        elif any(s == "loading" or s == "idle" for s in statuses):
            overall = "loading"
        elif all(s == "ready" for s in statuses):
            overall = "ready"
        elif any(s in ("ready", "fallback") for s in statuses):
            overall = "fallback"
        else:
            overall = "failed"
        return {
            "ok": True,
            "level": level,
            "overall": overall,
            "essentialReady": self._essential_ready_locked(models, level),
            "models": models,
        }

    # -- internals ----------------------------------------------------------
    @staticmethod
    def _essential_ready_locked(models: dict[str, dict[str, Any]], level: str) -> bool:
        level_names = set(LEVELS.get(level, []))
        relevant = [models[n] for n in ESSENTIAL_MODELS if n in models and n in level_names]
        if not relevant:
            return True
        return all(m["status"] in ("ready", "fallback") for m in relevant)

    def _preload_worker(self, level: str, names: list[str]) -> None:
        self._log("ai preload started", level=level, models=names)
        started = time.time()
        for name in names:
            with self._lock:
                if name in self._handles:
                    continue
                spec = self._specs.get(name)
            if spec is None:
                self._set_state(name, status="failed", error="not registered", fallback_reason="model not registered")
                self._emit_status(name)
                continue
            self._load_and_warm(spec)
            self._emit_status(name)
        self._log("ai preload finished", level=level, total_ms=round((time.time() - started) * 1000))

    def _load_and_warm(self, spec: ModelSpec) -> None:
        name = spec.name
        self._set_state(name, status="loading", error=None, fallback_reason=None, warmup_error=None)
        self._emit_status(name)

        # --- load ---
        load_started = time.time()
        try:
            result = spec.loader() or {}
        except Exception as exc:  # noqa: BLE001 - never crash the app
            reason = str(exc)
            self._set_state(name, status="failed", error=reason, fallback_reason=reason)
            self._log("ai model load failed", model=name, error=reason)
            return

        load_ms = round((time.time() - load_started) * 1000)
        handle = result.get("handle")
        provider = result.get("provider")
        if handle is None:
            reason = str(result.get("error") or "loader returned no handle")
            self._set_state(name, status="fallback", load_ms=load_ms, provider=provider, fallback_reason=reason)
            self._log("ai model unavailable, fallback active", model=name, reason=reason)
            return

        with self._lock:
            self._handles[name] = handle
        self._set_state(name, status="loading", load_ms=load_ms, provider=provider, loaded_at=time.time())
        self._log("ai model loaded", model=name, load_ms=load_ms, provider=provider, memory_mb=_process_memory_mb())

        # --- warmup (dummy inference) ---
        warmup_ms: float | None = None
        warmup_error: str | None = None
        if spec.warmer is not None:
            warm_started = time.time()
            try:
                spec.warmer(handle)
                warmup_ms = round((time.time() - warm_started) * 1000)
                self._log("ai model warmed", model=name, warmup_ms=warmup_ms)
            except Exception as exc:  # noqa: BLE001 - warmup is best-effort
                warmup_error = str(exc)
                self._log("ai model warmup failed", model=name, error=warmup_error)

        self._set_state(
            name,
            status="ready",
            load_ms=load_ms,
            provider=provider,
            warmup_ms=warmup_ms,
            warmup_error=warmup_error,
            memory_mb=_process_memory_mb(),
            loaded_at=time.time(),
        )

    def _set_state(self, name: str, **fields: Any) -> None:
        with self._lock:
            state = self._states.setdefault(name, ModelState(name=name))
            for key, value in fields.items():
                setattr(state, key, value)

    def _emit_status(self, name: str) -> None:
        with self._lock:
            state = self._states.get(name)
            payload = state.to_json() if state is not None else {"name": name}
        try:
            self._emit({"phase": "preload", "modelId": name, "model": payload})
        except Exception:
            pass
