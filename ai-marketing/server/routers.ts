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
  getTopicHubItems,
  createTopicHubItem,
  deleteTopicHubItem,
  getTopics,
  createTopic,
  updateTopic,
  deleteTopic,
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
  createPlatformAdaptation,
  getDashboardStats,
  logUsage,
} from "./db";
import { invokeLLM } from "./_core/llm";
import { callDataApi } from "./_core/dataApi";
import { generateImage } from "./_core/imageGeneration";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import {
  deleteXhsCookies,
  getXhsLoginQrcode,
  getXhsLoginStatus,
  getXhsMyProfile,
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

function includesAnyKeyword(text: string, terms: string[]) {
  if (terms.length === 0) return true;
  const normalized = text.toLowerCase();
  return terms.some(term => normalized.includes(term));
}

function matchesAuthor(feed: XhsFeed, authorKeywords: string[]) {
  if (authorKeywords.length === 0) return true;

  const candidates = [
    feed.noteCard?.user?.nickname,
    feed.noteCard?.user?.nickName,
    feed.noteCard?.user?.userId,
  ]
    .filter(Boolean)
    .map(value => String(value).trim().replace(/^@+/, "").toLowerCase());

  return authorKeywords.some(keyword =>
    candidates.some(candidate => candidate.includes(keyword))
  );
}

function selectTopVideoFeeds(
  feeds: XhsFeed[],
  options?: {
    keywordTerms?: string[];
    authorKeywords?: string[];
    limit?: number;
  }
) {
  const keywordTerms = options?.keywordTerms ?? [];
  const authorKeywords = options?.authorKeywords ?? [];
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
    .filter(feed => matchesAuthor(feed, authorKeywords))
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
  searchMode: "keyword" | "mine" | "authors";
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
  return createTopicHubItem(GUEST_USER_ID, {
    projectId: params.projectId,
    title: params.feed.noteCard?.displayTitle || "小红书视频",
    content: `关键词：${params.industry}${params.checklist ? ` | 补充关键词：${params.checklist}` : ""}`,
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
        "小红书用户",
      authorAvatar: params.feed.noteCard?.user?.avatar,
      likedCount: params.likedCount,
      commentCount: params.commentCount,
      sharedCount: params.sharedCount,
      duration: params.feed.noteCard?.video?.capa?.duration,
      coverDownloadPath,
      filters: params.filters,
      authorKeywords: params.authorKeywords,
    },
  });
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
      .mutation(({ input }) => createPositioning(GUEST_USER_ID, input)),
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
          industry: z.string().min(1),
          mode: z.enum(["keyword", "mine", "authors"]).default("keyword"),
          targetPlatform: z
            .enum(["xiaohongshu", "youtube", "douyin"])
            .default("xiaohongshu"),
          checklist: z.string().optional(),
          bloggerAccounts: z.string().optional(),
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

        const keyword = buildXhsSearchKeyword(input.industry, input.checklist);
        const keywordTerms = splitKeywordTerms(keyword);
        const authorKeywords = splitAuthorKeywords(input.bloggerAccounts);
        const filters: XhsSearchFilters | undefined = input.filters
          ? {
              sort_by: input.filters.sort_by,
              note_type: input.filters.note_type,
              publish_time: input.filters.publish_time,
              search_scope: input.filters.search_type,
              location: input.filters.location,
            }
          : undefined;

        let topVideoFeeds: Array<{
          feed: XhsFeed;
          likedCount: number;
          commentCount: number;
          sharedCount: number;
          score: number;
        }> = [];
        let sourceLabel = "关键词搜索";

        if (input.mode === "mine") {
          const profile = await getXhsMyProfile();
          topVideoFeeds = selectTopVideoFeeds(profile.feeds || [], {
            keywordTerms,
            limit: 3,
          });
          sourceLabel = "我的内容";
        } else {
          const result = await searchXhsFeeds(keyword, filters);
          topVideoFeeds = selectTopVideoFeeds(result.feeds || [], {
            keywordTerms,
            authorKeywords: input.mode === "authors" ? authorKeywords : [],
            limit: 3,
          });
          sourceLabel = input.mode === "authors" ? "指定博主" : "关键词搜索";
        }

        const items = [];
        for (const item of topVideoFeeds) {
          const saved = await saveTopicHubVideoItem({
            projectId: input.projectId,
            industry: input.industry,
            checklist: input.checklist,
            targetPlatform: input.targetPlatform,
            feed: item.feed,
            likedCount: item.likedCount,
            commentCount: item.commentCount,
            sharedCount: item.sharedCount,
            score: item.score,
            filters,
            searchMode: input.mode,
            authorKeywords,
            sourceLabel,
          });
          items.push(saved);
        }

        return {
          items,
          count: items.length,
          keyword,
          mode: input.mode,
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
    generate: publicProcedure
      .input(
        z.object({
          projectId: z.number(),
          industry: z.string(),
          personaType: z.string(),
          monetizationMethod: z.string(),
          trendingTopics: z.string().optional(),
          viralPosts: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await logUsage(GUEST_USER_ID, input.projectId, "topics", "generate");
        const prompt = `你是一位顶级的社交媒体选题策划师。

账号信息：
- 行业：${input.industry}
- 人设类型：${input.personaType}
- 变现方式：${input.monetizationMethod}

当前热点话题：
${input.trendingTopics || "暂无热点数据"}

近期爆款内容：
${input.viralPosts || "暂无爆款数据"}

请结合以上信息，生成5个具有高爆款潜质的选题，每个选题需要：
1. 明确的选题类型（人设型/流量型/营销型）
2. 吸引眼球的标题
3. 选题理由和爆款潜力分析
4. 建议的内容角度
5. 爆款潜力评级（high/medium/low）

人设型选题：展示个人经历、建立信任感的内容
流量型选题：泛流量干货、知识分享类内容
营销型选题：引导转化、销售类内容

以JSON格式返回：
{
  "topics": [
    {
      "title": "选题标题",
      "description": "选题描述和内容角度",
      "topicType": "persona|traffic|marketing",
      "viralPotential": "high|medium|low",
      "rationale": "爆款潜力分析"
    }
  ]
}`;

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content:
                "你是专业的社交媒体选题策划师，擅长结合热点和账号定位生成高爆款潜质选题。请严格按JSON格式返回。",
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
        for (const topic of (parsed.topics || []).slice(0, 5)) {
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

  // ─── Viral Analysis ────────────────────────────────────────────────────────
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
    generate: publicProcedure
      .input(
        z.object({
          projectId: z.number(),
          topicId: z.number().optional(),
          analysisId: z.number().optional(),
          title: z.string(),
          personaType: z.string(),
          industry: z.string(),
          viralFormula: z.string().optional(),
          hookType: z.enum(["camp_split", "anti_cognition", "curiosity"]),
          platform: z.string().optional(),
          duration: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await logUsage(GUEST_USER_ID, input.projectId, "scripts", "generate");
        const hookTypeLabel = {
          camp_split: "分阵营（制造对立，引发共鸣）",
          anti_cognition: "反认知（颠覆常识，制造惊喜）",
          curiosity: "好奇感（悬念设置，引发追问）",
        }[input.hookType];

        const prompt = `你是一位顶级的短视频脚本编导，擅长创作高完播率、高转化率的视频脚本。

选题：${input.title}
行业：${input.industry}
人设类型：${input.personaType}
开头类型：${hookTypeLabel}
目标平台：${input.platform || "通用"}
视频时长：${input.duration ? `${input.duration}秒` : "60-90秒"}

${input.viralFormula ? `爆款公式参考：\n${input.viralFormula.substring(0, 500)}` : ""}

请创作一个完整的视频脚本，包含：

**【前3秒钩子】**
使用${hookTypeLabel}的方式，设计一个让用户无法划走的开场白。
要求：具体、有冲击力、直击痛点或制造好奇

**【中段内容】**
核心内容展开，要求：
- 用动词和形容词把场景刻画得非常具体、可带入
- 讲故事时注重共鸣感
- 干货与情感并重
- 每个观点有具体案例支撑

**【结尾CTA】**
- 总结升华
- 引导关注/点赞/评论
- 预告下期内容（可选）

**【镜头/拍摄建议】**
简要说明每个段落的拍摄建议

请直接输出完整脚本，格式清晰，内容专业有感染力。`;

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content:
                "你是专业的短视频脚本编导，擅长创作高完播率、高转化率的视频脚本。请用中文创作，脚本要有感染力、具体生动、可直接拍摄使用。",
            },
            { role: "user", content: prompt },
          ],
        });

        const scriptContent = String(
          response.choices[0]?.message?.content || ""
        );
        const saved = await createScript(GUEST_USER_ID, {
          projectId: input.projectId,
          topicId: input.topicId,
          analysisId: input.analysisId,
          title: input.title,
          hookType: input.hookType,
          fullScript: scriptContent,
          platform: input.platform,
          duration: input.duration,
          status: "draft",
        });

        return { id: saved, script: scriptContent };
      }),
    update: publicProcedure
      .input(
        z.object({
          id: z.number(),
          status: z
            .enum(["draft", "review", "approved", "produced"])
            .optional(),
          fullScript: z.string().optional(),
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
});

export type AppRouter = typeof appRouter;
