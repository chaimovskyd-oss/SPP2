const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const COMPONENTS = [
  {
    id: "core",
    displayName: "ליבת SPP2",
    type: "core",
    defaultSelected: true,
    installOnFirstRun: true,
    blocksLaunch: true,
    isOptional: false,
    requirements: ["image.editor.engine/requirements-core.txt", "print.preview.engine/requirements.txt", "product_library/requirements.txt"],
    pipArgs: ["--prefer-binary"],
    models: [],
    toolIds: ["base", "psd-import", "print-preview"],
    signatureFile: ".spp2-comp-core.sig",
    healthImport: "import PIL, cv2, psd_tools",
    estimatedSizeMB: 350,
    removeSafe: false,
    repair: "reinstall-pip"
  },
  {
    id: "editor-light",
    displayName: "עורך תמונות",
    type: "editor",
    defaultSelected: true,
    installOnFirstRun: true,
    blocksLaunch: false,
    isOptional: false,
    requirements: [],
    pipArgs: [],
    models: [],
    toolIds: ["open_image_editor"],
    signatureFile: ".spp2-comp-editor-light.sig",
    healthImport: "import smart_image_editor",
    estimatedSizeMB: 0,
    removeSafe: false,
    repair: "reinstall-pip"
  },
  {
    id: "smart-selection",
    displayName: "בחירה חכמה",
    type: "optional",
    defaultSelected: true,
    installOnFirstRun: true,
    blocksLaunch: false,
    isOptional: true,
    requirements: ["image.editor.engine/requirements-smart-selection.txt"],
    pipArgs: ["--prefer-binary"],
    models: ["birefnet", "sam2_hiera_small"],
    toolIds: ["auto_segment", "predict_mask", "object_select"],
    signatureFile: ".spp2-comp-smart-selection.sig",
    healthImport: "import onnxruntime",
    estimatedSizeMB: 380,
    removeSafe: true,
    repair: "both"
  },
  {
    id: "content-aware-fill",
    displayName: "מילוי מודע תוכן",
    type: "optional",
    defaultSelected: false,
    installOnFirstRun: false,
    installOnDemandOnly: true,
    blocksLaunch: false,
    isOptional: true,
    requirements: ["image.editor.engine/requirements-content-aware.txt"],
    pipArgs: ["--prefer-binary", "--only-binary=:all:"],
    models: ["sd_inpaint"],
    toolIds: ["inpaint_remove", "content_aware_fill"],
    signatureFile: ".spp2-comp-content-aware-fill.sig",
    healthImport: "import torch",
    estimatedSizeMB: 550,
    removeSafe: true,
    repair: "both"
  },
  {
    id: "face-detection",
    displayName: "זיהוי פנים",
    type: "optional",
    defaultSelected: true,
    installOnFirstRun: true,
    blocksLaunch: false,
    isOptional: true,
    requirements: ["image.editor.engine/requirements-face.txt"],
    pipArgs: ["--prefer-binary"],
    models: [],
    toolIds: ["detect_faces", "class_photo"],
    signatureFile: ".spp2-comp-face-detection.sig",
    healthImport: "import mediapipe",
    estimatedSizeMB: 60,
    removeSafe: true,
    repair: "reinstall-pip"
  },
  {
    id: "editor-heavy-ai",
    displayName: "כלי AI מתקדמים לעורך",
    type: "editor",
    defaultSelected: false,
    installOnFirstRun: false,
    installOnDemandOnly: true,
    blocksLaunch: false,
    isOptional: true,
    requirements: ["image.editor.engine/requirements-editor-ai.txt"],
    pipArgs: ["--prefer-binary", "--only-binary=:all:"],
    models: ["gfpgan", "realesrgan"],
    toolIds: ["face_restore", "upscale_local"],
    signatureFile: ".spp2-comp-editor-heavy-ai.sig",
    healthImport: "import torchvision, realesrgan",
    estimatedSizeMB: 1500,
    removeSafe: true,
    repair: "both"
  },
  {
    id: "nvidia-ai-acceleration",
    displayName: "האצת AI ל-NVIDIA (CUDA)",
    type: "optional",
    defaultSelected: false,
    installOnFirstRun: false,
    installOnDemandOnly: true,
    blocksLaunch: false,
    isOptional: true,
    requirements: ["image.editor.engine/requirements-nvidia-ai.txt"],
    pipArgs: ["--prefer-binary"],
    models: [],
    toolIds: [],
    signatureFile: ".spp2-comp-nvidia-ai.sig",
    healthImport: "import torch; assert torch.cuda.is_available()",
    estimatedSizeMB: 2600,
    removeSafe: true,
    repair: "reinstall-pip"
  },
  {
    id: "raw-support",
    displayName: "תמיכה בקבצי RAW",
    type: "optional",
    defaultSelected: false,
    installOnFirstRun: false,
    installOnDemandOnly: true,
    blocksLaunch: false,
    isOptional: true,
    requirements: ["image.editor.engine/requirements-raw.txt"],
    pipArgs: ["--prefer-binary", "--only-binary=:all:"],
    models: [],
    toolIds: ["decode_raw"],
    signatureFile: ".spp2-comp-raw-support.sig",
    healthImport: "import rawpy",
    estimatedSizeMB: 15,
    removeSafe: true,
    repair: "reinstall-pip"
  },
  {
    id: "cloud-ai",
    displayName: "AI בענן",
    type: "cloud",
    defaultSelected: true,
    installOnFirstRun: false,
    blocksLaunch: false,
    isOptional: true,
    requirements: [],
    pipArgs: [],
    models: [],
    toolIds: ["remove_bg", "upscale", "restore"],
    signatureFile: ".spp2-comp-cloud-ai.sig",
    healthImport: "",
    estimatedSizeMB: 0,
    removeSafe: false,
    repair: "redownload-models"
  }
];

function getComponents() {
  return COMPONENTS.map((component) => ({ ...component, requirements: [...component.requirements], pipArgs: [...component.pipArgs], models: [...component.models], toolIds: [...component.toolIds] }));
}

function getComponent(id) {
  return getComponents().find((component) => component.id === id) || null;
}

function getComponentForTool(toolId) {
  return getComponents().find((component) => component.toolIds.includes(toolId)) || null;
}

function computeComponentSignature(componentId, options = {}) {
  const component = getComponent(componentId);
  if (!component) throw new Error(`Unknown component: ${componentId}`);
  const hash = crypto.createHash("sha256");
  hash.update(`component:${component.id}\n`);
  hash.update(`app:${options.appVersion || "0.0.0"}\n`);
  hash.update(`platform:${process.platform}-${process.arch}\n`);
  const resourcesRoot = options.resourcesRoot || path.join(__dirname, "..");
  for (const relPath of component.requirements) {
    const reqPath = path.join(resourcesRoot, relPath);
    hash.update(`${relPath}:`);
    if (fs.existsSync(reqPath)) hash.update(fs.readFileSync(reqPath));
    else hash.update("missing");
    hash.update("\n");
  }
  return hash.digest("hex");
}

module.exports = {
  getComponents,
  getComponent,
  getComponentForTool,
  computeComponentSignature
};
