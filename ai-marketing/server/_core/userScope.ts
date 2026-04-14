import { AsyncLocalStorage } from "node:async_hooks";

const FALLBACK_USER_ID = 1;
const userIdStorage = new AsyncLocalStorage<number>();

export function runWithUserId<T>(
  userId: number | null | undefined,
  fn: () => T
) {
  return userIdStorage.run(userId ?? FALLBACK_USER_ID, fn);
}

export function getActiveUserId() {
  return userIdStorage.getStore() ?? FALLBACK_USER_ID;
}
