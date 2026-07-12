import { CMP_API_URL, localeHeader } from "@/constants/Config";
import { getStoredToken, setStoredToken } from "@/lib/storage";

export { getStoredToken, setStoredToken };

export type ApiError = { message: string; status: number };

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null; locale?: string } = {}
): Promise<ApiResult<T>> {
  const { token: tokenOverride, locale, ...init } = options;
  const token = tokenOverride === undefined ? await getStoredToken() : tokenOverride;
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (locale) headers.set("x-cmp-locale", localeHeader(locale));

  const url = path.startsWith("http") ? path : `${CMP_API_URL}${path}`;

  try {
    const controller = new AbortController();
    const timeoutMs = 20_000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { ...init, headers, signal: controller.signal });
    clearTimeout(timeout);
    const text = await res.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }
    if (!res.ok) {
      const message =
        typeof payload === "object" && payload && "message" in payload
          ? String((payload as { message: unknown }).message)
          : `Request failed (${res.status})`;
      return { ok: false, error: { message, status: res.status } };
    }
    return { ok: true, data: payload as T };
  } catch (err) {
    return {
      ok: false,
      error: { message: (err as Error).message || "Network error", status: 0 },
    };
  }
}
