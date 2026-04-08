import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "node:path";
import { mkdirSync } from "node:fs";
import multer from "multer";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter, ensureTopicHubVideoPipelineStarted } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import {
  deleteXhsCookies,
  getXhsLoginQrcode,
  getXhsLoginStatus,
  sendXhsPhoneLoginCode,
  startXhsLoginSession,
  startXhsPhoneLogin,
  verifyXhsPhoneLoginCode,
} from "./xhsApi";

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
    limits: { fileSize: 30 * 1024 * 1024 }, // 最大 30MB
    fileFilter: (_req, file, cb) => {
      // 仅允许图片
      if (file.mimetype.startsWith("image/")) {
        cb(null, true);
      } else {
        cb(new Error("仅支持上传图片文件"));
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

  app.get("/api/xhs/login/qrcode", async (_req, res) => {
    try {
      const data = await getXhsLoginQrcode();
      res.json({ success: true, data });
    } catch (error) {
      res.status(502).json({
        success: false,
        error: error instanceof Error ? error.message : "获取二维码失败",
      });
    }
  });
  app.get("/api/xhs/login/status", async (_req, res) => {
    try {
      const data = await getXhsLoginStatus();
      res.json({ success: true, data });
    } catch (error) {
      res.status(502).json({
        success: false,
        error: error instanceof Error ? error.message : "获取登录状态失败",
      });
    }
  });
  app.delete("/api/xhs/login/cookies", async (_req, res) => {
    try {
      await deleteXhsCookies();
      res.json({ success: true });
    } catch (error) {
      res.status(502).json({
        success: false,
        error: error instanceof Error ? error.message : "清理登录态失败",
      });
    }
  });
  app.post("/api/xhs/login/session/start", async (_req, res) => {
    try {
      const data = await startXhsLoginSession();
      res.json({ success: true, data });
    } catch (error) {
      res.status(502).json({
        success: false,
        error: error instanceof Error ? error.message : "启动登录会话失败",
      });
    }
  });
  app.post("/api/xhs/login/phone/start", async (_req, res) => {
    try {
      const data = await startXhsPhoneLogin();
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
      const data = await sendXhsPhoneLoginCode(String(req.body?.phone || ""));
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
      const data = await verifyXhsPhoneLoginCode(String(req.body?.code || ""));
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
