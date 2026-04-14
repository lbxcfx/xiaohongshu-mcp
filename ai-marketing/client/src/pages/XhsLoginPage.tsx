import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { XhsLoginDialog } from "@/components/XhsLoginDialog";
import { withXhsClientHeader } from "@/lib/xhsClientId";

type LoginStatusResponse = {
  status?:
    | "unknown"
    | "waiting_verification"
    | "secondary_required"
    | "logged_in";
  is_logged_in: boolean;
  username?: string;
  detail?: string;
};

async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(
    path,
    withXhsClientHeader({
      ...init,
      headers: {
        accept: "application/json",
        ...(init.headers ?? {}),
      },
    })
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    const message =
      payload?.error || payload?.message || `请求失败 (${response.status})`;
    throw new Error(message);
  }

  return (payload?.data ?? payload) as T;
}

export default function XhsLoginPage() {
  const [dialogOpen, setDialogOpen] = useState(true);
  const [status, setStatus] = useState<LoginStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshStatus() {
    setLoading(true);
    setError(null);
    try {
      const nextStatus = await fetchJson<LoginStatusResponse>(
        "/api/xhs/login/status"
      );
      setStatus(nextStatus);
    } catch (statusError) {
      setError(
        statusError instanceof Error ? statusError.message : "读取登录状态失败"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshStatus();
  }, []);

  async function handleReset() {
    setResetting(true);
    setError(null);
    try {
      await fetchJson("/api/xhs/login/cookies", { method: "DELETE" });
      await refreshStatus();
      setDialogOpen(true);
    } catch (resetError) {
      setError(
        resetError instanceof Error ? resetError.message : "清理登录态失败"
      );
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h1 className="text-2xl font-semibold">小红书登录态切换</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            这个页面只用于切换小红书账号。先清理旧登录态，再打开官网登录窗口，用新账号扫码或验证码登录。
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm text-muted-foreground">当前状态</p>
              <p className="mt-2 text-base">
                {loading
                  ? "正在读取..."
                  : status?.is_logged_in
                    ? `已登录：${status.username || "小红书用户"}`
                    : "未登录"}
              </p>
              {status?.detail ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {status.detail}
                </p>
              ) : null}
              {error ? (
                <p className="mt-2 text-sm text-red-400">{error}</p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setDialogOpen(true)}>打开登录窗口</Button>
              <Button
                variant="outline"
                onClick={() => void refreshStatus()}
                disabled={loading}
              >
                刷新状态
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleReset()}
                disabled={resetting}
              >
                {resetting ? "正在清理..." : "清理旧登录态"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <XhsLoginDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => {
          setDialogOpen(false);
          void refreshStatus();
        }}
      />
    </div>
  );
}
