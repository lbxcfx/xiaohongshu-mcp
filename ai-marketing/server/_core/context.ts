import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { sdk } from "./sdk";

export function hashClientId(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return Math.max(2, hash % 2_000_000_000);
}

function userFromClientHeader(header: unknown): User | null {
  const clientId = Array.isArray(header) ? header[0] : header;
  if (!clientId || typeof clientId !== "string") return null;
  const now = new Date();
  return {
    id: hashClientId(clientId),
    openId: clientId,
    xhsUserId: clientId,
    xhsNickname: "小红书用户",
    name: "小红书用户",
    avatar: null,
    email: null,
    loginMethod: "xhs",
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = userFromClientHeader(opts.req.headers["x-xhs-client-id"]);
    if (user) {
      await db.upsertUser({
        openId: user.openId,
        xhsUserId: user.xhsUserId,
        xhsNickname: user.xhsNickname,
        name: user.name,
        avatar: user.avatar,
        loginMethod: "xhs",
        lastSignedIn: new Date(),
      });
      user = (await db.getUserByOpenId(user.openId)) ?? user;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
