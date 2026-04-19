import { ENV } from "./env";

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
  error?: string;
  code?: string;
  details?: string;
};

export type XhsLoginStatus = {
  status?:
    | "unknown"
    | "waiting_verification"
    | "secondary_required"
    | "logged_in";
  is_logged_in: boolean;
  needs_secondary_verification?: boolean;
  username?: string;
  redId?: string;
  detail?: string;
  requirement?: "none" | "qrcode" | "phone_code" | "manual";
  qrcode_image?: string;
  has_phone_input?: boolean;
  has_code_input?: boolean;
  can_send_phone_code?: boolean;
  can_submit_phone_code?: boolean;
  session_timeout?: string;
};

export type XhsLoginQrcode = {
  timeout: string;
  is_logged_in: boolean;
  img?: string;
};

export type XhsPhoneLoginStart = {
  timeout: string;
  detail?: string;
};

export type XhsPhoneLoginAction = {
  detail?: string;
};

export type XhsFeed = {
  xsecToken: string;
  id: string;
  modelType: string;
  index: number;
  noteCard?: {
    type?: string;
    displayTitle?: string;
    user?: {
      userId?: string;
      nickname?: string;
      nickName?: string;
      avatar?: string;
    };
    interactInfo?: {
      liked?: boolean;
      likedCount?: string;
      commentCount?: string;
      sharedCount?: string;
      collected?: boolean;
      collectedCount?: string;
    };
    cover?: {
      url?: string;
      urlDefault?: string;
      urlPre?: string;
      width?: number;
      height?: number;
    };
    video?: {
      capa?: {
        duration?: number;
      };
    } | null;
  };
};

export type XhsSearchFeedsResponse = {
  feeds: XhsFeed[];
  count: number;
};

export type XhsSearchFilters = {
  sort_by?: string;
  note_type?: string;
  publish_time?: string;
  search_scope?: string;
  location?: string;
};

export type XhsUserProfile = {
  userBasicInfo?: {
    nickname?: string;
    redId?: string;
    desc?: string;
  };
  interactions?: Array<{
    type?: string;
    name?: string;
    count?: string;
  }>;
  feeds: XhsFeed[];
};

export type XhsUserProfileLookup = {
  user_id: string;
  xsec_token: string;
};

export type XhsPublishVideoInput = {
  title: string;
  content: string;
  video: string;
  tags?: string[];
  visibility?: string;
};

export type XhsPublishVideoResponse = {
  post_id?: string;
  status?: string;
};

async function requestXhsApi<T>(
  path: string,
  init: RequestInit = {},
  accountKey?: string | null
): Promise<T> {
  const baseUrl = ENV.xhsApiUrl.endsWith("/")
    ? ENV.xhsApiUrl
    : `${ENV.xhsApiUrl}/`;
  const scopedPath = accountKey
    ? `/api/v1/accounts/${encodeURIComponent(accountKey)}${path.startsWith("/") ? path : `/${path}`}`
    : path;
  const url = new URL(scopedPath.replace(/^\//, ""), baseUrl).toString();

  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `XHS API 请求失败 (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
    );
  }

  const payload = (await response.json()) as ApiEnvelope<T> | T;
  if (payload && typeof payload === "object" && "success" in payload) {
    const envelope = payload as ApiEnvelope<T>;
    if (envelope.success === false) {
      throw new Error(envelope.error || envelope.message || "XHS API 返回失败");
    }
    return (envelope.data ?? (payload as T)) as T;
  }

  return payload as T;
}

export async function getXhsLoginStatus(
  accountKey?: string | null
): Promise<XhsLoginStatus> {
  return requestXhsApi<XhsLoginStatus>("/login/status", {}, accountKey);
}

export async function startXhsLoginSession(
  accountKey?: string | null
): Promise<XhsLoginStatus> {
  return requestXhsApi<XhsLoginStatus>(
    "/login/session/start",
    {
      method: "POST",
    },
    accountKey
  );
}

export async function getXhsLoginQrcode(
  accountKey?: string | null
): Promise<XhsLoginQrcode> {
  return requestXhsApi<XhsLoginQrcode>("/login/qrcode", {}, accountKey);
}

export async function deleteXhsCookies(
  accountKey?: string | null
): Promise<void> {
  await requestXhsApi(
    "/login/cookies",
    {
      method: "DELETE",
    },
    accountKey
  );
}

export async function startXhsPhoneLogin(
  accountKey?: string | null
): Promise<XhsPhoneLoginStart> {
  return requestXhsApi<XhsPhoneLoginStart>(
    "/login/phone/start",
    {
      method: "POST",
    },
    accountKey
  );
}

export async function sendXhsPhoneLoginCode(
  phone: string,
  accountKey?: string | null
): Promise<XhsPhoneLoginAction> {
  return requestXhsApi<XhsPhoneLoginAction>(
    "/login/phone/send_code",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ phone }),
    },
    accountKey
  );
}

export async function verifyXhsPhoneLoginCode(
  code: string,
  accountKey?: string | null
): Promise<XhsPhoneLoginAction> {
  return requestXhsApi<XhsPhoneLoginAction>(
    "/login/phone/verify",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ code }),
    },
    accountKey
  );
}

export async function searchXhsFeeds(
  keyword: string,
  filters?: XhsSearchFilters,
  accountKey?: string | null
): Promise<XhsSearchFeedsResponse> {
  return requestXhsApi<XhsSearchFeedsResponse>(
    "/feeds/search",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        keyword,
        filters,
      }),
    },
    accountKey
  );
}

export async function getXhsMyProfile(
  accountKey?: string | null
): Promise<XhsUserProfile> {
  const result = await requestXhsApi<{ data?: XhsUserProfile }>(
    "/user/me",
    {},
    accountKey
  );
  return result.data ?? { feeds: [] };
}

export async function getXhsUserProfile(
  params: XhsUserProfileLookup,
  accountKey?: string | null
): Promise<XhsUserProfile> {
  const result = await requestXhsApi<{ data?: XhsUserProfile }>(
    "/user/profile",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(params),
    },
    accountKey
  );
  return result.data ?? { feeds: [] };
}

export async function publishXhsVideo(
  input: XhsPublishVideoInput,
  accountKey?: string | null
): Promise<XhsPublishVideoResponse> {
  return requestXhsApi<XhsPublishVideoResponse>(
    "/publish_video",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(600_000),
    },
    accountKey
  );
}
