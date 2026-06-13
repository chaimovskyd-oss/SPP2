import { useEffect, useState, type ReactElement } from "react";

import { buildAndSubmitJob, type JobSourceImage } from "@/core/printHub/jobBuilder";
import { generateJobId } from "@/core/printHub/jobPackage";
import { orderSummaryFromFields } from "@/core/printHub/orderSummary";
import { renderOrderSummaryImage } from "@/core/printHub/orderSummaryRender";
import { buildClientPreset } from "@/core/printHub/sizes";
import { lanConfigFromSettings, type LanUploadProgress } from "@/services/lan/lanQueueClient";
import { useAppSettings } from "@/settings/store";
import { SendToPrintHubDialog, type SendToPrintHubOptions } from "./SendToPrintHubDialog";

function extToMime(name: string): string {
  return name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
}

/** Top-level listener for the Explorer "Send to SPP Print Hub" quick-print flow (Phase 9, spec §22).
 *  Loads the selected files and opens the send dialog without opening a design project. */
export function QuickPrintListener(): ReactElement | null {
  const [sources, setSources] = useState<JobSourceImage[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lanProgress, setLanProgress] = useState<LanUploadProgress | null>(null);

  useEffect(() => {
    const api = window.spp?.printHub;
    if (api?.onQuickPrintFiles === undefined) return;
    return api.onQuickPrintFiles(async (files) => {
      const loaded: JobSourceImage[] = [];
      for (const filePath of files) {
        const base64 = await window.spp?.readFileBase64?.(filePath);
        if (!base64) continue;
        const name = filePath.replace(/\\/g, "/").split("/").pop() ?? "image.jpg";
        loaded.push({ sourceUrl: `data:${extToMime(name)};base64,${base64}`, fileName: name });
      }
      if (loaded.length === 0) {
        setToast("לא נטענו תמונות מהבחירה");
        return;
      }
      setSources(loaded);
      setOpen(true);
    });
  }, []);

  async function handleConfirm(opts: SendToPrintHubOptions): Promise<void> {
    const printHubCfg = useAppSettings.getState().settings.printHub;
    const lanCfg = lanConfigFromSettings(printHubCfg);
    const hubRoot = printHubCfg.serverHubRoot || printHubCfg.networkFolderPath;
    if (!lanCfg && !hubRoot) {
      setToast('הגדר תחילה תיקיית תור או חיבור LAN בכלי "מרכז הדפסות"');
      return;
    }
    setBusy(true);
    setLanProgress(null);
    try {
      const stationInfo = await window.spp?.printHub?.stationInfo?.();
      const station = stationInfo?.computerName ?? "SPP2";
      const jobId = generateJobId();
      const jobSources = [...sources];

      if (opts.includeSummary) {
        const summary = orderSummaryFromFields({
          orderId: jobId, createdAt: new Date().toISOString(), customerName: opts.customerName,
          customerPhone: opts.customerPhone, note: opts.note, imageCount: jobSources.length,
          copies: opts.copies, size: opts.size, finish: opts.finish, borderMode: opts.borderMode, station
        });
        const slip = await renderOrderSummaryImage(summary, opts.size);
        jobSources.push({ sourceUrl: slip, fileName: "summary.jpg" });
      }

      const result = await buildAndSubmitJob({
        hubRoot,
        lan: lanCfg ?? undefined,
        onLanProgress: setLanProgress,
        sources: jobSources,
        preset: buildClientPreset(opts.size, opts.finish, opts.borderMode),
        size: opts.size,
        source: "windows_explorer_quick_print",
        sourceComputer: station,
        jobId,
        copies: opts.copies,
        approvalMode: opts.approvalMode,
        testPrintFirstOnly: opts.testPrintFirstOnly,
        customer: { name: opts.customerName, phone: opts.customerPhone, note: opts.note }
      });
      if (!result.success) {
        setToast(result.error ?? "שגיאה בשליחה");
        return;
      }
      setOpen(false);
      setSources([]);
      setToast(result.destination === "outbox"
        ? "השרת לא זמין — העבודה נשמרה מקומית ותישלח כשהחיבור יחזור"
        : `העבודה נשלחה לתור (${result.jobId})`);
    } catch (err) {
      setToast(`שגיאה: ${err instanceof Error ? err.message : "לא ידוע"}`);
    } finally {
      setBusy(false);
      setLanProgress(null);
    }
  }

  useEffect(() => {
    if (toast === null) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  function hubConfiguredFromSettings(): boolean {
    const p = useAppSettings.getState().settings.printHub;
    return Boolean(lanConfigFromSettings(p)) || (p.serverHubRoot || p.networkFolderPath).length > 0;
  }

  return (
    <>
      {open && (
        <SendToPrintHubDialog
          defaultApprovalMode={useAppSettings.getState().settings.printHub.defaultApprovalMode}
          pageCount={sources.length}
          busy={busy}
          hubConfigured={hubConfiguredFromSettings()}
          uploadProgress={lanProgress}
          onCancel={() => { if (!busy) { setOpen(false); setSources([]); } }}
          onConfirm={(opts) => { void handleConfirm(opts); }}
        />
      )}
      {toast && <div className="print-hub-toast" dir="rtl">{toast}</div>}
    </>
  );
}
