import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactElement } from "react";

import type { PreflightReport, PreflightSeverity } from "@/types/advancedPrint";

interface PreflightSummaryProps {
  report: PreflightReport;
  /** Plain-language summary of what will print (page size · print size · orientation · scaling · color). */
  summaryLines: string[];
}

const ICONS: Record<PreflightSeverity, ReactElement> = {
  info: <Info size={15} className="ape-warn-icon ape-warn-info" />,
  warning: <AlertTriangle size={15} className="ape-warn-icon ape-warn-warning" />,
  blocker: <XCircle size={15} className="ape-warn-icon ape-warn-blocker" />
};

/** Compact preflight panel: the human "this is what will happen" summary plus any warnings. */
export function PreflightSummary({ report, summaryLines }: PreflightSummaryProps): ReactElement {
  return (
    <div className="ape-preflight">
      <div className="ape-summary">
        {summaryLines.map((line, i) => (
          <div key={i} className="ape-summary-line">{line}</div>
        ))}
      </div>

      {report.clean ? (
        <div className="ape-warn ape-warn-ok">
          <CheckCircle2 size={15} className="ape-warn-icon ape-warn-info" />
          <span>אין אזהרות — מוכן להדפסה.</span>
        </div>
      ) : (
        <ul className="ape-warn-list">
          {report.warnings.map((w, i) => (
            <li key={i} className={`ape-warn ape-warn-row-${w.severity}`}>
              {ICONS[w.severity]}
              <div className="ape-warn-text">
                <div className="ape-warn-message">{w.message}</div>
                {w.hint && <div className="ape-warn-hint">{w.hint}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
