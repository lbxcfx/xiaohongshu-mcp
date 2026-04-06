import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  getProjectById,
  getPositionings,
  createPositioning,
  updatePositioning,
  deletePositioning,
  deletePositioningsByProject,
  getTopicHubItems,
  findTopicHubItemByNoteId,
  createTopicHubItem,
  updateTopicHubItemTags,
  deleteTopicHubItem,
  deleteTopicHubItemsByProject,
  getTopics,
  createTopic,
  updateTopic,
  deleteTopic,
  deleteTopicsByProject,
  getTopicPlans,
  createTopicPlan,
  deleteTopicPlansByProject,
  getViralAnalyses,
  createViralAnalysis,
  updateViralAnalysis,
  getScripts,
  createScript,
  updateScript,
  deleteScript,
  getMaterials,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  getPlatformAdaptations,
  getPlatformAdaptationsByProject,
  createPlatformAdaptation,
  getMaterialPublications,
  upsertMaterialPublication,
  getDashboardStats,
  logUsage,
} from "./db";
import { ENV } from "./_core/env";
import { invokeLLM } from "./_core/llm";
import { analyzeVideoWithArk, generateTextWithArk } from "./_core/ark";
import { createSeedanceTask, querySeedanceTask } from "./_core/seedance";
import { callDataApi } from "./_core/dataApi";
import { generateImage } from "./_core/imageGeneration";
import { downloadWithLux } from "./_core/lux";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import {
  deleteXhsCookies,
  getXhsLoginQrcode,
  getXhsLoginStatus,
  getXhsUserProfile,
  type XhsFeed,
  searchXhsFeeds,
  type XhsLoginStatus,
  type XhsSearchFilters,
} from "./_core/xhsApi";

// Guest user ID – all data is stored under this shared ID since auth is disabled
const GUEST_USER_ID = 1;
function parseEngagementCount(value?: string | null): number {
  if (!value) return 0;
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return 0;
  if (normalized.endsWith("万")) {
    const parsed = Number.parseFloat(normalized.slice(0, -1));
    return Number.isFinite(parsed) ? Math.round(parsed * 10000) : 0;
  }
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildCompletedPositioningDocumentV2(positioning: {
  industry?: string | null;
  track?: string | null;
  monetizationMethod?: string | null;
  targetAudience?: string | null;
  personaType?: string | null;
  positioningRecommendation?: string | null;
}) {
  return [
    `业务领域：${positioning.industry || "未填写"}`,
    `细分赛道：${positioning.track || "未填写"}`,
    `目标受众：${positioning.targetAudience || "未填写"}`,
    `账号人设：${positioning.personaType || "未填写"}`,
    `内容风格/品牌调性：${positioning.positioningRecommendation || "未填写"}`,
    `商业模式：${positioning.monetizationMethod || "未填写"}`,
  ].join("\n");
}

function extractJsonObject(text: string) {
  const candidates = [
    text.trim(),
    text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim(),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    try {
      return JSON.parse(candidate) as Record<string, unknown>;
    } catch {
      const match = candidate.match(/\{[\s\S]*\}/);
      if (!match) continue;

      try {
        return JSON.parse(match[0]) as Record<string, unknown>;
      } catch {
        continue;
      }
    }
  }

  return {};
}

function extractJsonArray(text: string) {
  const candidates = [
    text.trim(),
    text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim(),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    try {
      return JSON.parse(candidate) as Array<Record<string, unknown>>;
    } catch {
      const match = candidate.match(/\[[\s\S]*\]/);
      if (!match) continue;

      try {
        return JSON.parse(match[0]) as Array<Record<string, unknown>>;
      } catch {
        continue;
      }
    }
  }

  return [];
}

async function generateScriptForTopicPlanWithArk(
  projectId: number,
  topicPlanId: number
) {
  const [allTopicPlans, hubItems, allPositionings, allScripts] =
    await Promise.all([
      getTopicPlans(GUEST_USER_ID, projectId),
      getTopicHubItems(GUEST_USER_ID, projectId),
      getPositionings(GUEST_USER_ID, projectId),
      getScripts(GUEST_USER_ID, projectId),
    ]);

  const topicPlan = allTopicPlans.find(item => item.id === topicPlanId);
  if (!topicPlan) throw new Error("未找到选题策划结果");

  const hubItem = hubItems.find(item => item.id === topicPlan.hubItemId);
  if (!hubItem) throw new Error("未找到选题策划对应的源视频");

  const hubTags = (hubItem.tags ?? {}) as Record<string, unknown>;
  const viralAnalysis = String(hubTags.videoAnalysisResult || "").trim();
  if (!viralAnalysis) {
    throw new Error("该源视频尚无爆款因子分析结果");
  }

  const completedPositioning = allPositionings.find(
    item => item.status === "completed" && item.positioningRecommendation
  );
  if (!completedPositioning) {
    throw new Error("请先完成账号定位，再生成爆款复刻脚本");
  }

  const positioningDocument =
    buildCompletedPositioningDocumentV2(completedPositioning);

  const prompt = `你是专业的To B短视频口播文案创作师，必须严格整合三大核心信息进行文案创作，缺一不可，三大核心信息为：

1.【AI账号定位官】输出的完整账号定位（含业务领域、目标受众、账号人设、内容风格、品牌调性）
2.【AI爆款因子分析师】输出的爆款因子分析报告（含爆款核心钩子、受众痛点、内容结构、流量逻辑、互动技巧、爆款规律）
3.【AI定制化选题策划师】生成的最终定制化选题

创作要求

1.严格遵循账号定位：文案语言风格、专业度、价值输出，完全匹配账号人设与受众认知，贴合To B企业营销场景
2.深度融入爆款因子：全程套用爆款分析报告中的核心钩子、结构、痛点、流量技巧，保障文案具备爆款潜力
3.紧扣定制选题：核心内容完全围绕最终定制化选题展开，不偏离主题，精准传递选题核心信息
4.口播适配性：语言口语化、节奏流畅，适合短视频口播表达，开头3秒抓眼球，中间逻辑清晰，结尾引导互动/转化
5.专业合规：符合To B企业内容规范，无低俗、违规内容，凸显专业度与商业价值

输出要求

以完整正式文档形式输出，文案分段清晰、标注明确，可直接复制用于拍摄，无额外无关内容。

【AI账号定位官输出】
${positioningDocument}

【AI爆款因子分析师输出】
源视频标题：${hubItem.title}
${viralAnalysis}

【AI定制化选题策划师输出】
最终定制化选题：${topicPlan.title}
生成依据：${topicPlan.rationale || "无"}`;

  const response = await generateTextWithArk({
    systemPrompt:
      "你是专业的To B短视频口播文案创作师。请直接输出完整脚本正文，不要输出额外说明。",
    prompt,
  });

  const scriptContent = response.text.trim();
  if (!scriptContent) {
    throw new Error("Ark 未返回脚本内容");
  }

  const existingScript = allScripts.find(
    item => item.topicPlanId === topicPlan.id
  );
  const nextTitle = topicPlan.title;

  if (existingScript) {
    await updateScript(GUEST_USER_ID, {
      id: existingScript.id,
      title: nextTitle,
      fullScript: scriptContent,
      status: "draft",
    });
    return { id: existingScript.id, script: scriptContent };
  }

  const createdId = await createScript(GUEST_USER_ID, {
    projectId,
    topicPlanId: topicPlan.id,
    hubItemId: hubItem.id,
    title: nextTitle,
    fullScript: scriptContent,
    platform: "xiaohongshu",
    status: "draft",
  });

  return { id: createdId, script: scriptContent };
}

type XhsPublishDraft = {
  title: string;
  content: string;
  tags: string[];
};

function normalizeXhsTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item =>
      String(item || "")
        .trim()
        .replace(/^#+/, "")
    )
    .filter(Boolean)
    .slice(0, 10);
}

async function ensureXhsDraftForScript(params: {
  projectId: number;
  materialId: number;
  scriptId?: number | null;
  scriptTitle: string;
  scriptContent?: string | null;
}) {
  const scriptText = (params.scriptContent || params.scriptTitle || "").trim();
  if (!scriptText) {
    throw new Error("缺少脚本内容，无法生成小红书发布文案");
  }

  if (params.scriptId) {
    const existing = (
      await getPlatformAdaptations(GUEST_USER_ID, params.scriptId)
    )
      .filter(item => item.platform === "xiaohongshu")
      .find(item => item.title && item.caption);
    if (existing?.title && existing.caption) {
      const draft = {
        title: existing.title,
        content: existing.caption,
        tags: normalizeXhsTags(existing.hashtags),
      };
      await upsertMaterialPublication(GUEST_USER_ID, {
        projectId: params.projectId,
        materialId: params.materialId,
        scriptId: params.scriptId,
        platform: "xiaohongshu",
        status: "draft",
        title: draft.title,
        content: draft.content,
        tags: draft.tags,
        visibility: "公开可见",
      });
      return draft;
    }
  }

  const response = await generateTextWithArk({
    systemPrompt:
      "你是专业的小红书医美短视频发布运营。请只返回合法 JSON，不要输出额外解释。",
    prompt: `请根据以下视频脚本，生成可直接发布到小红书的视频笔记文案。

要求：
1. 标题控制在20字以内，适合小红书搜索和点击。
2. 正文口语化、专业合规，不承诺疗效，不使用绝对化词语。
3. 话题标签不超过10个，不需要带#号。
4. 只返回 JSON：{"title":"标题","content":"正文","tags":["标签1","标签2"]}

视频标题：${params.scriptTitle}

视频脚本：
${scriptText}`,
  });

  const parsed = extractJsonObject(response.text);
  const draft: XhsPublishDraft = {
    title: String(parsed.title || params.scriptTitle || "小红书视频").trim(),
    content: String(parsed.content || parsed.caption || scriptText).trim(),
    tags: normalizeXhsTags(parsed.tags),
  };
  if (!draft.title || !draft.content) {
    throw new Error("小红书发布文案生成失败");
  }

  if (params.scriptId) {
    await createPlatformAdaptation(GUEST_USER_ID, {
      projectId: params.projectId,
      scriptId: params.scriptId,
      platform: "xiaohongshu",
      title: draft.title,
      caption: draft.content,
      hashtags: draft.tags,
      adaptedContent: draft.content,
      formatNotes: "用于素材智造视频自动发布到小红书",
    });
  }

  await upsertMaterialPublication(GUEST_USER_ID, {
    projectId: params.projectId,
    materialId: params.materialId,
    scriptId: params.scriptId ?? null,
    platform: "xiaohongshu",
    status: "draft",
    title: draft.title,
    content: draft.content,
    tags: draft.tags,
    visibility: "公开可见",
  });

  return draft;
}

async function resolvePublishVideoPath(params: {
  projectId: number;
  materialId: number;
  fileUrl: string;
}) {
  if (params.fileUrl.startsWith("/_local/")) {
    return {
      path: resolve(
        process.cwd(),
        ".data",
        params.fileUrl.replace("/_local/", "")
      ),
      shouldCleanup: false,
    };
  }

  if (!params.fileUrl.startsWith("http")) {
    throw new Error("不支持的视频文件路径格式");
  }

  const dir = resolve(
    process.cwd(),
    ".data",
    "xhs-publish",
    String(params.projectId)
  );
  await mkdir(dir, { recursive: true });
  const filename = `video_${params.materialId}_${Date.now()}.mp4`;
  const localVideoPath = join(dir, filename);
  const resp = await fetch(params.fileUrl, {
    signal: AbortSignal.timeout(300_000),
  });
  if (!resp.ok) throw new Error(`视频下载失败 (${resp.status})`);
  const buf = await resp.arrayBuffer();
  await writeFile(localVideoPath, Buffer.from(buf));
  return { path: localVideoPath, shouldCleanup: true };
}

async function publishMaterialToXhs(input: {
  projectId: number;
  materialId: number;
  title?: string;
  content?: string;
  tags?: string[];
  visibility?: "公开可见" | "仅自己可见" | "仅互关好友可见";
}) {
  const [allMaterials, allScripts] = await Promise.all([
    getMaterials(GUEST_USER_ID, input.projectId),
    getScripts(GUEST_USER_ID, input.projectId),
  ]);
  const material = allMaterials.find(item => item.id === input.materialId);
  if (!material) throw new Error("未找到素材记录");
  if (material.status !== "ready")
    throw new Error("素材尚未生成完成，无法发布");
  if (!material.fileUrl) throw new Error("该素材没有可用的视频文件");

  const script = material.scriptId
    ? allScripts.find(item => item.id === material.scriptId)
    : undefined;
  const draft =
    input.title && input.content
      ? {
          title: input.title.trim(),
          content: input.content.trim(),
          tags: normalizeXhsTags(input.tags),
        }
      : await ensureXhsDraftForScript({
          projectId: input.projectId,
          materialId: input.materialId,
          scriptId: material.scriptId,
          scriptTitle: script?.title || material.title,
          scriptContent:
            script?.fullScript || material.prompt || material.title,
        });

  const visibility = input.visibility ?? "公开可见";
  await upsertMaterialPublication(GUEST_USER_ID, {
    projectId: input.projectId,
    materialId: input.materialId,
    scriptId: material.scriptId ?? null,
    platform: "xiaohongshu",
    status: "publishing",
    title: draft.title,
    content: draft.content,
    tags: draft.tags,
    visibility,
  });

  try {
    const videoPath = await resolvePublishVideoPath({
      projectId: input.projectId,
      materialId: input.materialId,
      fileUrl: material.fileUrl,
    });
    try {
      const publishResp = await fetch(`${ENV.xhsApiUrl}/api/v1/publish_video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          content: draft.content,
          video: videoPath.path,
          tags: draft.tags,
          visibility,
        }),
        signal: AbortSignal.timeout(600_000),
      });
      const result = (await publishResp.json()) as {
        success?: boolean;
        data?: { post_id?: string; status?: string };
        message?: string;
        error?: string;
      };
      if (!publishResp.ok || !result.success) {
        throw new Error(
          result.error || result.message || `发布失败 (${publishResp.status})`
        );
      }

      await upsertMaterialPublication(GUEST_USER_ID, {
        projectId: input.projectId,
        materialId: input.materialId,
        scriptId: material.scriptId ?? null,
        platform: "xiaohongshu",
        status: "published",
        title: draft.title,
        content: draft.content,
        tags: draft.tags,
        visibility,
        postId: result.data?.post_id ?? null,
        publishedAt: new Date(),
      });

      return {
        materialId: input.materialId,
        postId: result.data?.post_id,
        status: result.data?.status ?? "published",
        message: result.message ?? "发布成功",
        draft,
      };
    } finally {
      if (videoPath.shouldCleanup) {
        await unlink(videoPath.path).catch(() => undefined);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "发布失败";
    await upsertMaterialPublication(GUEST_USER_ID, {
      projectId: input.projectId,
      materialId: input.materialId,
      scriptId: material.scriptId ?? null,
      platform: "xiaohongshu",
      status: "failed",
      title: draft.title,
      content: draft.content,
      tags: draft.tags,
      visibility,
      errorMessage: message,
    });
    throw error;
  }
}

async function generateTopicPlansForProject(projectId: number) {
  const [positionings, hubItems] = await Promise.all([
    getPositionings(GUEST_USER_ID, projectId),
    getTopicHubItems(GUEST_USER_ID, projectId),
  ]);

  const completedPositioning = positionings.find(
    item => item.status === "completed" && item.positioningRecommendation
  );
  if (!completedPositioning?.positioningRecommendation) {
    throw new Error("请先完成账号定位，再生成选题策划");
  }

  const sourceVideos = hubItems
    .filter(item => item.platform === "xiaohongshu")
    .filter(item => {
      const tags = (item.tags ?? {}) as Record<string, unknown>;
      return (
        tags.videoAnalysisStatus === "completed" &&
        typeof tags.videoAnalysisResult === "string" &&
        String(tags.videoAnalysisResult || "").trim().length > 0
      );
    })
    .sort((a, b) => {
      const aTags = (a.tags ?? {}) as Record<string, unknown>;
      const bTags = (b.tags ?? {}) as Record<string, unknown>;
      return Number(bTags.likedCount || 0) - Number(aTags.likedCount || 0);
    });

  if (sourceVideos.length === 0) {
    throw new Error("请先在爆款分析中完成视频 AI 分析，再生成选题策划");
  }

  const generatedPlans: Array<{
    hubItemId: number;
    title: string;
    rationale: string;
  }> = [];

  for (const item of sourceVideos) {
    const tags = (item.tags ?? {}) as Record<string, unknown>;
    const viralAnalysis = String(tags.videoAnalysisResult || "").trim();
    const prompt = `你是专业的医美小红书选题策划师。
请根据以下两部分信息，为这个爆款视频生成 1 个适合当前账号继续发布的小红书视频题目。

【账号定位内容】
${completedPositioning.positioningRecommendation}

【参考爆款视频标题】
${item.title}

【参考爆款视频的爆款因子分析】
${viralAnalysis}

要求：
1. 只生成 1 个题目，必须适合小红书视频。
2. 题目要延续参考爆款视频里可复制的爆款因子，但必须匹配当前账号定位。
3. 不要照抄原题目，要做定位适配。
4. 表达要克制、专业、适合医美/轻医美/护肤内容。
5. 不要出现夸大承诺、绝对化疗效、违规营销表达。
6. 额外给出 1 行“生成依据”，说明这个题目是如何结合账号定位与爆款因子得出的。

请严格返回 JSON：
{
  "title": "生成的小红书视频题目",
  "rationale": "生成依据"
}`;

    const response = await generateTextWithArk({
      systemPrompt:
        "你擅长医美内容选题策划。请只返回合法 JSON，不要输出额外文本。",
      prompt,
    });

    const parsed = extractJsonObject(response.text);
    const title = String(parsed.title || "").trim();
    const rationale = String(parsed.rationale || "").trim();
    if (!title) {
      throw new Error(`选题策划生成失败：视频《${item.title}》未返回题目`);
    }

    generatedPlans.push({
      hubItemId: item.id,
      title,
      rationale,
    });
  }

  await deleteTopicPlansByProject(GUEST_USER_ID, projectId);

  const savedPlans = [];
  for (const plan of generatedPlans) {
    const saved = await createTopicPlan(GUEST_USER_ID, {
      projectId,
      hubItemId: plan.hubItemId,
      title: plan.title,
      rationale: plan.rationale,
    });
    savedPlans.push(saved);
  }

  return { plans: savedPlans };
}

function buildXhsSearchKeyword(industry: string, checklist?: string) {
  const checklistTerms = (checklist ?? "")
    .split(/[\n,，\s]+/)
    .map(term => term.trim())
    .filter(Boolean);

  return [industry.trim(), ...checklistTerms].join(" ").trim();
}

function splitKeywordTerms(keyword: string) {
  return keyword
    .split(/[\s,，、\n]+/)
    .map(term => term.trim().toLowerCase())
    .filter(Boolean);
}

function splitAuthorKeywords(value?: string) {
  return (value ?? "")
    .split(/[\n,，、\s]+/)
    .map(term => term.trim().replace(/^@+/, "").toLowerCase())
    .filter(Boolean);
}

function parseXhsProfileLinks(value?: string) {
  return (value ?? "")
    .split(/[\n\r\s,;]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => {
      try {
        const parsed = new URL(item);
        const segments = parsed.pathname.split("/").filter(Boolean);
        const profileIndex = segments.findIndex(
          segment => segment === "profile"
        );
        const userId =
          profileIndex >= 0 ? segments[profileIndex + 1] || "" : "";
        const xsecToken = parsed.searchParams.get("xsec_token") || "";
        if (!userId || !xsecToken) return null;
        return { url: item, userId, xsecToken };
      } catch {
        return null;
      }
    })
    .filter(
      (
        item
      ): item is {
        url: string;
        userId: string;
        xsecToken: string;
      } => Boolean(item)
    );
}

function normalizeAuthorValue(value?: string | null) {
  return String(value ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

function includesAnyKeyword(text: string, terms: string[]) {
  if (terms.length === 0) return true;
  const normalized = text.toLowerCase();
  return terms.some(term => normalized.includes(term));
}

function matchesAuthor(
  feed: XhsFeed,
  authorKeywords: string[],
  matchMode: "exact" | "contains" = "contains"
) {
  if (authorKeywords.length === 0) return true;

  const candidates = [
    feed.noteCard?.user?.nickname,
    feed.noteCard?.user?.nickName,
    feed.noteCard?.user?.userId,
  ]
    .filter(Boolean)
    .map(value => normalizeAuthorValue(value));

  const matcher =
    matchMode === "exact"
      ? (keyword: string, candidate: string) => candidate === keyword
      : (keyword: string, candidate: string) => candidate.includes(keyword);

  return authorKeywords.some(keyword =>
    candidates.some(candidate => matcher(keyword, candidate))
  );
}

function selectTopVideoFeeds(
  feeds: XhsFeed[],
  options?: {
    keywordTerms?: string[];
    authorKeywords?: string[];
    authorMatchMode?: "exact" | "contains";
    limit?: number;
  }
) {
  const keywordTerms = options?.keywordTerms ?? [];
  const authorKeywords = options?.authorKeywords ?? [];
  const authorMatchMode = options?.authorMatchMode ?? "contains";
  const limit = options?.limit ?? 3;

  return feeds
    .filter(
      feed => feed.noteCard?.type === "video" || Boolean(feed.noteCard?.video)
    )
    .filter(feed =>
      includesAnyKeyword(
        feed.noteCard?.displayTitle?.trim() ?? "",
        keywordTerms
      )
    )
    .filter(feed => matchesAuthor(feed, authorKeywords, authorMatchMode))
    .map(feed => {
      const likedCount = parseEngagementCount(
        feed.noteCard?.interactInfo?.likedCount
      );
      const commentCount = parseEngagementCount(
        feed.noteCard?.interactInfo?.commentCount
      );
      const sharedCount = parseEngagementCount(
        feed.noteCard?.interactInfo?.sharedCount
      );
      const score = likedCount * 3 + commentCount * 2 + sharedCount;

      return {
        feed,
        likedCount,
        commentCount,
        sharedCount,
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function buildAuthorCandidates(feed: XhsFeed) {
  return [
    feed.noteCard?.user?.nickname,
    feed.noteCard?.user?.nickName,
    feed.noteCard?.user?.userId,
  ]
    .filter(Boolean)
    .map(value => normalizeAuthorValue(value));
}

async function resolveTargetAuthors(params: {
  authorKeywords: string[];
  authorMatchMode: "exact" | "contains";
}) {
  const resolvedAuthors = new Map<
    string,
    {
      userId: string;
      xsecToken: string;
    }
  >();

  for (const authorKeyword of params.authorKeywords) {
    const result = await searchXhsFeeds(authorKeyword);
    for (const feed of result.feeds || []) {
      const userId = feed.noteCard?.user?.userId?.trim();
      const xsecToken = feed.xsecToken?.trim();
      if (!userId || !xsecToken) continue;

      const candidates = buildAuthorCandidates(feed);
      const matched = candidates.some(candidate =>
        params.authorMatchMode === "exact"
          ? candidate === authorKeyword
          : candidate.includes(authorKeyword)
      );
      if (!matched) continue;

      resolvedAuthors.set(userId, {
        userId,
        xsecToken,
      });
    }
  }

  return Array.from(resolvedAuthors.values());
}

const TOPIC_HUB_DOWNLOAD_CONCURRENCY = 2;
const TOPIC_HUB_ANALYSIS_CONCURRENCY = 2;
const TOPIC_HUB_PIPELINE_SCAN_INTERVAL_MS = 5_000;
const ANALYSIS_CONCURRENCY = TOPIC_HUB_ANALYSIS_CONCURRENCY;

const topicHubDownloadRunning = new Set<number>();
const topicHubAnalysisRunning = new Set<number>();
let topicHubPipelineRunning = false;
let topicHubPipelineStarted = false;
let topicHubDownloadQueue = Promise.resolve();
let analysisRunning = 0;
const analysisPendingQueue: Array<() => Promise<void>> = [];

function drainAnalysisQueue() {
  while (
    analysisRunning < TOPIC_HUB_ANALYSIS_CONCURRENCY &&
    analysisPendingQueue.length > 0
  ) {
    const next = analysisPendingQueue.shift()!;
    next();
  }
}

// 医美短视频爆款因子分析 prompt
const TOPIC_HUB_VIRAL_ANALYSIS_PROMPT = `角色定位

你是专业的医美短视频爆款因子智能分析引擎，专为医美、轻医美、皮肤管理、抗衰护肤类账号提供结构化、可复制、可直接用于脚本生成的爆款因子提取服务。所有输出必须标准化、标签化、可被下游脚本生成模块直接调用。

分析范围

仅针对医美/护肤/变美类爆款视频进行分析。
只提取可复制因子，不可复制内容（个人长相、特殊事件、偶然流量、隐私信息）一律忽略。

严格按照以下维度结构化分析

1. 基础信息

- 视频来源平台
- 视频时长
- 核心项目/主题
- 账号人设类型
- 核心数据表现（点赞/评论/收藏/完播特征）

2. 黄金3秒钩子因子

- 钩子类型：痛点直问 / 反常识颠覆 / 结果前置 / 禁忌警告 / 数字清单 / 场景代入
- 钩子原文与句式模板
- 核心关键词
- 可复制强度：高 / 中 / 低
- 合规风险：低 / 中 / 高

3. 痛点与情绪唤醒因子

- 核心痛点：衰老松弛 / 色斑暗沉 / 痘痘痘印 / 敏感泛红 / 毛孔粗大 / 熬夜垮脸等
- 情绪方向：焦虑唤醒 / 希望唤醒 / 安全感 / 避坑恐惧 / 性价比冲动
- 痛点强度与目标人群
- 可复制强度：高 / 中 / 低

4. 内容结构因子

- 完整脚本结构拆解：开头→共鸣→误区→科普→方案→效果→背书→互动
- 叙事节奏：快节奏高密度 / 舒缓 / 故事化
- 关键信息节点
- 可复制结构强度：高 / 中 / 低

5. 信任与人设因子

- 信任元素：医师资质 / 机构资质 / 案例对比 / 过程实拍 / 科普讲解
- 表达风格：专业严谨 / 闺蜜贴心 / 犀利直白 / 温柔安抚
- 可复用信任话术
- 可复制强度：高 / 中 / 低

6. 视觉呈现因子

- 画面风格：高清特写 / 前后对比 / 诊室实景 / 高级感 / 生活化
- 镜头语言、字幕特点、封面标题特征
- 可复制视觉强度：高 / 中 / 低

7. 话术与关键词因子

- 爆款高频关键词
- 可复用句式模板
- 口播节奏与语气特点
- 可复制话术强度：高 / 中 / 低

8. 互动与完播驱动因子

- 完播设计：短时长、信息密度、悬念、反转
- 互动引导：评论提问 / 收藏 / 转发 / 私信
- 可复制互动设计：有 / 无

9. 合规与转化因子

- 合规表达类型：科普 / 护理建议 / 误区纠正 / 案例展示
- 违规风险点识别：绝对化用词、疗效承诺、夸大宣传等
- 转化引导方式：私信领资料 / 预约面诊 / 方案咨询
- 可复制合规强度：高 / 中 / 低

输出要求

1. 结构清晰、条目化，禁止口语化、情绪化表达。
2. 每项必须标注可复制强度，便于AI筛选复用。
3. 最终必须输出一条【爆款核心可复制公式】，用于直接生成新脚本。
4. 最后给出【同人设迁移建议】，确保可落地到该医美账号自身风格。
5. 全程遵守医美广告合规要求，不鼓励、不提取违规内容。

爆款视频 = 强钩子 + 精准痛点 + 情绪唤醒 + 专业信任 + 视觉冲击 + 清晰结构 + 合规引导

你可以把每个维度再拆成可量化标签，让AI抓取爆款视频后自动打分、提取关键词、提取句式、提取结构。`;

const TOPIC_HUB_VIRAL_ANALYSIS_PROMPT_V2 = `你是专业的医美短视频爆款因子智能分析引擎，专为医美、轻医美、皮肤管理、抗衰护肤类账号提供结构化、可复制、可直接用于脚本生成的爆款因子提取服务。所有输出必须标准化、标签化、可被下游脚本生成模块直接调用。

分析范围

仅针对抖音、快手、小红书、视频号等平台的医美/护肤/变美类爆款视频进行分析。
只提取可复制因子，不可复制内容（个人长相、特殊事件、偶然流量、隐私信息）一律忽略。

严格按照以下维度结构化分析

1. 基础信息

- 视频来源平台
- 视频时长
- 核心项目/主题
- 账号人设类型
- 核心数据表现（点赞/评论/收藏/完播特征）

2. 黄金3秒钩子因子

- 钩子类型：痛点直问 / 反常识颠覆 / 结果前置 / 禁忌警告 / 数字清单 / 场景代入
- 钩子原文与句式模板
- 核心关键词
- 可复制强度：高 / 中 / 低
- 合规风险：低 / 中 / 高

3. 痛点与情绪唤醒因子

- 核心痛点：衰老松弛 / 色斑暗沉 / 痘痘痘印 / 敏感泛红 / 毛孔粗大 / 熬夜垮脸等
- 情绪方向：焦虑唤醒 / 希望唤醒 / 安全感 / 避坑恐惧 / 性价比冲动
- 痛点强度与目标人群
- 可复制强度：高 / 中 / 低

4. 内容结构因子

- 完整脚本结构拆解：开头共鸣误区科普方案效果背书互动
- 叙事节奏：快节奏高密度 / 舒缓 / 故事化
- 关键信息节点
- 可复制结构强度：高 / 中 / 低

5. 信任与人设因子

- 信任元素：医师资质 / 机构资质 / 案例对比 / 过程实拍 / 科普讲解
- 表达风格：专业严谨 / 闺蜜贴心 / 犀利直白 / 温柔安抚
- 可复用信任话术
- 可复制强度：高 / 中 / 低

6. 视觉呈现因子

- 画面风格：高清特写 / 前后对比 / 诊室实景 / 高级感 / 生活化
- 镜头语言、字幕特点、封面标题特征
- 可复制视觉强度：高 / 中 / 低

7. 话术与关键词因子

- 爆款高频关键词
- 可复用句式模板
- 口播节奏与语气特点
- 可复制话术强度：高 / 中 / 低

8. 互动与完播驱动因子

- 完播设计：短时长、信息密度、悬念、反转
- 互动引导：评论提问 / 收藏 / 转发 / 私信
- 可复制互动设计：有 / 无

9. 合规与转化因子

- 合规表达类型：科普 / 护理建议 / 误区纠正 / 案例展示
- 违规风险点识别：绝对化用词、疗效承诺、夸大宣传等
- 转化引导方式：私信领资料 / 预约面诊 / 方案咨询
- 可复制合规强度：高 / 中 / 低

输出要求

1. 结构清晰、条目化，禁止口语化、情绪化表达。
2. 每项必须标注可复制强度，便于 AI 筛选复用。
3. 最终必须输出一条【爆款核心可复制公式】，用于直接生成新脚本。
4. 最后给出【同人设迁移建议】，确保可落地到该医美账号自身风格。
5. 全程遵守医美广告合规要求，不鼓励、不提取违规内容。

爆款视频 = 强钩子 + 精准痛点 + 情绪唤醒 + 专业信任 + 视觉冲击 + 清晰结构 + 合规引导

你可以把每个维度再拆成可量化标签，让 AI 抓取爆款视频后自动打分、提取关键词、提取句式、提取结构。`;

function queueTopicHubVideoAnalysis(task: {
  itemId: number;
  projectId: number;
  filePath: string;
  tags: Record<string, unknown>;
}) {
  const run = async () => {
    analysisRunning++;
    console.info(
      `[TopicHub] analysis started for item ${task.itemId} (${analysisRunning}/${ANALYSIS_CONCURRENCY} slots)`
    );

    const analyzingTags = {
      ...task.tags,
      videoAnalysisStatus: "analyzing",
    };
    await updateTopicHubItemTags(GUEST_USER_ID, {
      id: task.itemId,
      tags: analyzingTags,
    });

    try {
      const result = await analyzeVideoWithArk({
        filePath: task.filePath,
        prompt: TOPIC_HUB_VIRAL_ANALYSIS_PROMPT_V2,
      });

      await updateTopicHubItemTags(GUEST_USER_ID, {
        id: task.itemId,
        tags: {
          ...analyzingTags,
          videoAnalysisStatus: "completed",
          videoAnalysisResult: result.text,
          videoAnalysisFileId: result.fileId,
        },
      });
      console.info(
        `[TopicHub] video analysis completed for item ${task.itemId}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await updateTopicHubItemTags(GUEST_USER_ID, {
        id: task.itemId,
        tags: {
          ...analyzingTags,
          videoAnalysisStatus: "failed",
          videoAnalysisError: message,
        },
      });
      console.warn("[TopicHub] video analysis failed", error);
    } finally {
      analysisRunning--;
      drainAnalysisQueue();
    }
  };

  if (analysisRunning < ANALYSIS_CONCURRENCY) {
    run();
  } else {
    analysisPendingQueue.push(run);
    console.info(
      `[TopicHub] analysis queued for item ${task.itemId} (pending: ${analysisPendingQueue.length})`
    );
  }
}

function queueTopicHubVideoDownload(task: {
  itemId: number;
  projectId: number;
  noteId: string;
  noteUrl: string;
  tags: Record<string, unknown>;
}) {
  topicHubDownloadQueue = topicHubDownloadQueue
    .then(async () => {
      const previousFailedAttempts = Number(
        task.tags.videoDownloadAttempts ?? 0
      );
      const previousStatus = String(task.tags.videoDownloadStatus ?? "");

      if (previousStatus === "failed" && previousFailedAttempts >= 3) {
        await updateTopicHubItemTags(GUEST_USER_ID, {
          id: task.itemId,
          tags: {
            ...task.tags,
            videoDownloadStatus: "skipped",
            videoDownloadError: "已达到最大重试次数，跳过下载",
          },
        });
        return;
      }

      try {
        const downloadResult = await downloadWithLux({
          url: task.noteUrl,
          noteId: task.noteId,
          projectId: task.projectId,
        });
        const updatedTags = {
          ...task.tags,
          videoDownloadPath: downloadResult.filePath,
          videoDownloadAttempts: downloadResult.attempts,
          videoDownloadStatus: downloadResult.success ? "success" : "failed",
          videoDownloadError: downloadResult.error,
        };
        await updateTopicHubItemTags(GUEST_USER_ID, {
          id: task.itemId,
          tags: updatedTags,
        });

        if (downloadResult.success && downloadResult.filePath) {
          queueTopicHubVideoAnalysis({
            itemId: task.itemId,
            projectId: task.projectId,
            filePath: downloadResult.filePath,
            tags: updatedTags,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await updateTopicHubItemTags(GUEST_USER_ID, {
          id: task.itemId,
          tags: {
            ...task.tags,
            videoDownloadAttempts: 3,
            videoDownloadStatus: "failed",
            videoDownloadError: message,
          },
        });
        console.warn("[XHS] background download video failed", error);
      }
    })
    .catch(error => {
      console.warn("[XHS] topic hub download queue failed", error);
    });
}

function getTopicHubQueueTimestamp(tags: Record<string, unknown>, key: string) {
  const value = tags[key];
  if (typeof value !== "string" || !value) return 0;

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

async function listTopicHubVideoItemsForPipeline() {
  const projects = await getProjects(GUEST_USER_ID);
  const itemGroups = await Promise.all(
    projects.map(project => getTopicHubItems(GUEST_USER_ID, project.id))
  );

  return itemGroups
    .flat()
    .filter(
      item => item.platform === "xiaohongshu" && item.type === "viral_post"
    );
}

async function recoverTopicHubVideoPipelineState() {
  const items = await listTopicHubVideoItemsForPipeline();
  let recoveredCount = 0;

  for (const item of items) {
    const tags = (item.tags ?? {}) as Record<string, unknown>;
    if (String(tags.videoAnalysisStatus || "") !== "analyzing") continue;

    await updateTopicHubItemTags(GUEST_USER_ID, {
      id: item.id,
      tags: {
        ...tags,
        videoAnalysisStatus: "pending",
        videoAnalysisQueuedAt:
          String(
            tags.videoAnalysisQueuedAt || tags.videoAnalysisStartedAt || ""
          ) || new Date().toISOString(),
        videoAnalysisStartedAt: undefined,
      },
    });
    recoveredCount += 1;
  }

  if (recoveredCount > 0) {
    console.info(
      `[TopicHub] recovered ${recoveredCount} video analysis tasks after restart`
    );
  }
}

async function runTopicHubDownloadTask(
  item: Awaited<ReturnType<typeof listTopicHubVideoItemsForPipeline>>[number]
) {
  topicHubDownloadRunning.add(item.id);

  const tags = (item.tags ?? {}) as Record<string, unknown>;
  const noteId = String(tags.noteId || "");
  const noteUrl = String(item.url || "");
  const previousFailedAttempts = Number(tags.videoDownloadAttempts ?? 0);
  const previousStatus = String(tags.videoDownloadStatus ?? "");

  try {
    if (!noteId || !noteUrl) {
      throw new Error("缺少视频链接信息，无法触发下载");
    }

    if (previousStatus === "failed" && previousFailedAttempts >= 3) {
      await updateTopicHubItemTags(GUEST_USER_ID, {
        id: item.id,
        tags: {
          ...tags,
          videoDownloadStatus: "skipped",
          videoDownloadError: "已达到最大重试次数，跳过下载",
          videoDownloadFinishedAt: new Date().toISOString(),
        },
      });
      return;
    }

    await updateTopicHubItemTags(GUEST_USER_ID, {
      id: item.id,
      tags: {
        ...tags,
        videoDownloadStatus: "pending",
        videoDownloadError: undefined,
        videoDownloadStartedAt: new Date().toISOString(),
      },
    });

    console.info(`[TopicHub] download started for item ${item.id}`);

    const downloadResult = await downloadWithLux({
      url: noteUrl,
      noteId,
      projectId: item.projectId,
    });

    const finishedAt = new Date().toISOString();
    const nextTags = {
      ...tags,
      videoDownloadPath: downloadResult.filePath,
      videoDownloadAttempts: downloadResult.attempts,
      videoDownloadStatus: downloadResult.success ? "success" : "failed",
      videoDownloadError: downloadResult.error,
      videoDownloadFinishedAt: finishedAt,
      videoAnalysisStatus: downloadResult.success ? "pending" : undefined,
      videoAnalysisError: undefined,
      videoAnalysisResult: undefined,
      videoAnalysisFileId: undefined,
      videoAnalysisQueuedAt: downloadResult.success ? finishedAt : undefined,
      videoAnalysisStartedAt: undefined,
      videoAnalysisFinishedAt: undefined,
    };
    await updateTopicHubItemTags(GUEST_USER_ID, {
      id: item.id,
      tags: nextTags,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateTopicHubItemTags(GUEST_USER_ID, {
      id: item.id,
      tags: {
        ...tags,
        videoDownloadAttempts: Math.max(previousFailedAttempts, 3),
        videoDownloadStatus: "failed",
        videoDownloadError: message,
        videoDownloadFinishedAt: new Date().toISOString(),
      },
    });
    console.warn("[TopicHub] background download video failed", error);
  } finally {
    topicHubDownloadRunning.delete(item.id);
    void pumpTopicHubVideoPipeline();
  }
}

async function runTopicHubAnalysisTask(
  item: Awaited<ReturnType<typeof listTopicHubVideoItemsForPipeline>>[number]
) {
  topicHubAnalysisRunning.add(item.id);

  const tags = (item.tags ?? {}) as Record<string, unknown>;
  const filePath = String(tags.videoDownloadPath || "");

  try {
    if (!filePath) {
      throw new Error("视频尚未下载完成");
    }

    const analyzingTags = {
      ...tags,
      videoAnalysisStatus: "analyzing",
      videoAnalysisError: undefined,
      videoAnalysisStartedAt: new Date().toISOString(),
    };
    await updateTopicHubItemTags(GUEST_USER_ID, {
      id: item.id,
      tags: analyzingTags,
    });

    console.info(`[TopicHub] analysis started for item ${item.id}`);

    const result = await analyzeVideoWithArk({
      filePath,
      prompt: TOPIC_HUB_VIRAL_ANALYSIS_PROMPT_V2,
    });

    await updateTopicHubItemTags(GUEST_USER_ID, {
      id: item.id,
      tags: {
        ...analyzingTags,
        videoAnalysisStatus: "completed",
        videoAnalysisResult: result.text,
        videoAnalysisFileId: result.fileId,
        videoAnalysisFinishedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateTopicHubItemTags(GUEST_USER_ID, {
      id: item.id,
      tags: {
        ...tags,
        videoAnalysisStatus: "failed",
        videoAnalysisError: message,
        videoAnalysisFinishedAt: new Date().toISOString(),
      },
    });
    console.warn("[TopicHub] video analysis failed", error);
  } finally {
    topicHubAnalysisRunning.delete(item.id);
    void pumpTopicHubVideoPipeline();
  }
}

async function pumpTopicHubVideoPipeline() {
  if (topicHubPipelineRunning) return;
  topicHubPipelineRunning = true;

  try {
    const items = await listTopicHubVideoItemsForPipeline();

    const downloadSlots =
      TOPIC_HUB_DOWNLOAD_CONCURRENCY - topicHubDownloadRunning.size;
    if (downloadSlots > 0) {
      const downloadCandidates = items
        .filter(item => {
          if (topicHubDownloadRunning.has(item.id)) return false;
          const tags = (item.tags ?? {}) as Record<string, unknown>;
          return (
            String(tags.videoDownloadStatus || "") === "pending" &&
            !String(tags.videoDownloadPath || "") &&
            Boolean(tags.noteId) &&
            Boolean(item.url)
          );
        })
        .sort((a, b) => {
          const aTags = (a.tags ?? {}) as Record<string, unknown>;
          const bTags = (b.tags ?? {}) as Record<string, unknown>;
          const aTs =
            getTopicHubQueueTimestamp(aTags, "videoDownloadQueuedAt") ||
            a.createdAt.getTime();
          const bTs =
            getTopicHubQueueTimestamp(bTags, "videoDownloadQueuedAt") ||
            b.createdAt.getTime();
          return aTs - bTs || a.id - b.id;
        })
        .slice(0, downloadSlots);

      for (const item of downloadCandidates) {
        void runTopicHubDownloadTask(item);
      }
    }

    const analysisSlots =
      TOPIC_HUB_ANALYSIS_CONCURRENCY - topicHubAnalysisRunning.size;
    if (analysisSlots > 0) {
      const analysisCandidates = items
        .filter(item => {
          if (topicHubAnalysisRunning.has(item.id)) return false;
          const tags = (item.tags ?? {}) as Record<string, unknown>;
          return (
            String(tags.videoAnalysisStatus || "") === "pending" &&
            Boolean(String(tags.videoDownloadPath || ""))
          );
        })
        .sort((a, b) => {
          const aTags = (a.tags ?? {}) as Record<string, unknown>;
          const bTags = (b.tags ?? {}) as Record<string, unknown>;
          const aTs =
            getTopicHubQueueTimestamp(aTags, "videoAnalysisQueuedAt") ||
            a.createdAt.getTime();
          const bTs =
            getTopicHubQueueTimestamp(bTags, "videoAnalysisQueuedAt") ||
            b.createdAt.getTime();
          return aTs - bTs || a.id - b.id;
        })
        .slice(0, analysisSlots);

      for (const item of analysisCandidates) {
        void runTopicHubAnalysisTask(item);
      }
    }
  } catch (error) {
    console.warn("[TopicHub] pipeline pump failed", error);
  } finally {
    topicHubPipelineRunning = false;
  }
}

export function ensureTopicHubVideoPipelineStarted() {
  if (topicHubPipelineStarted) return;

  topicHubPipelineStarted = true;
  void recoverTopicHubVideoPipelineState()
    .catch(error => {
      console.warn("[TopicHub] pipeline recovery failed", error);
    })
    .finally(() => {
      void pumpTopicHubVideoPipeline();
    });

  const timer = setInterval(() => {
    void pumpTopicHubVideoPipeline();
  }, TOPIC_HUB_PIPELINE_SCAN_INTERVAL_MS);

  if (typeof timer.unref === "function") {
    timer.unref();
  }
}

async function saveTopicHubVideoItem(params: {
  projectId: number;
  industry: string;
  checklist?: string;
  targetPlatform: "xiaohongshu" | "youtube" | "douyin";
  feed: XhsFeed;
  likedCount: number;
  commentCount: number;
  sharedCount: number;
  score: number;
  filters?: XhsSearchFilters;
  searchMode: "keyword" | "link";
  authorKeywords?: string[];
  sourceLabel: string;
}) {
  const noteId = params.feed.id;
  const xsecToken = params.feed.xsecToken;
  const coverUrl =
    params.feed.noteCard?.cover?.urlDefault ||
    params.feed.noteCard?.cover?.urlPre ||
    params.feed.noteCard?.cover?.url;

  let coverDownloadPath: string | undefined;
  try {
    coverDownloadPath = await downloadXhsCoverImage(noteId, coverUrl);
  } catch (error) {
    console.warn("[XHS] download cover failed", error);
  }

  const noteUrl = `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=${xsecToken}&xsec_source=pc_feed`;
  const existingItem = await findTopicHubItemByNoteId(
    GUEST_USER_ID,
    params.projectId,
    noteId
  );
  const existingTags =
    (existingItem?.tags as Record<string, unknown> | null | undefined) ?? {};

  const item = await createTopicHubItem(GUEST_USER_ID, {
    projectId: params.projectId,
    title: params.feed.noteCard?.displayTitle || "?????",
    content: `关键词：${params.industry}${params.checklist ? ` | 链接搜索：${params.checklist}` : ""}`,
    platform: "xiaohongshu",
    url: noteUrl,
    engagementScore: params.score,
    type: "viral_post",
    tags: {
      source: "xiaohongshu",
      sourceLabel: params.sourceLabel,
      searchMode: params.searchMode,
      targetPlatform: params.targetPlatform,
      noteId,
      xsecToken,
      coverUrl,
      authorName:
        params.feed.noteCard?.user?.nickname ||
        params.feed.noteCard?.user?.nickName ||
        "?????",
      authorAvatar: params.feed.noteCard?.user?.avatar,
      likedCount: params.likedCount,
      commentCount: params.commentCount,
      sharedCount: params.sharedCount,
      duration: params.feed.noteCard?.video?.capa?.duration,
      coverDownloadPath,
      videoDownloadPath: undefined,
      videoDownloadAttempts: Number(existingTags.videoDownloadAttempts ?? 0),
      videoDownloadStatus: "idle",
      videoDownloadError: undefined,
      videoDownloadQueuedAt: undefined,
      videoDownloadStartedAt: undefined,
      videoDownloadFinishedAt: undefined,
      videoAnalysisStatus: undefined,
      videoAnalysisError: undefined,
      videoAnalysisResult: undefined,
      videoAnalysisFileId: undefined,
      videoAnalysisQueuedAt: undefined,
      videoAnalysisStartedAt: undefined,
      videoAnalysisFinishedAt: undefined,
      filters: params.filters,
      authorKeywords: params.authorKeywords,
    },
  });

  return item;
}

async function downloadXhsCoverImage(noteId: string, coverUrl?: string) {
  if (!coverUrl) return undefined;

  const response = await fetch(coverUrl);
  if (!response.ok) {
    throw new Error(`下载封面失败: ${response.status} ${response.statusText}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const downloadDir = resolve(process.cwd(), ".data", "topic-hub-downloads");
  await mkdir(downloadDir, { recursive: true });

  let extension = "";
  try {
    const pathname = new URL(coverUrl).pathname;
    extension = extname(pathname);
  } catch {
    extension = "";
  }

  const filename = `${noteId}${extension || ".jpg"}`;
  const localPath = join(downloadDir, filename);
  await writeFile(localPath, bytes);
  return localPath;
}

function buildPositioningPrompt(input: {
  industry: string;
  track?: string;
  monetizationMethod?: string;
  targetAudience?: string;
  personaType?: string;
}) {
  return `你是一位专业的小红书账号定位顾问，请根据以下信息输出可直接执行的账号定位方案。

行业：${input.industry || "未提供"}
细分赛道：${input.track || "未提供"}
变现方式：${input.monetizationMethod || "未提供"}
目标用户描述：${input.targetAudience || "未提供"}
人设类型：${input.personaType || "未提供"}

请按以下结构输出，内容务必具体：
1. 账号定位一句话
2. 核心价值主张
3. 目标用户画像
4. 内容栏目设计（至少 4 个）
5. 人设表达建议
6. 差异化竞争策略
7. 变现路径规划
8. 前 10 条内容选题建议`;
}

function buildVideoPositioningPrompt(input: {
  videoUrl: string;
  industry?: string;
  track?: string;
  monetizationMethod?: string;
  targetAudience?: string;
  personaType?: string;
}) {
  const hasIndustry = !!input.industry;
  const hasTrack = !!input.track;
  const hasMonetization = !!input.monetizationMethod;
  const hasPersona = !!input.personaType;
  const hasAudience = !!input.targetAudience;

  const contextLines: string[] = [];
  if (hasIndustry) contextLines.push(`- 用户指定行业：${input.industry}`);
  if (hasTrack) contextLines.push(`- 用户指定细分赛道：${input.track}`);
  if (hasMonetization)
    contextLines.push(`- 用户指定变现方式：${input.monetizationMethod}`);
  if (hasPersona) contextLines.push(`- 用户指定人设类型：${input.personaType}`);
  if (hasAudience)
    contextLines.push(`- 用户指定目标用户：${input.targetAudience}`);

  const contextBlock =
    contextLines.length > 0
      ? `\n用户补充的上下文信息：\n${contextLines.join("\n")}\n`
      : "";

  return `你是一位专业的小红书账号定位顾问。请深度观看并理解这个视频，从以下五个核心维度进行定位分析。
${contextBlock}
请严格按以下五个维度输出分析，每个维度必须结合视频中的具体细节：

## 一、行业分析
- 视频属于什么行业？判断依据是什么（产品、场景、术语等）？
- 该行业在小红书的内容生态现状如何？竞争激烈程度？
- ${hasIndustry ? `与用户指定的「${input.industry}」行业是否吻合？差异点在哪？` : "推荐该视频最适合切入的行业方向"}

## 二、细分赛道分析
- 视频聚焦在哪个细分赛道？（如：行业中的具体品类、技术、场景）
- 该赛道的内容饱和度、用户需求热度如何？
- ${hasTrack ? `与用户指定的「${input.track}」赛道是否匹配？建议调整方向？` : "推荐最佳细分赛道，并说明为什么"}

## 三、变现方式分析
- 视频中透露了哪些变现信号？（如：产品植入、知识付费引导、私域引流等）
- 该内容形式最适合什么变现模式？
- ${hasMonetization ? `与用户指定的「${input.monetizationMethod}」变现方式的契合度如何？如何优化？` : "推荐最合适的变现路径，给出具体执行建议"}

## 四、人设类型分析
- 视频中的表达方式、语气、形象塑造属于什么人设类型？
- 该人设的优势和局限性是什么？
- ${hasPersona ? `与用户期望的「${input.personaType}」人设是否一致？如何调整？` : "推荐最适合的人设类型，说明如何打造"}

## 五、目标用户分析
- 视频的内容风格、话题、表达方式在吸引什么样的用户群体？
- 这些用户的核心痛点、消费能力、内容偏好是什么？
- ${hasAudience ? `与用户描述的目标用户「${input.targetAudience}」是否匹配？覆盖面差异？` : "画出最精准的目标用户画像（年龄、城市、兴趣、痛点）"}

## 综合定位结论
基于以上五个维度的分析，给出一句话定位结论和3条可立即执行的行动建议。

要求：使用中文，避免空话套话，所有结论必须结合视频中的具体画面、话术、产品等细节，不要给通用模板。`;
}

function extractXhsNoteId(videoUrl: string) {
  try {
    const parsed = new URL(videoUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const itemIndex = segments.findIndex(segment =>
      ["explore", "item"].includes(segment)
    );
    if (itemIndex >= 0 && segments[itemIndex + 1]) {
      return segments[itemIndex + 1];
    }

    const discoveryIndex = segments.findIndex(
      segment => segment === "discovery"
    );
    if (
      discoveryIndex >= 0 &&
      segments[discoveryIndex + 1] === "item" &&
      segments[discoveryIndex + 2]
    ) {
      return segments[discoveryIndex + 2];
    }

    const lastSegment = segments.at(-1);
    if (lastSegment) {
      return lastSegment.replace(/[^a-zA-Z0-9_-]/g, "") || undefined;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

async function runTextPositioningAnalysis(input: {
  industry: string;
  track?: string;
  monetizationMethod?: string;
  targetAudience?: string;
  personaType?: string;
}) {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "你是一位专业的小红书账号定位顾问。请使用中文输出，结构清晰、建议具体、强调可执行性。",
      },
      {
        role: "user",
        content: buildPositioningPrompt(input),
      },
    ],
  });

  return String(response.choices[0]?.message?.content || "");
}

function buildManualPositioningContent(input: {
  industry: string;
  track?: string;
  monetizationMethod?: string;
  targetAudience?: string;
  personaType?: string;
}) {
  return [
    "# 手动创建定位",
    "",
    "## 基础信息",
    `- 行业：${input.industry}`,
    `- 细分赛道：${input.track?.trim() || "未填写"}`,
    `- 变现方式：${input.monetizationMethod?.trim() || "未填写"}`,
    `- 人设类型：${input.personaType?.trim() || "未填写"}`,
    "",
    "## 目标用户描述",
    input.targetAudience?.trim() || "未填写",
  ].join("\n");
}

async function runVideoPositioningAnalysisInBackground(input: {
  positioningId: number;
  projectId: number;
  videoUrl: string;
  filePath: string;
  industry?: string;
  track?: string;
  monetizationMethod?: string;
  targetAudience?: string;
  personaType?: string;
}) {
  let currentFilePath = input.filePath;
  const updateStage = async (
    stage: string,
    details?: Record<string, unknown>,
    status: "analyzing" | "completed" | "failed" = "analyzing"
  ) => {
    console.info("[Positioning] video analysis stage", {
      positioningId: input.positioningId,
      stage,
      ...details,
    });

    await updatePositioning(GUEST_USER_ID, {
      id: input.positioningId,
      analysisResult: {
        mode: "video",
        provider: "ark",
        sourceUrl: input.videoUrl,
        filePath: input.filePath,
        stage,
        ...details,
      },
      status,
    });
  };

  try {
    if (!currentFilePath) {
      const noteId =
        extractXhsNoteId(input.videoUrl) ||
        `positioning-${Date.now().toString(36)}`;

      await updateStage("download.started", {
        projectId: input.projectId,
        noteId,
      });

      const downloadResult = await downloadWithLux({
        url: input.videoUrl,
        noteId,
        projectId: input.projectId,
      });

      if (!downloadResult.success || !downloadResult.filePath) {
        throw new Error(downloadResult.error || "视频下载失败");
      }

      currentFilePath = downloadResult.filePath;

      await updateStage("download.completed", {
        noteId,
        filePath: currentFilePath,
        attempts: downloadResult.attempts,
      });
    }

    await updateStage("task.started", {
      projectId: input.projectId,
      filePath: currentFilePath,
    });

    const result = await analyzeVideoWithArk({
      filePath: currentFilePath,
      prompt: buildVideoPositioningPrompt(input),
      onStageChange: (stage, details) => {
        void updateStage(stage, details);
      },
    });

    await updatePositioning(GUEST_USER_ID, {
      id: input.positioningId,
      positioningRecommendation: result.text,
      analysisResult: {
        mode: "video",
        provider: "ark",
        sourceUrl: input.videoUrl,
        filePath: currentFilePath,
        stage: "task.completed",
        fileId: result.fileId,
        raw: result.raw,
      },
      status: "completed",
    });
  } catch (error) {
    await updatePositioning(GUEST_USER_ID, {
      id: input.positioningId,
      analysisResult: {
        mode: "video",
        provider: "ark",
        sourceUrl: input.videoUrl,
        filePath: currentFilePath,
        stage: "task.failed",
        error: error instanceof Error ? error.message : String(error),
      },
      status: "failed",
    });
    console.warn("[Positioning] video analysis failed", error);
  }
}

function buildCompletedPositioningDocument(positioning: {
  industry?: string | null;
  track?: string | null;
  monetizationMethod?: string | null;
  targetAudience?: string | null;
  personaType?: string | null;
  positioningRecommendation?: string | null;
}) {
  return [
    `业务领域：${positioning.industry || "未填写"}`,
    `细分赛道：${positioning.track || "未填写"}`,
    `目标受众：${positioning.targetAudience || "未填写"}`,
    `账号人设：${positioning.personaType || "未填写"}`,
    `内容风格/品牌调性：${positioning.positioningRecommendation || "未填写"}`,
    `商业模式：${positioning.monetizationMethod || "未填写"}`,
  ].join("\n");
}

async function generateScriptForTopicPlan(
  projectId: number,
  topicPlanId: number
) {
  const [allTopicPlans, hubItems, allPositionings, allScripts] =
    await Promise.all([
      getTopicPlans(GUEST_USER_ID, projectId),
      getTopicHubItems(GUEST_USER_ID, projectId),
      getPositionings(GUEST_USER_ID, projectId),
      getScripts(GUEST_USER_ID, projectId),
    ]);

  const topicPlan = allTopicPlans.find(item => item.id === topicPlanId);
  if (!topicPlan) throw new Error("未找到选题策划结果");

  const hubItem = hubItems.find(item => item.id === topicPlan.hubItemId);
  if (!hubItem) throw new Error("未找到选题策划对应的源视频");

  const hubTags = (hubItem.tags ?? {}) as Record<string, unknown>;
  const viralAnalysis = String(hubTags.videoAnalysisResult || "").trim();
  if (!viralAnalysis) {
    throw new Error("该源视频尚无爆款因子分析结果");
  }

  const completedPositioning = allPositionings.find(
    item => item.status === "completed" && item.positioningRecommendation
  );
  if (!completedPositioning) {
    throw new Error("请先完成账号定位，再生成爆款复刻脚本");
  }

  const positioningDocument =
    buildCompletedPositioningDocument(completedPositioning);

  const prompt = `你是专业的To B短视频口播文案创作师，必须严格整合三大核心信息进行文案创作，缺一不可，三大核心信息为：

1.【AI账号定位官】输出的完整账号定位（含业务领域、目标受众、账号人设、内容风格、品牌调性）
2.【AI爆款因子分析师】输出的爆款因子分析报告（含爆款核心钩子、受众痛点、内容结构、流量逻辑、互动技巧、爆款规律）
3.【AI定制化选题策划师】生成的最终定制化选题

创作要求

1.严格遵循账号定位：文案语言风格、专业度、价值输出，完全匹配账号人设与受众认知，贴合To B企业营销场景
2.深度融入爆款因子：全程套用爆款分析报告中的核心钩子、结构、痛点、流量技巧，保障文案具备爆款潜力
3.紧扣定制选题：核心内容完全围绕最终定制选题展开，不偏离主题，精准传递选题核心信息
4.口播适配性：语言口语化、节奏流畅，适合短视频口播表达，开头3秒抓眼球，中间逻辑清晰，结尾引导互动/转化
5.专业合规：符合To B企业内容规范，无低俗、违规内容，凸显专业度与商业价值

输出要求

以完整正式文档形式输出，文案分段清晰、标注明确，可直接复制用于拍摄，无额外无关内容。

【AI账号定位官输出】
${positioningDocument}

【AI爆款因子分析师输出】
源视频标题：${hubItem.title}
${viralAnalysis}

【AI定制化选题策划师输出】
最终定制化选题：${topicPlan.title}
生成依据：${topicPlan.rationale || "无"}
`;

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "你是专业的To B短视频口播文案创作师。请使用中文输出完整脚本，不要输出与脚本无关的解释。",
      },
      { role: "user", content: prompt },
    ],
  });

  const scriptContent = String(
    response.choices[0]?.message?.content || ""
  ).trim();
  if (!scriptContent) {
    throw new Error("Ark 未返回脚本内容");
  }

  const existingScript = allScripts.find(
    item => item.topicPlanId === topicPlan.id
  );
  const nextTitle = `${topicPlan.title}`;

  if (existingScript) {
    await updateScript(GUEST_USER_ID, {
      id: existingScript.id,
      title: nextTitle,
      fullScript: scriptContent,
      status: "draft",
    });
    return { id: existingScript.id, script: scriptContent };
  }

  const createdId = await createScript(GUEST_USER_ID, {
    projectId,
    topicPlanId: topicPlan.id,
    hubItemId: hubItem.id,
    title: nextTitle,
    fullScript: scriptContent,
    platform: "xiaohongshu",
    status: "draft",
  });

  return { id: createdId, script: scriptContent };
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    status: publicProcedure.query(async (): Promise<XhsLoginStatus> => {
      try {
        return await getXhsLoginStatus();
      } catch {
        return { status: "unknown", is_logged_in: false, username: undefined };
      }
    }),
    me: publicProcedure.query(async (): Promise<XhsLoginStatus> => {
      try {
        return await getXhsLoginStatus();
      } catch {
        return { status: "unknown", is_logged_in: false, username: undefined };
      }
    }),
    qrcode: publicProcedure.query(async () => getXhsLoginQrcode()),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      try {
        await deleteXhsCookies();
      } catch (error) {
        console.warn("[XHS] delete cookies failed", error);
      }

      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Projects ──────────────────────────────────────────────────────────────
  projects: router({
    list: publicProcedure.query(() => getProjects(GUEST_USER_ID)),
    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getProjectById(GUEST_USER_ID, input.id)),
    create: publicProcedure
      .input(
        z.object({
          name: z.string().min(1),
          description: z.string().optional(),
          industry: z.string().optional(),
          platform: z.string().optional(),
        })
      )
      .mutation(({ input }) => createProject(GUEST_USER_ID, input)),
    update: publicProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          description: z.string().optional(),
          industry: z.string().optional(),
          platform: z.string().optional(),
          status: z.enum(["active", "archived"]).optional(),
        })
      )
      .mutation(({ input }) => updateProject(GUEST_USER_ID, input)),
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteProject(GUEST_USER_ID, input.id)),
  }),

  // ─── Positioning ───────────────────────────────────────────────────────────
  positioning: router({
    list: publicProcedure
      .input(z.object({ projectId: z.number() }))
      .query(({ input }) => getPositionings(GUEST_USER_ID, input.projectId)),
    create: publicProcedure
      .input(
        z.object({
          projectId: z.number(),
          industry: z.string().min(1),
          track: z.string().optional(),
          monetizationMethod: z.string().optional(),
          targetAudience: z.string().optional(),
          personaType: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await deletePositioningsByProject(GUEST_USER_ID, input.projectId);
        return createPositioning(GUEST_USER_ID, input);
      }),
    createAndAnalyze: publicProcedure
      .input(
        z.object({
          projectId: z.number(),
          industry: z.string().min(1),
          track: z.string().optional(),
          monetizationMethod: z.string().optional(),
          targetAudience: z.string().optional(),
          personaType: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await logUsage(GUEST_USER_ID, input.projectId, "positioning", "create");
        await deletePositioningsByProject(GUEST_USER_ID, input.projectId);

        const positioningId = await createPositioning(GUEST_USER_ID, {
          ...input,
          status: "completed",
        });

        const analysis = buildManualPositioningContent(input);

        await updatePositioning(GUEST_USER_ID, {
          id: positioningId,
          positioningRecommendation: analysis,
          analysisResult: {
            mode: "manual",
            provider: "manual",
            input,
          },
          status: "completed",
        });

        return { id: positioningId, analysis };
      }),
    downloadVideoForAnalysis: publicProcedure
      .input(
        z.object({
          projectId: z.number(),
          videoUrl: z.string().url(),
        })
      )
      .mutation(async ({ input }) => {
        await logUsage(
          GUEST_USER_ID,
          input.projectId,
          "positioning",
          "downloadVideo"
        );

        const noteId =
          extractXhsNoteId(input.videoUrl) ||
          `positioning-${Date.now().toString(36)}`;
        const downloadResult = await downloadWithLux({
          url: input.videoUrl,
          noteId,
          projectId: input.projectId,
        });

        if (!downloadResult.success || !downloadResult.filePath) {
          throw new Error(downloadResult.error || "视频下载失败");
        }

        return {
          noteId,
          filePath: downloadResult.filePath,
          attempts: downloadResult.attempts,
        };
      }),
    analyzeVideo: publicProcedure
      .input(
        z.object({
          projectId: z.number(),
          videoUrl: z.string().url(),
          filePath: z.string().min(1),
          industry: z.string().optional(),
          track: z.string().optional(),
          monetizationMethod: z.string().optional(),
          targetAudience: z.string().optional(),
          personaType: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await logUsage(
          GUEST_USER_ID,
          input.projectId,
          "positioning",
          "analyzeVideo"
        );
        await deletePositioningsByProject(GUEST_USER_ID, input.projectId);

        const positioningId = await createPositioning(GUEST_USER_ID, {
          projectId: input.projectId,
          industry: input.industry || "视频定位分析",
          track: input.track || "小红书视频链接",
          monetizationMethod: input.monetizationMethod,
          targetAudience: input.targetAudience,
          personaType: input.personaType,
          status: "analyzing",
        });

        await updatePositioning(GUEST_USER_ID, {
          id: positioningId,
          analysisResult: {
            mode: "video",
            provider: "ark",
            sourceUrl: input.videoUrl,
            filePath: input.filePath,
            stage: "queued",
          },
          status: "analyzing",
        });

        void runVideoPositioningAnalysisInBackground({
          positioningId,
          ...input,
        });

        return { id: positioningId, status: "analyzing" as const };
      }),
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deletePositioning(GUEST_USER_ID, input.id)),
    analyze: publicProcedure
      .input(
        z.object({
          positioningId: z.number(),
          industry: z.string(),
          track: z.string(),
          monetizationMethod: z.string(),
          targetAudience: z.string(),
          personaType: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        await logUsage(
          GUEST_USER_ID,
          input.positioningId,
          "positioning",
          "analyze"
        );
        const prompt = `你是一位顶级的社交媒体账号策划师，专注于帮助创作者打造爆款账号。

请根据以下信息，分析该账号的定位策略：

行业：${input.industry}
赛道：${input.track}
变现方式：${input.monetizationMethod}
目标用户：${input.targetAudience}
人设类型：${input.personaType}

请从以下维度进行深度分析并给出具体建议：

1. **账号定位建议**：明确的账号定位方向，包括核心价值主张
2. **目标用户画像**：详细的用户痛点、痒点、爽点分析
3. **内容策略**：推荐的内容形式、风格和频率
4. **人设设计**：具体的人设特征、语言风格、形象塑造建议
5. **爆款账号参考**：列举3-5个同赛道成功账号的关键特质
6. **差异化竞争策略**：如何在同赛道中脱颖而出
7. **变现路径规划**：基于选定变现方式的具体执行建议

请给出专业、具体、可执行的建议，避免泛泛而谈。`;

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content:
                "你是一位专业的社交媒体账号策划师，擅长分析爆款账号规律，帮助创作者精准定位账号方向。请用中文回复，格式清晰，内容专业具体。",
            },
            { role: "user", content: prompt },
          ],
        });

        const analysisResult = String(
          response.choices[0]?.message?.content || ""
        );
        await updatePositioning(GUEST_USER_ID, {
          id: input.positioningId,
          positioningRecommendation: analysisResult,
          status: "completed",
        });

        return { analysis: analysisResult };
      }),
  }),

  // ─── Topic Hub ─────────────────────────────────────────────────────────────
  topicHub: router({
    list: publicProcedure
      .input(z.object({ projectId: z.number() }))
      .query(({ input }) => getTopicHubItems(GUEST_USER_ID, input.projectId)),
    addManual: publicProcedure
      .input(
        z.object({
          projectId: z.number(),
          title: z.string().min(1),
          content: z.string().optional(),
          platform: z.string().optional(),
          url: z.string().optional(),
          type: z.enum(["trending", "viral_post", "high_conversion", "manual"]),
        })
      )
      .mutation(({ input }) => createTopicHubItem(GUEST_USER_ID, input)),
    crawlTrending: publicProcedure
      .input(
        z.object({
          projectId: z.number(),
          industry: z.string(),
          platform: z.string().optional(),
          checklist: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await logUsage(
          GUEST_USER_ID,
          input.projectId,
          "topicHub",
          "crawlTrending"
        );
        const prompt = `你是一位专业的社交媒体内容研究员。

请为以下行业生成当前最热门的内容趋势和话题：

行业：${input.industry}
平台：${input.platform || "全平台"}
${input.checklist ? `关键词清单：${input.checklist}` : ""}

请生成10个当前最热门、最有爆款潜力的话题/趋势，每个话题包含：
1. 话题标题（吸引眼球）
2. 话题描述（为什么热门，用户关注点）
3. 热度评分（1-100）
4. 适合的内容形式（视频/图文/直播等）

以JSON格式返回，格式如下：
{
  "topics": [
    {
      "title": "话题标题",
      "content": "话题描述和热门原因",
      "engagementScore": 85,
      "contentFormat": "短视频",
      "platform": "${input.platform || "全平台"}"
    }
  ]
}`;

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content:
                "你是社交媒体内容趋势分析专家，熟悉各平台热点规律。请严格按JSON格式返回数据。",
            },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
        });

        const content = String(response.choices[0]?.message?.content || "{}");
        let parsed: {
          topics?: Array<{
            title: string;
            content: string;
            engagementScore: number;
            contentFormat: string;
            platform: string;
          }>;
        } = {};
        try {
          parsed = JSON.parse(content);
        } catch {
          parsed = { topics: [] };
        }

        const items = [];
        for (const topic of parsed.topics || []) {
          const item = await createTopicHubItem(GUEST_USER_ID, {
            projectId: input.projectId,
            title: topic.title,
            content: topic.content,
            platform: topic.platform,
            engagementScore: topic.engagementScore,
            type: "trending",
          });
          items.push(item);
        }
        return { items, count: items.length };
      }),
    searchXiaohongshu: publicProcedure
      .input(
        z.object({
          projectId: z.number(),
          industry: z.string().min(1),
          mode: z.enum(["keyword", "mine", "authors"]).default("keyword"),
          targetPlatform: z
            .enum(["xiaohongshu", "youtube", "douyin"])
            .default("xiaohongshu"),
          checklist: z.string().optional(),
          bloggerAccounts: z.string().optional(),
          authorMatchMode: z.enum(["exact", "contains"]).default("exact"),
          filters: z
            .object({
              sort_by: z.string().optional(),
              note_type: z.string().optional(),
              publish_time: z.string().optional(),
              search_type: z.string().optional(),
              location: z.string().optional(),
            })
            .optional(),
        })
      )
      .mutation(async ({ input }) => {
        await logUsage(
          GUEST_USER_ID,
          input.projectId,
          "topicHub",
          "searchXiaohongshu"
        );

        const keyword = buildXhsSearchKeyword(input.industry, input.checklist);
        const filters: XhsSearchFilters | undefined = input.filters
          ? {
              sort_by: input.filters.sort_by,
              note_type: input.filters.note_type,
              publish_time: input.filters.publish_time,
              search_scope: input.filters.search_type,
              location: input.filters.location,
            }
          : undefined;
        const result = await searchXhsFeeds(keyword, filters);

        const topVideoFeeds = (result.feeds || [])
          .map(feed => {
            const likedCount = parseEngagementCount(
              feed.noteCard?.interactInfo?.likedCount
            );
            const commentCount = parseEngagementCount(
              feed.noteCard?.interactInfo?.commentCount
            );
            const sharedCount = parseEngagementCount(
              feed.noteCard?.interactInfo?.sharedCount
            );
            const score = likedCount * 3 + commentCount * 2 + sharedCount;

            return {
              feed,
              likedCount,
              commentCount,
              sharedCount,
              score,
            };
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);

        const items = [];
        for (const item of topVideoFeeds) {
          const feed = item.feed;
          const noteId = feed.id;
          const xsecToken = feed.xsecToken;
          const coverUrl =
            feed.noteCard?.cover?.urlDefault ||
            feed.noteCard?.cover?.urlPre ||
            feed.noteCard?.cover?.url;
          let coverDownloadPath: string | undefined;
          try {
            coverDownloadPath = await downloadXhsCoverImage(noteId, coverUrl);
          } catch (error) {
            console.warn("[XHS] download cover failed", error);
          }

          const noteUrl = `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=${xsecToken}&xsec_source=pc_feed`;
          const saved = await createTopicHubItem(GUEST_USER_ID, {
            projectId: input.projectId,
            title: feed.noteCard?.displayTitle || "小红书视频",
            content: `行业关键词：${input.industry}${input.checklist ? ` | checklist：${input.checklist}` : ""}`,
            platform: "xiaohongshu",
            url: noteUrl,
            engagementScore: item.score,
            type: "viral_post",
            tags: {
              source: "xiaohongshu",
              targetPlatform: input.targetPlatform,
              noteId,
              xsecToken,
              coverUrl,
              authorName:
                feed.noteCard?.user?.nickname ||
                feed.noteCard?.user?.nickName ||
                "小红书用户",
              authorAvatar: feed.noteCard?.user?.avatar,
              likedCount: item.likedCount,
              commentCount: item.commentCount,
              sharedCount: item.sharedCount,
              duration: feed.noteCard?.video?.capa?.duration,
              coverDownloadPath,
              filters,
            },
          });
          items.push(saved);
        }

        return {
          items,
          count: items.length,
          keyword,
        };
      }),
    searchXiaohongshuMulti: publicProcedure
      .input(
        z.object({
          projectId: z.number(),
          industry: z.string().optional(),
          targetPlatform: z
            .enum(["xiaohongshu", "youtube", "douyin"])
            .default("xiaohongshu"),
          checklist: z.string().optional(),
          filters: z
            .object({
              sort_by: z.string().optional(),
              note_type: z.string().optional(),
              publish_time: z.string().optional(),
              search_type: z.string().optional(),
              location: z.string().optional(),
            })
            .optional(),
        })
      )
      .mutation(async ({ input }) => {
        await logUsage(
          GUEST_USER_ID,
          input.projectId,
          "topicHub",
          "searchXiaohongshuMulti"
        );

        await deleteTopicHubItemsByProject(GUEST_USER_ID, input.projectId);

        const keyword = (input.industry ?? "").trim();
        const profileLinks = parseXhsProfileLinks(input.checklist);
        const keywordTerms = splitKeywordTerms(keyword);
        const filters: XhsSearchFilters | undefined = input.filters
          ? {
              sort_by: input.filters.sort_by,
              note_type: input.filters.note_type,
              publish_time: input.filters.publish_time,
              search_scope: input.filters.search_type,
              location: input.filters.location,
            }
          : undefined;

        if (!keyword && profileLinks.length === 0) {
          throw new Error(
            "\u8bf7\u81f3\u5c11\u8f93\u5165\u5173\u952e\u8bcd\u641c\u7d22\u6216\u94fe\u63a5\u641c\u7d22"
          );
        }

        const keywordLimit = keyword && profileLinks.length > 0 ? 10 : 15;
        const linkLimit = keyword && profileLinks.length > 0 ? 5 : 15;

        const collectedItems: Array<{
          feed: XhsFeed;
          likedCount: number;
          commentCount: number;
          sharedCount: number;
          score: number;
          searchMode: "keyword" | "link";
          sourceLabel: string;
        }> = [];

        if (keyword) {
          const result = await searchXhsFeeds(keyword, filters);
          let keywordFeeds = selectTopVideoFeeds(result.feeds || [], {
            keywordTerms,
            limit: keywordLimit,
          });
          if (keywordFeeds.length === 0 && filters) {
            const fallbackResult = await searchXhsFeeds(keyword);
            keywordFeeds = selectTopVideoFeeds(fallbackResult.feeds || [], {
              keywordTerms,
              limit: keywordLimit,
            });
          }
          collectedItems.push(
            ...keywordFeeds.map(item => ({
              ...item,
              searchMode: "keyword" as const,
              sourceLabel: "\u5173\u952e\u8bcd\u641c\u7d22",
            }))
          );
        }

        if (profileLinks.length > 0) {
          const authorProfiles = await Promise.all(
            profileLinks.map(link =>
              getXhsUserProfile({
                user_id: link.userId,
                xsec_token: link.xsecToken,
              })
            )
          );
          const authorFeeds = authorProfiles.flatMap(
            profile => profile.feeds || []
          );
          const linkedFeeds = selectTopVideoFeeds(authorFeeds, {
            keywordTerms,
            limit: linkLimit,
          });
          collectedItems.push(
            ...linkedFeeds.map(item => ({
              ...item,
              searchMode: "link" as const,
              sourceLabel: "\u94fe\u63a5\u641c\u7d22",
            }))
          );
        }

        const uniqueItems: typeof collectedItems = [];
        const seenFeedIds = new Set<string>();
        for (const item of collectedItems) {
          if (seenFeedIds.has(item.feed.id)) continue;
          seenFeedIds.add(item.feed.id);
          uniqueItems.push(item);
          if (uniqueItems.length >= 15) break;
        }

        if (uniqueItems.length === 0) {
          throw new Error(
            "\u672a\u627e\u5230\u7b26\u5408\u6761\u4ef6\u7684\u89c6\u9891\u5185\u5bb9"
          );
        }

        const items = [];
        for (const item of uniqueItems) {
          const saved = await saveTopicHubVideoItem({
            projectId: input.projectId,
            industry: keyword,
            checklist: input.checklist,
            targetPlatform: input.targetPlatform,
            feed: item.feed,
            likedCount: item.likedCount,
            commentCount: item.commentCount,
            sharedCount: item.sharedCount,
            score: item.score,
            filters,
            searchMode: item.searchMode,
            sourceLabel: item.sourceLabel,
          });
          items.push(saved);
        }

        return {
          items,
          count: items.length,
          keyword,
          mode:
            profileLinks.length > 0 && keyword
              ? "mixed"
              : keyword
                ? "keyword"
                : "link",
        };
      }),
    crawlViral: publicProcedure
      .input(
        z.object({
          projectId: z.number(),
          industry: z.string(),
          platform: z.string().optional(),
          timeRange: z.enum(["week", "month", "quarter"]).optional(),
        })
      )
      .mutation(async ({ input }) => {
        await logUsage(
          GUEST_USER_ID,
          input.projectId,
          "topicHub",
          "crawlViral"
        );
        const timeLabel =
          input.timeRange === "week"
            ? "近一周"
            : input.timeRange === "month"
              ? "近一个月"
              : "近三个月";
        const prompt = `请分析${input.industry}行业在${input.platform || "各主流平台"}${timeLabel}内的爆款帖文特征，并模拟生成10个具有代表性的爆款内容案例。

每个案例包含：
1. 标题（爆款标题风格）
2. 内容摘要（核心内容和爆款原因）
3. 互动数据估算（点赞/评论/转发）
4. 爆款因子分析

以JSON格式返回：
{
  "posts": [
    {
      "title": "爆款标题",
      "content": "内容摘要和爆款原因分析",
      "engagementScore": 92,
      "platform": "平台名称"
    }
  ]
}`;

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content:
                "你是社交媒体爆款内容分析专家。请严格按JSON格式返回数据。",
            },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
        });

        const content = String(response.choices[0]?.message?.content || "{}");
        let parsed: {
          posts?: Array<{
            title: string;
            content: string;
            engagementScore: number;
            platform: string;
          }>;
        } = {};
        try {
          parsed = JSON.parse(content);
        } catch {
          parsed = { posts: [] };
        }

        const items = [];
        for (const post of parsed.posts || []) {
          const item = await createTopicHubItem(GUEST_USER_ID, {
            projectId: input.projectId,
            title: post.title,
            content: post.content,
            platform: post.platform,
            engagementScore: post.engagementScore,
            type: "viral_post",
          });
          items.push(item);
        }
        return { items, count: items.length };
      }),
    analyzeVideo: publicProcedure
      .input(z.object({ id: z.number(), projectId: z.number() }))
      .mutation(async ({ input }) => {
        const items = await getTopicHubItems(GUEST_USER_ID, input.projectId);
        const item = items.find(i => i.id === input.id);
        if (!item) throw new Error("未找到该条目");

        const tags = (item.tags ?? {}) as Record<string, unknown>;
        const filePath = String(tags.videoDownloadPath || "");
        if (!filePath) throw new Error("视频尚未下载完成");

        await updateTopicHubItemTags(GUEST_USER_ID, {
          id: item.id,
          tags: {
            ...tags,
            videoAnalysisStatus: "pending",
            videoAnalysisError: undefined,
            videoAnalysisResult: undefined,
            videoAnalysisFileId: undefined,
            videoAnalysisQueuedAt: new Date().toISOString(),
            videoAnalysisStartedAt: undefined,
            videoAnalysisFinishedAt: undefined,
          },
        });
        void pumpTopicHubVideoPipeline();

        return { status: "analysis_queued" as const };
      }),
    requestVideoAnalysis: publicProcedure
      .input(z.object({ id: z.number(), projectId: z.number() }))
      .mutation(async ({ input }) => {
        const items = await getTopicHubItems(GUEST_USER_ID, input.projectId);
        const item = items.find(i => i.id === input.id);
        if (!item) throw new Error("未找到该条目");

        const tags = (item.tags ?? {}) as Record<string, unknown>;
        const filePath = String(tags.videoDownloadPath || "");
        const noteId = String(tags.noteId || "");
        const noteUrl = String(item.url || "");
        const analysisStatus = String(tags.videoAnalysisStatus || "");
        const downloadStatus = String(tags.videoDownloadStatus || "");

        if (downloadStatus === "pending") {
          return { status: "download_queued" as const };
        }

        if (analysisStatus === "pending" || analysisStatus === "analyzing") {
          return {
            status:
              analysisStatus === "analyzing"
                ? ("analysis_running" as const)
                : ("analysis_queued" as const),
          };
        }

        if (!filePath && (!noteId || !noteUrl)) {
          throw new Error("缺少视频链接信息，无法触发下载分析");
        }

        const nextTags = {
          ...tags,
          videoDownloadStatus: filePath ? "success" : "pending",
          videoDownloadAttempts: filePath
            ? Number(tags.videoDownloadAttempts ?? 0)
            : downloadStatus === "failed"
              ? Number(tags.videoDownloadAttempts ?? 0)
              : 0,
          videoDownloadError: undefined,
          videoDownloadQueuedAt: filePath
            ? tags.videoDownloadQueuedAt
            : new Date().toISOString(),
          videoDownloadStartedAt: filePath
            ? tags.videoDownloadStartedAt
            : undefined,
          videoDownloadFinishedAt: filePath
            ? tags.videoDownloadFinishedAt
            : undefined,
          videoAnalysisStatus: filePath ? "pending" : undefined,
          videoAnalysisError: undefined,
          videoAnalysisResult: undefined,
          videoAnalysisFileId: undefined,
          videoAnalysisQueuedAt: filePath
            ? new Date().toISOString()
            : undefined,
          videoAnalysisStartedAt: undefined,
          videoAnalysisFinishedAt: undefined,
        };

        await updateTopicHubItemTags(GUEST_USER_ID, {
          id: item.id,
          tags: nextTags,
        });

        if (filePath) {
          void pumpTopicHubVideoPipeline();
          return { status: "analysis_queued" as const };
        }

        void pumpTopicHubVideoPipeline();

        return { status: "download_queued" as const };
      }),
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteTopicHubItem(GUEST_USER_ID, input.id)),

    // ── Real Data Source: TikTok Search ──────────────────────────────────────
    crawlTikTok: publicProcedure
      .input(
        z.object({
          projectId: z.number(),
          keyword: z.string().min(1),
        })
      )
      .mutation(async ({ input }) => {
        await logUsage(
          GUEST_USER_ID,
          input.projectId,
          "topicHub",
          "crawlTikTok"
        );
        let rawData: unknown;
        try {
          rawData = await callDataApi("Tiktok/search_tiktok_video_general", {
            query: { keyword: input.keyword },
          });
        } catch {
          throw new Error("TikTok API调用失败，请稍后重试");
        }

        const data = rawData as {
          data?: Array<{
            aweme_id?: string;
            desc?: string;
            author?: { nickname?: string };
            statistics?: {
              digg_count?: number;
              comment_count?: number;
              share_count?: number;
              play_count?: number;
            };
          }>;
        };
        const videos = data?.data || [];
        const items = [];
        for (const v of videos.slice(0, 10)) {
          const likes = v.statistics?.digg_count || 0;
          const plays = v.statistics?.play_count || 0;
          const score = Math.min(
            100,
            Math.round(
              (likes / Math.max(plays, 1)) * 100 * 10 +
                Math.log10(Math.max(plays, 1)) * 5
            )
          );
          const item = await createTopicHubItem(GUEST_USER_ID, {
            projectId: input.projectId,
            title: v.desc?.substring(0, 200) || "TikTok视频",
            content: `作者：${v.author?.nickname || "未知"} | 点赞：${likes.toLocaleString()} | 播放：${plays.toLocaleString()} | 评论：${(v.statistics?.comment_count || 0).toLocaleString()}`,
            platform: "TikTok",
            engagementScore: score,
            type: "viral_post",
          });
          items.push(item);
        }
        return { items, count: items.length, source: "TikTok" };
      }),

    // ── Real Data Source: YouTube Search ─────────────────────────────────────
    crawlYouTube: publicProcedure
      .input(
        z.object({
          projectId: z.number(),
          keyword: z.string().min(1),
          language: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await logUsage(
          GUEST_USER_ID,
          input.projectId,
          "topicHub",
          "crawlYouTube"
        );
        let rawData: unknown;
        try {
          rawData = await callDataApi("Youtube/search", {
            query: {
              q: input.keyword,
              hl: input.language || "zh-CN",
              gl: "CN",
            },
          });
        } catch {
          throw new Error("YouTube API调用失败，请稍后重试");
        }

        const data = rawData as {
          contents?: Array<{
            type?: string;
            video?: {
              title?: string;
              videoId?: string;
              channelTitle?: string;
              viewCountText?: string;
              publishedTimeText?: string;
              descriptionSnippet?: string;
            };
          }>;
        };
        const contents = data?.contents || [];
        const items = [];
        for (const c of contents.slice(0, 10)) {
          if (c.type !== "video" || !c.video) continue;
          const v = c.video;
          const item = await createTopicHubItem(GUEST_USER_ID, {
            projectId: input.projectId,
            title: v.title || "YouTube视频",
            content: `频道：${v.channelTitle || "未知"} | 播放量：${v.viewCountText || "N/A"} | 发布：${v.publishedTimeText || "N/A"} | ${v.descriptionSnippet?.substring(0, 100) || ""}`,
            platform: "YouTube",
            url: v.videoId
              ? `https://www.youtube.com/watch?v=${v.videoId}`
              : undefined,
            engagementScore: 75,
            type: "viral_post",
          });
          items.push(item);
        }
        return { items, count: items.length, source: "YouTube" };
      }),

    // ── Real Data Source: Account Popular Posts ───────────────────────────────
    crawlAccountPosts: publicProcedure
      .input(
        z.object({
          projectId: z.number(),
          accountHandle: z.string().min(1),
          platform: z.enum(["tiktok", "youtube"]),
        })
      )
      .mutation(async ({ input }) => {
        await logUsage(
          GUEST_USER_ID,
          input.projectId,
          "topicHub",
          "crawlAccountPosts"
        );
        const items = [];

        if (input.platform === "tiktok") {
          let userRaw: unknown;
          try {
            userRaw = await callDataApi("Tiktok/get_user_info", {
              query: { uniqueId: input.accountHandle.replace("@", "") },
            });
          } catch {
            throw new Error("TikTok用户信息获取失败");
          }
          const userData = userRaw as {
            userInfo?: {
              user?: { secUid?: string; nickname?: string; signature?: string };
            };
          };
          const secUid = userData?.userInfo?.user?.secUid;
          if (!secUid) throw new Error("未找到该TikTok账号，请检查用户名");

          let postsRaw: unknown;
          try {
            postsRaw = await callDataApi("Tiktok/get_user_popular_posts", {
              query: { secUid, count: "10", cursor: "0" },
            });
          } catch {
            throw new Error("TikTok热帖获取失败");
          }
          const postsData = postsRaw as {
            data?: {
              itemList?: Array<{
                id?: string;
                desc?: string;
                stats?: {
                  playCount?: number;
                  diggCount?: number;
                  commentCount?: number;
                };
              }>;
            };
          };
          const posts = postsData?.data?.itemList || [];
          for (const p of posts.slice(0, 10)) {
            const item = await createTopicHubItem(GUEST_USER_ID, {
              projectId: input.projectId,
              title: p.desc?.substring(0, 200) || "TikTok热帖",
              content: `播放：${(p.stats?.playCount || 0).toLocaleString()} | 点赞：${(p.stats?.diggCount || 0).toLocaleString()} | 评论：${(p.stats?.commentCount || 0).toLocaleString()}`,
              platform: "TikTok",
              engagementScore: Math.min(
                100,
                Math.round(
                  Math.log10(Math.max(p.stats?.playCount || 1, 1)) * 10
                )
              ),
              type: "high_conversion",
            });
            items.push(item);
          }
        } else {
          let channelRaw: unknown;
          try {
            channelRaw = await callDataApi("Youtube/get_channel_videos", {
              query: {
                id: input.accountHandle,
                filter: "videos_latest",
                hl: "zh-CN",
                gl: "CN",
              },
            });
          } catch {
            throw new Error("YouTube频道视频获取失败");
          }
          const channelData = channelRaw as {
            contents?: Array<{
              type?: string;
              video?: {
                title?: string;
                videoId?: string;
                stats?: { views?: number };
                publishedTimeText?: string;
              };
            }>;
          };
          const contents = channelData?.contents || [];
          for (const c of contents.slice(0, 10)) {
            if (c.type !== "video" || !c.video) continue;
            const v = c.video;
            const item = await createTopicHubItem(GUEST_USER_ID, {
              projectId: input.projectId,
              title: v.title || "YouTube视频",
              content: `播放量：${(v.stats?.views || 0).toLocaleString()} | 发布：${v.publishedTimeText || "N/A"}`,
              platform: "YouTube",
              url: v.videoId
                ? `https://www.youtube.com/watch?v=${v.videoId}`
                : undefined,
              engagementScore: Math.min(
                100,
                Math.round(Math.log10(Math.max(v.stats?.views || 1, 1)) * 10)
              ),
              type: "high_conversion",
            });
            items.push(item);
          }
        }
        return { items, count: items.length, source: input.platform };
      }),
  }),

  // ─── Topics ────────────────────────────────────────────────────────────────
  topics: router({
    list: publicProcedure
      .input(z.object({ projectId: z.number() }))
      .query(({ input }) => getTopics(GUEST_USER_ID, input.projectId)),
    relatedVideos: publicProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input }) => {
        const [positionings, hubItems] = await Promise.all([
          getPositionings(GUEST_USER_ID, input.projectId),
          getTopicHubItems(GUEST_USER_ID, input.projectId),
        ]);

        const completedPositioning = positionings.find(
          item => item.status === "completed" && item.positioningRecommendation
        );
        if (!completedPositioning?.positioningRecommendation) {
          return [];
        }

        const candidateVideos = hubItems
          .filter(item => item.platform === "xiaohongshu")
          .map(item => {
            const tags = (item.tags ?? {}) as Record<string, unknown>;
            return {
              id: item.id,
              title: item.title,
              authorName: String(tags.authorName || ""),
              likedCount: Number(tags.likedCount || 0),
            };
          });

        if (candidateVideos.length === 0) {
          return [];
        }

        const prompt = `你是医美短视频选题分析助手。请根据“账号定位内容”，判断下面哪些视频标题与该账号定位高度相关。

账号定位内容：
${completedPositioning.positioningRecommendation}

候选视频标题列表：
${candidateVideos
  .map(
    item =>
      `- id=${item.id}｜标题=${item.title}｜作者=${item.authorName || "未知"}｜点赞=${item.likedCount}`
  )
  .join("\n")}

判断规则：
1. 只依据账号定位与视频标题语义相关性判断。
2. 与定位方向、目标人群、内容赛道明显相关的，才选中。
3. 不确定时宁可不选。
4. 返回的 id 必须来自给定列表。

请严格返回 JSON：
{
  "matchedIds": [1, 2],
  "reasons": [
    { "id": 1, "reason": "为什么相关" }
  ]
}`;

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content:
                "你擅长医美账号定位与短视频选题相关性判断。只返回合法 JSON，不要输出多余文本。",
            },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
        });

        const raw = String(response.choices[0]?.message?.content || "{}");
        let parsed: {
          matchedIds?: number[];
          reasons?: Array<{ id: number; reason: string }>;
        } = {};

        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = {};
        }

        const matchedIds = new Set(
          (parsed.matchedIds || [])
            .map(value => Number(value))
            .filter(value => Number.isFinite(value))
        );
        const reasonMap = new Map(
          (parsed.reasons || [])
            .map(item => [Number(item.id), String(item.reason || "")] as const)
            .filter(([id]) => Number.isFinite(id))
        );

        return hubItems
          .filter(item => matchedIds.has(item.id))
          .map(item => ({
            ...item,
            matchedReason: reasonMap.get(item.id) || "",
          }))
          .sort((a, b) => {
            const aTags = (a.tags ?? {}) as Record<string, unknown>;
            const bTags = (b.tags ?? {}) as Record<string, unknown>;
            return (
              Number(bTags.likedCount || 0) - Number(aTags.likedCount || 0)
            );
          });
      }),
    generate: publicProcedure
      .input(z.object({ projectId: z.number() }))
      .mutation(async ({ input }) => {
        await logUsage(GUEST_USER_ID, input.projectId, "topics", "generate");

        const [positionings, hubItems] = await Promise.all([
          getPositionings(GUEST_USER_ID, input.projectId),
          getTopicHubItems(GUEST_USER_ID, input.projectId),
        ]);

        const completedPositioning = positionings.find(
          p => p.status === "completed" && p.positioningRecommendation
        );
        const positioningBlock = completedPositioning
          ? `## ?????????

${completedPositioning.positioningRecommendation}
`
          : "";

        type HubTags = Record<string, unknown>;
        const analyzedVideos = hubItems.filter(item => {
          const tags = (item.tags ?? {}) as HubTags;
          return (
            tags.videoAnalysisStatus === "completed" &&
            typeof tags.videoAnalysisResult === "string"
          );
        });

        let viralAnalysisBlock = "";
        if (analyzedVideos.length > 0) {
          const sections = analyzedVideos.map((item, i) => {
            const tags = (item.tags ?? {}) as HubTags;
            return `### ?????? ${i + 1}: ${item.title}
${String(tags.videoAnalysisResult)}`;
          });
          viralAnalysisBlock = `## 鐖嗘瑙嗛鍥犲瓙鍒嗘瀽锛堝叡${analyzedVideos.length}鏉★級\n\n${sections.join("\n\n---\n\n")}\n`;
        }

        if (!positioningBlock && !viralAnalysisBlock) {
          throw new Error("??????????????????????????????????????????????");
        }

        await deleteTopicsByProject(GUEST_USER_ID, input.projectId);

        const prompt = `?????????????????????????????????????????????????????????????????????????????
${positioningBlock}
${viralAnalysisBlock}

## ?????????

??????????????????????????????????????10 ???????????????????????
??????????????1. **??????**????????????????????????????????2. **??????**??ersona????????????????? traffic????????????????? marketing????????????????3. **??????**???????????????????????????????4. **?????????**??igh / medium / low
5. **??????**?????????????????????????????????????????????????????????

??????????????? 3 ??+ ?????4 ??+ ?????3 ??
??SON????????{
  "topics": [
    {
      "title": "??????",
      "description": "??????????????",
      "topicType": "persona|traffic|marketing",
      "viralPotential": "high|medium|low",
      "rationale": "????????????"
    }
  ]
}`;

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content:
                "???????????????????????????????????????????????????????????????????SON????????;",
            },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
        });

        const content = String(response.choices[0]?.message?.content || "{}");
        let parsed: {
          topics?: Array<{
            title: string;
            description: string;
            topicType: "persona" | "traffic" | "marketing";
            viralPotential: "high" | "medium" | "low";
            rationale: string;
          }>;
        } = {};
        try {
          parsed = JSON.parse(content);
        } catch {
          parsed = { topics: [] };
        }

        const savedTopics = [];
        for (const topic of (parsed.topics || []).slice(0, 10)) {
          const saved = await createTopic(GUEST_USER_ID, {
            projectId: input.projectId,
            title: topic.title,
            description: topic.description,
            topicType: topic.topicType,
            viralPotential: topic.viralPotential,
            rationale: topic.rationale,
          });
          savedTopics.push(saved);
        }
        return { topics: savedTopics };
      }),
    update: publicProcedure
      .input(
        z.object({
          id: z.number(),
          status: z
            .enum(["draft", "selected", "in_production", "published"])
            .optional(),
          title: z.string().optional(),
        })
      )
      .mutation(({ input }) => updateTopic(GUEST_USER_ID, input)),
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteTopic(GUEST_USER_ID, input.id)),
  }),

  // ?????? Viral Analysis ────────────────────────────────────────────────────────
  topicPlans: router({
    list: publicProcedure
      .input(z.object({ projectId: z.number() }))
      .query(({ input }) => getTopicPlans(GUEST_USER_ID, input.projectId)),
    generate: publicProcedure
      .input(z.object({ projectId: z.number() }))
      .mutation(async ({ input }) => {
        await logUsage(
          GUEST_USER_ID,
          input.projectId,
          "topicPlans",
          "generate"
        );
        return generateTopicPlansForProject(input.projectId);
      }),
  }),

  viralAnalysis: router({
    list: publicProcedure
      .input(z.object({ projectId: z.number() }))
      .query(({ input }) => getViralAnalyses(GUEST_USER_ID, input.projectId)),
    analyze: publicProcedure
      .input(
        z.object({
          projectId: z.number(),
          topicId: z.number().optional(),
          referenceContent: z.string(),
          contentUrl: z.string().optional(),
          accountPositioning: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await logUsage(
          GUEST_USER_ID,
          input.projectId,
          "viralAnalysis",
          "analyze"
        );
        const analysisId = await createViralAnalysis(GUEST_USER_ID, {
          projectId: input.projectId,
          topicId: input.topicId,
          referenceContent: input.referenceContent,
          contentUrl: input.contentUrl,
          status: "analyzing",
        });

        const prompt = `你是一位顶级的社交媒体内容分析师，专注于解析爆款内容的底层逻辑。

请对以下内容进行360度深度分析：

参考内容：
${input.referenceContent}

${input.accountPositioning ? `账号定位：${input.accountPositioning}` : ""}

请从以下9个维度进行专业分析：

1. **内容形式**：视频还是图文？精致拍摄还是平易近人？
2. **视频类型**：口播/术前术后对比/医生看诊/知识分享等
3. **拍摄风格**：打光方式、镜头运用、画面质感
4. **环境设置**：精致专业还是接地气真实？
5. **服饰形象**：专业装/休闲装/白大褂等对信任感的影响
6. **人设风格**：权威专家型 vs 接地气真实分享型
7. **情绪基调**：冷静客观/情绪激动/煽动性/真诚分享
8. **内容结构**：干货型/情绪氛围型，各角度的比例
9. **脚本架构**：开头钩子、中段展开、结尾CTA的具体逻辑

最后给出：
- **爆款公式**：提炼可复制的爆款模板
- **高转化公式**：针对转化目标的内容策略
- **与账号定位匹配度**：分析哪些因子适合该账号，哪些不适合

请给出专业、具体、可直接应用的分析结论。`;

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content:
                "你是专业的社交媒体内容分析师，擅长解析爆款内容规律，提炼可复制的内容公式。请用中文回复，分析深入具体。",
            },
            { role: "user", content: prompt },
          ],
        });

        const analysisText = String(
          response.choices[0]?.message?.content || ""
        );
        await updateViralAnalysis(GUEST_USER_ID, {
          id: analysisId,
          viralFormula: analysisText,
          fullAnalysis: { text: analysisText },
          status: "completed",
        });

        return { id: analysisId, analysis: analysisText };
      }),
  }),

  // ─── Scripts ───────────────────────────────────────────────────────────────
  scripts: router({
    list: publicProcedure
      .input(z.object({ projectId: z.number() }))
      .query(({ input }) => getScripts(GUEST_USER_ID, input.projectId)),
    generateForTopicPlan: publicProcedure
      .input(
        z.object({
          projectId: z.number(),
          topicPlanId: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        await logUsage(GUEST_USER_ID, input.projectId, "scripts", "generate");
        return generateScriptForTopicPlanWithArk(
          input.projectId,
          input.topicPlanId
        );
      }),
    generateBatchFromTopicPlans: publicProcedure
      .input(
        z.object({
          projectId: z.number(),
          regenerateAll: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await logUsage(
          GUEST_USER_ID,
          input.projectId,
          "scripts",
          "generateBatch"
        );

        const [plans, scripts] = await Promise.all([
          getTopicPlans(GUEST_USER_ID, input.projectId),
          getScripts(GUEST_USER_ID, input.projectId),
        ]);

        const existingPlanIds = new Set(
          scripts
            .map(item => Number(item.topicPlanId))
            .filter(value => Number.isFinite(value) && value > 0)
        );

        const targetPlans = plans.filter(
          plan => input.regenerateAll || !existingPlanIds.has(plan.id)
        );

        const results = [];
        for (const plan of targetPlans) {
          results.push(
            await generateScriptForTopicPlanWithArk(input.projectId, plan.id)
          );
        }

        return {
          generatedCount: results.length,
          ids: results.map(item => item.id),
        };
      }),
    update: publicProcedure
      .input(
        z.object({
          id: z.number(),
          status: z
            .enum(["draft", "review", "approved", "produced"])
            .optional(),
          fullScript: z.string().optional(),
          title: z.string().optional(),
        })
      )
      .mutation(({ input }) => updateScript(GUEST_USER_ID, input)),
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteScript(GUEST_USER_ID, input.id)),
  }),

  // ─── Digital Avatar Generation (HeyGen) ─────────────────────────────────
  digitalAvatar: router({
    generate: publicProcedure
      .input(
        z.object({
          projectId: z.number(),
          scriptContent: z.string().min(1),
          avatarId: z.string().optional(),
          voiceId: z.string().optional(),
          title: z.string().min(1),
          heygenApiKey: z.string().min(1),
        })
      )
      .mutation(async ({ input }) => {
        await logUsage(
          GUEST_USER_ID,
          input.projectId,
          "materials",
          "digitalAvatar"
        );

        const createRes = await fetch(
          "https://api.heygen.com/v2/video/generate",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Api-Key": input.heygenApiKey,
            },
            body: JSON.stringify({
              video_inputs: [
                {
                  character: {
                    type: "avatar",
                    avatar_id:
                      input.avatarId || "Abigail_expressive_2024112501",
                    avatar_style: "normal",
                  },
                  voice: {
                    type: "text",
                    input_text: input.scriptContent.substring(0, 1500),
                    voice_id:
                      input.voiceId || "2d5b0e6cf36f460aa7fc47e3eee4ba54",
                  },
                  background: { type: "color", value: "#f5f5f5" },
                },
              ],
              dimension: { width: 1280, height: 720 },
            }),
          }
        );

        if (!createRes.ok) {
          const errText = await createRes.text().catch(() => "");
          throw new Error(
            `HeyGen API错误 (${createRes.status}): ${errText.substring(0, 200)}`
          );
        }

        const createData = (await createRes.json()) as {
          data?: { video_id?: string };
          error?: string;
        };
        if (createData.error)
          throw new Error(`HeyGen错误: ${createData.error}`);
        const videoId = createData.data?.video_id;
        if (!videoId) throw new Error("HeyGen未返回视频ID");

        const materialId = await createMaterial(GUEST_USER_ID, {
          projectId: input.projectId,
          title: input.title,
          type: "digital_avatar",
          status: "processing",
          tags: ["heygen", "数字人", "AI生成"],
        });

        return {
          videoId,
          materialId,
          status: "processing",
          message: "视频生成中，请稍后查询状态",
        };
      }),

    checkStatus: publicProcedure
      .input(
        z.object({
          videoId: z.string(),
          materialId: z.number(),
          heygenApiKey: z.string().min(1),
        })
      )
      .mutation(async ({ input }) => {
        const statusRes = await fetch(
          `https://api.heygen.com/v1/video_status.get?video_id=${input.videoId}`,
          {
            headers: { "X-Api-Key": input.heygenApiKey },
          }
        );

        if (!statusRes.ok)
          throw new Error(`HeyGen状态查询失败 (${statusRes.status})`);

        const statusData = (await statusRes.json()) as {
          data?: {
            status?: string;
            video_url?: string;
            thumbnail_url?: string;
            error?: string;
          };
        };
        const status = statusData.data?.status;
        const videoUrl = statusData.data?.video_url;
        const thumbnailUrl = statusData.data?.thumbnail_url;

        if (status === "completed" && videoUrl) {
          await updateMaterial(GUEST_USER_ID, {
            id: input.materialId,
            status: "ready",
            fileUrl: videoUrl,
            thumbnailUrl,
          });
          return { status: "completed", videoUrl, thumbnailUrl };
        } else if (status === "failed") {
          await updateMaterial(GUEST_USER_ID, {
            id: input.materialId,
            status: "failed",
          });
          return {
            status: "failed",
            error: statusData.data?.error || "生成失败",
          };
        }
        return { status: status || "processing" };
      }),

    listAvatars: publicProcedure
      .input(z.object({ heygenApiKey: z.string().min(1) }))
      .query(async ({ input }) => {
        const res = await fetch("https://api.heygen.com/v2/avatars", {
          headers: { "X-Api-Key": input.heygenApiKey },
        });
        if (!res.ok) throw new Error(`获取数字人列表失败 (${res.status})`);
        const data = (await res.json()) as {
          data?: {
            avatars?: Array<{
              avatar_id: string;
              avatar_name: string;
              preview_image_url?: string;
            }>;
          };
        };
        return { avatars: data.data?.avatars || [] };
      }),
  }),

  // ─── Materials ─────────────────────────────────────────────────────────────
  materials: router({
    list: publicProcedure
      .input(z.object({ projectId: z.number() }))
      .query(({ input }) => getMaterials(GUEST_USER_ID, input.projectId)),
    create: publicProcedure
      .input(
        z.object({
          projectId: z.number(),
          scriptId: z.number().optional(),
          type: z.enum([
            "real_person",
            "digital_avatar",
            "before_after",
            "other",
          ]),
          title: z.string().min(1),
          fileUrl: z.string().optional(),
          thumbnailUrl: z.string().optional(),
          tags: z.array(z.string()).optional(),
          bodyPart: z.string().optional(),
          treatmentType: z.string().optional(),
          style: z.string().optional(),
        })
      )
      .mutation(({ input }) => createMaterial(GUEST_USER_ID, input)),
    update: publicProcedure
      .input(
        z.object({
          id: z.number(),
          status: z
            .enum(["uploading", "processing", "ready", "failed"])
            .optional(),
          tags: z.array(z.string()).optional(),
          fileUrl: z.string().optional(),
          thumbnailUrl: z.string().optional(),
        })
      )
      .mutation(({ input }) => updateMaterial(GUEST_USER_ID, input)),
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteMaterial(GUEST_USER_ID, input.id)),
  }),

  // ─── Content Package (Cover Image + Hashtags) ────────────────────────────
  contentPackage: router({
    generateCover: publicProcedure
      .input(
        z.object({
          projectId: z.number(),
          title: z.string(),
          platform: z.string(),
          industry: z.string().optional(),
          style: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await logUsage(
          GUEST_USER_ID,
          input.projectId,
          "platformAdaptation",
          "generateCover"
        );
        const styleDesc = input.style || "现代简约";
        const prompt = `为${input.platform}平台创建一张专业的社交媒体封面图。
标题文字：${input.title}
行业：${input.industry || "通用"}
风格：${styleDesc}
要求：高清、视觉冲击力强、符合${input.platform}平台审美、文字清晰可读、背景精美、色彩鲜艳吸引眼球。适合作为${input.platform}帖子封面。`;

        const { url } = await generateImage({ prompt });
        return { coverUrl: url };
      }),

    generateHashtags: publicProcedure
      .input(
        z.object({
          projectId: z.number(),
          title: z.string(),
          caption: z.string().optional(),
          platform: z.string(),
          industry: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await logUsage(
          GUEST_USER_ID,
          input.projectId,
          "platformAdaptation",
          "generateHashtags"
        );
        const platformSpecs: Record<string, string> = {
          xiaohongshu:
            "小红书话题标签，以#开头，中文，5-10个，包含行业词+热门词+长尾词",
          douyin: "抖音话题标签，以#开头，中文，3-5个，简短有力",
          instagram:
            "Instagram hashtags in English, 10-15 tags, mix of popular and niche",
          tiktok:
            "TikTok hashtags in English, 3-5 trending tags, short and punchy",
          youtube:
            "YouTube tags for SEO, 5-10 relevant keywords, mix of broad and specific",
        };
        const spec = platformSpecs[input.platform] || "通用话题标签，5-8个";
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "你是社交媒体话题标签专家。请严格按JSON格式返回。",
            },
            {
              role: "user",
              content: `为以下内容生成${spec}：\n标题：${input.title}\n正文：${input.caption?.substring(0, 300) || ""}\n行业：${input.industry || "通用"}\n\n以JSON格式返回：{"hashtags": ["#标签1", "#标签2"]}`,
            },
          ],
          response_format: { type: "json_object" },
        });
        const content = String(response.choices[0]?.message?.content || "{}");
        let parsed: { hashtags?: string[] } = {};
        try {
          parsed = JSON.parse(content);
        } catch {
          parsed = { hashtags: [] };
        }
        return { hashtags: parsed.hashtags || [] };
      }),
  }),

  // ─── Platform Adaptations ──────────────────────────────────────────────────
  platformAdaptation: router({
    list: publicProcedure
      .input(z.object({ scriptId: z.number() }))
      .query(({ input }) =>
        getPlatformAdaptations(GUEST_USER_ID, input.scriptId)
      ),
    listByProject: publicProcedure
      .input(z.object({ projectId: z.number() }))
      .query(({ input }) =>
        getPlatformAdaptationsByProject(GUEST_USER_ID, input.projectId)
      ),
    generate: publicProcedure
      .input(
        z.object({
          projectId: z.number(),
          scriptId: z.number(),
          scriptContent: z.string(),
          platforms: z.array(
            z.enum(["xiaohongshu", "douyin", "instagram", "tiktok", "youtube"])
          ),
          industry: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        await logUsage(
          GUEST_USER_ID,
          input.projectId,
          "platformAdaptation",
          "generate"
        );
        const platformSpecs: Record<string, string> = {
          xiaohongshu:
            "小红书：标题控制在20字以内，正文500-1000字，多用emoji，话题标签5-10个，语气亲切种草感强",
          douyin:
            "抖音：标题简短有力，正文100-200字，话题标签3-5个，突出视频亮点，引导互动",
          instagram:
            "Instagram：英文内容，caption 150-300 words, 10-15 hashtags, engaging and visual storytelling style",
          tiktok:
            "TikTok：英文内容，caption under 150 characters, 3-5 trending hashtags, hook in first line",
          youtube:
            "YouTube：标题SEO优化，description 200-500 words with keywords, timestamps if applicable, call to action",
        };

        const results = [];
        for (const platform of input.platforms) {
          const spec = platformSpecs[platform];
          const prompt = `请将以下视频脚本内容适配为${platform}平台的发布文案：

原始脚本：
${input.scriptContent.substring(0, 1000)}

平台要求：${spec}

请输出：
1. 标题
2. 正文/Caption
3. 话题标签/Hashtags（以JSON数组格式）
4. 发布建议

以JSON格式返回：
{
  "title": "标题",
  "caption": "正文内容",
  "hashtags": ["标签1", "标签2"],
  "formatNotes": "发布建议"
}`;

          const response = await invokeLLM({
            messages: [
              {
                role: "system",
                content:
                  "你是专业的多平台内容运营专家，熟悉各平台算法和用户习惯。请严格按JSON格式返回。",
              },
              { role: "user", content: prompt },
            ],
            response_format: { type: "json_object" },
          });

          const content = String(response.choices[0]?.message?.content || "{}");
          let parsed: {
            title?: string;
            caption?: string;
            hashtags?: string[];
            formatNotes?: string;
          } = {};
          try {
            parsed = JSON.parse(content);
          } catch {
            parsed = {};
          }

          const saved = await createPlatformAdaptation(GUEST_USER_ID, {
            projectId: input.projectId,
            scriptId: input.scriptId,
            platform,
            title: parsed.title,
            caption: parsed.caption,
            hashtags: parsed.hashtags,
            adaptedContent: parsed.caption,
            formatNotes: parsed.formatNotes,
          });
          results.push({ platform, ...parsed, id: saved });
        }
        return { adaptations: results };
      }),
  }),

  // ─── Dashboard Stats ───────────────────────────────────────────────────────
  dashboard: router({
    stats: publicProcedure.query(() => getDashboardStats(GUEST_USER_ID)),
  }),

  // ─── Video Generation (Seedance 1.5 Pro) ────────────────────────────────────
  videoGeneration: router({
    // 根据脚本内容生成分镜头列表（不入库，前端状态管理）
    generateStoryboard: publicProcedure
      .input(
        z.object({
          projectId: z.number(),
          scriptId: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        await logUsage(
          GUEST_USER_ID,
          input.projectId,
          "materials",
          "storyboard"
        );

        const allScripts = await getScripts(GUEST_USER_ID, input.projectId);
        const script = allScripts.find(s => s.id === input.scriptId);
        if (!script) throw new Error("未找到脚本");

        const scriptContent =
          script.fullScript || script.mainContent || script.title;

        const prompt = `你是专业短视频分镜头策划师。请根据以下短视频脚本，拆解为可执行的分镜头列表。

【脚本内容】
${scriptContent}

【要求】
1. 按时间顺序拆分为 4-8 个分镜头
2. 每个镜头时长 3-8 秒，总时长控制在 15-30 秒内
3. 每个镜头需包含：时间段、画面描述、拍摄建议、重点文案

【输出格式】严格输出 JSON 数组，不要有其他文字：
[
  {
    "shotIndex": 1,
    "timeRange": "0-3s",
    "description": "画面描述",
    "cameraInstruction": "拍摄/镜头指令",
    "visualSuggestion": "视觉建议（背景、光线、道具等）",
    "voiceOver": "该镜头对应的口播文案"
  }
]`;

        type ShotItem = {
          shotIndex: number;
          timeRange: string;
          description: string;
          cameraInstruction: string;
          visualSuggestion: string;
          voiceOver: string;
        };

        const response = await generateTextWithArk({
          systemPrompt:
            "你是短视频分镜头策划师，请严格按 JSON 数组输出，不要有任何额外文字。",
          prompt,
        });

        const rawShots = extractJsonArray(response.text);
        if (rawShots.length === 0) {
          throw new Error("分镜头生成失败：无法解析返回结果");
        }

        const shots = rawShots
          .map((item, index) => ({
            shotIndex: Number(item.shotIndex || index + 1),
            timeRange: String(item.timeRange || "").trim(),
            description: String(item.description || "").trim(),
            cameraInstruction: String(item.cameraInstruction || "").trim(),
            visualSuggestion: String(item.visualSuggestion || "").trim(),
            voiceOver: String(item.voiceOver || "").trim(),
          }))
          .filter(
            item =>
              item.shotIndex > 0 &&
              item.timeRange &&
              item.description &&
              item.cameraInstruction &&
              item.visualSuggestion
          );

        if (shots.length === 0) {
          throw new Error("分镜头生成失败：返回结果不完整");
        }

        return { shots, scriptTitle: script.title };
      }),

    // 创建 Seedance 视频生成任务
    createTask: publicProcedure
      .input(
        z.object({
          projectId: z.number(),
          scriptId: z.number().optional(),
          title: z.string().min(1),
          type: z.enum([
            "real_person",
            "digital_avatar",
            "before_after",
            "other",
          ]),
          prompt: z.string().min(1),
          referenceImageUrl: z.string().optional(), // 远端 URL 或 /_local/ 开头的本地路径
          ratio: z
            .enum(["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"])
            .optional(),
          duration: z.number().min(4).max(12).optional(),
          resolution: z.enum(["480p", "720p", "1080p"]).optional(),
          generateAudio: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await logUsage(GUEST_USER_ID, input.projectId, "materials", "seedance");

        // 本地路径转换：/_local/xxx -> .data/xxx（服务端物理路径）
        let imageInput = input.referenceImageUrl;
        if (imageInput?.startsWith("/_local/")) {
          const relativePath = imageInput.replace("/_local/", "");
          imageInput = resolve(process.cwd(), ".data", relativePath);
        }

        const { taskId } = await createSeedanceTask(input.prompt, imageInput, {
          ratio: input.ratio,
          duration: input.duration,
          resolution: input.resolution,
          generateAudio: input.generateAudio,
        });

        const materialId = await createMaterial(GUEST_USER_ID, {
          projectId: input.projectId,
          scriptId: input.scriptId,
          type: input.type,
          title: input.title,
          status: "processing",
          seedanceTaskId: taskId,
          referenceImageUrl: input.referenceImageUrl,
          prompt: input.prompt,
          tags: ["seedance", "AI生成"],
        });

        return { materialId, taskId };
      }),

    // 查询 Seedance 任务状态，完成后更新素材记录
    checkStatus: publicProcedure
      .input(
        z.object({
          materialId: z.number(),
          taskId: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        const result = await querySeedanceTask(input.taskId);

        if (result.status === "succeeded" && result.videoUrl) {
          await updateMaterial(GUEST_USER_ID, {
            id: input.materialId,
            status: "ready",
            fileUrl: result.videoUrl,
          });
          return { status: "completed", videoUrl: result.videoUrl };
        }

        if (result.status === "failed" || result.status === "expired") {
          await updateMaterial(GUEST_USER_ID, {
            id: input.materialId,
            status: "failed",
          });
          return { status: "failed", error: result.error || "生成失败" };
        }

        // queued / running
        return { status: "processing" };
      }),
  }),

  // ─── XHS 发布 ────────────────────────────────────────────────────────────────
  xhsPublish: router({
    // 查询 XHS 登录状态
    loginStatus: publicProcedure.query(async () => {
      try {
        const resp = await fetch(`${ENV.xhsApiUrl}/api/v1/login/status`, {
          signal: AbortSignal.timeout(5000),
        });
        const data = (await resp.json()) as {
          success?: boolean;
          data?: { is_logged_in?: boolean; username?: string };
        };
        return {
          isLoggedIn: data.data?.is_logged_in ?? false,
          username: data.data?.username ?? "",
        };
      } catch {
        return { isLoggedIn: false, username: "" };
      }
    }),

    publications: publicProcedure
      .input(z.object({ projectId: z.number() }))
      .query(({ input }) =>
        getMaterialPublications(GUEST_USER_ID, input.projectId)
      ),

    prepareDraft: publicProcedure
      .input(
        z.object({
          projectId: z.number(),
          materialId: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        const [allMaterials, allScripts] = await Promise.all([
          getMaterials(GUEST_USER_ID, input.projectId),
          getScripts(GUEST_USER_ID, input.projectId),
        ]);
        const material = allMaterials.find(
          item => item.id === input.materialId
        );
        if (!material) throw new Error("未找到素材记录");
        const script = material.scriptId
          ? allScripts.find(item => item.id === material.scriptId)
          : undefined;
        const draft = await ensureXhsDraftForScript({
          projectId: input.projectId,
          materialId: input.materialId,
          scriptId: material.scriptId,
          scriptTitle: script?.title || material.title,
          scriptContent:
            script?.fullScript || material.prompt || material.title,
        });
        return { materialId: input.materialId, draft };
      }),

    publishMaterialAuto: publicProcedure
      .input(
        z.object({
          projectId: z.number(),
          materialId: z.number(),
          title: z.string().optional(),
          content: z.string().optional(),
          tags: z.array(z.string()).optional(),
          visibility: z
            .enum(["公开可见", "仅自己可见", "仅互关好友可见"])
            .default("公开可见"),
        })
      )
      .mutation(async ({ input }) => {
        await logUsage(
          GUEST_USER_ID,
          input.projectId,
          "platform",
          "xhs_auto_publish"
        );
        return publishMaterialToXhs(input);
      }),

    batchPublishAuto: publicProcedure
      .input(
        z.object({
          projectId: z.number(),
          materialIds: z.array(z.number()),
          visibility: z
            .enum(["公开可见", "仅自己可见", "仅互关好友可见"])
            .default("公开可见"),
        })
      )
      .mutation(async ({ input }) => {
        await logUsage(
          GUEST_USER_ID,
          input.projectId,
          "platform",
          "xhs_batch_publish"
        );
        const results: Array<{
          materialId: number;
          success: boolean;
          postId?: string;
          error?: string;
        }> = [];
        for (const materialId of input.materialIds) {
          try {
            const result = await publishMaterialToXhs({
              projectId: input.projectId,
              materialId,
              visibility: input.visibility,
            });
            results.push({ materialId, success: true, postId: result.postId });
          } catch (error) {
            results.push({
              materialId,
              success: false,
              error: error instanceof Error ? error.message : "发布失败",
            });
          }
        }
        return { results };
      }),

    // 发布视频到小红书
    publishVideo: publicProcedure
      .input(
        z.object({
          projectId: z.number(),
          materialId: z.number(),
          title: z.string().min(1),
          content: z.string().min(1),
          tags: z.array(z.string()).optional(),
          visibility: z
            .enum(["公开可见", "仅自己可见", "仅互关好友可见"])
            .default("公开可见"),
        })
      )
      .mutation(async ({ input }) => {
        await logUsage(
          GUEST_USER_ID,
          input.projectId,
          "platform",
          "xhs_publish"
        );

        // 获取素材记录
        const allMaterials = await getMaterials(GUEST_USER_ID, input.projectId);
        const material = allMaterials.find(m => m.id === input.materialId);
        if (!material) throw new Error("未找到素材记录");
        if (!material.fileUrl) throw new Error("该素材没有可用的视频文件");

        const videoPath = await resolvePublishVideoPath({
          projectId: input.projectId,
          materialId: input.materialId,
          fileUrl: material.fileUrl,
        });

        try {
          // 调用 XHS 发布视频 API
          const publishResp = await fetch(
            `${ENV.xhsApiUrl}/api/v1/publish_video`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: input.title,
                content: input.content,
                video: videoPath.path,
                tags: input.tags ?? [],
                visibility: input.visibility,
              }),
              signal: AbortSignal.timeout(600_000), // 视频发布可能较慢，给 10 分钟
            }
          );

          const result = (await publishResp.json()) as {
            success?: boolean;
            data?: { post_id?: string; status?: string };
            message?: string;
            error?: string;
          };

          if (!publishResp.ok || !result.success) {
            throw new Error(
              result.error ||
                result.message ||
                `发布失败 (${publishResp.status})`
            );
          }

          return {
            postId: result.data?.post_id,
            status: result.data?.status ?? "published",
            message: result.message ?? "发布成功",
          };
        } finally {
          if (videoPath.shouldCleanup) {
            await unlink(videoPath.path).catch(() => undefined);
          }
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
