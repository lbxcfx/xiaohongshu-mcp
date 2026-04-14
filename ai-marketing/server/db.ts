import { eq, and, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  InsertUser,
  users,
  xhsAccounts,
  projects,
  positionings,
  topicHubItems,
  topics,
  topicPlans,
  viralAnalyses,
  scripts,
  materials,
  platformAdaptations,
  materialPublications,
  usageStats,
  type InsertProject,
  type InsertXhsAccount,
  type InsertPositioning,
  type InsertTopicHubItem,
  type InsertTopic,
  type InsertTopicPlan,
  type InsertViralAnalysis,
  type InsertScript,
  type InsertMaterial,
  type InsertPlatformAdaptation,
  type InsertMaterialPublication,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
let _sqliteDb: DatabaseSync | null = null;

type ProjectStatus = "active" | "archived";

type SqliteProjectRow = {
  id: number;
  userId: number;
  xhsAccountId: number | null;
  name: string;
  description: string | null;
  industry: string | null;
  platform: string | null;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
};

type SqliteXhsAccountRow = {
  id: number;
  userId: number;
  accountKey: string;
  xhsUserId: string | null;
  nickname: string | null;
  avatar: string | null;
  status: string;
  cookiesPath: string | null;
  loginStatePath: string | null;
  browserUserDataDir: string | null;
  createdAt: string;
  updatedAt: string;
};

type PositioningStatus = "pending" | "analyzing" | "completed" | "failed";

type SqlitePositioningRow = {
  id: number;
  projectId: number;
  userId: number;
  industry: string | null;
  track: string | null;
  monetizationMethod: string | null;
  targetAudience: string | null;
  personaType: string | null;
  analysisResult: string | null;
  positioningRecommendation: string | null;
  viralAccountInsights: string | null;
  status: PositioningStatus;
  createdAt: string;
  updatedAt: string;
};

type TopicHubItemType =
  | "trending"
  | "viral_post"
  | "high_conversion"
  | "manual";

type SqliteTopicHubItemRow = {
  id: number;
  projectId: number;
  userId: number;
  type: TopicHubItemType;
  platform: string | null;
  title: string;
  content: string | null;
  url: string | null;
  engagementScore: number | null;
  tags: string | null;
  isSelected: number | null;
  createdAt: string;
};

type TopicStatus = "draft" | "selected" | "in_production" | "published";
type TopicType = "persona" | "traffic" | "marketing";
type ViralPotential = "high" | "medium" | "low";

type ScriptStatus = "draft" | "review" | "approved" | "produced";

type SqliteScriptRow = {
  id: number;
  projectId: number;
  userId: number;
  topicId: number | null;
  topicPlanId: number | null;
  analysisId: number | null;
  hubItemId: number | null;
  title: string;
  hookType: string | null;
  hookContent: string | null;
  mainContent: string | null;
  endingContent: string | null;
  fullScript: string | null;
  platform: string | null;
  duration: number | null;
  status: ScriptStatus;
  createdAt: string;
  updatedAt: string;
};

type SqliteTopicRow = {
  id: number;
  projectId: number;
  userId: number;
  title: string;
  description: string | null;
  topicType: TopicType;
  viralPotential: ViralPotential | null;
  rationale: string | null;
  status: TopicStatus;
  createdAt: string;
  updatedAt: string;
};

type SqliteTopicPlanRow = {
  id: number;
  projectId: number;
  userId: number;
  hubItemId: number;
  title: string;
  rationale: string | null;
  createdAt: string;
  updatedAt: string;
};

function getSqliteDbPath() {
  return (
    process.env.SQLITE_DATABASE_PATH ??
    resolve(process.cwd(), ".data", "ai-marketing.sqlite")
  );
}

function getSqliteDb() {
  if (_sqliteDb) return _sqliteDb;
  const dbPath = getSqliteDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });
  _sqliteDb = new DatabaseSync(dbPath);
  _sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      xhsAccountId INTEGER,
      name TEXT NOT NULL,
      description TEXT,
      industry TEXT,
      platform TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);
  const projectColumns = (
    _sqliteDb.prepare("PRAGMA table_info(projects)").all() as Array<{
      name: string;
    }>
  ).map(column => column.name);
  if (!projectColumns.includes("xhsAccountId")) {
    _sqliteDb.exec("ALTER TABLE projects ADD COLUMN xhsAccountId INTEGER");
  }
  _sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS xhs_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      accountKey TEXT NOT NULL,
      xhsUserId TEXT,
      nickname TEXT,
      avatar TEXT,
      status TEXT NOT NULL DEFAULT 'unknown',
      cookiesPath TEXT,
      loginStatePath TEXT,
      browserUserDataDir TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);
  _sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS positionings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      industry TEXT,
      track TEXT,
      monetizationMethod TEXT,
      targetAudience TEXT,
      personaType TEXT,
      analysisResult TEXT,
      positioningRecommendation TEXT,
      viralAccountInsights TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);
  _sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS topic_hub_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      type TEXT NOT NULL,
      platform TEXT,
      title TEXT NOT NULL,
      content TEXT,
      url TEXT,
      engagementScore INTEGER,
      tags TEXT,
      isSelected INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    )
  `);
  _sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      topicType TEXT NOT NULL DEFAULT 'traffic',
      viralPotential TEXT DEFAULT 'medium',
      rationale TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);
  _sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS topic_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      hubItemId INTEGER NOT NULL,
      title TEXT NOT NULL,
      rationale TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);
  _sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS scripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      topicId INTEGER,
      topicPlanId INTEGER,
      analysisId INTEGER,
      hubItemId INTEGER,
      title TEXT NOT NULL,
      hookType TEXT,
      hookContent TEXT,
      mainContent TEXT,
      endingContent TEXT,
      fullScript TEXT,
      platform TEXT,
      duration INTEGER,
      status TEXT NOT NULL DEFAULT 'draft',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);
  const scriptColumns = (
    _sqliteDb.prepare("PRAGMA table_info(scripts)").all() as Array<{
      name: string;
    }>
  ).map(column => column.name);
  if (!scriptColumns.includes("topicPlanId")) {
    _sqliteDb.exec("ALTER TABLE scripts ADD COLUMN topicPlanId INTEGER");
  }
  if (!scriptColumns.includes("hubItemId")) {
    _sqliteDb.exec("ALTER TABLE scripts ADD COLUMN hubItemId INTEGER");
  }
  _sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      scriptId INTEGER,
      type TEXT NOT NULL DEFAULT 'other',
      title TEXT NOT NULL,
      fileUrl TEXT,
      thumbnailUrl TEXT,
      tags TEXT,
      bodyPart TEXT,
      treatmentType TEXT,
      style TEXT,
      status TEXT NOT NULL DEFAULT 'uploading',
      provider TEXT,
      taskType TEXT,
      seedanceTaskId TEXT,
      pixelleTaskId TEXT,
      referenceImageUrl TEXT,
      prompt TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    )
  `);
  const materialColumns = (
    _sqliteDb.prepare("PRAGMA table_info(materials)").all() as Array<{
      name: string;
    }>
  ).map(column => column.name);
  if (!materialColumns.includes("provider")) {
    _sqliteDb.exec("ALTER TABLE materials ADD COLUMN provider TEXT");
  }
  if (!materialColumns.includes("taskType")) {
    _sqliteDb.exec("ALTER TABLE materials ADD COLUMN taskType TEXT");
  }
  if (!materialColumns.includes("pixelleTaskId")) {
    _sqliteDb.exec("ALTER TABLE materials ADD COLUMN pixelleTaskId TEXT");
  }
  _sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS platform_adaptations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      scriptId INTEGER NOT NULL,
      platform TEXT NOT NULL,
      title TEXT,
      caption TEXT,
      hashtags TEXT,
      adaptedContent TEXT,
      formatNotes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);
  _sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS material_publications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      materialId INTEGER NOT NULL,
      scriptId INTEGER,
      platform TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      title TEXT,
      content TEXT,
      tags TEXT,
      visibility TEXT,
      postId TEXT,
      errorMessage TEXT,
      publishedAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);
  return _sqliteDb;
}

function mapSqliteProject(row: SqliteProjectRow | undefined | null) {
  if (!row) return null;
  return {
    id: Number(row.id),
    userId: Number(row.userId),
    xhsAccountId: row.xhsAccountId,
    name: row.name,
    description: row.description,
    industry: row.industry,
    platform: row.platform,
    status: row.status,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function mapSqliteXhsAccount(row: SqliteXhsAccountRow | undefined | null) {
  if (!row) return null;
  return {
    id: Number(row.id),
    userId: Number(row.userId),
    accountKey: row.accountKey,
    xhsUserId: row.xhsUserId,
    nickname: row.nickname,
    avatar: row.avatar,
    status: row.status as "unknown" | "logged_in" | "expired",
    cookiesPath: row.cookiesPath,
    loginStatePath: row.loginStatePath,
    browserUserDataDir: row.browserUserDataDir,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function parseSqliteJson(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function mapSqlitePositioning(row: SqlitePositioningRow | undefined | null) {
  if (!row) return null;
  return {
    id: Number(row.id),
    projectId: Number(row.projectId),
    userId: Number(row.userId),
    industry: row.industry,
    track: row.track,
    monetizationMethod: row.monetizationMethod,
    targetAudience: row.targetAudience,
    personaType: row.personaType,
    analysisResult: parseSqliteJson(row.analysisResult),
    positioningRecommendation: row.positioningRecommendation,
    viralAccountInsights: parseSqliteJson(row.viralAccountInsights),
    status: row.status,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function mapSqliteTopicHubItem(row: SqliteTopicHubItemRow | undefined | null) {
  if (!row) return null;
  return {
    id: Number(row.id),
    projectId: Number(row.projectId),
    userId: Number(row.userId),
    type: row.type,
    platform: row.platform,
    title: row.title,
    content: row.content,
    url: row.url,
    engagementScore:
      row.engagementScore == null ? null : Number(row.engagementScore),
    tags: parseSqliteJson(row.tags),
    isSelected: Boolean(row.isSelected),
    createdAt: new Date(row.createdAt),
  };
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = [
      "xhsUserId",
      "xhsNickname",
      "name",
      "avatar",
      "email",
      "loginMethod",
    ] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0)
      updateSet.lastSignedIn = new Date();
    await db
      .insert(users)
      .values(values)
      .onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── XHS Accounts ─────────────────────────────────────────────────────────────
export async function getXhsAccounts(userId: number) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    const rows = sqlite
      .prepare(
        `SELECT * FROM xhs_accounts WHERE userId = ? ORDER BY datetime(updatedAt) DESC, id DESC`
      )
      .all(userId) as SqliteXhsAccountRow[];
    return rows.map(row => mapSqliteXhsAccount(row)!);
  }
  return db
    .select()
    .from(xhsAccounts)
    .where(eq(xhsAccounts.userId, userId))
    .orderBy(desc(xhsAccounts.updatedAt));
}

export async function getXhsAccountById(userId: number, id: number) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    const row = sqlite
      .prepare(`SELECT * FROM xhs_accounts WHERE userId = ? AND id = ? LIMIT 1`)
      .get(userId, id) as SqliteXhsAccountRow | undefined;
    return mapSqliteXhsAccount(row);
  }
  const rows = await db
    .select()
    .from(xhsAccounts)
    .where(and(eq(xhsAccounts.userId, userId), eq(xhsAccounts.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertXhsAccount(
  userId: number,
  data: Omit<InsertXhsAccount, "userId"> & { id?: number }
) {
  const db = await getDb();
  const now = new Date();
  if (!db) {
    const sqlite = getSqliteDb();
    const existing = sqlite
      .prepare(
        `SELECT * FROM xhs_accounts WHERE userId = ? AND accountKey = ? LIMIT 1`
      )
      .get(userId, data.accountKey) as SqliteXhsAccountRow | undefined;

    if (existing) {
      sqlite
        .prepare(
          `UPDATE xhs_accounts
           SET xhsUserId = ?, nickname = ?, avatar = ?, status = ?, cookiesPath = ?, loginStatePath = ?, browserUserDataDir = ?, updatedAt = ?
           WHERE id = ? AND userId = ?`
        )
        .run(
          data.xhsUserId ?? existing.xhsUserId,
          data.nickname ?? existing.nickname,
          data.avatar ?? existing.avatar,
          data.status ?? existing.status,
          data.cookiesPath ?? existing.cookiesPath,
          data.loginStatePath ?? existing.loginStatePath,
          data.browserUserDataDir ?? existing.browserUserDataDir,
          now.toISOString(),
          existing.id,
          userId
        );
      return getXhsAccountById(userId, existing.id);
    }

    const result = sqlite
      .prepare(
        `INSERT INTO xhs_accounts (userId, accountKey, xhsUserId, nickname, avatar, status, cookiesPath, loginStatePath, browserUserDataDir, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        userId,
        data.accountKey,
        data.xhsUserId ?? null,
        data.nickname ?? null,
        data.avatar ?? null,
        data.status ?? "unknown",
        data.cookiesPath ?? null,
        data.loginStatePath ?? null,
        data.browserUserDataDir ?? null,
        now.toISOString(),
        now.toISOString()
      );
    return getXhsAccountById(userId, Number(result.lastInsertRowid));
  }

  const existing = await db
    .select()
    .from(xhsAccounts)
    .where(
      and(
        eq(xhsAccounts.userId, userId),
        eq(xhsAccounts.accountKey, data.accountKey)
      )
    )
    .limit(1);
  const values = { ...data, userId } as InsertXhsAccount;
  if (existing[0]) {
    await db
      .update(xhsAccounts)
      .set({
        xhsUserId: values.xhsUserId,
        nickname: values.nickname,
        avatar: values.avatar,
        status: values.status,
        cookiesPath: values.cookiesPath,
        loginStatePath: values.loginStatePath,
        browserUserDataDir: values.browserUserDataDir,
        updatedAt: now,
      })
      .where(eq(xhsAccounts.id, existing[0].id));
  } else {
    await db.insert(xhsAccounts).values(values);
  }
  const rows = await db
    .select()
    .from(xhsAccounts)
    .where(
      and(
        eq(xhsAccounts.userId, userId),
        eq(xhsAccounts.accountKey, data.accountKey)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getDefaultXhsAccount(userId: number) {
  const accounts = await getXhsAccounts(userId);
  return accounts[0] ?? null;
}

// ─── Projects ─────────────────────────────────────────────────────────────────
export async function getProjects(userId: number) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    const rows = sqlite
      .prepare(
        `SELECT id, userId, xhsAccountId, name, description, industry, platform, status, createdAt, updatedAt
         FROM projects
         WHERE userId = ?
         ORDER BY datetime(createdAt) DESC, id DESC`
      )
      .all(userId) as SqliteProjectRow[];
    return rows.map(row => mapSqliteProject(row)!);
  }
  return db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.createdAt));
}

export async function getProjectById(userId: number, id: number) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    const row = sqlite
      .prepare(
        `SELECT id, userId, xhsAccountId, name, description, industry, platform, status, createdAt, updatedAt
         FROM projects
         WHERE id = ? AND userId = ?
         LIMIT 1`
      )
      .get(id, userId) as SqliteProjectRow | undefined;
    return mapSqliteProject(row);
  }
  const result = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .limit(1);
  return result[0] ?? null;
}

export async function createProject(
  userId: number,
  data: Omit<InsertProject, "userId">
) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    const now = new Date().toISOString();
    const result = sqlite
      .prepare(
        `INSERT INTO projects (userId, xhsAccountId, name, description, industry, platform, status, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`
      )
      .run(
        userId,
        data.xhsAccountId ?? null,
        data.name,
        data.description ?? null,
        data.industry ?? null,
        data.platform ?? null,
        now,
        now
      );
    const row = sqlite
      .prepare(
        `SELECT id, userId, xhsAccountId, name, description, industry, platform, status, createdAt, updatedAt
         FROM projects
         WHERE id = ?
         LIMIT 1`
      )
      .get(Number(result.lastInsertRowid)) as SqliteProjectRow | undefined;
    const project = mapSqliteProject(row);
    if (!project) throw new Error("Failed to create project in sqlite");
    return project;
  }
  const result = await db.insert(projects).values({ ...data, userId });
  const id = (result as unknown as { insertId: number }).insertId;
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  return rows[0];
}

export async function updateProject(
  userId: number,
  data: {
    id: number;
    name?: string;
    description?: string;
    industry?: string;
    platform?: string;
    xhsAccountId?: number | null;
    status?: "active" | "archived";
  }
) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    const fields: string[] = [];
    const values: Array<string | number | null> = [];
    if (data.name !== undefined) {
      fields.push("name = ?");
      values.push(data.name);
    }
    if (data.description !== undefined) {
      fields.push("description = ?");
      values.push(data.description ?? null);
    }
    if (data.industry !== undefined) {
      fields.push("industry = ?");
      values.push(data.industry ?? null);
    }
    if (data.platform !== undefined) {
      fields.push("platform = ?");
      values.push(data.platform ?? null);
    }
    if (data.xhsAccountId !== undefined) {
      fields.push("xhsAccountId = ?");
      values.push(data.xhsAccountId ?? null);
    }
    if (data.status !== undefined) {
      fields.push("status = ?");
      values.push(data.status);
    }
    fields.push("updatedAt = ?");
    values.push(new Date().toISOString());
    values.push(data.id, userId);
    sqlite
      .prepare(
        `UPDATE projects SET ${fields.join(", ")} WHERE id = ? AND userId = ?`
      )
      .run(...values);
    return { success: true };
  }
  const { id, ...rest } = data;
  await db
    .update(projects)
    .set(rest)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)));
  return { success: true };
}

export async function deleteProject(userId: number, id: number) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    sqlite
      .prepare("DELETE FROM projects WHERE id = ? AND userId = ?")
      .run(id, userId);
    return { success: true };
  }
  await db
    .delete(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)));
  return { success: true };
}

// ─── Positionings ──────────────────────────────────────────────────────────────
export async function getPositionings(userId: number, projectId: number) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    const rows = sqlite
      .prepare(
        `SELECT id, projectId, userId, industry, track, monetizationMethod, targetAudience, personaType,
                analysisResult, positioningRecommendation, viralAccountInsights, status, createdAt, updatedAt
         FROM positionings
         WHERE userId = ? AND projectId = ?
         ORDER BY datetime(createdAt) DESC, id DESC`
      )
      .all(userId, projectId) as SqlitePositioningRow[];
    return rows.map(row => mapSqlitePositioning(row)!);
  }
  return db
    .select()
    .from(positionings)
    .where(
      and(
        eq(positionings.userId, userId),
        eq(positionings.projectId, projectId)
      )
    )
    .orderBy(desc(positionings.createdAt));
}

export async function createPositioning(
  userId: number,
  data: Omit<InsertPositioning, "userId">
) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    const now = new Date().toISOString();
    const result = sqlite
      .prepare(
        `INSERT INTO positionings (
          projectId, userId, industry, track, monetizationMethod, targetAudience, personaType,
          analysisResult, positioningRecommendation, viralAccountInsights, status, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)`
      )
      .run(
        data.projectId,
        userId,
        data.industry ?? null,
        data.track ?? null,
        data.monetizationMethod ?? null,
        data.targetAudience ?? null,
        data.personaType ?? null,
        data.status ?? "pending",
        now,
        now
      );
    return Number(result.lastInsertRowid);
  }
  const result = await db.insert(positionings).values({ ...data, userId });
  const id = (result as unknown as { insertId: number }).insertId;
  return id;
}

export async function updatePositioning(
  userId: number,
  data: {
    id: number;
    positioningRecommendation?: string;
    analysisResult?: unknown;
    viralAccountInsights?: unknown;
    status?: "pending" | "analyzing" | "completed" | "failed";
  }
) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    const fields: string[] = [];
    const values: Array<string | number | null> = [];
    if (data.positioningRecommendation !== undefined) {
      fields.push("positioningRecommendation = ?");
      values.push(data.positioningRecommendation ?? null);
    }
    if (data.analysisResult !== undefined) {
      fields.push("analysisResult = ?");
      values.push(
        data.analysisResult == null ? null : JSON.stringify(data.analysisResult)
      );
    }
    if (data.viralAccountInsights !== undefined) {
      fields.push("viralAccountInsights = ?");
      values.push(
        data.viralAccountInsights == null
          ? null
          : JSON.stringify(data.viralAccountInsights)
      );
    }
    if (data.status !== undefined) {
      fields.push("status = ?");
      values.push(data.status);
    }
    fields.push("updatedAt = ?");
    values.push(new Date().toISOString());
    values.push(data.id, userId);
    sqlite
      .prepare(
        `UPDATE positionings SET ${fields.join(", ")} WHERE id = ? AND userId = ?`
      )
      .run(...values);
    return { success: true };
  }
  const { id, ...rest } = data;
  await db
    .update(positionings)
    .set(rest as Record<string, unknown>)
    .where(and(eq(positionings.id, id), eq(positionings.userId, userId)));
  return { success: true };
}

export async function deletePositioning(userId: number, id: number) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    sqlite
      .prepare("DELETE FROM positionings WHERE id = ? AND userId = ?")
      .run(id, userId);
    return { success: true };
  }
  await db
    .delete(positionings)
    .where(and(eq(positionings.id, id), eq(positionings.userId, userId)));
  return { success: true };
}

export async function deletePositioningsByProject(
  userId: number,
  projectId: number
) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    sqlite
      .prepare("DELETE FROM positionings WHERE userId = ? AND projectId = ?")
      .run(userId, projectId);
    return { success: true };
  }

  await db
    .delete(positionings)
    .where(
      and(
        eq(positionings.userId, userId),
        eq(positionings.projectId, projectId)
      )
    );
  return { success: true };
}

// ─── Topic Hub ─────────────────────────────────────────────────────────────────
export async function getTopicHubItems(userId: number, projectId: number) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    const rows = sqlite
      .prepare(
        `SELECT id, projectId, userId, type, platform, title, content, url, engagementScore, tags, isSelected, createdAt
         FROM topic_hub_items
         WHERE userId = ? AND projectId = ?
         ORDER BY datetime(createdAt) DESC, id DESC`
      )
      .all(userId, projectId) as SqliteTopicHubItemRow[];
    return rows.map(row => mapSqliteTopicHubItem(row)!);
  }
  return db
    .select()
    .from(topicHubItems)
    .where(
      and(
        eq(topicHubItems.userId, userId),
        eq(topicHubItems.projectId, projectId)
      )
    )
    .orderBy(desc(topicHubItems.createdAt));
}

export async function findTopicHubItemByNoteId(
  userId: number,
  projectId: number,
  noteId: string
) {
  const items = await getTopicHubItems(userId, projectId);
  return (
    items.find(item => {
      const tags = item.tags as Record<string, unknown> | null | undefined;
      return String(tags?.noteId ?? "") === noteId;
    }) ?? null
  );
}

export async function createTopicHubItem(
  userId: number,
  data: Omit<InsertTopicHubItem, "userId">
) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    const now = new Date().toISOString();
    const result = sqlite
      .prepare(
        `INSERT INTO topic_hub_items (
          projectId, userId, type, platform, title, content, url, engagementScore, tags, isSelected, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.projectId,
        userId,
        data.type,
        data.platform ?? null,
        data.title,
        data.content ?? null,
        data.url ?? null,
        data.engagementScore ?? null,
        data.tags == null ? null : JSON.stringify(data.tags),
        data.isSelected ? 1 : 0,
        now
      );
    const row = sqlite
      .prepare(
        `SELECT id, projectId, userId, type, platform, title, content, url, engagementScore, tags, isSelected, createdAt
         FROM topic_hub_items
         WHERE id = ?
         LIMIT 1`
      )
      .get(Number(result.lastInsertRowid)) as SqliteTopicHubItemRow | undefined;
    const item = mapSqliteTopicHubItem(row);
    if (!item) throw new Error("Failed to create topic hub item in sqlite");
    return item;
  }
  const result = await db.insert(topicHubItems).values({ ...data, userId });
  const id = (result as unknown as { insertId: number }).insertId;
  const items = await db
    .select()
    .from(topicHubItems)
    .where(eq(topicHubItems.id, id))
    .limit(1);
  return items[0];
}

export async function updateTopicHubItemTags(
  userId: number,
  data: {
    id: number;
    tags: unknown;
  }
) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    sqlite
      .prepare(
        "UPDATE topic_hub_items SET tags = ? WHERE id = ? AND userId = ?"
      )
      .run(
        data.tags == null ? null : JSON.stringify(data.tags),
        data.id,
        userId
      );
    return { success: true };
  }
  await db
    .update(topicHubItems)
    .set({ tags: data.tags as Record<string, unknown> })
    .where(
      and(eq(topicHubItems.id, data.id), eq(topicHubItems.userId, userId))
    );
  return { success: true };
}

export async function deleteTopicHubItem(userId: number, id: number) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    sqlite
      .prepare("DELETE FROM topic_hub_items WHERE id = ? AND userId = ?")
      .run(id, userId);
    return { success: true };
  }
  await db
    .delete(topicHubItems)
    .where(and(eq(topicHubItems.id, id), eq(topicHubItems.userId, userId)));
  return { success: true };
}

export async function deleteTopicHubItemsByProject(
  userId: number,
  projectId: number
) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    sqlite
      .prepare("DELETE FROM topic_hub_items WHERE projectId = ? AND userId = ?")
      .run(projectId, userId);
    return { success: true };
  }
  await db
    .delete(topicHubItems)
    .where(
      and(
        eq(topicHubItems.projectId, projectId),
        eq(topicHubItems.userId, userId)
      )
    );
  return { success: true };
}

// ─── Topics ────────────────────────────────────────────────────────────────────
function mapSqliteTopic(row: SqliteTopicRow | undefined | null) {
  if (!row) return null;
  return {
    id: Number(row.id),
    projectId: Number(row.projectId),
    userId: Number(row.userId),
    title: row.title,
    description: row.description,
    topicType: row.topicType,
    viralPotential: row.viralPotential,
    rationale: row.rationale,
    status: row.status,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

export async function getTopics(userId: number, projectId: number) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    const rows = sqlite
      .prepare(
        `SELECT id, projectId, userId, title, description, topicType, viralPotential, rationale, status, createdAt, updatedAt
         FROM topics
         WHERE userId = ? AND projectId = ?
         ORDER BY datetime(createdAt) DESC, id DESC`
      )
      .all(userId, projectId) as SqliteTopicRow[];
    return rows.map(row => mapSqliteTopic(row)!);
  }
  return db
    .select()
    .from(topics)
    .where(and(eq(topics.userId, userId), eq(topics.projectId, projectId)))
    .orderBy(desc(topics.createdAt));
}

export async function createTopic(
  userId: number,
  data: Omit<InsertTopic, "userId">
) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    const now = new Date().toISOString();
    const result = sqlite
      .prepare(
        `INSERT INTO topics (projectId, userId, title, description, topicType, viralPotential, rationale, status, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.projectId,
        userId,
        data.title,
        data.description ?? null,
        data.topicType ?? "traffic",
        data.viralPotential ?? "medium",
        data.rationale ?? null,
        data.status ?? "draft",
        now,
        now
      );
    const row = sqlite
      .prepare("SELECT * FROM topics WHERE id = ? LIMIT 1")
      .get(Number(result.lastInsertRowid)) as SqliteTopicRow | undefined;
    const topic = mapSqliteTopic(row);
    if (!topic) throw new Error("Failed to create topic in sqlite");
    return topic;
  }
  const result = await db.insert(topics).values({ ...data, userId });
  const id = (result as unknown as { insertId: number }).insertId;
  const rows = await db.select().from(topics).where(eq(topics.id, id)).limit(1);
  return rows[0];
}

export async function updateTopic(
  userId: number,
  data: {
    id: number;
    status?: "draft" | "selected" | "in_production" | "published";
    title?: string;
  }
) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    const fields: string[] = [];
    const values: Array<string | number | null> = [];
    if (data.status !== undefined) {
      fields.push("status = ?");
      values.push(data.status);
    }
    if (data.title !== undefined) {
      fields.push("title = ?");
      values.push(data.title);
    }
    fields.push("updatedAt = ?");
    values.push(new Date().toISOString());
    values.push(data.id, userId);
    sqlite
      .prepare(
        `UPDATE topics SET ${fields.join(", ")} WHERE id = ? AND userId = ?`
      )
      .run(...values);
    return { success: true };
  }
  const { id, ...rest } = data;
  await db
    .update(topics)
    .set(rest)
    .where(and(eq(topics.id, id), eq(topics.userId, userId)));
  return { success: true };
}

export async function deleteTopic(userId: number, id: number) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    sqlite
      .prepare("DELETE FROM topics WHERE id = ? AND userId = ?")
      .run(id, userId);
    return { success: true };
  }
  await db
    .delete(topics)
    .where(and(eq(topics.id, id), eq(topics.userId, userId)));
  return { success: true };
}

export async function deleteTopicsByProject(userId: number, projectId: number) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    sqlite
      .prepare("DELETE FROM topics WHERE projectId = ? AND userId = ?")
      .run(projectId, userId);
    return { success: true };
  }
  await db
    .delete(topics)
    .where(and(eq(topics.projectId, projectId), eq(topics.userId, userId)));
  return { success: true };
}

function mapSqliteTopicPlan(row: SqliteTopicPlanRow | undefined | null) {
  if (!row) return null;
  return {
    id: Number(row.id),
    projectId: Number(row.projectId),
    userId: Number(row.userId),
    hubItemId: Number(row.hubItemId),
    title: row.title,
    rationale: row.rationale,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

export async function getTopicPlans(userId: number, projectId: number) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    const rows = sqlite
      .prepare(
        `SELECT id, projectId, userId, hubItemId, title, rationale, createdAt, updatedAt
         FROM topic_plans
         WHERE userId = ? AND projectId = ?
         ORDER BY datetime(createdAt) DESC, id DESC`
      )
      .all(userId, projectId) as SqliteTopicPlanRow[];
    return rows.map(row => mapSqliteTopicPlan(row)!);
  }
  return db
    .select()
    .from(topicPlans)
    .where(
      and(eq(topicPlans.userId, userId), eq(topicPlans.projectId, projectId))
    )
    .orderBy(desc(topicPlans.createdAt));
}

export async function createTopicPlan(
  userId: number,
  data: Omit<InsertTopicPlan, "userId">
) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    const now = new Date().toISOString();
    const result = sqlite
      .prepare(
        `INSERT INTO topic_plans (projectId, userId, hubItemId, title, rationale, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.projectId,
        userId,
        data.hubItemId,
        data.title,
        data.rationale ?? null,
        now,
        now
      );
    const row = sqlite
      .prepare("SELECT * FROM topic_plans WHERE id = ? LIMIT 1")
      .get(Number(result.lastInsertRowid)) as SqliteTopicPlanRow | undefined;
    const topicPlan = mapSqliteTopicPlan(row);
    if (!topicPlan) throw new Error("Failed to create topic plan in sqlite");
    return topicPlan;
  }
  const result = await db.insert(topicPlans).values({ ...data, userId });
  const id = (result as unknown as { insertId: number }).insertId;
  const rows = await db
    .select()
    .from(topicPlans)
    .where(eq(topicPlans.id, id))
    .limit(1);
  return rows[0];
}

export async function deleteTopicPlansByProject(
  userId: number,
  projectId: number
) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    sqlite
      .prepare("DELETE FROM topic_plans WHERE projectId = ? AND userId = ?")
      .run(projectId, userId);
    return { success: true };
  }
  await db
    .delete(topicPlans)
    .where(
      and(eq(topicPlans.projectId, projectId), eq(topicPlans.userId, userId))
    );
  return { success: true };
}

// ─── Viral Analyses ────────────────────────────────────────────────────────────
export async function getViralAnalyses(userId: number, projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(viralAnalyses)
    .where(
      and(
        eq(viralAnalyses.userId, userId),
        eq(viralAnalyses.projectId, projectId)
      )
    )
    .orderBy(desc(viralAnalyses.createdAt));
}

export async function createViralAnalysis(
  userId: number,
  data: Omit<InsertViralAnalysis, "userId">
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(viralAnalyses).values({ ...data, userId });
  return (result as unknown as { insertId: number }).insertId;
}

export async function updateViralAnalysis(
  userId: number,
  data: {
    id: number;
    viralFormula?: string;
    conversionFormula?: string;
    fullAnalysis?: unknown;
    status?: "pending" | "analyzing" | "completed" | "failed";
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { id, ...rest } = data;
  await db
    .update(viralAnalyses)
    .set(rest as Record<string, unknown>)
    .where(and(eq(viralAnalyses.id, id), eq(viralAnalyses.userId, userId)));
  return { success: true };
}

// ─── Scripts ───────────────────────────────────────────────────────────────────
function mapSqliteScript(row: SqliteScriptRow | undefined | null) {
  if (!row) return null;
  return {
    id: Number(row.id),
    projectId: Number(row.projectId),
    userId: Number(row.userId),
    topicId: row.topicId != null ? Number(row.topicId) : null,
    topicPlanId: row.topicPlanId != null ? Number(row.topicPlanId) : null,
    analysisId: row.analysisId != null ? Number(row.analysisId) : null,
    hubItemId: row.hubItemId != null ? Number(row.hubItemId) : null,
    title: row.title,
    hookType: row.hookType,
    hookContent: row.hookContent,
    mainContent: row.mainContent,
    endingContent: row.endingContent,
    fullScript: row.fullScript,
    platform: row.platform,
    duration: row.duration != null ? Number(row.duration) : null,
    status: row.status,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

export async function getScripts(userId: number, projectId: number) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    const rows = sqlite
      .prepare(
        `SELECT * FROM scripts WHERE userId = ? AND projectId = ? ORDER BY datetime(createdAt) DESC, id DESC`
      )
      .all(userId, projectId) as SqliteScriptRow[];
    return rows.map(row => mapSqliteScript(row)!);
  }
  return db
    .select()
    .from(scripts)
    .where(and(eq(scripts.userId, userId), eq(scripts.projectId, projectId)))
    .orderBy(desc(scripts.createdAt));
}

export async function createScript(
  userId: number,
  data: Omit<InsertScript, "userId">
) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    const now = new Date().toISOString();
    const result = sqlite
      .prepare(
        `INSERT INTO scripts (projectId, userId, topicId, topicPlanId, analysisId, hubItemId, title, hookType, hookContent, mainContent, endingContent, fullScript, platform, duration, status, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.projectId,
        userId,
        data.topicId ?? null,
        data.topicPlanId ?? null,
        data.analysisId ?? null,
        data.hubItemId ?? null,
        data.title,
        data.hookType ?? null,
        data.hookContent ?? null,
        data.mainContent ?? null,
        data.endingContent ?? null,
        data.fullScript ?? null,
        data.platform ?? null,
        data.duration ?? null,
        data.status ?? "draft",
        now,
        now
      );
    return Number(result.lastInsertRowid);
  }
  const result = await db.insert(scripts).values({ ...data, userId });
  return (result as unknown as { insertId: number }).insertId;
}

export async function updateScript(
  userId: number,
  data: {
    id: number;
    status?: "draft" | "review" | "approved" | "produced";
    fullScript?: string;
    title?: string;
  }
) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    const fields: string[] = [];
    const values: Array<string | number | null> = [];
    if (data.status !== undefined) {
      fields.push("status = ?");
      values.push(data.status);
    }
    if (data.fullScript !== undefined) {
      fields.push("fullScript = ?");
      values.push(data.fullScript);
    }
    if (data.title !== undefined) {
      fields.push("title = ?");
      values.push(data.title);
    }
    fields.push("updatedAt = ?");
    values.push(new Date().toISOString());
    values.push(data.id, userId);
    sqlite
      .prepare(
        `UPDATE scripts SET ${fields.join(", ")} WHERE id = ? AND userId = ?`
      )
      .run(...values);
    return { success: true };
  }
  const { id, ...rest } = data;
  await db
    .update(scripts)
    .set(rest)
    .where(and(eq(scripts.id, id), eq(scripts.userId, userId)));
  return { success: true };
}

export async function deleteScript(userId: number, id: number) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    sqlite
      .prepare("DELETE FROM scripts WHERE id = ? AND userId = ?")
      .run(id, userId);
    return { success: true };
  }
  await db
    .delete(scripts)
    .where(and(eq(scripts.id, id), eq(scripts.userId, userId)));
  return { success: true };
}

// ─── Materials ─────────────────────────────────────────────────────────────────

type SqliteMaterialRow = {
  id: number;
  projectId: number;
  userId: number;
  scriptId: number | null;
  type: string;
  title: string;
  fileUrl: string | null;
  thumbnailUrl: string | null;
  tags: string | null;
  bodyPart: string | null;
  treatmentType: string | null;
  style: string | null;
  status: string;
  provider: string | null;
  taskType: string | null;
  seedanceTaskId: string | null;
  pixelleTaskId: string | null;
  referenceImageUrl: string | null;
  prompt: string | null;
  createdAt: string;
  updatedAt: string;
};

type SqlitePlatformAdaptationRow = {
  id: number;
  projectId: number;
  userId: number;
  scriptId: number;
  platform: string;
  title: string | null;
  caption: string | null;
  hashtags: string | null;
  adaptedContent: string | null;
  formatNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

type SqliteMaterialPublicationRow = {
  id: number;
  projectId: number;
  userId: number;
  materialId: number;
  scriptId: number | null;
  platform: string;
  status: string;
  title: string | null;
  content: string | null;
  tags: string | null;
  visibility: string | null;
  postId: string | null;
  errorMessage: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapSqliteMaterial(row: SqliteMaterialRow | undefined | null) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    scriptId: row.scriptId,
    type: row.type as
      | "real_person"
      | "digital_avatar"
      | "before_after"
      | "other",
    title: row.title,
    fileUrl: row.fileUrl,
    thumbnailUrl: row.thumbnailUrl,
    tags: row.tags ? (JSON.parse(row.tags) as string[]) : null,
    bodyPart: row.bodyPart,
    treatmentType: row.treatmentType,
    style: row.style,
    status: row.status as "uploading" | "processing" | "ready" | "failed",
    provider: row.provider,
    taskType: row.taskType,
    seedanceTaskId: row.seedanceTaskId,
    pixelleTaskId: row.pixelleTaskId,
    referenceImageUrl: row.referenceImageUrl,
    prompt: row.prompt,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function mapSqlitePlatformAdaptation(
  row: SqlitePlatformAdaptationRow | undefined | null
) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    scriptId: row.scriptId,
    platform: row.platform as
      | "xiaohongshu"
      | "douyin"
      | "instagram"
      | "tiktok"
      | "youtube",
    title: row.title,
    caption: row.caption,
    hashtags: parseSqliteJson(row.hashtags) as string[] | null,
    adaptedContent: row.adaptedContent,
    formatNotes: row.formatNotes,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function mapSqliteMaterialPublication(
  row: SqliteMaterialPublicationRow | undefined | null
) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    materialId: row.materialId,
    scriptId: row.scriptId,
    platform: row.platform as "xiaohongshu",
    status: row.status as "draft" | "publishing" | "published" | "failed",
    title: row.title,
    content: row.content,
    tags: parseSqliteJson(row.tags) as string[] | null,
    visibility: row.visibility,
    postId: row.postId,
    errorMessage: row.errorMessage,
    publishedAt: row.publishedAt ? new Date(row.publishedAt) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

export async function getMaterials(userId: number, projectId: number) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    const rows = sqlite
      .prepare(
        "SELECT * FROM materials WHERE userId = ? AND projectId = ? ORDER BY createdAt DESC"
      )
      .all(userId, projectId) as SqliteMaterialRow[];
    return rows.map(r => mapSqliteMaterial(r)!);
  }
  return db
    .select()
    .from(materials)
    .where(
      and(eq(materials.userId, userId), eq(materials.projectId, projectId))
    )
    .orderBy(desc(materials.createdAt));
}

export async function createMaterial(
  userId: number,
  data: Omit<InsertMaterial, "userId"> & {
    provider?: string;
    taskType?: string;
    seedanceTaskId?: string;
    pixelleTaskId?: string;
    referenceImageUrl?: string;
    prompt?: string;
  }
) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    const now = new Date().toISOString();
    const result = sqlite
      .prepare(
        `INSERT INTO materials (projectId, userId, scriptId, type, title, fileUrl, thumbnailUrl, tags, bodyPart, treatmentType, style, status, provider, taskType, seedanceTaskId, pixelleTaskId, referenceImageUrl, prompt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.projectId,
        userId,
        data.scriptId ?? null,
        data.type ?? "other",
        data.title,
        data.fileUrl ?? null,
        data.thumbnailUrl ?? null,
        data.tags ? JSON.stringify(data.tags) : null,
        data.bodyPart ?? null,
        data.treatmentType ?? null,
        data.style ?? null,
        data.status ?? "uploading",
        data.provider ?? null,
        data.taskType ?? null,
        data.seedanceTaskId ?? null,
        data.pixelleTaskId ?? null,
        data.referenceImageUrl ?? null,
        data.prompt ?? null,
        now,
        now
      );
    return Number(
      (result as { lastInsertRowid: number | bigint }).lastInsertRowid
    );
  }
  const result = await db
    .insert(materials)
    .values({ ...data, userId } as InsertMaterial);
  return (result as unknown as { insertId: number }).insertId;
}

export async function updateMaterial(
  userId: number,
  data: {
    id: number;
    status?: "uploading" | "processing" | "ready" | "failed";
    tags?: string[];
    fileUrl?: string;
    thumbnailUrl?: string;
    provider?: string;
    taskType?: string;
    seedanceTaskId?: string;
    pixelleTaskId?: string;
    referenceImageUrl?: string;
    prompt?: string;
  }
) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    const { id, ...rest } = data;
    const sets: string[] = [];
    const vals: Array<string | number | null> = [];
    if (rest.status !== undefined) {
      sets.push("status = ?");
      vals.push(rest.status);
    }
    if (rest.tags !== undefined) {
      sets.push("tags = ?");
      vals.push(JSON.stringify(rest.tags));
    }
    if (rest.fileUrl !== undefined) {
      sets.push("fileUrl = ?");
      vals.push(rest.fileUrl);
    }
    if (rest.thumbnailUrl !== undefined) {
      sets.push("thumbnailUrl = ?");
      vals.push(rest.thumbnailUrl);
    }
    if (rest.provider !== undefined) {
      sets.push("provider = ?");
      vals.push(rest.provider);
    }
    if (rest.taskType !== undefined) {
      sets.push("taskType = ?");
      vals.push(rest.taskType);
    }
    if (rest.seedanceTaskId !== undefined) {
      sets.push("seedanceTaskId = ?");
      vals.push(rest.seedanceTaskId);
    }
    if (rest.pixelleTaskId !== undefined) {
      sets.push("pixelleTaskId = ?");
      vals.push(rest.pixelleTaskId);
    }
    if (rest.referenceImageUrl !== undefined) {
      sets.push("referenceImageUrl = ?");
      vals.push(rest.referenceImageUrl);
    }
    if (rest.prompt !== undefined) {
      sets.push("prompt = ?");
      vals.push(rest.prompt);
    }
    if (sets.length === 0) return { success: true };
    sets.push("updatedAt = ?");
    vals.push(new Date().toISOString());
    vals.push(id, userId);
    sqlite
      .prepare(
        `UPDATE materials SET ${sets.join(", ")} WHERE id = ? AND userId = ?`
      )
      .run(...vals);
    return { success: true };
  }
  const { id, ...rest } = data;
  await db
    .update(materials)
    .set(rest as Record<string, unknown>)
    .where(and(eq(materials.id, id), eq(materials.userId, userId)));
  return { success: true };
}

export async function deleteMaterial(userId: number, id: number) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    sqlite
      .prepare("DELETE FROM materials WHERE id = ? AND userId = ?")
      .run(id, userId);
    return { success: true };
  }
  await db
    .delete(materials)
    .where(and(eq(materials.id, id), eq(materials.userId, userId)));
  return { success: true };
}

// ─── Platform Adaptations ──────────────────────────────────────────────────────
export async function getPlatformAdaptations(userId: number, scriptId: number) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    const rows = sqlite
      .prepare(
        `SELECT * FROM platform_adaptations
         WHERE userId = ? AND scriptId = ?
         ORDER BY datetime(createdAt) DESC, id DESC`
      )
      .all(userId, scriptId) as SqlitePlatformAdaptationRow[];
    return rows.map(row => mapSqlitePlatformAdaptation(row)!);
  }
  return db
    .select()
    .from(platformAdaptations)
    .where(
      and(
        eq(platformAdaptations.userId, userId),
        eq(platformAdaptations.scriptId, scriptId)
      )
    )
    .orderBy(desc(platformAdaptations.createdAt));
}

export async function getPlatformAdaptationsByProject(
  userId: number,
  projectId: number
) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    const rows = sqlite
      .prepare(
        `SELECT * FROM platform_adaptations
         WHERE userId = ? AND projectId = ?
         ORDER BY datetime(createdAt) DESC, id DESC`
      )
      .all(userId, projectId) as SqlitePlatformAdaptationRow[];
    return rows.map(row => mapSqlitePlatformAdaptation(row)!);
  }
  return db
    .select()
    .from(platformAdaptations)
    .where(
      and(
        eq(platformAdaptations.userId, userId),
        eq(platformAdaptations.projectId, projectId)
      )
    )
    .orderBy(desc(platformAdaptations.createdAt));
}

export async function createPlatformAdaptation(
  userId: number,
  data: Omit<InsertPlatformAdaptation, "userId">
) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    const now = new Date().toISOString();
    const result = sqlite
      .prepare(
        `INSERT INTO platform_adaptations (
          projectId, userId, scriptId, platform, title, caption, hashtags,
          adaptedContent, formatNotes, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.projectId,
        userId,
        data.scriptId,
        data.platform,
        data.title ?? null,
        data.caption ?? null,
        data.hashtags ? JSON.stringify(data.hashtags) : null,
        data.adaptedContent ?? null,
        data.formatNotes ?? null,
        now,
        now
      );
    return Number(
      (result as { lastInsertRowid: number | bigint }).lastInsertRowid
    );
  }
  const result = await db
    .insert(platformAdaptations)
    .values({ ...data, userId });
  return (result as unknown as { insertId: number }).insertId;
}

export async function getMaterialPublications(
  userId: number,
  projectId: number
) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    const rows = sqlite
      .prepare(
        `SELECT * FROM material_publications
         WHERE userId = ? AND projectId = ?
         ORDER BY datetime(createdAt) DESC, id DESC`
      )
      .all(userId, projectId) as SqliteMaterialPublicationRow[];
    return rows.map(row => mapSqliteMaterialPublication(row)!);
  }
  return db
    .select()
    .from(materialPublications)
    .where(
      and(
        eq(materialPublications.userId, userId),
        eq(materialPublications.projectId, projectId)
      )
    )
    .orderBy(desc(materialPublications.createdAt));
}

export async function upsertMaterialPublication(
  userId: number,
  data: Omit<InsertMaterialPublication, "userId"> & {
    materialId: number;
    platform: "xiaohongshu";
  }
) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    const existing = sqlite
      .prepare(
        `SELECT id FROM material_publications
         WHERE userId = ? AND materialId = ? AND platform = ?
         LIMIT 1`
      )
      .get(userId, data.materialId, data.platform) as
      | { id: number }
      | undefined;
    const now = new Date().toISOString();

    if (existing) {
      sqlite
        .prepare(
          `UPDATE material_publications
           SET projectId = ?, scriptId = ?, status = ?, title = ?, content = ?, tags = ?,
               visibility = ?, postId = ?, errorMessage = ?, publishedAt = ?, updatedAt = ?
           WHERE id = ?`
        )
        .run(
          data.projectId,
          data.scriptId ?? null,
          data.status ?? "draft",
          data.title ?? null,
          data.content ?? null,
          data.tags ? JSON.stringify(data.tags) : null,
          data.visibility ?? null,
          data.postId ?? null,
          data.errorMessage ?? null,
          data.publishedAt ? new Date(data.publishedAt).toISOString() : null,
          now,
          existing.id
        );
      return existing.id;
    }

    const result = sqlite
      .prepare(
        `INSERT INTO material_publications (
          projectId, userId, materialId, scriptId, platform, status, title, content,
          tags, visibility, postId, errorMessage, publishedAt, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.projectId,
        userId,
        data.materialId,
        data.scriptId ?? null,
        data.platform,
        data.status ?? "draft",
        data.title ?? null,
        data.content ?? null,
        data.tags ? JSON.stringify(data.tags) : null,
        data.visibility ?? null,
        data.postId ?? null,
        data.errorMessage ?? null,
        data.publishedAt ? new Date(data.publishedAt).toISOString() : null,
        now,
        now
      );
    return Number(
      (result as { lastInsertRowid: number | bigint }).lastInsertRowid
    );
  }

  const existing = await db
    .select({ id: materialPublications.id })
    .from(materialPublications)
    .where(
      and(
        eq(materialPublications.userId, userId),
        eq(materialPublications.materialId, data.materialId),
        eq(materialPublications.platform, data.platform)
      )
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(materialPublications)
      .set({ ...data } as Record<string, unknown>)
      .where(
        and(
          eq(materialPublications.id, existing[0].id),
          eq(materialPublications.userId, userId)
        )
      );
    return existing[0].id;
  }

  const result = await db
    .insert(materialPublications)
    .values({ ...data, userId } as InsertMaterialPublication);
  return (result as unknown as { insertId: number }).insertId;
}

// ─── Usage Stats ───────────────────────────────────────────────────────────────
export async function logUsage(
  userId: number,
  projectId: number | undefined,
  module: string,
  action: string
) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(usageStats).values({ userId, projectId, module, action });
  } catch {
    /* non-critical */
  }
}

export async function getDashboardStats(userId: number) {
  const db = await getDb();
  if (!db) {
    const sqlite = getSqliteDb();
    const countRows = (table: string) => {
      const row = sqlite
        .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE userId = ?`)
        .get(userId) as { count: number } | undefined;
      return Number(row?.count ?? 0);
    };
    const hubRows = sqlite
      .prepare("SELECT tags FROM topic_hub_items WHERE userId = ?")
      .all(userId) as Array<{ tags: string | null }>;
    const completedAnalyses = hubRows.filter(row => {
      try {
        const tags = row.tags
          ? (JSON.parse(row.tags) as Record<string, unknown>)
          : {};
        return tags.videoAnalysisStatus === "completed";
      } catch {
        return false;
      }
    }).length;

    return {
      projects: countRows("projects"),
      topicHubItems: countRows("topic_hub_items"),
      topics: countRows("topics"),
      topicPlans: countRows("topic_plans"),
      scripts: countRows("scripts"),
      materials: countRows("materials"),
      adaptations: countRows("platform_adaptations"),
      publications: countRows("material_publications"),
      analyses: completedAnalyses,
    };
  }
  const [
    projectCount,
    topicHubItemCount,
    topicCount,
    topicPlanCount,
    scriptCount,
    materialCount,
    adaptationCount,
    publicationCount,
    analysisCount,
  ] = await Promise.all([
    db.select().from(projects).where(eq(projects.userId, userId)),
    db.select().from(topicHubItems).where(eq(topicHubItems.userId, userId)),
    db.select().from(topics).where(eq(topics.userId, userId)),
    db.select().from(topicPlans).where(eq(topicPlans.userId, userId)),
    db.select().from(scripts).where(eq(scripts.userId, userId)),
    db.select().from(materials).where(eq(materials.userId, userId)),
    db
      .select()
      .from(platformAdaptations)
      .where(eq(platformAdaptations.userId, userId)),
    db
      .select()
      .from(materialPublications)
      .where(eq(materialPublications.userId, userId)),
    db.select().from(viralAnalyses).where(eq(viralAnalyses.userId, userId)),
  ]);
  const completedHubAnalyses = topicHubItemCount.filter(item => {
    const tags = item.tags as Record<string, unknown> | null | undefined;
    return tags?.videoAnalysisStatus === "completed";
  }).length;
  return {
    projects: projectCount.length,
    topicHubItems: topicHubItemCount.length,
    topics: topicCount.length,
    topicPlans: topicPlanCount.length,
    scripts: scriptCount.length,
    materials: materialCount.length,
    adaptations: adaptationCount.length,
    publications: publicationCount.length,
    analyses: analysisCount.length + completedHubAnalyses,
  };
}
