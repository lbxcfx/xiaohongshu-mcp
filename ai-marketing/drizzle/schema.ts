import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
  boolean,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Projects ────────────────────────────────────────────────────────────────
export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  industry: varchar("industry", { length: 128 }),
  platform: varchar("platform", { length: 128 }),
  status: mysqlEnum("status", ["active", "archived"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

// ─── Account Positionings ─────────────────────────────────────────────────────
export const positionings = mysqlTable("positionings", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId").notNull(),
  // Input fields
  industry: varchar("industry", { length: 128 }),
  track: varchar("track", { length: 128 }),
  monetizationMethod: varchar("monetizationMethod", { length: 128 }),
  targetAudience: text("targetAudience"),
  personaType: varchar("personaType", { length: 128 }),
  // AI analysis results
  analysisResult: json("analysisResult"),
  positioningRecommendation: text("positioningRecommendation"),
  viralAccountInsights: json("viralAccountInsights"),
  status: mysqlEnum("status", ["pending", "analyzing", "completed", "failed"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Positioning = typeof positionings.$inferSelect;
export type InsertPositioning = typeof positionings.$inferInsert;

// ─── Topic Hub (Information Center) ──────────────────────────────────────────
export const topicHubItems = mysqlTable("topic_hub_items", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["trending", "viral_post", "high_conversion", "manual"]).notNull(),
  platform: varchar("platform", { length: 64 }),
  title: varchar("title", { length: 512 }).notNull(),
  content: text("content"),
  url: text("url"),
  engagementScore: int("engagementScore"),
  tags: json("tags"),
  isSelected: boolean("isSelected").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TopicHubItem = typeof topicHubItems.$inferSelect;
export type InsertTopicHubItem = typeof topicHubItems.$inferInsert;

// ─── Generated Topics ─────────────────────────────────────────────────────────
export const topics = mysqlTable("topics", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  topicType: mysqlEnum("topicType", ["persona", "traffic", "marketing"]).notNull(),
  viralPotential: mysqlEnum("viralPotential", ["high", "medium", "low"]).default("medium"),
  rationale: text("rationale"),
  status: mysqlEnum("status", ["draft", "selected", "in_production", "published"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Topic = typeof topics.$inferSelect;
export type InsertTopic = typeof topics.$inferInsert;

// ─── Viral Factor Analyses ────────────────────────────────────────────────────
export const viralAnalyses = mysqlTable("viral_analyses", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId").notNull(),
  topicId: int("topicId"),
  // Input
  referenceContent: text("referenceContent"),
  contentUrl: text("contentUrl"),
  // Analysis dimensions output
  contentFormat: varchar("contentFormat", { length: 128 }),
  videoType: varchar("videoType", { length: 128 }),
  shootingStyle: text("shootingStyle"),
  environment: text("environment"),
  wardrobe: text("wardrobe"),
  personaStyle: text("personaStyle"),
  emotionTone: text("emotionTone"),
  contentStructure: text("contentStructure"),
  scriptArchitecture: text("scriptArchitecture"),
  viralFormula: text("viralFormula"),
  conversionFormula: text("conversionFormula"),
  fullAnalysis: json("fullAnalysis"),
  status: mysqlEnum("status", ["pending", "analyzing", "completed", "failed"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ViralAnalysis = typeof viralAnalyses.$inferSelect;
export type InsertViralAnalysis = typeof viralAnalyses.$inferInsert;

// ─── Scripts ──────────────────────────────────────────────────────────────────
export const scripts = mysqlTable("scripts", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId").notNull(),
  topicId: int("topicId"),
  analysisId: int("analysisId"),
  title: varchar("title", { length: 512 }).notNull(),
  hookType: mysqlEnum("hookType", ["camp_split", "anti_cognition", "curiosity"]),
  hookContent: text("hookContent"),
  mainContent: text("mainContent"),
  endingContent: text("endingContent"),
  fullScript: text("fullScript"),
  platform: varchar("platform", { length: 64 }),
  duration: int("duration"),
  status: mysqlEnum("status", ["draft", "review", "approved", "produced"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Script = typeof scripts.$inferSelect;
export type InsertScript = typeof scripts.$inferInsert;

// ─── Materials ────────────────────────────────────────────────────────────────
export const materials = mysqlTable("materials", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId").notNull(),
  scriptId: int("scriptId"),
  type: mysqlEnum("type", ["real_person", "digital_avatar", "before_after", "other"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  fileUrl: text("fileUrl"),
  thumbnailUrl: text("thumbnailUrl"),
  tags: json("tags"),
  bodyPart: varchar("bodyPart", { length: 128 }),
  treatmentType: varchar("treatmentType", { length: 128 }),
  style: varchar("style", { length: 128 }),
  status: mysqlEnum("status", ["uploading", "processing", "ready", "failed"]).default("uploading").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Material = typeof materials.$inferSelect;
export type InsertMaterial = typeof materials.$inferInsert;

// ─── Platform Adaptations ─────────────────────────────────────────────────────
export const platformAdaptations = mysqlTable("platform_adaptations", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId").notNull(),
  scriptId: int("scriptId").notNull(),
  platform: mysqlEnum("platform", ["xiaohongshu", "douyin", "instagram", "tiktok", "youtube"]).notNull(),
  title: text("title"),
  caption: text("caption"),
  hashtags: json("hashtags"),
  adaptedContent: text("adaptedContent"),
  formatNotes: text("formatNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PlatformAdaptation = typeof platformAdaptations.$inferSelect;
export type InsertPlatformAdaptation = typeof platformAdaptations.$inferInsert;

// ─── Usage Stats ──────────────────────────────────────────────────────────────
export const usageStats = mysqlTable("usage_stats", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  projectId: int("projectId"),
  module: varchar("module", { length: 64 }).notNull(),
  action: varchar("action", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UsageStat = typeof usageStats.$inferSelect;
export type InsertUsageStat = typeof usageStats.$inferInsert;
