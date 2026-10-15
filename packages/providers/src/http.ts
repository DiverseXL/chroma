/**
 * Shared fetch hardening for provider adapters.
 *
 * Every Google/KIE request gets a hard 20-second budget via AbortController.
 * Node's built-in fetch (undici) defaults headersTimeout/bodyTimeout to
 * 300s, which let a hung Gemini request block a run for 5.5 minutes; the
 * budget turns that hang into an abort the adapters can classify and
 * recover from.
 */

/** Per-request budget: aborts if response headers have not arrived (and the body has not started) in time. */
export const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Error names that indicate a transient network fault:
 * - AbortError — our own budget firing (AbortController.abort)
 * - HeadersTimeoutError / BodyTimeoutError — undici's internal timeouts
 */
const TRANSIENT_ERROR_NAMES = new Set([
  "AbortError",
  "HeadersTimeoutError",
  "BodyTimeoutError",
]);

/**
 * Error codes that indicate a transient network fault, including undici's
 * UND_ERR_* timeout codes and the classic socket/DNS errno values.
 */
const TRANSIENT_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_CONNECT_TIMEOUT",
]);

/**
 * Walks an error and its `cause` chain looking for a transient network
 * fault. undici surfaces socket failures as `TypeError: fetch failed` with
 * the errno on `cause`, so the chain must be inspected, not just the top.
 *
 * @param error Any caught value.
 * @returns true when the error is transient and should trigger fallback.
 */
export function isTransientNetworkError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current !== null && current !== undefined; depth++) {
    if (typeof current !== "object") return false;
    const { name, code } = current as { name?: unknown; code?: unknown };
    if (typeof name === "string" && TRANSIENT_ERROR_NAMES.has(name)) {
      return true;
    }
    if (typeof code === "string" && TRANSIENT_ERROR_CODES.has(code)) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * fetch with a hard per-request budget. When the budget elapses the request
 * is aborted and fetch rejects with an AbortError, which
 * isTransientNetworkError classifies as fallback-triggering.
 *
 * @param url Absolute request URL.
 * @param init Fetch init options.
 * @param timeoutMs Budget in milliseconds (defaults to REQUEST_TIMEOUT_MS).
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
