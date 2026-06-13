import { ArrowLeft, Cloud, Download, FileUp, Loader2, LogOut, RefreshCw, Trash2, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactElement } from "react";
import { captureCloudSessionFromCallbackUrl, captureCloudSessionFromConfirmUrl, captureCloudSessionFromHash, clearCloudSession, getCloudSession, requestCloudMagicLink, verifyCloudEmailOtp, type CloudSession } from "@/services/cloud/cloudAuth";
import { getCloudConfig } from "@/services/cloud/cloudConfig";
import { deleteCloudProject, downloadCloudProjectFile, getCloudStorageQuotaBytes, listCloudProjects, uploadCloudProjectFile, type CloudProject } from "@/services/cloud/cloudProjects";
import "./cloudLibrary.css";

interface CloudLibraryScreenProps {
  onBack: () => void;
  onOpenProjectFile: (file: File) => void;
}

type BusyState = "idle" | "auth" | "list" | "upload" | "download" | "delete";

export function CloudLibraryScreen({ onBack, onOpenProjectFile }: CloudLibraryScreenProps): ReactElement {
  const config = useMemo(() => getCloudConfig(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<CloudSession | null>(() => getCloudSession());
  const [projects, setProjects] = useState<CloudProject[]>([]);
  const [usedStorageBytes, setUsedStorageBytes] = useState(0);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("");
  const [busy, setBusy] = useState<BusyState>("idle");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const captured = captureCloudSessionFromHash();
    if (captured !== null) {
      setSession(captured);
      setStatus("הכניסה לענן הושלמה.");
      window.history.replaceState(null, "", `${window.location.pathname}#/cloud`);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function captureConfirmSession(): Promise<void> {
      try {
        const captured = await captureCloudSessionFromConfirmUrl();
        if (!active || captured === null) return;
        setSession(captured);
        setStatus("הכניסה לענן הושלמה.");
        window.history.replaceState(null, "", `${window.location.origin}${window.location.pathname.replace(/\/auth\/confirm$/, "/")}#/cloud`);
      } catch (error) {
        if (active) setStatus(formatCloudError(error));
      }
    }
    void captureConfirmSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (session === null || !config.configured) return;
    void refreshProjects();
  }, [session, config.configured]);

  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return projects;
    return projects.filter((project) =>
      [project.name, project.fileName, project.deviceName].some((value) => (value ?? "").toLowerCase().includes(normalized))
    );
  }, [projects, query]);

  async function refreshProjects(): Promise<void> {
    setBusy("list");
    setStatus("מרענן את ספריית הענן...");
    try {
      const nextProjects = await listCloudProjects();
      setProjects(nextProjects);
      setUsedStorageBytes(nextProjects.reduce((total, project) => total + project.sizeBytes, 0));
      setStatus("");
    } catch (error) {
      setStatus(formatCloudError(error));
    } finally {
      setBusy("idle");
    }
  }

  async function handleSendMagicLink(): Promise<void> {
    if (!email.trim()) return;
    setBusy("auth");
    setStatus("שולח קישור/קוד כניסה...");
    try {
      await requestCloudMagicLink(email.trim());
      setStatus("נשלח קישור כניסה. אם קיבלת קוד במייל, אפשר להזין אותו כאן.");
    } catch (error) {
      setStatus(formatCloudError(error));
    } finally {
      setBusy("idle");
    }
  }

  async function handleVerifyOtp(): Promise<void> {
    if (!email.trim() || !otp.trim()) return;
    setBusy("auth");
    setStatus("מאמת את הקוד...");
    try {
      const next = await verifyCloudEmailOtp(email.trim(), otp.trim());
      setSession(next);
      setOtp("");
      setStatus("מחובר לענן.");
    } catch (error) {
      setStatus(formatCloudError(error));
    } finally {
      setBusy("idle");
    }
  }

  function handleUseCallbackUrl(): void {
    if (!callbackUrl.trim()) return;
    try {
      const next = captureCloudSessionFromCallbackUrl(callbackUrl);
      setSession(next);
      setCallbackUrl("");
      setStatus("הכניסה לענן הושלמה.");
      window.history.replaceState(null, "", `${window.location.pathname}#/cloud`);
    } catch (error) {
      setStatus(formatCloudError(error));
    }
  }

  async function handleUploadFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) return;
    setBusy("upload");
    setStatus("מעלה פרויקט לענן...");
    try {
      const uploaded = await uploadCloudProjectFile(file);
      setProjects((items) => [uploaded, ...items.filter((item) => item.id !== uploaded.id)]);
      setUsedStorageBytes((value) => value + uploaded.sizeBytes);
      setStatus("הפרויקט עלה לענן.");
    } catch (error) {
      setStatus(formatCloudError(error));
    } finally {
      setBusy("idle");
    }
  }

  async function handleOpenProject(project: CloudProject): Promise<void> {
    setBusy("download");
    setStatus("מוריד פרויקט מהענן...");
    try {
      const file = await downloadCloudProjectFile(project);
      onOpenProjectFile(file);
    } catch (error) {
      setStatus(formatCloudError(error));
      setBusy("idle");
    }
  }

  async function handleDeleteProject(project: CloudProject): Promise<void> {
    const confirmed = window.confirm(`למחוק את "${project.name}" מהענן?`);
    if (!confirmed) return;
    setBusy("delete");
    setStatus("מוחק פרויקט...");
    try {
      await deleteCloudProject(project.id);
      setProjects((items) => items.filter((item) => item.id !== project.id));
      setUsedStorageBytes((value) => Math.max(0, value - project.sizeBytes));
      setStatus("הפרויקט נמחק מהענן.");
    } catch (error) {
      setStatus(formatCloudError(error));
    } finally {
      setBusy("idle");
    }
  }

  function handleSignOut(): void {
    clearCloudSession();
    setSession(null);
    setProjects([]);
    setUsedStorageBytes(0);
    setStatus("התנתקת מהענן.");
  }

  const storageQuotaBytes = getCloudStorageQuotaBytes();
  const storagePercent = Math.min(100, Math.round((usedStorageBytes / storageQuotaBytes) * 100));
  const remainingStorageBytes = Math.max(0, storageQuotaBytes - usedStorageBytes);

  return (
    <main className="cloud-shell">
      <header className="cloud-topbar">
        <button className="btn btn-ghost" onClick={onBack} type="button">
          <ArrowLeft size={15} />
          חזרה
        </button>
        <div className="cloud-title">
          <Cloud size={20} />
          <span>הענן שלי</span>
        </div>
        <div className="cloud-account">
          {session !== null ? (
            <>
              <span><UserRound size={14} /> {session.email ?? "מחובר"}</span>
              <button className="btn btn-ghost" onClick={handleSignOut} type="button">
                <LogOut size={14} />
                התנתק
              </button>
            </>
          ) : null}
        </div>
      </header>

      {!config.configured ? (
        <section className="cloud-empty-state">
          <Cloud size={34} />
          <strong>הענן עדיין לא מוגדר</strong>
          <p>כדי לבדוק בחנות צריך להגדיר בקובץ הסביבה את VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY ו-VITE_SPP2_CLOUD_API_URL.</p>
        </section>
      ) : session === null ? (
        <section className="cloud-auth-card">
          <h1>כניסה לענן</h1>
          <p>נשלח קישור כניסה או קוד חד-פעמי למייל. אין צורך בסיסמה בשלב הבדיקה.</p>
          <label>
            אימייל
            <input dir="ltr" onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" type="email" value={email} />
          </label>
          <div className="cloud-auth-actions">
            <button className="btn btn-accent" disabled={busy !== "idle"} onClick={() => void handleSendMagicLink()} type="button">
              {busy === "auth" ? <Loader2 className="spin" size={14} /> : null}
              שלח קישור / קוד
            </button>
          </div>
          <label>
            קוד מהמייל
            <input dir="ltr" inputMode="numeric" onChange={(event) => setOtp(event.target.value)} placeholder="123456" type="text" value={otp} />
          </label>
          <button className="btn btn-ghost" disabled={busy !== "idle"} onClick={() => void handleVerifyOtp()} type="button">
            אמת קוד
          </button>
          <div className="cloud-auth-divider" />
          <label>
            הדבק קישור מהמייל
            <input dir="ltr" onChange={(event) => setCallbackUrl(event.target.value)} placeholder="http://localhost:3000/#access_token=..." type="url" value={callbackUrl} />
          </label>
          <button className="btn btn-ghost" disabled={busy !== "idle" || !callbackUrl.trim()} onClick={handleUseCallbackUrl} type="button">
            התחבר מהקישור
          </button>
          {status ? <p className="cloud-status">{status}</p> : null}
        </section>
      ) : (
        <section className="cloud-library">
          <div className="cloud-library-toolbar">
            <div>
              <strong>פרויקטים</strong>
              <span>{projects.length} פרויקטים בענן</span>
            </div>
            <label className="project-search cloud-search">
              <input onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש פרויקט בענן..." type="search" value={query} />
            </label>
            <button className="btn btn-ghost" disabled={busy !== "idle"} onClick={() => void refreshProjects()} type="button">
              <RefreshCw size={14} />
              רענן
            </button>
            <button className="btn btn-accent" disabled={busy !== "idle"} onClick={() => fileInputRef.current?.click()} type="button">
              <FileUp size={14} />
              העלה פרויקט
            </button>
            <input ref={fileInputRef} accept=".spp,.spp2,.json,.spp.json" hidden onChange={(event) => void handleUploadFileChange(event)} type="file" />
          </div>

          <div className="cloud-storage-meter" aria-label="שימוש באחסון ענן">
            <div>
              <strong>אחסון</strong>
              <span>{formatBytes(usedStorageBytes)} בשימוש · {formatBytes(remainingStorageBytes)} פנוי מתוך {formatBytes(storageQuotaBytes)}</span>
            </div>
            <div className="cloud-storage-track">
              <span style={{ width: `${storagePercent}%` }} />
            </div>
            <b>{storagePercent}%</b>
          </div>

          {status ? <div className="cloud-status-line">{status}</div> : null}

          <div className="cloud-tabs" role="tablist" aria-label="ספריית ענן">
            <button className="active" type="button">פרויקטים</button>
            <button disabled type="button">תבניות</button>
            <button disabled type="button">נכסים</button>
            <button disabled type="button">ייצואים</button>
          </div>

          <div className="cloud-project-list">
            {busy === "list" ? (
              <div className="cloud-empty-state compact">
                <Loader2 className="spin" size={24} />
                <strong>טוען פרויקטים...</strong>
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="cloud-empty-state compact">
                <Cloud size={28} />
                <strong>אין עדיין פרויקטים בענן</strong>
                <p>אפשר להעלות קובץ פרויקט ראשון ולבדוק פתיחה מחדש מהענן.</p>
              </div>
            ) : (
              filteredProjects.map((project) => (
                <article className="cloud-project-row" key={project.id}>
                  <div className="cloud-project-thumb">
                    {project.thumbnailUrl ? <img alt="" src={project.thumbnailUrl} /> : <Cloud size={20} />}
                  </div>
                  <div className="cloud-project-copy">
                    <strong>{project.name}</strong>
                    <span>{project.fileName} · {formatBytes(project.sizeBytes)} · {formatDate(project.updatedAt)}</span>
                    {project.deviceName ? <span>נשמר מ: {project.deviceName}</span> : null}
                  </div>
                  <div className="cloud-project-actions">
                    <button className="btn btn-accent" disabled={busy !== "idle"} onClick={() => void handleOpenProject(project)} type="button">
                      <Download size={14} />
                      פתח
                    </button>
                    <button className="btn btn-ghost" disabled={busy !== "idle"} onClick={() => void handleDeleteProject(project)} type="button">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      )}
    </main>
  );
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatCloudError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "CLOUD_NOT_CONFIGURED") return "הענן לא מוגדר עדיין.";
  if (message === "CLOUD_NOT_SIGNED_IN") return "צריך להתחבר לענן מחדש.";
  if (message.includes("401")) return "החיבור פג או שהמשתמש לא מורשה.";
  if (message.includes("413")) return "הקובץ גדול מדי לשלב הבדיקה.";
  return message;
}
