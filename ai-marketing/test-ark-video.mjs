/**
 * 方舟视频理解 API 测试脚本
 * 用法: node test-ark-video.mjs [视频文件路径]
 */
import { readFileSync } from "node:fs";
import { basename, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── 加载 .env ─────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envLines = readFileSync(resolve(__dirname, ".env"), "utf-8").split("\n");
for (const line of envLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  const val = trimmed.slice(eq + 1).trim();
  if (key && !process.env[key]) process.env[key] = val;
}

const ARK_API_KEY = process.env.ARK_API_KEY ?? "";
const ARK_BASE_URL = (process.env.ARK_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, "");
const ARK_MODEL = process.env.ARK_MODEL ?? "doubao-seed-2-0-pro-260215";

if (!ARK_API_KEY) {
  console.error("错误: ARK_API_KEY 未配置");
  process.exit(1);
}

// ── 参数 ──────────────────────────────────────────────────────
const VIDEO_PATH =
  process.argv[2] ??
  resolve(__dirname, ".data/topic-hub-downloads/3/69bd2adf000000001d01d3c2.mp4");

const PROMPT =
  "请分析这个视频的内容，包括：1）视频主题；2）内容风格；3）目标受众；" +
  "4）适合发布到小红书的文案方向建议（给出至少2个方向）。";

// ── 工具函数 ──────────────────────────────────────────────────
function authHeader() {
  return { Authorization: `Bearer ${ARK_API_KEY}` };
}

async function checkResponse(resp, label) {
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`${label} 失败 (HTTP ${resp.status}): ${body.slice(0, 300)}`);
  }
}

// ── Step 1: 上传视频 ──────────────────────────────────────────
async function uploadVideo(filePath) {
  console.log(`[1/3] 上传视频: ${basename(filePath)}`);
  const buf = readFileSync(filePath);
  const form = new FormData();
  form.append("purpose", "user_data");
  form.append("file", new Blob([buf], { type: "video/mp4" }), basename(filePath));

  const resp = await fetch(`${ARK_BASE_URL}/files`, {
    method: "POST",
    headers: authHeader(),
    body: form,
    signal: AbortSignal.timeout(900_000),
  });
  await checkResponse(resp, "文件上传");

  const data = await resp.json();
  if (!data.id) throw new Error("上传响应中缺少 file id");
  console.log(`    ✓ File ID: ${data.id}`);
  return data.id;
}

// ── Step 2: 等待文件处理完成 ──────────────────────────────────
async function waitForFile(fileId) {
  console.log("[2/3] 等待文件处理...");
  for (let i = 1; i <= 120; i++) {
    const resp = await fetch(`${ARK_BASE_URL}/files/${fileId}`, {
      headers: authHeader(),
      signal: AbortSignal.timeout(30_000),
    });
    await checkResponse(resp, "文件查询");

    const data = await resp.json();
    const status = String(data.status ?? "").toLowerCase();
    process.stdout.write(`    轮询 #${i} 状态: ${status}          \r`);

    if (["processed", "succeeded", "active"].includes(status)) {
      console.log(`\n    ✓ 处理完成 (状态: ${status})`);
      return;
    }
    if (["failed", "error"].includes(status)) {
      throw new Error(`文件处理失败: ${fileId}`);
    }
    await new Promise(r => setTimeout(r, 3_000));
  }
  throw new Error("等待文件处理超时");
}

// ── Step 3: 调用视频理解 API ──────────────────────────────────
async function analyzeVideo(fileId) {
  console.log(`[3/3] 调用视频理解 (model: ${ARK_MODEL})...`);
  const resp = await fetch(`${ARK_BASE_URL}/responses`, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ARK_MODEL,
      input: [
        {
          role: "user",
          content: [
            { type: "input_video", file_id: fileId },
            { type: "input_text", text: PROMPT },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(600_000),
  });
  await checkResponse(resp, "视频理解");

  const data = await resp.json();

  // 兼容两种响应格式
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }
  for (const output of data.output ?? []) {
    for (const content of output.content ?? []) {
      if (content.type === "output_text" && content.text?.trim()) {
        return content.text.trim();
      }
    }
  }
  throw new Error("API 响应中未找到分析文本");
}

// ── 主流程 ────────────────────────────────────────────────────
console.log("=".repeat(60));
console.log("方舟视频理解 API 测试");
console.log("=".repeat(60));
console.log(`API Key : ${ARK_API_KEY.slice(0, 8)}...`);
console.log(`Model   : ${ARK_MODEL}`);
console.log(`视频    : ${VIDEO_PATH}`);
console.log("");

const t0 = Date.now();

const fileId = await uploadVideo(VIDEO_PATH);
await waitForFile(fileId);
const result = await analyzeVideo(fileId);

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log("");
console.log("=".repeat(60));
console.log(`分析结果 (耗时 ${elapsed}s):`);
console.log("=".repeat(60));
console.log(result);
console.log("=".repeat(60));
