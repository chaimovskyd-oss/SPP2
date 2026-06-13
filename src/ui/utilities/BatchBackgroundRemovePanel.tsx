import { CheckCircle2, FolderOpen, Images, Play, X, XCircle } from "lucide-react";
import { useEffect, useMemo, useState, type ReactElement } from "react";

type BatchStatus = "idle" | "ready" | "running" | "done" | "error";

interface BatchProgress {
  status: "running" | "done";
  total: number;
  completed: number;
  currentFile?: string;
  message: string;
}

interface BatchItem {
  inputPath: string;
  outputPath?: string;
  fileName: string;
  error?: string;
}

interface BatchResult {
  success: boolean;
  outputDir: string;
  successes: BatchItem[];
  failures: BatchItem[];
  error?: string;
}

interface BatchBackgroundRemovePanelProps {
  onClose: () => void;
}

export function BatchBackgroundRemovePanel({ onClose }: BatchBackgroundRemovePanelProps): ReactElement {
  const [filePaths, setFilePaths] = useState<string[]>([]);
  const [outputDir, setOutputDir] = useState("");
  const [status, setStatus] = useState<BatchStatus>("idle");
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canRun = filePaths.length > 0 && status !== "running";
  const percent = useMemo(() => {
    if (progress === null || progress.total <= 0) return 0;
    return Math.round((progress.completed / progress.total) * 100);
  }, [progress]);

  useEffect(() => {
    return window.spp?.batchBackgroundRemove?.onProgress?.((payload) => {
      setProgress(payload);
    });
  }, []);

  async function chooseImages(): Promise<void> {
    setError(null);
    const api = window.spp?.batchBackgroundRemove;
    if (api === undefined) {
      setError("הכלי זמין רק בהרצה דרך Electron.");
      setStatus("error");
      return;
    }
    const response = await api.chooseImages();
    if (!response.success) {
      if (!response.canceled) setError(response.error ?? "בחירת התמונות נכשלה.");
      return;
    }
    const selected = response.filePaths ?? [];
    setFilePaths(selected);
    setOutputDir(response.defaultOutputDir ?? "");
    setResult(null);
    setProgress(null);
    setStatus(selected.length > 0 ? "ready" : "idle");
  }

  async function chooseOutputDir(): Promise<void> {
    setError(null);
    const response = await window.spp?.batchBackgroundRemove?.chooseOutputDir(outputDir);
    if (response === undefined) {
      setError("בחירת תיקייה זמינה רק בהרצה דרך Electron.");
      setStatus("error");
      return;
    }
    if (!response.success) {
      if (!response.canceled) setError(response.error ?? "בחירת תיקיית השמירה נכשלה.");
      return;
    }
    setOutputDir(response.folderPath ?? outputDir);
  }

  async function runBatch(): Promise<void> {
    if (!canRun) return;
    setStatus("running");
    setError(null);
    setResult(null);
    setProgress({ status: "running", total: filePaths.length, completed: 0, message: "מתחיל עיבוד תמונות" });
    const response = await window.spp?.batchBackgroundRemove?.run({ filePaths, outputDir });
    if (response === undefined) {
      setStatus("error");
      setError("הכלי זמין רק בהרצה דרך Electron.");
      return;
    }
    setResult(response);
    setStatus(response.success ? "done" : "error");
    if (!response.success) setError(response.error ?? "העיבוד נכשל.");
  }

  return (
    <div className="util-panel batch-bg-panel" role="dialog" aria-label="הסרת רקע כמותית">
      <div className="util-panel-header">
        <h3>הסרת רקע כמותית</h3>
        <button className="icon-btn" onClick={onClose} type="button" aria-label="סגור">
          <X size={16} />
        </button>
      </div>

      <div className="util-panel-body batch-bg-body">
        <div className="batch-bg-actions">
          <button className="btn btn-accent" onClick={chooseImages} disabled={status === "running"} type="button">
            <Images size={15} />
            העלאת תמונות
          </button>
          <button className="btn btn-ghost" onClick={chooseOutputDir} disabled={filePaths.length === 0 || status === "running"} type="button">
            <FolderOpen size={15} />
            תיקיית שמירה
          </button>
        </div>

        <div className="batch-bg-field">
          <span>נבחרו</span>
          <strong>{filePaths.length} תמונות</strong>
        </div>

        <div className="batch-bg-field">
          <span>שמירה אל</span>
          <strong title={outputDir}>{outputDir || "תיקייה פנימית ליד התמונות המקוריות"}</strong>
        </div>

        <button className="btn btn-accent batch-bg-run" onClick={runBatch} disabled={!canRun} type="button">
          <Play size={15} />
          הסר רקע ושמור PNG שקוף
        </button>

        {progress !== null && (
          <div className="batch-bg-progress" aria-live="polite">
            <div className="batch-bg-progress-head">
              <span>{progress.message}</span>
              <strong>{percent}%</strong>
            </div>
            <div className="batch-bg-track">
              <span style={{ width: `${percent}%` }} />
            </div>
            <div className="batch-bg-progress-sub">
              {progress.completed} / {progress.total}
              {progress.currentFile ? ` · ${progress.currentFile}` : ""}
            </div>
          </div>
        )}

        {error !== null && <div className="batch-bg-error">{error}</div>}

        {result !== null && (
          <div className="batch-bg-summary">
            <div className="batch-bg-summary-row ok">
              <CheckCircle2 size={15} />
              <span>הצליחו: {result.successes.length}</span>
            </div>
            <div className="batch-bg-summary-row fail">
              <XCircle size={15} />
              <span>נכשלו: {result.failures.length}</span>
            </div>
            {result.failures.length > 0 && (
              <div className="batch-bg-failures">
                {result.failures.slice(0, 6).map((item) => (
                  <div key={item.inputPath}>
                    <strong>{item.fileName}</strong>
                    <span>{item.error ?? "זיהוי האובייקט נכשל"}</span>
                  </div>
                ))}
              </div>
            )}
            {result.successes.length > 0 && (
              <button className="btn btn-ghost" onClick={() => window.spp?.openFolder(result.outputDir)} type="button">
                <FolderOpen size={15} />
                פתח תיקיית תוצאות
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
