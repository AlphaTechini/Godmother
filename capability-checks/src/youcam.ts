import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";

const API_BASE = (process.env.YOUCAM_API_BASE ?? "https://yce-api-01.perfectcorp.com").replace(/\/$/, "");
const API_KEY = process.env.YOUCAM_API_KEY ?? "";

const POLL_INTERVAL_MS = Number(process.env.YOUCAM_POLL_INTERVAL_MS ?? 5000);
const POLL_TIMEOUT_MS = Number(process.env.YOUCAM_POLL_TIMEOUT_MS ?? 300000);

export class YouCamError extends Error {
  constructor(message: string, readonly body?: unknown) {
    super(message);
  }
}

function requireKey(): void {
  if (!API_KEY) throw new YouCamError("YOUCAM_API_KEY is not set. Copy .env.example to .env and fill it in.");
}

async function call(method: string, path: string, body?: unknown): Promise<any> {
  requireKey();
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new YouCamError(`${method} ${path} -> HTTP ${res.status} ${json?.error_code ?? json?.error ?? ""}`.trim(), json);
  }
  return json;
}

/** Remaining API units (not Online Editor credits). */
export async function getBalance(): Promise<{ total: number; raw: any }> {
  const raw = await call("GET", "/s2s/v1.0/client/credit");
  const results: any[] = raw?.results ?? raw?.data?.results ?? [];
  const total = results.reduce((sum, r) => sum + Number(r.amount_dec ?? r.amount ?? 0), 0);
  return { total, raw };
}

function contentTypeFor(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".heic") return "image/heic";
  return "image/jpg";
}

/** Uploads a local image through the File API and returns its file_id. */
export async function uploadFile(path: string): Promise<string> {
  const { size } = await stat(path);
  const content_type = contentTypeFor(path);
  const file_name = basename(path);
  const res = await call("POST", "/s2s/v2.0/file", { files: [{ content_type, file_name, file_size: size }] });
  const files: any[] = res?.data?.files ?? res?.files ?? [];
  const file = files[0];
  const req = file?.requests?.[0];
  if (!file?.file_id || !req?.url) throw new YouCamError("File API returned no file_id or upload URL", res);

  const bytes = await readFile(path);
  const put = await fetch(req.url, {
    method: req.method ?? "PUT",
    headers: req.headers ?? { "Content-Type": content_type, "Content-Length": String(size) },
    body: bytes,
  });
  if (!put.ok) throw new YouCamError(`Upload to signed URL failed: HTTP ${put.status}`, await put.text());
  return file.file_id as string;
}

export type TaskResult = {
  taskId: string;
  status: "success" | "error";
  resultUrl?: string;
  error?: string;
  errorMessage?: string;
  seconds: number;
  raw: any;
};

/**
 * Creates a task and polls until success or error.
 * createPath: e.g. "/s2s/v2.0/task/cloth-v3"; the status path is createPath + "/{task_id}".
 */
export async function runTask(createPath: string, body: Record<string, unknown>): Promise<TaskResult> {
  const started = Date.now();
  const created = await call("POST", createPath, body);
  const taskId: string | undefined = created?.data?.task_id;
  if (!taskId) throw new YouCamError("Task creation returned no task_id", created);

  while (Date.now() - started < POLL_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const statusRes = await call("GET", `${createPath}/${encodeURIComponent(taskId)}`);
    const data = statusRes?.data ?? {};
    if (data.task_status === "success" || data.task_status === "error") {
      const results = data.results;
      const resultUrl: string | undefined = Array.isArray(results)
        ? results[0]?.url ?? results[0]?.download_url
        : results?.url ?? results?.download_url;
      return {
        taskId,
        status: data.task_status,
        resultUrl,
        error: data.error ?? undefined,
        errorMessage: data.error_message ?? undefined,
        seconds: Math.round((Date.now() - started) / 100) / 10,
        raw: statusRes,
      };
    }
  }
  throw new YouCamError(`Task ${taskId} still running after ${POLL_TIMEOUT_MS / 1000}s`);
}

export async function listTemplates(path: string, pageSize = 20): Promise<any[]> {
  const out: any[] = [];
  let token: string | null = null;
  for (let page = 0; page < 10; page++) {
    const qs = new URLSearchParams({ page_size: String(pageSize) });
    if (token) qs.set("starting_token", token);
    const res = await call("GET", `${path}?${qs}`);
    out.push(...(res?.data?.templates ?? []));
    token = res?.data?.next_token ?? null;
    if (!token) break;
  }
  return out;
}
