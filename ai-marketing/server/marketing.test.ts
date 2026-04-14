import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the database module
vi.mock("./db", () => ({
  getProjects: vi.fn().mockResolvedValue([
    {
      id: 1,
      userId: 1,
      xhsAccountId: 1,
      name: "Test Project",
      description: "A test project",
      industry: "医美",
      platform: "小红书",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  createProject: vi.fn().mockResolvedValue([{ insertId: 2 }]),
  updateProject: vi.fn().mockResolvedValue({ success: true }),
  deleteProject: vi.fn().mockResolvedValue({ success: true }),
  getProjectById: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    xhsAccountId: 1,
    name: "Test Project",
    industry: "医美",
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  getPositionings: vi.fn().mockResolvedValue([]),
  createPositioning: vi.fn().mockResolvedValue(1),
  updatePositioning: vi.fn().mockResolvedValue({ success: true }),
  deletePositioningsByProject: vi.fn().mockResolvedValue({ success: true }),
  getTopicHubItems: vi.fn().mockResolvedValue([]),
  createTopicHubItem: vi.fn().mockResolvedValue({
    id: 1,
    title: "Test Topic",
    type: "trending",
    createdAt: new Date(),
  }),
  deleteTopicHubItem: vi.fn().mockResolvedValue({ success: true }),
  getTopics: vi.fn().mockResolvedValue([]),
  createTopic: vi.fn().mockResolvedValue({
    id: 1,
    title: "Test",
    topicType: "traffic",
    createdAt: new Date(),
  }),
  updateTopic: vi.fn().mockResolvedValue({ success: true }),
  deleteTopic: vi.fn().mockResolvedValue({ success: true }),
  getTopicPlans: vi.fn().mockResolvedValue([]),
  createTopicPlan: vi.fn().mockResolvedValue({
    id: 1,
    title: "Test Plan",
    hubItemId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  getViralAnalyses: vi.fn().mockResolvedValue([]),
  createViralAnalysis: vi.fn().mockResolvedValue(1),
  updateViralAnalysis: vi.fn().mockResolvedValue({ success: true }),
  getScripts: vi.fn().mockResolvedValue([]),
  createScript: vi.fn().mockResolvedValue(1),
  updateScript: vi.fn().mockResolvedValue({ success: true }),
  deleteScript: vi.fn().mockResolvedValue({ success: true }),
  getMaterials: vi.fn().mockResolvedValue([]),
  createMaterial: vi.fn().mockResolvedValue(1),
  updateMaterial: vi.fn().mockResolvedValue({ success: true }),
  deleteMaterial: vi.fn().mockResolvedValue({ success: true }),
  getPlatformAdaptations: vi.fn().mockResolvedValue([]),
  getPlatformAdaptationsByProject: vi.fn().mockResolvedValue([]),
  createPlatformAdaptation: vi.fn().mockResolvedValue(1),
  getMaterialPublications: vi.fn().mockResolvedValue([]),
  getDashboardStats: vi.fn().mockResolvedValue({
    projects: 3,
    topicHubItems: 6,
    topics: 10,
    topicPlans: 7,
    scripts: 5,
    materials: 8,
    adaptations: 15,
    publications: 2,
    analyses: 4,
  }),
  logUsage: vi.fn().mockResolvedValue(undefined),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
  getXhsAccounts: vi.fn().mockResolvedValue([]),
  getDefaultXhsAccount: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    accountKey: "u1-default",
    status: "unknown",
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  getXhsAccountById: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    accountKey: "u1-default",
    status: "unknown",
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  upsertXhsAccount: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    accountKey: "u1-default",
    status: "unknown",
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  upsertMaterialPublication: vi.fn().mockResolvedValue(1),
}));

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: "AI分析结果：这是一个测试响应，包含账号定位建议。",
        },
      },
    ],
  }),
}));

vi.mock("./_core/ark", () => ({
  analyzeVideoWithArk: vi.fn().mockResolvedValue({
    text: "视频定位分析结果：适合做细分赛道账号。",
    raw: { id: "ark-test-response" },
  }),
}));

vi.mock("./_core/pixelle", () => ({
  createPixelleTask: vi.fn().mockResolvedValue({
    taskId: "pixelle-test-task",
    status: "queued",
  }),
  queryPixelleTask: vi.fn().mockResolvedValue({
    status: "running",
    progress: 20,
  }),
}));

vi.mock("./_core/lux", () => ({
  downloadWithLux: vi.fn().mockResolvedValue({
    success: true,
    filePath: "/tmp/test-video.mp4",
    attempts: 1,
  }),
}));

vi.mock("./_core/xhsApi", () => ({
  getXhsLoginStatus: vi.fn().mockResolvedValue({
    status: "unknown",
    is_logged_in: false,
  }),
  getXhsLoginQrcode: vi.fn().mockResolvedValue({
    timeout: "0s",
    is_logged_in: false,
  }),
  deleteXhsCookies: vi.fn().mockResolvedValue(undefined),
  searchXhsFeeds: vi.fn().mockResolvedValue({ feeds: [], count: 0 }),
  getXhsUserProfile: vi.fn().mockResolvedValue({ feeds: [] }),
  publishXhsVideo: vi.fn().mockResolvedValue({
    post_id: "test-post",
    status: "published",
  }),
}));

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user-123",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("auth router", () => {
  it("returns current auth status from me query", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toHaveProperty("status");
    expect(result).toHaveProperty("is_logged_in");
  });

  it("clears cookie on logout", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
  });
});

describe("projects router", () => {
  it("lists projects for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const projects = await caller.projects.list();
    expect(Array.isArray(projects)).toBe(true);
    expect(projects.length).toBeGreaterThan(0);
    expect(projects[0]).toMatchObject({
      name: "Test Project",
      industry: "医美",
    });
  });

  it("creates a new project", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.projects.create({
      name: "新项目",
      description: "测试项目描述",
      industry: "美妆",
      platform: "抖音",
    });
    expect(result).toBeDefined();
  });

  it("updates a project", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.projects.update({
      id: 1,
      name: "更新后的项目名",
    });
    expect(result).toEqual({ success: true });
  });

  it("deletes a project", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.projects.delete({ id: 1 });
    expect(result).toEqual({ success: true });
  });

  it("gets a project by id", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const project = await caller.projects.get({ id: 1 });
    expect(project).toMatchObject({ id: 1, name: "Test Project" });
  });
});

describe("positioning router", () => {
  it("lists positionings for a project", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.positioning.list({ projectId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("creates a positioning record", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.positioning.create({
      projectId: 1,
      industry: "医美",
      track: "轻医美",
      monetizationMethod: "电商带货",
      targetAudience: "25-40岁女性",
      personaType: "权威专家型",
    });
    expect(result).toBeDefined();
  });

  it("creates and analyzes a positioning record in one step", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.positioning.createAndAnalyze({
      projectId: 1,
      industry: "鍖荤編",
      track: "杞诲尰缇?",
      monetizationMethod: "鐢靛晢甯﹁揣",
      targetAudience: "25-40宀佸コ鎬?",
      personaType: "鏉冨▉涓撳鍨?",
    });
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("analysis");
  });

  it("analyzes a video link for positioning", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.positioning.analyzeVideo({
      projectId: 1,
      videoUrl: "https://www.xiaohongshu.com/explore/abc123",
      filePath: "/tmp/test-video.mp4",
      industry: "鍖荤編",
    });
    expect(result).toHaveProperty("id");
    expect(result).toMatchObject({ status: "analyzing" });
  });

  it("runs AI analysis on a positioning", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.positioning.analyze({
      positioningId: 1,
      industry: "医美",
      track: "轻医美",
      monetizationMethod: "电商带货",
      targetAudience: "25-40岁女性",
      personaType: "权威专家型",
    });
    expect(result).toHaveProperty("analysis");
    expect(typeof result.analysis).toBe("string");
    expect(result.analysis.length).toBeGreaterThan(0);
  });
});

describe("topicHub router", () => {
  it("lists topic hub items for a project", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.topicHub.list({ projectId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("adds a manual topic hub item", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.topicHub.addManual({
      projectId: 1,
      title: "手动添加的热点话题",
      content: "这是一个测试话题",
      platform: "小红书",
      type: "manual",
    });
    expect(result).toBeDefined();
  });

  it("AI crawls trending topics", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.topicHub.crawlTrending({
      projectId: 1,
      industry: "医美",
      platform: "小红书",
    });
    expect(result).toHaveProperty("count");
    expect(typeof result.count).toBe("number");
  });
});

describe("topics router", () => {
  it("lists topics for a project", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.topics.list({ projectId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("updates a topic status", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.topics.update({ id: 1, status: "selected" });
    expect(result).toEqual({ success: true });
  });
});

describe("viralAnalysis router", () => {
  it("lists viral analyses for a project", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.viralAnalysis.list({ projectId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("runs AI viral factor analysis", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.viralAnalysis.analyze({
      projectId: 1,
      referenceContent: "这是一个测试爆款内容，用于分析爆款因子",
      contentUrl: "",
      accountPositioning: "接地气真实分享型",
    });
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("analysis");
  });
});

describe("scripts router", () => {
  it("lists scripts for a project", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.scripts.list({ projectId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("updates a script status", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.scripts.update({ id: 1, status: "review" });
    expect(result).toEqual({ success: true });
  });

  it("deletes a script", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.scripts.delete({ id: 1 });
    expect(result).toEqual({ success: true });
  });
});

describe("materials router", () => {
  it("lists materials for a project", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.materials.list({ projectId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("creates a material", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.materials.create({
      projectId: 1,
      title: "测试素材",
      type: "real_person",
      tags: ["测试", "口播"],
    });
    expect(result).toBeDefined();
  });

  it("deletes a material", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.materials.delete({ id: 1 });
    expect(result).toEqual({ success: true });
  });
});

describe("video generation router", () => {
  it("creates a Pixelle material task", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.videoGeneration.createTask({
      projectId: 1,
      scriptId: 1,
      title: "Pixelle 测试任务",
      provider: "pixelle",
      taskType: "video_clone",
      type: "real_person",
      prompt: "按参考视频结构生成营销短视频",
      referenceVideoUrl: "/_local/uploads/1/demo.mp4",
      ratio: "9:16",
      duration: 8,
      resolution: "720p",
      generateAudio: true,
      subtitlesEnabled: true,
    });

    expect(result).toMatchObject({
      materialId: 1,
      taskId: "pixelle-test-task",
      provider: "pixelle",
    });
  });
});

describe("dashboard router", () => {
  it("returns dashboard stats for user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const stats = await caller.dashboard.stats();
    expect(stats).toMatchObject({
      projects: expect.any(Number),
      topics: expect.any(Number),
      topicPlans: expect.any(Number),
      scripts: expect.any(Number),
      materials: expect.any(Number),
      publications: expect.any(Number),
      adaptations: expect.any(Number),
      analyses: expect.any(Number),
    });
  });

  it("returns dashboard content results", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dashboard.contentResults();
    expect(result.projects[0]).toMatchObject({
      project: {
        id: 1,
        name: "Test Project",
      },
      counts: {
        topicPlans: expect.any(Number),
        scripts: expect.any(Number),
        materials: expect.any(Number),
        published: expect.any(Number),
      },
    });
  });
});
