import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "node:path";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import multer from "multer";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter, ensureTopicHubVideoPipelineStarted } from "../routers";
import { createContext, hashClientId, isRealXhsUserId } from "./context";
import {
  getUserByOpenId,
  getUserByXhsUserId,
  getXhsAccounts,
  migrateUserData,
  upsertUser,
  upsertXhsAccount,
} from "../db";
import { serveStatic, setupVite } from "./vite";
import {
  deleteXhsCookies,
  getXhsMyProfile,
  getXhsLoginQrcode,
  getXhsLoginStatus,
  type XhsLoginStatus,
  sendXhsPhoneLoginCode,
  startXhsLoginSession,
  startXhsPhoneLogin,
  verifyXhsPhoneLoginCode,
} from "./xhsApi";

function headerValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

function accountRuntimePaths(accountKey: string) {
  return {
    cookiesPath: `.data/xhs-accounts/${accountKey}/cookies.json`,
    loginStatePath: `.data/xhs-accounts/${accountKey}/login_state.json`,
    browserUserDataDir: `.data/xhs-accounts/${accountKey}/browser`,
  };
}

type DefaultAccount = {
  userId: number;
  openId: string;
  accountKey: string;
  redId?: string;
};

const loginIdentitySyncing = new Set<string>();
const loginIdentitySyncedAt = new Map<string, number>();
const PROFILE_SYNC_TIMEOUT_MS = 30_000;
// clientId → redId，登录成功后写入，供 status 端点读取并返回给前端
const redIdByClientId = new Map<string, string>();

// 根据 redId 生成稳定的 accountKey（redId 全局唯一且不可重复）
function redIdAccountKey(redId: string) {
  return `xhs-${redId}`;
}

function runtimeRoot() {
  return path.basename(process.cwd()) === "ai-marketing"
    ? path.dirname(process.cwd())
    : process.cwd();
}

function resolveRuntimePath(relativePath: string) {
  return path.resolve(runtimeRoot(), relativePath);
}

function isDefaultXhsUsername(value?: string | null) {
  const text = value?.trim();
  return !text || text === "小红书用户";
}

async function findKnownNickname(userId: number, redId?: string | null) {
  const accounts = await getXhsAccounts(userId);
  return (
    accounts.find(
      account =>
        account.xhsUserId === redId && !isDefaultXhsUsername(account.nickname)
    )?.nickname ??
    accounts.find(account => !isDefaultXhsUsername(account.nickname))
      ?.nickname ??
    null
  );
}

async function withLocalXhsNickname(
  account: DefaultAccount | null,
  status: XhsLoginStatus
) {
  if (!account || !status.is_logged_in || !isDefaultXhsUsername(status.username)) {
    return status;
  }
  const nickname = await findKnownNickname(account.userId, account.redId);
  return nickname ? { ...status, username: nickname } : status;
}

function copyAccountRuntimeFiles(
  fromAccountKey: string,
  toAccountKey: string,
  options: { overwrite?: boolean } = {}
) {
  const sourcePaths = accountRuntimePaths(fromAccountKey);
  const targetPaths = accountRuntimePaths(toAccountKey);

  try {
    const sourceCookiesPath = resolveRuntimePath(sourcePaths.cookiesPath);
    const targetCookiesPath = resolveRuntimePath(targetPaths.cookiesPath);
    const sourceLoginStatePath = resolveRuntimePath(sourcePaths.loginStatePath);
    const targetLoginStatePath = resolveRuntimePath(targetPaths.loginStatePath);

    mkdirSync(path.dirname(targetCookiesPath), { recursive: true });
    if (
      existsSync(sourceCookiesPath) &&
      (options.overwrite || !existsSync(targetCookiesPath))
    ) {
      copyFileSync(sourceCookiesPath, targetCookiesPath);
    }
    if (
      existsSync(sourceLoginStatePath) &&
      (options.overwrite || !existsSync(targetLoginStatePath))
    ) {
      mkdirSync(path.dirname(targetLoginStatePath), { recursive: true });
      copyFileSync(sourceLoginStatePath, targetLoginStatePath);
    }
  } catch (copyError) {
    console.warn("[XHS] copy account runtime files failed", copyError);
  }
}

async function getDefaultAccountKey(
  req: express.Request
): Promise<DefaultAccount | null> {
  const clientId = headerValue(req.headers["x-xhs-client-id"]);
  if (!clientId || typeof clientId !== "string") return null;

  const redIdHeader = headerValue(req.headers["x-xhs-red-id"]);
  const redId =
    typeof redIdHeader === "string" && isRealXhsUserId(redIdHeader)
      ? redIdHeader
      : isRealXhsUserId(clientId)
        ? clientId
        : null;

  const existingByOpenId = await getUserByOpenId(clientId);
  const existingByXhsUserId = redId ? await getUserByXhsUserId(redId) : null;
  let user = existingByXhsUserId ?? existingByOpenId;
  if (!user) {
    await upsertUser({
      openId: clientId,
      xhsUserId: null,
      xhsNickname: "小红书用户",
      name: "小红书用户",
      loginMethod: "xhs",
      lastSignedIn: new Date(),
    });
    user = await getUserByOpenId(clientId);
  }

  const userId = user?.id ?? hashClientId(clientId);
  const openId = user?.openId ?? clientId;

  // 如果已经获得真实的 redId，直接使用 redId-based accountKey
  const realRedId =
    user && isRealXhsUserId(user.xhsUserId) ? user.xhsUserId : null;
  if (realRedId) {
    const accountKey = redIdAccountKey(realRedId);
    const nickname = await findKnownNickname(userId, realRedId);
    copyAccountRuntimeFiles(`u${userId}-default`, accountKey);
    await upsertXhsAccount(userId, {
      accountKey,
      xhsUserId: realRedId,
      nickname,
      status: "logged_in",
      ...accountRuntimePaths(accountKey),
    });
    return { userId, openId, accountKey, redId: realRedId };
  }

  // 尚未登录，使用临时 default accountKey
  const accountKey = `u${userId}-default`;
  await upsertXhsAccount(userId, {
    accountKey,
    status: "unknown",
    ...accountRuntimePaths(accountKey),
  });
  return { userId, openId, accountKey };
}

async function syncLoginIdentity(
  account: DefaultAccount | null,
  status: XhsLoginStatus
) {
  if (!account || !status.is_logged_in) return;
  if (loginIdentitySyncing.has(account.accountKey)) return;
  const lastSyncedAt = loginIdentitySyncedAt.get(account.accountKey) ?? 0;
  if (Date.now() - lastSyncedAt < 5 * 60 * 1000) return;

  loginIdentitySyncing.add(account.accountKey);
  loginIdentitySyncedAt.set(account.accountKey, Date.now());

  let nickname = status.username || "小红书用户";
  let xhsUserId: string | null = status.redId ?? account.redId ?? null;

  try {
    const needsProfile =
      !isRealXhsUserId(xhsUserId) || isDefaultXhsUsername(nickname);
    if (needsProfile) {
      // 带超时的 profile 拉取，避免阻塞 status 端点过长
      const profilePromise = getXhsMyProfile(account.accountKey);
      const profile = await Promise.race([
        profilePromise,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("getXhsMyProfile timeout")),
            PROFILE_SYNC_TIMEOUT_MS
          )
        ),
      ]);
      nickname = profile.userBasicInfo?.nickname || nickname;
      xhsUserId = profile.userBasicInfo?.redId || xhsUserId;
    }
  } catch (error) {
    console.warn("[XHS] sync profile failed", error);
  } finally {
    let targetUserId = account.userId;
    let targetOpenId = account.openId;
    const realRedId = isRealXhsUserId(xhsUserId) ? xhsUserId : null;
    if (realRedId) {
      try {
        const existingUser = await getUserByXhsUserId(realRedId);
        if (existingUser && existingUser.id !== account.userId) {
          await migrateUserData(account.userId, existingUser.id);
          targetUserId = existingUser.id;
          targetOpenId = existingUser.openId;
          console.info(
            `[XHS] merged userId=${account.userId} into userId=${existingUser.id} for redId=${realRedId}`
          );
        } else if (existingUser) {
          targetUserId = existingUser.id;
          targetOpenId = existingUser.openId;
        }
      } catch (mergeError) {
        console.warn("[XHS] account merge failed", mergeError);
      }
    }

    if (isDefaultXhsUsername(nickname)) {
      nickname = (await findKnownNickname(targetUserId, realRedId)) ?? nickname;
    }

    // 更新用户记录，写入真实 redId
    await upsertUser({
      openId: targetOpenId,
      xhsUserId,
      xhsNickname: nickname,
      name: nickname,
      loginMethod: "xhs",
      lastSignedIn: new Date(),
    });

    // 更新临时 accountKey 记录
    await upsertXhsAccount(targetUserId, {
      accountKey: account.accountKey,
      xhsUserId,
      nickname,
      status: "logged_in",
      ...accountRuntimePaths(account.accountKey),
    });

    if (realRedId) {
      try {
        // 查找是否已有其他用户绑定了这个 redId（多浏览器同一账号场景）
        const existingUser = await getUserByXhsUserId(realRedId);
        if (existingUser && existingUser.id !== targetUserId) {
          // 合并：把当前浏览器新建的数据迁移到历史用户
          await migrateUserData(account.userId, existingUser.id);
          console.info(
            `[XHS] merged userId=${account.userId} into userId=${existingUser.id} for redId=${realRedId}`
          );
        }
      } catch (mergeError) {
        console.warn("[XHS] account merge failed", mergeError);
      }

      // 建立 redId-based 的 accountKey，复制 cookies
      const redIdKey = redIdAccountKey(realRedId);
      const redIdPaths = accountRuntimePaths(redIdKey);
      try {
        const targetCookiesPath = resolveRuntimePath(redIdPaths.cookiesPath);
        const targetLoginStatePath = resolveRuntimePath(
          redIdPaths.loginStatePath
        );
        mkdirSync(path.dirname(targetCookiesPath), { recursive: true });
        const srcCookies = resolveRuntimePath(
          accountRuntimePaths(account.accountKey).cookiesPath
        );
        if (existsSync(srcCookies)) {
          copyFileSync(srcCookies, targetCookiesPath);
        }
        const srcLoginState = accountRuntimePaths(
          account.accountKey
        ).loginStatePath;
        const sourceLoginState = resolveRuntimePath(srcLoginState);
        if (existsSync(sourceLoginState)) {
          mkdirSync(path.dirname(targetLoginStatePath), { recursive: true });
          copyFileSync(sourceLoginState, targetLoginStatePath);
        }
      } catch (copyError) {
        console.warn("[XHS] copy cookies to redId dir failed", copyError);
      }

      const targetUser =
        (await getUserByXhsUserId(realRedId)) ??
        (await getUserByOpenId(account.openId));
      await upsertXhsAccount(targetUser?.id ?? targetUserId, {
        accountKey: redIdKey,
        xhsUserId: realRedId,
        nickname,
        status: "logged_in",
        ...redIdPaths,
      });

      // 记录 redId，供 status 端点返回给前端
      redIdByClientId.set(account.openId, realRedId);
    }

    loginIdentitySyncing.delete(account.accountKey);
  }
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  ensureTopicHubVideoPipelineStarted();

  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(
    "/_local",
    express.static(path.resolve(process.cwd(), ".data"), {
      fallthrough: true,
    })
  );
  // 文件上传端点：POST /api/upload?projectId=xxx
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, _file, cb) => {
        const projectId = String(req.query.projectId || "0");
        const dir = path.resolve(process.cwd(), ".data", "uploads", projectId);
        mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname) || ".bin";
        cb(null, `${Date.now()}${ext}`);
      },
    }),
    limits: { fileSize: 200 * 1024 * 1024 }, // 最大 200MB
    fileFilter: (_req, file, cb) => {
      // 仅允许素材图片和参考视频
      if (
        file.mimetype.startsWith("image/") ||
        file.mimetype.startsWith("video/")
      ) {
        cb(null, true);
      } else {
        cb(new Error("仅支持上传图片或视频文件"));
      }
    },
  });
  app.post("/api/upload", upload.single("file"), (req, res) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: "未收到文件" });
      return;
    }
    const projectId = String(req.query.projectId || "0");
    const url = `/_local/uploads/${projectId}/${req.file.filename}`;
    res.json({ success: true, url });
  });

  app.get("/api/xhs/login/qrcode", async (req, res) => {
    try {
      const account = await getDefaultAccountKey(req);
      const data = await getXhsLoginQrcode(account?.accountKey);
      res.json({ success: true, data });
    } catch (error) {
      res.status(502).json({
        success: false,
        error: error instanceof Error ? error.message : "获取二维码失败",
      });
    }
  });
  app.get("/api/xhs/login/status", async (req, res) => {
    try {
      const account = await getDefaultAccountKey(req);
      const data = await getXhsLoginStatus(account?.accountKey);
      const status = await withLocalXhsNickname(account, data);
      void syncLoginIdentity(account, status);
      const redId = account
        ? (status.redId ?? account.redId ?? redIdByClientId.get(account.openId))
        : undefined;
      res.json({ success: true, data: { ...status, redId } });
    } catch (error) {
      res.status(502).json({
        success: false,
        error: error instanceof Error ? error.message : "获取登录状态失败",
      });
    }
  });
  app.delete("/api/xhs/login/cookies", async (req, res) => {
    try {
      const account = await getDefaultAccountKey(req);
      await deleteXhsCookies(account?.accountKey);
      res.json({ success: true });
    } catch (error) {
      res.status(502).json({
        success: false,
        error: error instanceof Error ? error.message : "清理登录态失败",
      });
    }
  });
  app.post("/api/xhs/login/session/start", async (req, res) => {
    try {
      const account = await getDefaultAccountKey(req);
      const data = await startXhsLoginSession(account?.accountKey);
      const status = await withLocalXhsNickname(account, data);
      void syncLoginIdentity(account, status);
      const redId = account ? (status.redId ?? account.redId) : undefined;
      res.json({ success: true, data: { ...status, redId } });
    } catch (error) {
      res.status(502).json({
        success: false,
        error: error instanceof Error ? error.message : "启动登录会话失败",
      });
    }
  });
  app.post("/api/xhs/login/phone/start", async (req, res) => {
    try {
      const account = await getDefaultAccountKey(req);
      const data = await startXhsPhoneLogin(account?.accountKey);
      res.json({ success: true, data });
    } catch (error) {
      res.status(502).json({
        success: false,
        error: error instanceof Error ? error.message : "启动手机号登录失败",
      });
    }
  });
  app.post("/api/xhs/login/phone/send_code", async (req, res) => {
    try {
      const account = await getDefaultAccountKey(req);
      const data = await sendXhsPhoneLoginCode(
        String(req.body?.phone || ""),
        account?.accountKey
      );
      res.json({ success: true, data });
    } catch (error) {
      res.status(502).json({
        success: false,
        error: error instanceof Error ? error.message : "发送手机号验证码失败",
      });
    }
  });
  app.post("/api/xhs/login/phone/verify", async (req, res) => {
    try {
      const account = await getDefaultAccountKey(req);
      const data = await verifyXhsPhoneLoginCode(
        String(req.body?.code || ""),
        account?.accountKey
      );
      res.json({ success: true, data });
    } catch (error) {
      res.status(502).json({
        success: false,
        error: error instanceof Error ? error.message : "提交手机号验证码失败",
      });
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
