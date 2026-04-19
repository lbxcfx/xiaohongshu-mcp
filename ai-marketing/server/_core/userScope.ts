import { AsyncLocalStorage } from "node:async_hooks";

const userIdStorage = new AsyncLocalStorage<number>();

export function runWithUserId<T>(
  userId: number | null | undefined,
  fn: () => T
) {
  if (typeof userId !== "number") {
    return fn();
  }
  return userIdStorage.run(userId, fn);
}

export function getActiveUserId() {
  const userId = userIdStorage.getStore();
  if (typeof userId !== "number") {
    throw new Error("当前请求未绑定小红书 redID 用户");
  }
  return userId;
}
