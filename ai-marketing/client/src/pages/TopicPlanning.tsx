import { useMemo, useState } from "react";
import { Streamdown } from "streamdown";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ExternalLink,
  Heart,
  Loader2,
  MessageCircle,
  RefreshCw,
  Share2,
  Sparkles,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

interface Props {
  projectId: string;
}

type TopicHubTagMeta = {
  coverUrl?: string;
  coverDownloadPath?: string;
  authorName?: string;
  likedCount?: number;
  commentCount?: number;
  sharedCount?: number;
  duration?: number;
  videoAnalysisStatus?: "pending" | "analyzing" | "completed" | "failed";
  videoAnalysisResult?: string;
  topicGenerationExcluded?: boolean;
  [key: string]: unknown;
};

function formatCount(value?: number) {
  if (!value) return "0";
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`;
  return String(value);
}

function formatDuration(seconds?: number) {
  if (!seconds) return undefined;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function toLocalAssetUrl(filePath?: string) {
  if (!filePath) return undefined;
  const normalized = filePath.replace(/\\/g, "/");
  const marker = "/.data/";
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex < 0) return undefined;
  return `/_local/${normalized.slice(markerIndex + marker.length)}`;
}

export default function TopicPlanning({ projectId }: Props) {
  const pid = Number.parseInt(projectId, 10);
  const utils = trpc.useUtils();
  const [expandedPositioning, setExpandedPositioning] = useState(false);

  const { data: positionings } = trpc.positioning.list.useQuery({
    projectId: pid,
  });
  const { data: hubItems, isLoading: hubItemsLoading } =
    trpc.topicHub.list.useQuery({ projectId: pid });
  const { data: plans, isLoading: plansLoading } =
    trpc.topicPlans.list.useQuery({
      projectId: pid,
    });

  const generateMutation = trpc.topicPlans.generate.useMutation({
    onSuccess: async () => {
      await utils.topicPlans.list.invalidate({ projectId: pid });
      toast.success("选题策划已生成");
    },
    onError: error => {
      toast.error(error.message || "选题策划生成失败");
    },
  });

  const completedPositioning = useMemo(
    () =>
      positionings?.find(
        item => item.status === "completed" && item.positioningRecommendation
      ) ?? null,
    [positionings]
  );

  const sourceVideos = useMemo(() => {
    return (hubItems ?? [])
      .filter(item => item.platform === "xiaohongshu")
      .filter(item => {
        const tags = (item.tags ?? {}) as TopicHubTagMeta;
        return (
          !tags.topicGenerationExcluded &&
          tags.videoAnalysisStatus === "completed" &&
          typeof tags.videoAnalysisResult === "string" &&
          String(tags.videoAnalysisResult || "").trim().length > 0
        );
      })
      .sort((a, b) => {
        const aTags = (a.tags ?? {}) as TopicHubTagMeta;
        const bTags = (b.tags ?? {}) as TopicHubTagMeta;
        return Number(bTags.likedCount ?? 0) - Number(aTags.likedCount ?? 0);
      });
  }, [hubItems]);

  const planMap = useMemo(() => {
    return new Map((plans ?? []).map(item => [item.hubItemId, item]));
  }, [plans]);

  const generatedCount = useMemo(() => {
    return sourceVideos.filter(item => planMap.has(item.id)).length;
  }, [planMap, sourceVideos]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Sparkles className="h-6 w-6 text-orange-400" />
            选题策划
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            基于爆款分析中的爆款因子结果，结合账号定位内容，为每个爆款视频生成 1
            个小红书题目。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void Promise.all([
                utils.topicPlans.list.invalidate({ projectId: pid }),
                utils.topicHub.list.invalidate({ projectId: pid }),
              ]);
            }}
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            刷新
          </Button>
          <Button
            onClick={() => generateMutation.mutate({ projectId: pid })}
            disabled={
              generateMutation.isPending ||
              !completedPositioning ||
              sourceVideos.length === 0
            }
            className="h-10 px-5"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <Brain className="mr-2 h-4 w-4" />
                {plans && plans.length > 0 ? "重新生成题目" : "一键生成题目"}
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium">
              <span className="flex items-center gap-2 text-foreground">
                <Target className="h-4 w-4 text-primary" />
                账号定位
              </span>
              {completedPositioning ? (
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 text-emerald-400"
                >
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  已完成
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-amber-500/30 text-amber-400"
                >
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  待完成
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {completedPositioning ? (
              <div className="space-y-3">
                <p className="line-clamp-4 text-xs leading-relaxed text-muted-foreground">
                  {completedPositioning.positioningRecommendation || ""}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-primary"
                  onClick={() => setExpandedPositioning(value => !value)}
                >
                  {expandedPositioning ? "收起" : "展开定位内容"}
                </Button>
                {expandedPositioning ? (
                  <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                    <div className="prose prose-sm prose-invert max-w-none text-xs leading-relaxed text-foreground/85">
                      <Streamdown>
                        {completedPositioning.positioningRecommendation || ""}
                      </Streamdown>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                请先完成账号定位，再生成选题策划。
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium">
              <span className="flex items-center gap-2 text-foreground">
                <Brain className="h-4 w-4 text-orange-400" />
                生成范围
              </span>
              <Badge variant="outline">
                {generatedCount}/{sourceVideos.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-muted-foreground">
            <p>数据来源：爆款分析中已完成 AI 分析的视频。</p>
            <p>
              生成规则：每个爆款视频生成 1 个小红书题目，并附带 1 行生成依据。
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">源视频 {sourceVideos.length}</Badge>
              <Badge variant="secondary">已生成 {generatedCount}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {hubItemsLoading || plansLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(item => (
            <div key={item} className="h-80 rounded-3xl shimmer" />
          ))}
        </div>
      ) : !completedPositioning ? (
        <Card className="border-border bg-card">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            请先完成账号定位。
          </CardContent>
        </Card>
      ) : sourceVideos.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            当前还没有可用于选题策划的爆款分析视频。请先到爆款分析页完成视频 AI
            分析。
          </CardContent>
        </Card>
      ) : plans && plans.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            已找到 {sourceVideos.length}{" "}
            条可用爆款视频，点击右上角“一键生成题目”即可生成选题策划。
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sourceVideos.map(item => {
            const meta = (item.tags ?? {}) as TopicHubTagMeta;
            const plan = planMap.get(item.id);
            const cover =
              toLocalAssetUrl(meta.coverDownloadPath) || meta.coverUrl;
            const duration = formatDuration(meta.duration);

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
                          className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        >
                          爆款分析已完成
                        </Badge>
                        <div>
                          <div className="line-clamp-2 text-sm font-medium text-foreground">
                            {item.title}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {meta.authorName || "小红书作者"}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Heart className="h-3.5 w-3.5" />
                            {formatCount(meta.likedCount)}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageCircle className="h-3.5 w-3.5" />
                            {formatCount(meta.commentCount)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Share2 className="h-3.5 w-3.5" />
                            {formatCount(meta.sharedCount)}
                          </span>
                        </div>

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
                      </div>
                    </div>

                    <div className="p-5 lg:p-6">
                      {plan ? (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <Sparkles className="h-4 w-4 text-orange-400" />
                            生成题目
                          </div>
                          <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4">
                            <p className="text-lg font-semibold leading-8 text-foreground">
                              {plan.title}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border/70 bg-background/20 p-4">
                            <p className="text-xs font-medium text-muted-foreground">
                              生成依据
                            </p>
                            <p className="mt-2 text-sm leading-7 text-foreground/85">
                              {plan.rationale ||
                                "已结合账号定位与爆款因子完成选题适配。"}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex min-h-[260px] items-center justify-center rounded-3xl border border-dashed border-border/70 bg-background/20 px-6 text-center text-sm text-muted-foreground">
                          该爆款视频尚未生成对应题目。点击右上角按钮后，将按 1
                          个视频生成 1 个题目。
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
