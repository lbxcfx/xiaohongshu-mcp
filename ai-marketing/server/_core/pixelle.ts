import { ENV } from "./env";

export type PixelleTaskType = "video_clone" | "asset_remix" | "long_marketing";

export interface PixelleCreateInput {
  projectId: number;
  scriptId?: number;
  title: string;
  taskType: PixelleTaskType;
  prompt: string;
  referenceVideoUrl?: string;
  referenceImageUrl?: string;
  productImageUrls?: string[];
  aspectRatio?: string;
  duration?: number;
  voiceEnabled?: boolean;
  subtitlesEnabled?: boolean;
}

export interface PixelleTaskStatus {
  status: "queued" | "running" | "succeeded" | "failed";
  progress?: number;
  resultUrl?: string;
  error?: string;
}

function getPixelleBaseUrl() {
  return ENV.pixelleApiUrl.replace(/\/$/, "");
}

export async function createPixelleTask(input: PixelleCreateInput) {
  if (!ENV.pixelleApiUrl) {
    return {
      taskId: `pixelle-local-${Date.now()}`,
      status: "queued" as const,
      message: "PIXELLE_API_URL 未配置，已创建本地编排任务",
    };
  }

  const response = await fetch(`${getPixelleBaseUrl()}/api/video/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(ENV.pixelleApiKey
        ? { Authorization: `Bearer ${ENV.pixelleApiKey}` }
        : {}),
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Pixelle 任务创建失败 (${response.status}): ${text.substring(0, 300)}`
    );
  }

  const data = (await response.json()) as {
    id?: string;
    taskId?: string;
    status?: string;
    message?: string;
  };
  const taskId = data.taskId || data.id;
  if (!taskId) throw new Error("Pixelle API 未返回任务 ID");

  return {
    taskId,
    status: (data.status || "queued") as PixelleTaskStatus["status"],
    message: data.message,
  };
}

export async function queryPixelleTask(
  taskId: string
): Promise<PixelleTaskStatus> {
  if (!ENV.pixelleApiUrl) {
    return {
      status: "running",
      progress: 0,
      error: "PIXELLE_API_URL 未配置，等待接入 Pixelle 服务",
    };
  }

  const response = await fetch(
    `${getPixelleBaseUrl()}/api/video/tasks/${encodeURIComponent(taskId)}`,
    {
      headers: ENV.pixelleApiKey
        ? { Authorization: `Bearer ${ENV.pixelleApiKey}` }
        : {},
      signal: AbortSignal.timeout(15_000),
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Pixelle 状态查询失败 (${response.status}): ${text.substring(0, 300)}`
    );
  }

  const data = (await response.json()) as {
    status?: PixelleTaskStatus["status"];
    progress?: number;
    resultUrl?: string;
    videoUrl?: string;
    error?: string;
  };

  return {
    status: data.status || "running",
    progress: data.progress,
    resultUrl: data.resultUrl || data.videoUrl,
    error: data.error,
  };
}
