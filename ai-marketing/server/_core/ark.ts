import { existsSync, readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { basename } from "node:path";
import { ENV } from "./env";

type ArkTextPart = {
  type: "input_text";
  text: string;
};

type ArkVideoPart = {
  type: "input_video";
  file_id: string;
};

type ArkResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

type ArkFileObject = {
  id: string;
  status?: string;
};

type ArkHttpResponse = {
  statusCode: number;
  statusMessage: string;
  bodyText: string;
};

const ARK_FILE_RETRIEVE_TIMEOUT_MS = 30_000;
const ARK_FILE_POLL_INTERVAL_MS = 3_000;
const ARK_FILE_PROCESS_TIMEOUT_MS = 10 * 60 * 1000;
const ARK_FILE_MAX_POLL_ATTEMPTS =
  ARK_FILE_PROCESS_TIMEOUT_MS / ARK_FILE_POLL_INTERVAL_MS;

function assertArkApiKey() {
  if (!ENV.arkApiKey) {
    throw new Error("ARK_API_KEY is not configured");
  }
}

function getArkBaseUrl() {
  return ENV.arkBaseUrl.replace(/\/$/, "");
}

function escapeMultipartValue(value: string) {
  return value.replace(/"/g, '\\"');
}

function requestArk(
  urlText: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: Buffer | string;
    timeoutMs: number;
  }
) {
  return new Promise<ArkHttpResponse>((resolve, reject) => {
    const url = new URL(urlText);
    const requestImpl = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = requestImpl(
      url,
      {
        method: init.method ?? "GET",
        headers: init.headers,
      },
      res => {
        const chunks: Buffer[] = [];

        res.on("data", chunk => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        res.on("end", () => {
          clearTimeout(timer);
          resolve({
            statusCode: res.statusCode ?? 0,
            statusMessage: res.statusMessage ?? "",
            bodyText: Buffer.concat(chunks).toString("utf-8"),
          });
        });
      }
    );

    const timer = setTimeout(() => {
      req.destroy(new Error(`Ark request timeout after ${init.timeoutMs}ms`));
    }, init.timeoutMs);

    req.on("error", error => {
      clearTimeout(timer);
      reject(error);
    });

    if (init.body) {
      req.write(init.body);
    }

    req.end();
  });
}

function extractArkText(response: ArkResponse) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  for (const output of response.output ?? []) {
    for (const content of output.content ?? []) {
      if (content.type === "output_text" && content.text?.trim()) {
        return content.text.trim();
      }
    }
  }

  return "";
}

function wrapArkError(error: unknown, action: string) {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "";
  const cause =
    error && typeof error === "object" && "cause" in error ? error.cause : null;
  const causeMessage =
    cause instanceof Error ? cause.message : cause ? String(cause) : "";
  const causeCode =
    cause &&
    typeof cause === "object" &&
    "code" in cause &&
    typeof cause.code === "string"
      ? cause.code
      : "";
  const timedOut =
    name === "TimeoutError" ||
    /aborted due to timeout/i.test(message) ||
    /timeout/i.test(message) ||
    /timeout/i.test(causeMessage) ||
    causeCode === "UND_ERR_HEADERS_TIMEOUT" ||
    causeCode === "ETIMEDOUT";

  if (timedOut) {
    return new Error(`方舟${action}超时，请重试或缩短视频时长后再试`);
  }
  if (causeMessage && causeMessage !== message) {
    return new Error(`Ark ${action} failed: ${causeMessage}`);
  }

  return error instanceof Error ? error : new Error(message);
}

function normalizeWindowsPathToWsl(filePath: string) {
  const match = filePath.match(/^([a-zA-Z]):[\\/](.*)$/);
  if (!match) return undefined;

  const drive = match[1].toLowerCase();
  const rest = match[2].replace(/\\/g, "/");

  return `/mnt/${drive}/${rest}`;
}

function normalizeWslPathToWindows(filePath: string) {
  const match = filePath.match(/^\/mnt(?:\/host)?\/([a-zA-Z])\/(.+)$/);
  if (!match) return undefined;

  const drive = match[1].toUpperCase();
  const rest = match[2].replace(/\//g, "\\");

  return `${drive}:\\${rest}`;
}

function resolveArkUploadPath(filePath: string) {
  const candidates = [filePath];

  if (process.platform === "win32") {
    const windowsPath = normalizeWslPathToWindows(filePath);
    if (windowsPath) candidates.unshift(windowsPath);
  } else {
    const wslPath = normalizeWindowsPathToWsl(filePath);
    if (wslPath) candidates.unshift(wslPath);
  }

  const existingPath = candidates.find(candidate => existsSync(candidate));
  return existingPath || filePath;
}

async function uploadVideoFile(filePath: string) {
  const resolvedPath = resolveArkUploadPath(filePath);

  try {
    const buf = readFileSync(resolvedPath);
    const fileName = basename(resolvedPath);
    const boundary = `----ark-upload-${Date.now().toString(16)}`;
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="purpose"\r\n\r\n` +
          `user_data\r\n` +
          `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="file"; filename="${escapeMultipartValue(fileName)}"\r\n` +
          `Content-Type: video/mp4\r\n\r\n`,
        "utf-8"
      ),
      buf,
      Buffer.from(`\r\n--${boundary}--\r\n`, "utf-8"),
    ]);

    const resp = await requestArk(`${getArkBaseUrl()}/files`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV.arkApiKey}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": String(payload.length),
      },
      body: payload,
      timeoutMs: ENV.arkFileUploadTimeoutMs,
    });

    if (resp.statusCode < 200 || resp.statusCode >= 300) {
      throw new Error(
        `Ark file upload failed (${resp.statusCode} ${resp.statusMessage}): ${resp.bodyText}`
      );
    }

    const file = JSON.parse(resp.bodyText) as ArkFileObject;
    if (!file.id) {
      throw new Error("Ark file upload did not return file id");
    }

    return {
      fileId: file.id,
      resolvedPath,
    };
  } catch (error) {
    throw wrapArkError(error, "文件上传");
  }
}

async function retrieveArkFile(fileId: string) {
  const resp = await requestArk(`${getArkBaseUrl()}/files/${fileId}`, {
    headers: { Authorization: `Bearer ${ENV.arkApiKey}` },
    timeoutMs: ARK_FILE_RETRIEVE_TIMEOUT_MS,
  });

  if (resp.statusCode < 200 || resp.statusCode >= 300) {
    throw new Error(
      `Ark file retrieve failed (${resp.statusCode} ${resp.statusMessage}): ${resp.bodyText}`
    );
  }

  return JSON.parse(resp.bodyText) as ArkFileObject;
}

async function createArkResponse(input: {
  fileId: string;
  prompt: string;
  model: string;
}) {
  const content: Array<ArkVideoPart | ArkTextPart> = [
    {
      type: "input_video",
      file_id: input.fileId,
    },
    {
      type: "input_text",
      text: input.prompt,
    },
  ];

  try {
    const payload = JSON.stringify({
      model: input.model,
      input: [
        {
          role: "user",
          content,
        },
      ],
    });

    const resp = await requestArk(`${getArkBaseUrl()}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV.arkApiKey}`,
        "Content-Type": "application/json",
        "Content-Length": String(Buffer.byteLength(payload)),
      },
      body: payload,
      timeoutMs: ENV.arkResponseTimeoutMs,
    });

    if (resp.statusCode < 200 || resp.statusCode >= 300) {
      throw new Error(
        `Ark responses failed (${resp.statusCode} ${resp.statusMessage}): ${resp.bodyText}`
      );
    }

    return JSON.parse(resp.bodyText) as ArkResponse;
  } catch (error) {
    throw wrapArkError(error, "视频分析");
  }
}

export async function analyzeVideoWithArk(input: {
  prompt: string;
  filePath: string;
  model?: string;
  onStageChange?: (stage: string, details?: Record<string, unknown>) => void;
}) {
  assertArkApiKey();

  input.onStageChange?.("files.create.start", {
    filePath: input.filePath,
  });

  const { fileId, resolvedPath } = await uploadVideoFile(input.filePath);

  input.onStageChange?.("files.create.done", {
    fileId,
    resolvedPath,
  });

  input.onStageChange?.("files.retrieve.start", {
    fileId,
  });

  for (let attempt = 0; attempt < ARK_FILE_MAX_POLL_ATTEMPTS; attempt += 1) {
    const file = await retrieveArkFile(fileId);
    const status = String(file.status || "").toLowerCase();

    input.onStageChange?.("files.retrieve.poll", {
      fileId,
      attempt: attempt + 1,
      status,
    });

    if (
      status === "processed" ||
      status === "succeeded" ||
      status === "active"
    ) {
      input.onStageChange?.("files.retrieve.done", {
        fileId,
        attempt: attempt + 1,
        status,
      });
      break;
    }

    if (status === "failed" || status === "error") {
      throw new Error(`Ark file processing failed: ${fileId}`);
    }

    if (attempt === ARK_FILE_MAX_POLL_ATTEMPTS - 1) {
      throw new Error(`Ark file processing timeout: ${fileId}`);
    }

    await new Promise(resolve =>
      setTimeout(resolve, ARK_FILE_POLL_INTERVAL_MS)
    );
  }

  input.onStageChange?.("responses.create.start", {
    fileId,
    model: input.model || ENV.arkModel,
  });

  const response = await createArkResponse({
    fileId,
    prompt: input.prompt,
    model: input.model || ENV.arkModel,
  });

  input.onStageChange?.("responses.create.done", {
    fileId,
  });

  const text = extractArkText(response);
  if (!text) {
    throw new Error("Ark did not return analysis text");
  }

  return {
    text,
    fileId,
    raw: response,
  };
}
