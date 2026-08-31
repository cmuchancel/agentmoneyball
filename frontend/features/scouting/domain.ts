import type { Answer, ProgressEvent } from "@/lib/api";

/** One visible message in the scouting conversation. */
export type Turn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  question?: string;
  detail?: Answer;
  process?: ProgressEvent[];
};

/** A structured result that can be opened in the artifact workspace. */
export type Artifact = {
  id: string;
  turnId: string;
  title: string;
  kind: "location" | "table" | "metrics";
  detail: Answer;
};

export type ReportTemplate = { id: string; name: string; recipes: string[] };
export type ReportPageMode = "full" | "summary" | "chart" | "table";
export type ReportPageSpec = {
  id: string;
  turn: Turn;
  mode: ReportPageMode;
  rowStart?: number;
  rowLimit?: number;
};

const FIRST_TABLE_PAGE_ROWS = 8;
const CONTINUATION_TABLE_PAGE_ROWS = 18;

export const TEMPLATE_STORAGE_KEY = "pitchquery-report-templates";

export function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

export function artifactFrom(turn: Turn): Artifact | undefined {
  const detail = turn.detail;
  if (!detail) return;
  const kind = detail.location_chart
    ? "location"
    : detail.result_table?.length
      ? "table"
      : detail.metrics?.length
        ? "metrics"
        : undefined;
  if (!kind) return;
  const title = detail.location_chart?.title || detail.question_interpreted || turn.question || "Scouting analysis";
  return { id: `artifact-${turn.id}`, turnId: turn.id, title, kind, detail };
}

export function reportPages(turns: Turn[], selected: string[]): ReportPageSpec[] {
  return selected.flatMap<ReportPageSpec>(id => {
    const turn = turns.find(item => item.id === id);
    if (!turn) return [];
    const artifact = artifactFrom(turn);
    const rows = artifact?.detail.result_table ?? [];
    const hasChart = Boolean(artifact?.detail.location_chart);
    if (rows.length) {
      const firstMode: ReportPageMode = hasChart ? "summary" : "full";
      const pages: ReportPageSpec[] = [{
        id: `${turn.id}-${firstMode}`,
        turn,
        mode: firstMode,
        rowStart: 0,
        rowLimit: Math.min(rows.length, FIRST_TABLE_PAGE_ROWS),
      }];
      for (let start = FIRST_TABLE_PAGE_ROWS; start < rows.length; start += CONTINUATION_TABLE_PAGE_ROWS) {
        pages.push({
          id: `${turn.id}-table-${start}`,
          turn,
          mode: "table",
          rowStart: start,
          rowLimit: Math.min(CONTINUATION_TABLE_PAGE_ROWS, rows.length - start),
        });
      }
      if (hasChart) pages.push({ id: `${turn.id}-chart`, turn, mode: "chart" });
      return pages;
    }
    return [{ id: `${turn.id}-full`, turn, mode: "full" }];
  });
}

/** Format model-returned numeric values without leaking long floating-point tails into the UI. */
export function displayValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
  }
  return String(value ?? "—");
}
