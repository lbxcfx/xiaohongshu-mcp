import { useEffect, useMemo, useState } from "react";
import { Streamdown } from "streamdown";
import {
  AlertTriangle,
  Brain,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

interface Props {
  projectId: string;
}

type TopicHubTagMeta = {
  coverUrl?: string;
  coverDownloadPath?: string;
  authorName?: string;
  duration?: number;
  videoDownloadStatus?: "idle" | "pending" | "success" | "failed" | "skipped";
  videoDownloadError?: string;
  videoDownloadQueuedAt?: string;
  videoDownloadStartedAt?: string;
  videoDownloadFinishedAt?: string;
  videoAnalysisStatus?: "pending" | "analyzing" | "completed" | "failed";
  videoAnalysisResult?: string;
  videoAnalysisError?: string;
  videoAnalysisQueuedAt?: string;
  videoAnalysisStartedAt?: string;
  videoAnalysisFinishedAt?: string;
};

function toLocalAssetUrl(filePath?: string) {
  if (!filePath) return undefined;
  const normalized = filePath.replace(/\\/g, "/");
  const marker = "/.data/";
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex < 0) return undefined;
  return `/_local/${normalized.slice(markerIndex + marker.length)}`;
}

function formatDuration(seconds?: number) {
  if (!seconds) return undefined;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getStatusLabel(meta: TopicHubTagMeta) {
  if (meta.videoAnalysisStatus === "completed") return "分析完成";
  if (meta.videoAnalysisStatus === "failed") return "分析失败";
  if (meta.videoAnalysisStatus === "analyzing") return "分析中";
  if (meta.videoAnalysisStatus === "pending") return "待分析";
  if (meta.videoDownloadStatus === "pending") return "下载中";
  return "待分析";
}

function getStatusClass(meta: TopicHubTagMeta) {
  if (meta.videoAnalysisStatus === "completed") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
  }
  if (meta.videoAnalysisStatus === "failed") {
    return "border-red-500/30 bg-red-500/10 text-red-400";
  }
  if (
    meta.videoAnalysisStatus === "pending" ||
    meta.videoAnalysisStatus === "analyzing" ||
    meta.videoDownloadStatus === "pending"
  ) {
    return "border-amber-500/30 bg-amber-500/10 text-amber-400";
  }
  return "border-border bg-muted/30 text-muted-foreground";
}

function hasRequestedAnalysis(meta: TopicHubTagMeta) {
  return Boolean(
    meta.videoDownloadQueuedAt ||
      meta.videoDownloadStartedAt ||
      meta.videoDownloadFinishedAt ||
      meta.videoAnalysisQueuedAt ||
      meta.videoAnalysisStartedAt ||
      meta.videoAnalysisFinishedAt
  );
}

export default function ViralAnalysis({ projectId }: Props) {
  const pid = Number.parseInt(projectId, 10);
  const utils = trpc.useUtils();
  const [pollingEnabled, setPollingEnabled] = useState(false);

  const { data: items, isLoading } = trpc.topicHub.list.useQuery(
    { projectId: pid },
    { refetchInterval: pollingEnabled ? 5000 : false }
  );

  const requestAnalysisMutation =
    trpc.topicHub.requestVideoAnalysis.useMutation({
      onSuccess: async () => {
        await utils.topicHub.list.invalidate({ projectId: pid });
        toast.success("已加入下载/分析队列");
      },
      onError: error => {
        toast.error(error.message || "AI分析触发失败");
      },
    });

  const analysisItems = useMemo(() => {
    return (items ?? [])
      .filter(item => item.platform === "xiaohongshu")
      .filter(item => {
        const meta = (item.tags ?? {}) as TopicHubTagMeta;
        return hasRequestedAnalysis(meta);
      })
      .sort((a, b) => b.id - a.id);
  }, [items]);

  useEffect(() => {
    const hasActive = analysisItems.some(item => {
      const meta = (item.tags ?? {}) as TopicHubTagMeta;
      return (
        meta.videoDownloadStatus === "pending" ||
        meta.videoAnalysisStatus === "pending" ||
        meta.videoAnalysisStatus === "analyzing"
      );
    });
    setPollingEnabled(hasActive);
  }, [analysisItems]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Brain className="h-6 w-6 text-amber-400" />
            爆款分析
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            展示已触发 AI分析 的视频，以及对应的 Ark 爆款因子分析结果。
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => utils.topicHub.list.invalidate({ projectId: pid })}
        >
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          刷新
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(item => (
            <div key={item} className="h-72 rounded-3xl shimmer" />
          ))}
        </div>
      ) : analysisItems.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            还没有触发 AI分析 的视频。请先前往 Topic Hub 页面点击视频下方的
            `AI分析`。
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {analysisItems.map(item => {
            const meta = (item.tags ?? {}) as TopicHubTagMeta;
            const cover =
              toLocalAssetUrl(meta.coverDownloadPath) || meta.coverUrl;
            const duration = formatDuration(meta.duration);
            const active =
              requestAnalysisMutation.isPending &&
              requestAnalysisMutation.variables?.id === item.id;

            return (
              <Card
                key={item.id}
                className="overflow-hidden rounded-3xl border-border bg-card"
              >
                <CardContent className="p-0">
                  <div className="grid gap-0 lg:grid-cols-[280px_minmax(0,1fr)]">
                    <div className="border-b border-border/70 bg-muted/20 p-4 lg:border-b-0 lg:border-r">
                      <div className="relative overflow-hidden rounded-2xl bg-muted">
                        <div className="aspect-[3/4]">
                          {cover ? (
                            <img
                              src={cover}
                              alt={item.title}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                              暂无封面
                            </div>
                          )}
                        </div>
                        {duration ? (
                          <div className="absolute bottom-3 right-3 rounded-full bg-black/70 px-2 py-1 text-xs text-white">
                            {duration}
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-4 space-y-3">
                        <Badge
                          variant="outline"
                          className={getStatusClass(meta)}
                        >
                          {getStatusLabel(meta)}
                        </Badge>

                        <div>
                          <div className="line-clamp-2 text-sm font-medium text-foreground">
                            {item.title}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {meta.authorName || "小红书用户"}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {item.url ? (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-foreground transition-colors hover:border-primary hover:text-primary"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              原视频
                            </a>
                          ) : null}

                          {(meta.videoAnalysisStatus === "failed" ||
                            meta.videoDownloadStatus === "failed") && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                requestAnalysisMutation.mutate({
                                  id: item.id,
                                  projectId: pid,
                                })
                              }
                              disabled={active}
                              className="h-7 rounded-full px-3 text-xs"
                            >
                              {active ? (
                                <>
                                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                  处理中
                                </>
                              ) : (
                                "重新AI分析"
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="p-5 lg:p-6">
                      {meta.videoAnalysisStatus === "completed" &&
                      meta.videoAnalysisResult ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <Sparkles className="h-4 w-4 text-primary" />
                            爆款因子分析结果
                          </div>
                          <div className="prose prose-invert max-w-none text-sm leading-7 text-foreground/90">
                            <Streamdown>{meta.videoAnalysisResult}</Streamdown>
                          </div>
                        </div>
                      ) : meta.videoAnalysisStatus === "failed" ? (
                        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200">
                          <div className="flex items-center gap-2 font-medium">
                            <AlertTriangle className="h-4 w-4" />
                            分析失败
                          </div>
                          <p className="mt-2 leading-7 text-red-100/80">
                            {meta.videoAnalysisError || "未知错误"}
                          </p>
                        </div>
                      ) : meta.videoDownloadStatus === "failed" ? (
                        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200">
                          <div className="flex items-center gap-2 font-medium">
                            <AlertTriangle className="h-4 w-4" />
                            下载失败
                          </div>
                          <p className="mt-2 leading-7 text-red-100/80">
                            {meta.videoDownloadError || "未知错误"}
                          </p>
                        </div>
                      ) : (
                        <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-dashed border-border/70 bg-background/20 px-6 text-center text-sm text-muted-foreground">
                          <div>
                            <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
                            {meta.videoDownloadStatus === "pending"
                              ? "正在下载视频，完成后会自动进入 Ark 分析。"
                              : "Ark 正在分析视频内容，请稍后刷新查看结果。"}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
