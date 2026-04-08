export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  xhsApiUrl: process.env.XHS_API_URL ?? "http://localhost:18060",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  forgeRequestTimeoutMs: Number(
    process.env.FORGE_REQUEST_TIMEOUT_MS ?? "600000"
  ),
  arkBaseUrl:
    process.env.ARK_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3",
  arkApiKey: process.env.ARK_API_KEY ?? "",
  arkModel: process.env.ARK_MODEL ?? "doubao-seed-2-0-pro-260215",
  arkFileUploadTimeoutMs: Number(
    process.env.ARK_FILE_UPLOAD_TIMEOUT_MS ?? "900000"
  ),
  arkResponseTimeoutMs: Number(process.env.ARK_RESPONSE_TIMEOUT_MS ?? "600000"),
};
