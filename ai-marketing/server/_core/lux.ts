import { mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_LUX_BIN = "/home/lbx/go/bin/lux";
const MAX_DOWNLOAD_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1_000;
const LUX_DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;

function getLuxBin() {
  return process.env.LUX_BIN || DEFAULT_LUX_BIN;
}

async function findDownloadedFile(outputDir: string, noteId: string) {
  const files = await readdir(outputDir);
  const matched = files
    .filter(file => file === noteId || file.startsWith(`${noteId}.`))
    .sort();

  if (matched.length === 0) return undefined;

  return resolve(outputDir, matched[0]);
}

function sleep(ms: number) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, ms));
}

function formatLuxError(error: unknown) {
  if (error && typeof error === "object") {
    const timedOut =
      "code" in error &&
      typeof error.code === "string" &&
      error.code === "ETIMEDOUT";
    const killed =
      "killed" in error && typeof error.killed === "boolean" && error.killed;
    const signal =
      "signal" in error && typeof error.signal === "string" ? error.signal : "";
    const message =
      "message" in error && typeof error.message === "string"
        ? error.message
        : String(error);

    if (
      timedOut ||
      signal === "SIGTERM" ||
      /timed out/i.test(message) ||
      killed
    ) {
      return "视频下载超时（10分钟），请重试或更换更短的小红书链接";
    }

    return message;
  }

  return String(error);
}

export type LuxDownloadResult = {
  filePath?: string;
  attempts: number;
  success: boolean;
  error?: string;
};

export async function downloadWithLux(input: {
  url: string;
  noteId: string;
  projectId: number;
}): Promise<LuxDownloadResult> {
  const outputDir = resolve(
    process.cwd(),
    ".data",
    "topic-hub-downloads",
    String(input.projectId)
  );
  await mkdir(outputDir, { recursive: true });

  const luxBin = getLuxBin();
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= MAX_DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      await execFileAsync(
        luxBin,
        [
          "--output-path",
          outputDir,
          "--output-name",
          input.noteId,
          "--retry",
          "0",
          "--silent",
          input.url,
        ],
        {
          timeout: LUX_DOWNLOAD_TIMEOUT_MS,
          maxBuffer: 1024 * 1024 * 4,
        }
      );

      const filePath = await findDownloadedFile(outputDir, input.noteId);
      if (filePath) {
        return {
          filePath,
          attempts: attempt,
          success: true,
        };
      }

      lastError = "lux 执行成功但未找到下载文件";
    } catch (error) {
      lastError = formatLuxError(error);
    }

    if (attempt < MAX_DOWNLOAD_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS);
    }
  }

  return {
    attempts: MAX_DOWNLOAD_ATTEMPTS,
    success: false,
    error: lastError,
  };
}
