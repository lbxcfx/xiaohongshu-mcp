import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { ENV } from "./env";

// Seedance 1.5 Pro 模型 ID
const SEEDANCE_MODEL = "doubao-seedance-1-5-pro-251215";

function getArkBaseUrl() {
  return ENV.arkBaseUrl.replace(/\/$/, "");
}

function assertArkApiKey() {
  if (!ENV.arkApiKey) {
    throw new Error("ARK_API_KEY 未配置，无法调用 Seedance API");
  }
}

// 将本地文件转换为 base64 data URL
function localFileToDataUrl(filePath: string): string {
  const buf = readFileSync(filePath);
  const ext = extname(filePath).toLowerCase().replace(".", "");
  const mime = ext === "jpg" ? "jpeg" : ext;
  return `data:image/${mime};base64,${buf.toString("base64")}`;
}

export interface SeedanceCreateOptions {
  ratio?: "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "21:9" | "adaptive";
  duration?: number; // 4-12 秒，-1 为自动
  resolution?: "480p" | "720p" | "1080p";
  generateAudio?: boolean;
  seed?: number;
  cameraFixed?: boolean;
}

export interface SeedanceTaskResult {
  taskId: string;
}

export interface SeedanceTaskStatus {
  status: "queued" | "running" | "succeeded" | "failed" | "expired";
  videoUrl?: string;
  error?: string;
}

/**
 * 创建 Seedance 视频生成任务
 * @param prompt 视频描述
 * @param imageInput 参考图片：URL 字符串（远端）或本地文件路径（以 / 或盘符开头）
 * @param options 其他参数
 */
export async function createSeedanceTask(
  prompt: string,
  imageInput?: string,
  options: SeedanceCreateOptions = {}
): Promise<SeedanceTaskResult> {
  assertArkApiKey();

  type ContentItem =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string }; role: "first_frame" };

  const content: ContentItem[] = [{ type: "text", text: prompt }];

  if (imageInput) {
    // 判断是否为本地文件路径（Windows 或 Unix）
    const isLocalPath =
      /^[a-zA-Z]:[\\/]/.test(imageInput) ||
      imageInput.startsWith("/") ||
      imageInput.startsWith("._local/");

    let imageUrl = imageInput;
    if (isLocalPath) {
      imageUrl = localFileToDataUrl(imageInput);
    }

    content.push({
      type: "image_url",
      image_url: { url: imageUrl },
      role: "first_frame",
    });
  }

  const body: Record<string, unknown> = {
    model: SEEDANCE_MODEL,
    content,
    ratio: options.ratio ?? (imageInput ? "adaptive" : "9:16"),
    duration: options.duration ?? 5,
    resolution: options.resolution ?? "720p",
    generate_audio: options.generateAudio ?? true,
  };

  if (options.seed !== undefined) body.seed = options.seed;
  if (options.cameraFixed !== undefined) body.camera_fixed = options.cameraFixed;

  const resp = await fetch(
    `${getArkBaseUrl()}/contents/generations/tasks`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENV.arkApiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    }
  );

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Seedance 任务创建失败 (${resp.status}): ${text.substring(0, 300)}`);
  }

  const data = (await resp.json()) as { id?: string; error?: { message?: string } };

  if (data.error?.message) {
    throw new Error(`Seedance API 错误: ${data.error.message}`);
  }

  if (!data.id) {
    throw new Error("Seedance API 未返回任务 ID");
  }

  return { taskId: data.id };
}

/**
 * 查询 Seedance 视频生成任务状态
 */
export async function querySeedanceTask(taskId: string): Promise<SeedanceTaskStatus> {
  assertArkApiKey();

  const resp = await fetch(
    `${getArkBaseUrl()}/contents/generations/tasks/${taskId}`,
    {
      headers: { Authorization: `Bearer ${ENV.arkApiKey}` },
      signal: AbortSignal.timeout(15_000),
    }
  );

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Seedance 状态查询失败 (${resp.status}): ${text.substring(0, 300)}`);
  }

  const data = (await resp.json()) as {
    status?: string;
    content?: { video_url?: string };
    error?: { message?: string };
  };

  const status = (data.status || "queued") as SeedanceTaskStatus["status"];
  const videoUrl = data.content?.video_url;
  const error = data.error?.message;

  return { status, videoUrl, error };
}
