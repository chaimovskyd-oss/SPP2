import type { BatchTextVariableField } from "@/types/batchProduction";

export interface ParsedTextImportRow {
  fields: Record<string, string>;
  sourceLabel?: string;
}

function normalizeKey(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, "");
}

export function getTextFieldRecordKey(
  field: BatchTextVariableField,
  textFields: BatchTextVariableField[],
): string {
  const duplicateId = textFields.filter((item) => item.id === field.id).length > 1;
  return duplicateId ? field.layerId : field.id;
}

function getFieldKeys(textFields: BatchTextVariableField[]): string[] {
  return textFields.length > 0 ? textFields.map((field) => getTextFieldRecordKey(field, textFields)) : ["name"];
}

function getPrimaryTextFieldId(textFields: BatchTextVariableField[]): string {
  const primary =
    textFields.find((field) => field.sourceField === "name" || field.id === "name") ??
    textFields[0];
  return primary !== undefined ? getTextFieldRecordKey(primary, textFields) : "name";
}

function emptyFields(textFields: BatchTextVariableField[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const id of getFieldKeys(textFields)) fields[id] = "";
  return fields;
}

function tokensForField(field: BatchTextVariableField): string[] {
  return [field.id, field.label, field.sourceField].filter((value) => value.trim().length > 0);
}

function buildHeaderMap(header: string[], textFields: BatchTextVariableField[]): Map<number, string> {
  const fieldByToken = new Map<string, string>();
  for (const field of textFields) {
    const recordKey = getTextFieldRecordKey(field, textFields);
    for (const token of tokensForField(field)) {
      fieldByToken.set(normalizeKey(token), recordKey);
    }
  }

  const map = new Map<number, string>();
  header.forEach((cell, index) => {
    const fieldId = fieldByToken.get(normalizeKey(cell));
    if (fieldId !== undefined) map.set(index, fieldId);
  });
  return map;
}

function pickDelimiter(content: string): "," | "\t" {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  return firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";
}

export function parseCsvRows(content: string, delimiter: "," | "\t" = pickDelimiter(content)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.replace(/\r$/, ""));
  rows.push(row);
  return rows.filter((cells) => cells.some((value) => value.trim().length > 0));
}

export function parseTxtImport(content: string, textFields: BatchTextVariableField[]): ParsedTextImportRow[] {
  const primaryId = getPrimaryTextFieldId(textFields);
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line): ParsedTextImportRow => ({
      fields: { ...emptyFields(textFields), [primaryId]: line },
      sourceLabel: line,
    }));
}

export function parseCsvImport(content: string, textFields: BatchTextVariableField[]): ParsedTextImportRow[] {
  const rows = parseCsvRows(content);
  if (rows.length === 0) return [];

  const fieldIds = getFieldKeys(textFields);
  const headerMap = textFields.length > 0 ? buildHeaderMap(rows[0], textFields) : new Map<number, string>();
  const hasHeader = headerMap.size > 0;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const orderMap = new Map<number, string>();
  fieldIds.forEach((fieldId, index) => orderMap.set(index, fieldId));
  const columnMap = hasHeader ? headerMap : orderMap;

  return dataRows.map((cells, rowIndex): ParsedTextImportRow => {
    const fields = emptyFields(textFields);
    for (const [columnIndex, fieldId] of columnMap.entries()) {
      if (!fieldIds.includes(fieldId)) continue;
      fields[fieldId] = cells[columnIndex]?.trim() ?? "";
    }
    return {
      fields,
      sourceLabel: cells[0]?.trim() || `row-${rowIndex + 1}`,
    };
  });
}

export function parseTextImportContent(
  content: string,
  fileName: string,
  textFields: BatchTextVariableField[],
): ParsedTextImportRow[] {
  return /\.csv$/i.test(fileName)
    ? parseCsvImport(content, textFields)
    : parseTxtImport(content, textFields);
}
