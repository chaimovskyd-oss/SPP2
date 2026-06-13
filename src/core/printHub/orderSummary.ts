// Order summary / receipt data (Phase 8, spec §20). Pure builder — produces the structured data
// for a summary slip from a job manifest. Rendering to an image lives in orderSummaryRender.ts
// (renderer/canvas). The QR payload is a compact, scannable order identifier.

import { SIZE_LABELS } from "./sizes";
import type { PrintJobManifest } from "@/types/printHub";

export interface OrderSummaryData {
  orderId: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  note: string;
  imageCount: number;
  copies: number;
  size: string;
  sizeLabel: string;
  finish: string;
  borderMode: string;
  station: string;
}

export function buildOrderSummary(manifest: PrintJobManifest): OrderSummaryData {
  const o = manifest.requestedOutput;
  return {
    orderId: manifest.jobId,
    createdAt: manifest.createdAt,
    customerName: manifest.customer.name,
    customerPhone: manifest.customer.phone,
    note: manifest.customer.note,
    imageCount: manifest.files.length,
    copies: o.copies,
    size: o.size,
    sizeLabel: SIZE_LABELS[o.size] ?? o.size,
    finish: o.finish,
    borderMode: o.borderMode,
    station: manifest.sourceComputer
  };
}

/** Builds summary data directly from sender fields (before a manifest exists). */
export function orderSummaryFromFields(input: {
  orderId: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  note: string;
  imageCount: number;
  copies: number;
  size: string;
  finish: string;
  borderMode: string;
  station: string;
}): OrderSummaryData {
  return { ...input, sizeLabel: SIZE_LABELS[input.size] ?? input.size };
}

/** Compact scannable payload encoded into the QR on the slip. */
export function summaryQrPayload(data: OrderSummaryData): string {
  return [
    "SPP2",
    data.orderId,
    data.customerName || "-",
    data.customerPhone || "-",
    `${data.imageCount}x${data.size}`,
    data.copies > 1 ? `c${data.copies}` : ""
  ]
    .filter((part) => part !== "")
    .join("|");
}

const FINISH_LABELS: Record<string, string> = { glossy: "גלוסי", matte: "מאט" };
const BORDER_LABELS: Record<string, string> = { borderless: "ללא שוליים", white_border: "שוליים לבנים" };

/** Human-readable Hebrew lines for the slip body. */
export function summaryLines(data: OrderSummaryData): Array<{ label: string; value: string }> {
  const date = new Date(data.createdAt);
  const pad = (n: number): string => String(n).padStart(2, "0");
  const when = Number.isNaN(date.getTime())
    ? data.createdAt
    : `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const lines: Array<{ label: string; value: string }> = [
    { label: "מספר הזמנה", value: data.orderId },
    { label: "תאריך", value: when }
  ];
  if (data.customerName) lines.push({ label: "לקוח", value: data.customerName });
  if (data.customerPhone) lines.push({ label: "טלפון", value: data.customerPhone });
  lines.push({ label: "כמות", value: `${data.imageCount} תמונות${data.copies > 1 ? ` × ${data.copies}` : ""}` });
  lines.push({ label: "גודל", value: data.sizeLabel });
  lines.push({ label: "גימור", value: `${FINISH_LABELS[data.finish] ?? data.finish} · ${BORDER_LABELS[data.borderMode] ?? data.borderMode}` });
  if (data.note) lines.push({ label: "הערה", value: data.note });
  return lines;
}
