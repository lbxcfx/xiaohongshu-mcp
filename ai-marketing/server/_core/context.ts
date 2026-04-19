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

function headerValue(header: unknown) {
  return Array.isArray(header) ? header[0] : header;
}

export function isRealXhsUserId(value?: string | null): value is string {
  return Boolean(value && !value.startsWith("xhs-client-"));
}

export function isRedIdBoundUser(
  user?: User | null
): user is User & { xhsUserId: string } {
  return Boolean(user && isRealXhsUserId(user.xhsUserId));
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
    if (!isRedIdBoundUser(user)) {
      user = null;
    }
  } catch (error) {
    const redId =
      headerValue(opts.req.headers["x-xhs-red-id"]) ??
      headerValue(opts.req.headers["x-xhs-client-id"]);
    if (typeof redId === "string" && isRealXhsUserId(redId)) {
      user = (await db.getUserByXhsUserId(redId)) ?? null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
