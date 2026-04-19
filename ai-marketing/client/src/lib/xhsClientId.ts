const STORAGE_KEY = "xhs-client-id";
const RED_ID_KEY = "xhs-red-id";

function fallbackId() {
  return `xhs-client-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function getXhsClientId() {
  if (typeof window === "undefined") return "xhs-client-server";

  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const next =
    typeof window.crypto?.randomUUID === "function"
      ? `xhs-client-${window.crypto.randomUUID()}`
      : fallbackId();
  window.localStorage.setItem(STORAGE_KEY, next);
  return next;
}

export function setXhsRedId(redId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RED_ID_KEY, redId);
}

export function getXhsRedId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(RED_ID_KEY);
}

export function clearXhsRedId() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(RED_ID_KEY);
}

export function withXhsClientHeader(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("x-xhs-client-id", getXhsClientId());
  const redId = getXhsRedId();
  if (redId) {
    headers.set("x-xhs-red-id", redId);
  }

  return {
    ...init,
    headers,
  };
}
