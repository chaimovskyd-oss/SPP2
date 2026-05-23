import { useEffect, useRef, useState, type ReactElement } from "react";
import { UploadCloud } from "lucide-react";

interface GlobalWizardDropTargetProps {
  acceptFile: (file: File) => boolean;
  onFiles: (files: File[]) => void;
  title?: string;
  subtitle?: string;
  invalidTitle?: string;
  invalidSubtitle?: string;
  enabled?: boolean;
}

type OverlayState = "idle" | "active" | "invalid";

function dragEventHasFiles(event: DragEvent): boolean {
  const types = event.dataTransfer?.types;
  return types !== undefined && Array.from(types).includes("Files");
}

export function isImageDropFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(avif|bmp|gif|heic|heif|jpe?g|png|tiff?|webp)$/i.test(file.name);
}

export function GlobalWizardDropTarget({
  acceptFile,
  onFiles,
  title = "שחרר כאן להוספת תמונות",
  subtitle = "אפשר לגרור קבצים כמעט מכל מקום בחלון",
  invalidTitle = "הקובץ אינו נתמך",
  invalidSubtitle = "גרור קבצי תמונה נתמכים בלבד",
  enabled = true
}: GlobalWizardDropTargetProps): ReactElement | null {
  const [overlayState, setOverlayState] = useState<OverlayState>("idle");
  const dragDepthRef = useRef(0);
  const invalidTimerRef = useRef<number | null>(null);
  const acceptFileRef = useRef(acceptFile);
  const onFilesRef = useRef(onFiles);

  acceptFileRef.current = acceptFile;
  onFilesRef.current = onFiles;

  useEffect(() => {
    if (!enabled) return;

    function clearInvalidTimer(): void {
      if (invalidTimerRef.current !== null) {
        window.clearTimeout(invalidTimerRef.current);
        invalidTimerRef.current = null;
      }
    }

    function showInvalidFeedback(): void {
      clearInvalidTimer();
      setOverlayState("invalid");
      invalidTimerRef.current = window.setTimeout(() => {
        dragDepthRef.current = 0;
        setOverlayState("idle");
        invalidTimerRef.current = null;
      }, 1800);
    }

    function onDragEnter(event: DragEvent): void {
      if (!dragEventHasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      clearInvalidTimer();
      setOverlayState("active");
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "copy";
    }

    function onDragOver(event: DragEvent): void {
      if (!dragEventHasFiles(event)) return;
      event.preventDefault();
      setOverlayState("active");
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "copy";
    }

    function onDragLeave(event: DragEvent): void {
      if (!dragEventHasFiles(event)) return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setOverlayState("idle");
    }

    function onDrop(event: DragEvent): void {
      if (!dragEventHasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current = 0;
      const files = Array.from(event.dataTransfer?.files ?? []);
      const accepted = files.filter((file) => acceptFileRef.current(file));
      if (accepted.length === 0) {
        showInvalidFeedback();
        return;
      }
      setOverlayState("idle");
      onFilesRef.current(accepted);
    }

    const capture = { capture: true };
    window.addEventListener("dragenter", onDragEnter, capture);
    window.addEventListener("dragover", onDragOver, capture);
    window.addEventListener("dragleave", onDragLeave, capture);
    window.addEventListener("drop", onDrop, capture);

    return () => {
      clearInvalidTimer();
      window.removeEventListener("dragenter", onDragEnter, capture);
      window.removeEventListener("dragover", onDragOver, capture);
      window.removeEventListener("dragleave", onDragLeave, capture);
      window.removeEventListener("drop", onDrop, capture);
    };
  }, [enabled]);

  if (!enabled || overlayState === "idle") return null;

  const invalid = overlayState === "invalid";
  return (
    <div className={`wizard-global-drop-overlay${invalid ? " invalid" : ""}`} aria-hidden="true">
      <div className="wizard-global-drop-panel">
        <UploadCloud size={42} strokeWidth={1.5} />
        <strong>{invalid ? invalidTitle : title}</strong>
        <span>{invalid ? invalidSubtitle : subtitle}</span>
      </div>
    </div>
  );
}
