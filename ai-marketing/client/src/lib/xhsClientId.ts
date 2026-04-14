const STORAGE_KEY = "xhs-client-id";

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

export function withXhsClientHeader(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      "x-xhs-client-id": getXhsClientId(),
    },
  };
}
