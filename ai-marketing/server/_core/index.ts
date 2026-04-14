import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "node:path";
import { mkdirSync } from "node:fs";
import multer from "multer";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter, ensureTopicHubVideoPipelineStarted } from "../routers";
import { createContext, hashClientId } from "./context";
import { getUserByOpenId, upsertUser, upsertXhsAccount } from "../db";
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

async function getDefaultAccountKey(req: express.Request) {
  const clientId = headerValue(req.headers["x-xhs-client-id"]);
  if (!clientId || typeof clientId !== "string") return null;

  let userId = hashClientId(clientId);
  await upsertUser({
    openId: clientId,
    xhsUserId: clientId,
    xhsNickname: "小红书用户",
    name: "小红书用户",
    loginMethod: "xhs",
    lastSignedIn: new Date(),
  });
  const user = await getUserByOpenId(clientId);
  userId = user?.id ?? userId;
  const accountKey = `u${userId}-default`;
  await upsertXhsAccount(userId, {
    accountKey,
    status: "unknown",
    ...accountRuntimePaths(accountKey),
  });
  return { userId, openId: clientId, accountKey };
}

async function syncLoginIdentity(req: express.Request, status: XhsLoginStatus) {
  if (!status.is_logged_in) return;

  const account = await getDefaultAccountKey(req);
  if (!account) return;

  let nickname = status.username || "小红书用户";
  let xhsUserId = account.openId;

  try {
    const profile = await getXhsMyProfile(account.accountKey);
    nickname = profile.userBasicInfo?.nickname || nickname;
    xhsUserId = profile.userBasicInfo?.redId || xhsUserId;
  } catch (error) {
    console.warn("[XHS] sync profile failed", error);
  }

  await upsertUser({
    openId: account.openId,
    xhsUserId,
    xhsNickname: nickname,
    name: nickname,
    loginMethod: "xhs",
    lastSignedIn: new Date(),
  });
  await upsertXhsAccount(account.userId, {
    accountKey: account.accountKey,
    xhsUserId,
    nickname,
    status: "logged_in",
    ...accountRuntimePaths(account.accountKey),
  });
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
      await syncLoginIdentity(req, data);
      res.json({ success: true, data });
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
      await syncLoginIdentity(req, data);
      res.json({ success: true, data });
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
