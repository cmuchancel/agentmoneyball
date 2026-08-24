export type Profile = { dataset_id: string; file_name: string; rows: number; columns: number;
  pitchers?: number; batters?: number; date_coverage?: string; warnings: string[] };
export type Answer = { status: string; answer: string; filters: string[]; metric_definitions: string[];
  result_table?: Record<string, unknown>[]; warnings: string[]; executed_code: string[];
  execution_evidence: string[] };

const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function checked(response: Response) {
  if (response.ok) return response.json();
  const body = await response.json().catch(() => ({}));
  throw new Error(body.detail ?? "Request failed");
}

export async function upload(file?: File) {
  const body = new FormData();
  if (file) body.append("file", file); else body.append("use_demo", "true");
  return checked(await fetch(`${base}/api/datasets`, { method: "POST", body })) as Promise<{dataset_id: string; profile: Profile}>;
}

export async function chat(thread_id: string, dataset_id: string, message: string) {
  return checked(await fetch(`${base}/api/chat`, { method: "POST", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({thread_id, dataset_id, message}) })) as Promise<Answer>;
}

