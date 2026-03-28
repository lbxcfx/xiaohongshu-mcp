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

async function requestXhsApi<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const baseUrl = ENV.xhsApiUrl.endsWith("/")
    ? ENV.xhsApiUrl
    : `${ENV.xhsApiUrl}/`;
  const url = new URL(path.replace(/^\//, ""), baseUrl).toString();

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

export async function getXhsLoginStatus(): Promise<XhsLoginStatus> {
  return requestXhsApi<XhsLoginStatus>("/api/v1/login/status");
}

export async function startXhsLoginSession(): Promise<XhsLoginStatus> {
  return requestXhsApi<XhsLoginStatus>("/api/v1/login/session/start", {
    method: "POST",
  });
}

export async function getXhsLoginQrcode(): Promise<XhsLoginQrcode> {
  return requestXhsApi<XhsLoginQrcode>("/api/v1/login/qrcode");
}

export async function deleteXhsCookies(): Promise<void> {
  await requestXhsApi("/api/v1/login/cookies", {
    method: "DELETE",
  });
}

export async function startXhsPhoneLogin(): Promise<XhsPhoneLoginStart> {
  return requestXhsApi<XhsPhoneLoginStart>("/api/v1/login/phone/start", {
    method: "POST",
  });
}

export async function sendXhsPhoneLoginCode(
  phone: string
): Promise<XhsPhoneLoginAction> {
  return requestXhsApi<XhsPhoneLoginAction>("/api/v1/login/phone/send_code", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ phone }),
  });
}

export async function verifyXhsPhoneLoginCode(
  code: string
): Promise<XhsPhoneLoginAction> {
  return requestXhsApi<XhsPhoneLoginAction>("/api/v1/login/phone/verify", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ code }),
  });
}

export async function searchXhsFeeds(
  keyword: string,
  filters?: XhsSearchFilters
): Promise<XhsSearchFeedsResponse> {
  return requestXhsApi<XhsSearchFeedsResponse>("/api/v1/feeds/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      keyword,
      filters,
    }),
  });
}

export async function getXhsMyProfile(): Promise<XhsUserProfile> {
  const result = await requestXhsApi<{ data?: XhsUserProfile }>(
    "/api/v1/user/me"
  );
  return result.data ?? { feeds: [] };
}
