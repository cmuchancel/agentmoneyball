export type Profile = { dataset_id: string; file_name: string; rows: number; columns: number; games: number; source_files: string[];
  pitchers?: number; batters?: number; pitcher_names: string[]; batter_names: string[];
  pitcher_teams: Record<string, string[]>; batter_teams: Record<string, string[]>; pitcher_aliases: Record<string, string>;
  batter_aliases: Record<string, string>; date_coverage?: string; warnings: string[] };
export type Answer = { status: string; answer: string; filters: string[]; metric_definitions: string[];
  method: string; sample_size?: number | null; chart_file?: string; location_chart?: LocationChart | null;
  coverage: string; warnings: string[]; executed_code: string[];
  execution_evidence: string[]; daily_usage?: {date: string; tokens: number; limit: number; remaining: number} };
export type ProgressEvent = { stage: string; detail?: string; attempt?: number; status?: "active" | "complete" | "revise" | "stopped" };
export type LocationChart = { title: string;
  encodings: {feature: string; channel: "color" | "shape"; label: string}[];
  points: {plate_x: number; plate_z: number; features: {name: string; value: string}[]; label: string}[] };

const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function checked(response: Response) {
  if (response.ok) return response.json();
  const body = await response.json().catch(() => ({}));
  throw new Error(body.detail ?? "Request failed");
}

export async function upload(files?: File[]) {
  const body = new FormData();
  if (files?.length) files.forEach(file => body.append("files", file)); else body.append("use_demo", "true");
  return checked(await fetch(`${base}/api/datasets`, { method: "POST", body })) as Promise<{dataset_id: string; profile: Profile}>;
}

export async function chat(thread_id: string, dataset_id: string, message: string, onProgress: (event: ProgressEvent) => void) {
  const response = await fetch(`${base}/api/chat`, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({thread_id, dataset_id, message}) });
  if (!response.ok || !response.body) return checked(response) as Promise<Answer>;
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let answer: Answer | undefined;
  while (true) {
    const { value, done } = await reader.read(); buffer += decoder.decode(value ?? new Uint8Array(), {stream: !done});
    const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
    for (const line of lines) if (line) { const event = JSON.parse(line); if (event.type === "progress") onProgress(event); else answer = event.data; }
    if (done) break;
  }
  if (!answer) throw new Error("Analysis ended without a result.");
  return answer;
}
