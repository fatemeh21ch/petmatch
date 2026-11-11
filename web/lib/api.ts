// Same-origin calls (/api/* is proxied to FastAPI by next.config.mjs) so the session cookie just works.
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = any>(path: string, opts: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = opts;
  const res = await fetch(path, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers || {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: "same-origin",
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") msg = body.detail;
      else if (Array.isArray(body.detail)) msg = "ورودی نامعتبر است";
    } catch { /* not json */ }
    throw new ApiError(res.status, msg);
  }
  return res.json();
}

/** Server components call FastAPI directly (no browser, no proxy). */
export async function serverApi<T = any>(path: string): Promise<T | null> {
  const base = process.env.BACKEND_URL || "http://127.0.0.1:8000";
  try {
    const res = await fetch(base + path, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
