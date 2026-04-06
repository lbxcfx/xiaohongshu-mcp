import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { trpc } from "@/lib/trpc";

type XhsLoginDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

type LoginStatus =
  | "unknown"
  | "waiting_verification"
  | "secondary_required"
  | "logged_in";

type LoginStatusResponse = {
  status?: LoginStatus;
  is_logged_in: boolean;
  username?: string;
  detail?: string;
  session_timeout?: string;
};

function resolveStatus(status: LoginStatusResponse | null): LoginStatus {
  if (status?.is_logged_in) return "logged_in";
  if (status?.status) return status.status;
  return "waiting_verification";
}

async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    const message =
      payload?.error || payload?.message || `请求失败 (${response.status})`;
    throw new Error(message);
  }

  return (payload?.data ?? payload) as T;
}

function getInstruction(
  status: LoginStatusResponse | null,
  fallbackError: string | null
) {
  if (fallbackError) return fallbackError;
  if (!status) return "正在打开小红书官网登录页...";
  if (status.status === "logged_in")
    return `已登录，${status.username || "小红书用户"}`;
  if (status.status === "secondary_required") {
    return status.detail || "请在官网窗口继续完成额外安全校验";
  }
  return "请在弹出的官网登录窗口完成扫码、短信验证码或其他校验";
}

export function XhsLoginDialog({
  open,
  onOpenChange,
  onSuccess,
}: XhsLoginDialogProps) {
  const utils = trpc.useUtils();
  const pollingRef = useRef<number | null>(null);
  const successHandledRef = useRef(false);
  const onOpenChangeRef = useRef(onOpenChange);
  const onSuccessRef = useRef(onSuccess);

  const [refreshSeed, setRefreshSeed] = useState(0);
  const [status, setStatus] = useState<LoginStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
    onSuccessRef.current = onSuccess;
  }, [onOpenChange, onSuccess]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      setRefreshSeed(0);
      setStatus(null);
      setLoading(false);
      setError(null);
      successHandledRef.current = false;
      return;
    }

    let disposed = false;
    successHandledRef.current = false;

    const stopPolling = () => {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };

    const completeLogin = () => {
      if (successHandledRef.current) return;
      successHandledRef.current = true;
      stopPolling();
      onOpenChangeRef.current(false);
      onSuccessRef.current?.();

      void Promise.allSettled([
        utils.auth.me.invalidate(),
        utils.auth.status.invalidate(),
      ]).then(results => {
        const rejected = results.find(result => result.status === "rejected");
        if (rejected && rejected.status === "rejected") {
          console.warn("[XHS] refresh login cache failed", rejected.reason);
        }
      });
    };

    const syncStatus = async () => {
      const nextStatus = await fetchJson<LoginStatusResponse>(
        "/api/xhs/login/status"
      );
      if (disposed) return;
      setStatus(nextStatus);

      if (resolveStatus(nextStatus) === "logged_in") {
        completeLogin();
      }
    };

    const startPolling = () => {
      stopPolling();
      pollingRef.current = window.setInterval(() => {
        void syncStatus().catch(pollError => {
          if (!disposed) {
            setError(
              pollError instanceof Error
                ? pollError.message
                : "登录状态检查失败"
            );
          }
        });
      }, 1000);
    };

    async function boot() {
      setLoading(true);
      setError(null);
      setStatus(null);

      try {
        const nextStatus = await fetchJson<LoginStatusResponse>(
          "/api/xhs/login/session/start",
          {
            method: "POST",
          }
        );
        if (disposed) return;
        setStatus(nextStatus);
        if (resolveStatus(nextStatus) === "logged_in") {
          completeLogin();
          return;
        }
        startPolling();
      } catch (bootError) {
        if (!disposed) {
          setError(
            bootError instanceof Error ? bootError.message : "启动登录流程失败"
          );
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    }

    void boot();

    return () => {
      disposed = true;
      stopPolling();
    };
  }, [open, refreshSeed, utils]);

  const handleRefresh = () => {
    if (pollingRef.current) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setRefreshSeed(value => value + 1);
  };

  const displayStatus = resolveStatus(status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border text-foreground">
        <DialogHeader className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">小红书登录</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1">
                点击后直接打开官网登录页，按官网流程完成登录
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-secondary/40 p-4 min-h-[240px]">
            {loading ? (
              <div className="flex min-h-[208px] flex-col items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm">正在打开官网登录页...</p>
              </div>
            ) : (
              <div className="flex min-h-[208px] flex-col justify-between gap-4">
                <div className="rounded-xl border border-border bg-background/70 p-4">
                  <p className="text-sm font-medium text-foreground">
                    已切换到官网登录模式
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground leading-6">
                    页面内不再嵌入二维码。请在弹出的官网浏览器窗口完成扫码、短信验证码和其他安全校验。
                  </p>
                </div>

                <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  登录成功后会自动保存 cookies，并刷新当前账号信息。
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 text-sm">
            <div className="text-muted-foreground">
              {displayStatus === "logged_in" ? (
                <span className="text-green-400 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  已登录，{status?.username || "小红书用户"}
                </span>
              ) : (
                <span>{getInstruction(status, error)}</span>
              )}
            </div>
            {status?.session_timeout ? (
              <span className="text-xs text-muted-foreground">
                有效期：{status.session_timeout}
              </span>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className="w-4 h-4 mr-2" />
              重新打开官网
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
