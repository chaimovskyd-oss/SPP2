from __future__ import annotations

import hashlib
import json
import os
import time
import urllib.error
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable


MANIFEST_VERSION = 1
DOWNLOAD_CHUNK_SIZE = 1024 * 1024
BIREFNET_LITE_ONNX_URL = "https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/main/onnx/model.onnx?download=true"
SAM2_SMALL_BASE_URL = "https://huggingface.co/onnx-community/sam2.1-hiera-small-ONNX/resolve/main/onnx"
SCRFD_25G_NUGET_URL = "https://packages.nuget.org/api/v2/package/FaceAiSharp.Models.Scrfd.2dot5g_kps_640x640/0.20230205.2"
ProgressCallback = Callable[[dict[str, Any]], None]


DEFAULT_MODELS: dict[str, dict[str, Any]] = {
    "birefnet": {
        "id": "birefnet",
        "label": "Automatic Object Cutout",
        "filename": "birefnet.onnx",
        "version": "onnx-community/BiRefNet_lite-ONNX@f82954f",
        "repo": "onnx-community/BiRefNet_lite-ONNX",
        "sourceFile": "onnx/model.onnx",
        "url": BIREFNET_LITE_ONNX_URL,
        "sha256": "5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333",
        "sizeBytes": 224005088,
        "license": "mit",
        "requiredFor": ["auto_segment"],
        "profile": ["balanced", "quality"],
    },
    "sam2_hiera_small": {
        "id": "sam2_hiera_small",
        "label": "Interactive Smart Selection",
        "filename": "sam2_hiera_small/vision_encoder_quantized.onnx",
        "version": "onnx-community/sam2.1-hiera-small-ONNX@a7df49d",
        "repo": "onnx-community/sam2.1-hiera-small-ONNX",
        "variant": "quantized",
        "sourceFile": "onnx/vision_encoder_quantized.onnx",
        "url": f"{SAM2_SMALL_BASE_URL}/vision_encoder_quantized.onnx?download=true",
        "sha256": "7a39994554c68e39ad6e10d1b9f2284bbdcd8e32e3ae18c83c1adf2e91b59582",
        "sizeBytes": 69269632,
        "files": [
            {
                "role": "vision_encoder",
                "filename": "sam2_hiera_small/vision_encoder_quantized.onnx",
                "sourceFile": "onnx/vision_encoder_quantized.onnx",
                "url": f"{SAM2_SMALL_BASE_URL}/vision_encoder_quantized.onnx?download=true",
                "sha256": "7a39994554c68e39ad6e10d1b9f2284bbdcd8e32e3ae18c83c1adf2e91b59582",
                "sizeBytes": 578237,
            },
            {
                "role": "vision_encoder_data",
                "filename": "sam2_hiera_small/vision_encoder_quantized.onnx_data",
                "sourceFile": "onnx/vision_encoder_quantized.onnx_data",
                "url": f"{SAM2_SMALL_BASE_URL}/vision_encoder_quantized.onnx_data?download=true",
                "sha256": "154519f6f0f118f1e48dba7afaecb9bac5917969b7d5daa01c5195342a4f95e4",
                "sizeBytes": 59730848,
            },
            {
                "role": "prompt_encoder_mask_decoder",
                "filename": "sam2_hiera_small/prompt_encoder_mask_decoder_quantized.onnx",
                "sourceFile": "onnx/prompt_encoder_mask_decoder_quantized.onnx",
                "url": f"{SAM2_SMALL_BASE_URL}/prompt_encoder_mask_decoder_quantized.onnx?download=true",
                "sha256": "00a5806d32601169ff194510469101e7ebbd81878955ca79d5afedbb595c1382",
                "sizeBytes": 290416,
            },
            {
                "role": "prompt_encoder_mask_decoder_data",
                "filename": "sam2_hiera_small/prompt_encoder_mask_decoder_quantized.onnx_data",
                "sourceFile": "onnx/prompt_encoder_mask_decoder_quantized.onnx_data",
                "url": f"{SAM2_SMALL_BASE_URL}/prompt_encoder_mask_decoder_quantized.onnx_data?download=true",
                "sha256": "95ffcc679712b94e038428fc7d4875bcfd9e42b068bd833f166db3526dfcb07c",
                "sizeBytes": 8662016,
            },
        ],
        "requiredFor": ["predict_mask"],
        "profile": ["balanced", "quality"],
    },
    "scrfd_2.5g_kps": {
        "id": "scrfd_2.5g_kps",
        "label": "Face Detection (SCRFD 2.5G KPS)",
        "filename": "scrfd/scrfd_2.5g_kps_640x640.onnx",
        "version": "FaceAiSharp.Models.Scrfd.2dot5g_kps_640x640@0.20230205.2",
        "repo": "georg-jung/FaceAiSharp.Models",
        "sourceFile": "contentFiles/any/any/onnx/scrfd_2.5g_kps_640x640.onnx",
        "url": SCRFD_25G_NUGET_URL,
        "archiveMember": "contentFiles/any/any/onnx/scrfd_2.5g_kps_640x640.onnx",
        "sha256": "6e23f1a85a558b8cc48d25b79e4d40a3380a66a9ac671215505b105b868f587f",
        "sizeBytes": 3291773,
        "archiveSizeBytes": 3066165,
        "license": "non-commercial-research",
        "requiredFor": ["detect_faces", "class_photo"],
        "profile": ["performance", "balanced", "quality"],
    },
    "sam2_hiera_large": {
        "id": "sam2_hiera_large",
        "label": "Interactive Smart Selection (Large)",
        "filename": "sam2_hiera_large.onnx",
        "version": "unconfigured",
        "url": None,
        "sha256": None,
        "sizeBytes": None,
        "requiredFor": ["predict_mask"],
        "profile": ["quality"],
    },
    "cascadepsp": {
        "id": "cascadepsp",
        "label": "Print Edge Refinement",
        "filename": "cascadepsp.onnx",
        "version": "unconfigured",
        "url": None,
        "sha256": None,
        "sizeBytes": None,
        "requiredFor": ["refine_mask"],
        "profile": ["balanced", "quality"],
    },
    "modnet": {
        "id": "modnet",
        "label": "Fast Matting Fallback",
        "filename": "modnet.onnx",
        "version": "unconfigured",
        "url": None,
        "sha256": None,
        "sizeBytes": None,
        "requiredFor": ["refine_mask"],
        "profile": ["performance"],
    },
    "lama": {
        "id": "lama",
        "label": "Remove / AI Fill",
        "filename": "lama/big-lama.ckpt",
        "version": "simple-lama-inpainting",
        "url": None,
        "sha256": None,
        "sizeBytes": None,
        "license": "apache-2.0",
        "requiredFor": ["inpaint_remove"],
        "profile": ["balanced", "quality"],
    },
}


@dataclass(frozen=True)
class ModelStatus:
    ok: bool
    model_id: str
    available: bool
    path: str | None
    status: str
    message: str
    manifest_path: str
    sha256: str | None = None
    expected_sha256: str | None = None
    size_bytes: int | None = None
    version: str | None = None
    files: list[dict[str, Any]] | None = None

    def to_json(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "modelId": self.model_id,
            "available": self.available,
            "path": self.path,
            "status": self.status,
            "message": self.message,
            "manifestPath": self.manifest_path,
            "sha256": self.sha256,
            "expectedSha256": self.expected_sha256,
            "sizeBytes": self.size_bytes,
            "version": self.version,
            "files": self.files,
        }


class ModelManager:
    def __init__(self, models_dir: Path | None = None) -> None:
        self.models_dir = models_dir or Path(os.environ.get("SPP2_MODELS_DIR", "models"))
        self.models_dir.mkdir(parents=True, exist_ok=True)
        self.manifest_path = self.models_dir / "smart-selection-manifest.json"
        self._ready_cache: dict[str, ModelStatus] = {}

    def list_models(self) -> dict[str, Any]:
        manifest = self.read_manifest()
        models = []
        for model_id in sorted(manifest["models"]):
            models.append(self.status(model_id).to_json())
        return {
            "ok": True,
            "manifestPath": str(self.manifest_path),
            "modelsDir": str(self.models_dir),
            "models": models,
        }

    def status(self, model_id: str) -> ModelStatus:
        manifest = self.read_manifest()
        model = manifest["models"].get(model_id)
        if not model:
            return ModelStatus(
                ok=False,
                model_id=model_id,
                available=False,
                path=None,
                status="unknown_model",
                message=f"Unknown smart-selection model: {model_id}",
                manifest_path=str(self.manifest_path),
            )

        file_specs = self.model_files(model)
        file_statuses = [self.file_status(spec) for spec in file_specs]
        missing = [item for item in file_statuses if item["status"] == "missing"]
        mismatched = [item for item in file_statuses if item["status"] == "sha256_mismatch"]
        primary = file_statuses[0]
        if missing:
            return ModelStatus(
                ok=True,
                model_id=model_id,
                available=False,
                path=str(primary["path"]),
                status="missing",
                message=self.missing_message(model),
                manifest_path=str(self.manifest_path),
                expected_sha256=primary.get("expectedSha256"),
                version=str(model.get("version") or ""),
                files=file_statuses,
            )

        if mismatched:
            return ModelStatus(
                ok=False,
                model_id=model_id,
                available=False,
                path=str(primary["path"]),
                status="sha256_mismatch",
                message=f"Model file failed integrity check: {mismatched[0]['filename']}",
                manifest_path=str(self.manifest_path),
                sha256=primary.get("sha256"),
                expected_sha256=primary.get("expectedSha256"),
                size_bytes=sum(int(item.get("sizeBytes") or 0) for item in file_statuses),
                version=str(model.get("version") or ""),
                files=file_statuses,
            )

        return ModelStatus(
            ok=True,
            model_id=model_id,
            available=True,
            path=str(primary["path"]),
            status="ready",
            message=f"{model.get('label') or model_id} is ready.",
            manifest_path=str(self.manifest_path),
            sha256=primary.get("sha256"),
            expected_sha256=primary.get("expectedSha256"),
            size_bytes=sum(int(item.get("sizeBytes") or 0) for item in file_statuses),
            version=str(model.get("version") or ""),
            files=file_statuses,
        )

    def ensure(self, model_id: str, *, auto_download: bool = True, progress: ProgressCallback | None = None) -> ModelStatus:
        cached = self._ready_cache.get(model_id)
        if cached is not None and self._cached_status_exists(cached):
            return cached

        current = self.status(model_id)
        if current.available or current.status not in {"missing", "sha256_mismatch"}:
            if current.available:
                self._ready_cache[model_id] = current
            return current

        manifest = self.read_manifest()
        model = manifest["models"].get(model_id)
        if not model:
            return current
        file_specs = self.model_files(model)
        if not any(str(spec.get("url") or "") for spec in file_specs):
            return current
        if not auto_download:
            return ModelStatus(
                ok=True,
                model_id=model_id,
                available=False,
                path=current.path,
                status="download_required",
                message=f"{model.get('label') or model_id} needs a first-time download.",
                manifest_path=str(self.manifest_path),
                expected_sha256=normalize_sha(model.get("sha256")),
                version=str(model.get("version") or ""),
            )

        if progress is not None:
            progress({
                "phase": "download",
                "modelId": model_id,
                "message": f"Preparing {model.get('label') or model_id}...",
                "percent": 0,
            })

        failures: list[str] = []
        total_bytes = sum(int(spec.get("sizeBytes") or 0) for spec in file_specs)
        completed_bytes = 0
        for spec in file_specs:
            file_state = self.file_status(spec)
            if file_state["status"] == "ready":
                completed_bytes += int(file_state.get("sizeBytes") or spec.get("sizeBytes") or 0)
                continue
            url = str(spec.get("url") or "")
            if not url:
                continue
            try:
                filename = str(spec.get("filename") or self.model_path(spec).name)

                def file_progress(update: dict[str, Any], *, offset: int = completed_bytes, file_spec: dict[str, Any] = spec, file_name: str = filename) -> None:
                    file_done = int(update.get("bytesDone") or 0)
                    file_total = int(update.get("bytesTotal") or file_spec.get("sizeBytes") or 0)
                    aggregate_total = total_bytes or file_total
                    aggregate_done = offset + file_done if total_bytes else file_done
                    percent = None
                    if aggregate_total > 0:
                        percent = max(0, min(100, round((aggregate_done / aggregate_total) * 100, 1)))
                    progress({
                        **update,
                        "modelId": model_id,
                        "fileName": file_name,
                        "bytesDone": aggregate_done,
                        "bytesTotal": aggregate_total or None,
                        "percent": percent,
                    })

                path = self.model_path(spec)
                archive_member = str(spec.get("archiveMember") or "")
                if archive_member:
                    self.download_archive_member(
                        url,
                        archive_member,
                        path,
                        progress=file_progress if progress is not None else None,
                        expected_size=int(spec.get("archiveSizeBytes") or spec.get("sizeBytes") or 0) or None,
                    )
                else:
                    self.download_model(
                        url,
                        path,
                        progress=file_progress if progress is not None else None,
                        expected_size=int(spec.get("sizeBytes") or 0) or None,
                    )
                completed_bytes += int(spec.get("sizeBytes") or path.stat().st_size)
            except Exception as exc:
                failures.append(f"{spec.get('filename')}: {exc}")
        if failures:
            self._ready_cache.pop(model_id, None)
            return ModelStatus(
                ok=False,
                model_id=model_id,
                available=False,
                path=current.path,
                status="download_failed",
                message=f"Model download failed: {'; '.join(failures)}",
                manifest_path=str(self.manifest_path),
                expected_sha256=normalize_sha(model.get("sha256")),
                version=str(model.get("version") or ""),
            )
        if progress is not None:
            progress({
                "phase": "verify",
                "modelId": model_id,
                "message": f"Verifying {model.get('label') or model_id}...",
                "percent": 100,
            })
        final = self.status(model_id)
        if final.available:
            self._ready_cache[model_id] = final
            if progress is not None:
                progress({
                    "phase": "ready",
                    "modelId": model_id,
                    "message": f"{model.get('label') or model_id} is ready.",
                    "percent": 100,
                })
        return final

    def _cached_status_exists(self, status: ModelStatus) -> bool:
        if status.files:
            return all(Path(str(item.get("path") or "")).exists() for item in status.files)
        return bool(status.path and Path(status.path).exists())

    def read_manifest(self) -> dict[str, Any]:
        if not self.manifest_path.exists():
            return self.write_default_manifest()
        try:
            manifest = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        except Exception:
            broken = self.manifest_path.with_suffix(f".broken-{int(time.time())}.json")
            self.manifest_path.replace(broken)
            return self.write_default_manifest()

        changed = False
        if manifest.get("version") != MANIFEST_VERSION:
            manifest["version"] = MANIFEST_VERSION
            changed = True
        if not isinstance(manifest.get("models"), dict):
            manifest["models"] = {}
            changed = True
        for model_id, model in DEFAULT_MODELS.items():
            if model_id not in manifest["models"]:
                manifest["models"][model_id] = model
                changed = True
            elif merge_default_model_metadata(manifest["models"][model_id], model):
                changed = True
        if changed:
            self.manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        return manifest

    def write_default_manifest(self) -> dict[str, Any]:
        manifest = {
            "version": MANIFEST_VERSION,
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "note": "Fill url and sha256 for each approved ONNX model. Downloads are lazy and stored in this directory.",
            "models": DEFAULT_MODELS,
        }
        self.manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        return manifest

    def model_files(self, model: dict[str, Any]) -> list[dict[str, Any]]:
        files = model.get("files")
        if isinstance(files, list) and files:
            return [item for item in files if isinstance(item, dict)]
        return [model]

    def model_path(self, model: dict[str, Any]) -> Path:
        filename = safe_relative_path(str(model.get("filename") or f"{model.get('id', 'model')}.onnx"))
        return self.models_dir / filename

    def file_status(self, spec: dict[str, Any]) -> dict[str, Any]:
        path = self.model_path(spec)
        expected_sha = normalize_sha(spec.get("sha256"))
        base = {
            "role": spec.get("role"),
            "filename": str(spec.get("filename") or path.name),
            "path": str(path),
            "expectedSha256": expected_sha,
            "sizeBytes": path.stat().st_size if path.exists() else None,
        }
        if not path.exists():
            return {**base, "available": False, "status": "missing", "sha256": None}
        actual_sha = sha256_file(path)
        if expected_sha and actual_sha.lower() != expected_sha:
            return {**base, "available": False, "status": "sha256_mismatch", "sha256": actual_sha}
        return {**base, "available": True, "status": "ready", "sha256": actual_sha}

    def missing_message(self, model: dict[str, Any]) -> str:
        if model.get("url"):
            return f"{model.get('label') or model.get('id')} will download on first use."
        return f"{model.get('label') or model.get('id')} is not configured yet; fallback selection is active."

    def download_model(
        self,
        url: str,
        path: Path,
        *,
        progress: ProgressCallback | None = None,
        expected_size: int | None = None,
    ) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = path.with_suffix(path.suffix + ".download")
        headers: dict[str, str] = {}
        initial_size = tmp_path.stat().st_size if tmp_path.exists() else 0
        if tmp_path.exists():
            headers["Range"] = f"bytes={initial_size}-"
        request = urllib.request.Request(url, headers=headers)
        mode = "ab" if "Range" in headers else "wb"
        downloaded = initial_size
        last_emit = 0.0
        try:
            with urllib.request.urlopen(request, timeout=60) as response, tmp_path.open(mode) as out:
                if headers.get("Range") and getattr(response, "status", 200) == 200:
                    out.seek(0)
                    out.truncate()
                    downloaded = 0
                response_remaining = int(response.headers.get("Content-Length") or 0)
                total = expected_size or (downloaded + response_remaining if response_remaining else None)
                if progress is not None:
                    progress({
                        "phase": "download",
                        "message": "Downloading smart selection model...",
                        "bytesDone": downloaded,
                        "bytesTotal": total,
                    })
                while True:
                    chunk = response.read(DOWNLOAD_CHUNK_SIZE)
                    if not chunk:
                        break
                    out.write(chunk)
                    downloaded += len(chunk)
                    now = time.time()
                    if progress is not None and now - last_emit >= 0.2:
                        last_emit = now
                        progress({
                            "phase": "download",
                            "message": "Downloading smart selection model...",
                            "bytesDone": downloaded,
                            "bytesTotal": total,
                        })
        except urllib.error.HTTPError as exc:
            if exc.code == 416 and tmp_path.exists():
                pass
            else:
                raise
        if progress is not None:
            progress({
                "phase": "download",
                "message": "Download complete.",
                "bytesDone": tmp_path.stat().st_size if tmp_path.exists() else downloaded,
                "bytesTotal": expected_size,
            })
        tmp_path.replace(path)

    def download_archive_member(
        self,
        url: str,
        member_name: str,
        path: Path,
        *,
        progress: ProgressCallback | None = None,
        expected_size: int | None = None,
    ) -> None:
        """Download a zip-compatible package and extract one model file from it."""
        archive_path = path.with_suffix(path.suffix + ".archive.download")
        self.download_model(url, archive_path, progress=progress, expected_size=expected_size)
        try:
            with zipfile.ZipFile(archive_path) as archive:
                normalized = member_name.replace("\\", "/")
                candidates = {name.replace("\\", "/"): name for name in archive.namelist()}
                archive_member = candidates.get(normalized)
                if archive_member is None:
                    raise RuntimeError(f"Archive member not found: {member_name}")
                path.parent.mkdir(parents=True, exist_ok=True)
                tmp_path = path.with_suffix(path.suffix + ".extract")
                with archive.open(archive_member) as source, tmp_path.open("wb") as target:
                    while True:
                        chunk = source.read(DOWNLOAD_CHUNK_SIZE)
                        if not chunk:
                            break
                        target.write(chunk)
                tmp_path.replace(path)
        finally:
            try:
                archive_path.unlink(missing_ok=True)
            except Exception:
                pass


def normalize_sha(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip().lower()
    return value if len(value) == 64 else None


def safe_relative_path(value: str) -> Path:
    path = Path(value.replace("\\", "/"))
    parts = [part for part in path.parts if part not in {"", ".", ".."}]
    if not parts:
        return Path("model.onnx")
    return Path(*parts)


def merge_default_model_metadata(current: Any, default: dict[str, Any]) -> bool:
    if not isinstance(current, dict):
        return False
    changed = False
    for key, value in default.items():
        current_value = current.get(key)
        should_fill = current_value is None or current_value == "" or current_value == "unconfigured"
        if key in {"url", "sha256", "sizeBytes", "archiveSizeBytes", "archiveMember", "version", "repo", "sourceFile", "license", "variant"} and should_fill:
            current[key] = value
            changed = True
        elif key not in current:
            current[key] = value
            changed = True
    return changed


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(DOWNLOAD_CHUNK_SIZE), b""):
            digest.update(chunk)
    return digest.hexdigest()
