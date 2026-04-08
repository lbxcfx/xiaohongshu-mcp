import { type ElementType, useEffect, useMemo, useState } from "react";
import { Streamdown } from "streamdown";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Heart,
  Loader2,
  MessageCircle,
  ShoppingBag,
  Share2,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "../../../server/routers";

interface Props {
  projectId: string;
  pageTitle?: string;
}

type TopicHubTagMeta = {
  sourceLabel?: string;
  coverUrl?: string;
  coverDownloadPath?: string;
  authorName?: string;
  likedCount?: number;
  commentCount?: number;
  sharedCount?: number;
  duration?: number;
  videoDownloadStatus?: "idle" | "pending" | "success" | "failed" | "skipped";
  videoAnalysisStatus?: "pending" | "analyzing" | "completed" | "failed";
  topicGenerationExcluded?: boolean;
  [key: string]: unknown;
};

type RouterOutputs = inferRouterOutputs<AppRouter>;
type RelatedVideoItem = RouterOutputs["topics"]["relatedVideos"][number];
type FilteredVideoItem = RelatedVideoItem & {
  matchedReason?: string;
  matchSource?: "manual" | "ai";
};

const TOPIC_TYPE_META: Record<
  string,
  { icon: ElementType; label: string; color: string; bg: string }
> = {
  persona: {
    icon: Users,
    label: "人设型",
    color: "text-purple-400",
    bg: "bg-purple-400/10",
  },
  traffic: {
    icon: TrendingUp,
    label: "流量型",
    color: "text-cyan-400",
    bg: "bg-cyan-400/10",
  },
  marketing: {
    icon: ShoppingBag,
    label: "营销型",
    color: "text-green-400",
    bg: "bg-green-400/10",
  },
};

const VIRAL_META: Record<string, { label: string; color: string }> = {
  high: { label: "高潜力", color: "text-green-400 bg-green-400/10" },
  medium: { label: "中潜力", color: "text-amber-400 bg-amber-400/10" },
  low: { label: "低潜力", color: "text-muted-foreground bg-muted" },
};

const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  selected: "已选定",
  in_production: "制作中",
  published: "已发布",
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

function normalizeTopicHubContent(content?: string | null) {
  if (!content) return undefined;
  return content.replace(/^\?+/, "关键词：").trim();
}

function toLocalAssetUrl(filePath?: string) {
  if (!filePath) return undefined;
  const normalized = filePath.replace(/\\/g, "/");
  const marker = "/.data/";
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex < 0) return undefined;
  return `/_local/${normalized.slice(markerIndex + marker.length)}`;
}

function getLikedCount(item: { tags?: unknown }) {
  const tags = (item.tags ?? {}) as TopicHubTagMeta;
  return Number(tags.likedCount ?? 0);
}

export default function TopicGeneration({
  projectId,
  pageTitle = "选题生成",
}: Props) {
  const pid = Number.parseInt(projectId, 10);
  const utils = trpc.useUtils();

  const [expandedPositioning, setExpandedPositioning] = useState(false);
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const [hasRequestedRelatedMatch, setHasRequestedRelatedMatch] =
    useState(false);

  const { data: positionings } = trpc.positioning.list.useQuery({
    projectId: pid,
  });
  const { data: hubItems } = trpc.topicHub.list.useQuery(
    { projectId: pid },
    { refetchInterval: pollingEnabled ? 5000 : false }
  );
  const {
    data: relatedVideos,
    isFetching: relatedVideosLoading,
    refetch: refetchRelatedVideos,
  } = trpc.topics.relatedVideos.useQuery(
    { projectId: pid },
    { enabled: false, retry: false }
  );
  const { data: topics, isLoading: topicsLoading } = trpc.topics.list.useQuery({
    projectId: pid,
  });

  const startViralAnalysisMutation = trpc.topics.startViralAnalysis.useMutation(
    {
      onSuccess: async () => {
        await utils.topicHub.list.invalidate({ projectId: pid });
        toast.success("已加入爆款分析队列");
        window.location.assign(`/projects/${pid}/viral-analysis`);
      },
      onError: error => toast.error(error.message || "加入爆款分析失败"),
    }
  );

  const excludeVideoMutation = trpc.topics.excludeRelatedVideo.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.topics.relatedVideos.invalidate({ projectId: pid }),
        utils.topicHub.list.invalidate({ projectId: pid }),
      ]);
      toast.success("已从选题生成中移除");
    },
    onError: error => toast.error(error.message || "移除失败"),
  });

  const updateMutation = trpc.topics.update.useMutation({
    onSuccess: () => utils.topics.list.invalidate({ projectId: pid }),
  });

  const deleteMutation = trpc.topics.delete.useMutation({
    onSuccess: async () => {
      await utils.topics.list.invalidate({ projectId: pid });
      toast.success("已删除选题");
    },
  });

  const completedPositioning = useMemo(
    () =>
      positionings?.find(
        item => item.status === "completed" && item.positioningRecommendation
      ) ?? null,
    [positionings]
  );

  async function handleMatchRelatedVideos() {
    if (!completedPositioning) {
      toast.error("请先完成账号定位");
      return;
    }

    setHasRequestedRelatedMatch(true);
    const result = await refetchRelatedVideos();
    if (result.error) {
      toast.error(result.error.message || "视频匹配失败");
      return;
    }

    toast.success(`已筛选出 ${result.data?.length ?? 0} 条视频`);
  }

  const filteredVideos = useMemo(() => {
    const latestHubItemMap = new Map(
      (hubItems ?? []).map(item => [item.id, item])
    );

    return (relatedVideos ?? [])
      .map(item => {
        const latest = latestHubItemMap.get(item.id);
        return {
          ...(latest ?? item),
          matchedReason: item.matchedReason || "",
          matchSource: item.matchSource,
        } as FilteredVideoItem;
      })
      .filter(item => {
        const meta = (item.tags ?? {}) as TopicHubTagMeta;
        return !meta.topicGenerationExcluded;
      })
      .sort(
        (a, b) =>
          getLikedCount(b) - getLikedCount(a) ||
          (b.engagementScore ?? 0) - (a.engagementScore ?? 0)
      );
  }, [hubItems, relatedVideos]);

  useEffect(() => {
    const hasActive = filteredVideos.some(item => {
      const meta = (item.tags ?? {}) as TopicHubTagMeta;
      return (
        meta.videoDownloadStatus === "pending" ||
        meta.videoAnalysisStatus === "pending" ||
        meta.videoAnalysisStatus === "analyzing"
      );
    });
    setPollingEnabled(hasActive);
  }, [filteredVideos]);

  const stats = useMemo(() => {
    let analyzed = 0;
    let processing = 0;
    let manual = 0;
    let ai = 0;
    for (const item of filteredVideos) {
      const meta = (item.tags ?? {}) as TopicHubTagMeta;
      if (meta.videoAnalysisStatus === "completed") analyzed++;
      if (item.matchSource === "manual") manual++;
      if (item.matchSource === "ai") ai++;
      if (
        meta.videoDownloadStatus === "pending" ||
        meta.videoAnalysisStatus === "pending" ||
        meta.videoAnalysisStatus === "analyzing"
      ) {
        processing++;
      }
    }
    return { total: filteredVideos.length, analyzed, processing, manual, ai };
  }, [filteredVideos]);

  const topicTypeStats = useMemo(() => {
    const summary = { persona: 0, traffic: 0, marketing: 0 };
    for (const topic of topics ?? []) {
      if (topic.topicType in summary) {
        summary[topic.topicType as keyof typeof summary]++;
      }
    }
    return summary;
  }, [topics]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Sparkles className="h-6 w-6 text-pink-400" />
          {pageTitle}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          从选题中台已搜索的视频里，使用 Ark
          大模型根据账号定位内容做相关性判断，只展示匹配的视频。
        </p>
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
                  {expandedPositioning ? (
                    <>
                      <ChevronUp className="mr-1 h-3 w-3" />
                      收起
                    </>
                  ) : (
                    <>
                      <ChevronDown className="mr-1 h-3 w-3" />
                      展开定位内容
                    </>
                  )}
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
                请先在“账号定位”页面完成分析，再回到这里查看匹配结果。
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium">
              <span className="flex items-center gap-2 text-foreground">
                <TrendingUp className="h-4 w-4 text-rose-400" />
                相关视频池
              </span>
              <Badge variant="outline">{stats.total} 条</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-muted-foreground">
            <p>来源：选题中台已经搜索出来的视频。</p>
            <p>
              筛选方式：手动点击过 AI分析 的视频直接保留，其余视频由 Ark
              大模型根据账号定位和标题筛选。
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">按点赞量排序</Badge>
              <Badge variant="secondary">手动分析 {stats.manual}</Badge>
              <Badge variant="secondary">AI筛选 {stats.ai}</Badge>
              <Badge variant="secondary">已分析 {stats.analyzed}</Badge>
              <Badge variant="secondary">处理中 {stats.processing}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">AI 选题生成</p>
            <p className="text-xs text-muted-foreground">
              点击后先匹配账号定位与视频题目；确认保留结果后，再提交到爆款分析。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                void handleMatchRelatedVideos();
              }}
              disabled={!completedPositioning || relatedVideosLoading}
              className="glow-purple h-10 px-6"
            >
              {relatedVideosLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  匹配中...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  AI 生成选题
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                startViralAnalysisMutation.mutate({
                  projectId: pid,
                  videoIds: filteredVideos.map(item => item.id),
                })
              }
              disabled={
                filteredVideos.length === 0 ||
                startViralAnalysisMutation.isPending
              }
              className="h-10 px-6"
            >
              {startViralAnalysisMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  提交中...
                </>
              ) : (
                "提交爆款分析"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-foreground">相关视频</h2>
            <Badge variant="outline">{stats.total}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            展示样式与选题中台保持一致
          </p>
        </div>

        {relatedVideosLoading ? (
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
            {[1, 2, 3, 4, 5].map(item => (
              <div key={item} className="h-96 rounded-3xl shimmer" />
            ))}
          </div>
        ) : !completedPositioning ? (
          <Card className="border-border bg-card">
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              请先完成账号定位。
            </CardContent>
          </Card>
        ) : !hasRequestedRelatedMatch ? (
          <Card className="border-border bg-card">
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              点击上方 AI 生成选题，先进行账号定位与视频题目匹配。
            </CardContent>
          </Card>
        ) : filteredVideos.length === 0 ? (
          <Card className="border-border bg-card">
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              当前还没有筛选出与账号定位匹配的视频。请先到选题中台搜索更多作品，再返回这里查看。
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
            {filteredVideos.map(item => {
              const meta = (item.tags ?? {}) as TopicHubTagMeta;
              const localCover = toLocalAssetUrl(meta.coverDownloadPath);
              const cover = localCover || meta.coverUrl;
              const duration = formatDuration(meta.duration);
              const isActive =
                meta.videoDownloadStatus === "pending" ||
                meta.videoAnalysisStatus === "pending" ||
                meta.videoAnalysisStatus === "analyzing";
              const isRemoving =
                excludeVideoMutation.isPending &&
                excludeVideoMutation.variables?.id === item.id;

              return (
                <Card
                  key={item.id}
                  className="overflow-hidden rounded-3xl border-border bg-card"
                >
                  <div className="relative aspect-[3/4] overflow-hidden bg-muted">
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

                    {duration ? (
                      <div className="absolute bottom-3 right-3 rounded-full bg-black/70 px-2 py-1 text-xs text-white">
                        {duration}
                      </div>
                    ) : null}

                    {meta.videoAnalysisStatus === "completed" ? (
                      <div className="absolute right-3 top-3 rounded-full bg-emerald-500/90 px-2 py-1 text-xs text-white">
                        已分析
                      </div>
                    ) : null}

                    {meta.videoAnalysisStatus === "failed" ? (
                      <div className="absolute right-3 top-3 rounded-full bg-red-500/90 px-2 py-1 text-xs text-white">
                        失败
                      </div>
                    ) : null}

                    {isActive ? (
                      <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-amber-500/90 px-2 py-1 text-xs text-white">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        处理中
                      </div>
                    ) : null}
                  </div>

                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="secondary">
                          {meta.sourceLabel || "小红书"}
                        </Badge>
                        {item.matchSource === "manual" ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/30 text-emerald-400"
                          >
                            手动分析
                          </Badge>
                        ) : item.matchSource === "ai" ? (
                          <Badge
                            variant="outline"
                            className="border-primary/30 text-primary"
                          >
                            AI筛选
                          </Badge>
                        ) : null}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        热度值 {item.engagementScore ?? 0}
                      </span>
                    </div>

                    <div>
                      <p className="line-clamp-2 text-sm font-medium text-foreground">
                        {item.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {meta.authorName || "小红书作者"}
                      </p>
                      {normalizeTopicHubContent(item.content) ? (
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                          {normalizeTopicHubContent(item.content)}
                        </p>
                      ) : null}
                      {item.matchedReason ? (
                        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-primary/80">
                          匹配原因：{item.matchedReason}
                        </p>
                      ) : null}
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

                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                        onClick={() =>
                          excludeVideoMutation.mutate({
                            id: item.id,
                            projectId: pid,
                          })
                        }
                        disabled={isRemoving}
                      >
                        {isRemoving ? (
                          <>
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            移除中
                          </>
                        ) : (
                          "删除"
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {topicsLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 shimmer rounded-xl" />
          ))}
        </div>
      ) : (topics?.length ?? 0) === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <Sparkles className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p>还没有选题，点击上方按钮生成。</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-medium text-foreground">已生成选题</h2>
            <Badge variant="outline">{topics?.length}</Badge>
            {topicTypeStats.persona > 0 ? (
              <Badge
                variant="outline"
                className="border-purple-400/30 text-purple-400"
              >
                <Users className="mr-1 h-3 w-3" />
                人设型 {topicTypeStats.persona}
              </Badge>
            ) : null}
            {topicTypeStats.traffic > 0 ? (
              <Badge
                variant="outline"
                className="border-cyan-400/30 text-cyan-400"
              >
                <TrendingUp className="mr-1 h-3 w-3" />
                流量型 {topicTypeStats.traffic}
              </Badge>
            ) : null}
            {topicTypeStats.marketing > 0 ? (
              <Badge
                variant="outline"
                className="border-green-400/30 text-green-400"
              >
                <ShoppingBag className="mr-1 h-3 w-3" />
                营销型 {topicTypeStats.marketing}
              </Badge>
            ) : null}
          </div>

          {topics?.map(topic => {
            const typeInfo =
              TOPIC_TYPE_META[topic.topicType || "traffic"] ??
              TOPIC_TYPE_META.traffic;
            const viralInfo =
              VIRAL_META[topic.viralPotential || "medium"] ?? VIRAL_META.medium;
            const TypeIcon = typeInfo.icon;

            return (
              <Card
                key={topic.id}
                className="border-border bg-card transition-all hover:border-primary/30"
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${typeInfo.bg}`}
                    >
                      <TypeIcon className={`h-4 w-4 ${typeInfo.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold leading-snug text-foreground">
                          {topic.title}
                        </h3>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs ${viralInfo.color}`}
                          >
                            {viralInfo.label}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs ${typeInfo.bg} ${typeInfo.color}`}
                          >
                            {typeInfo.label}
                          </span>
                        </div>
                      </div>
                      {topic.description ? (
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {topic.description}
                        </p>
                      ) : null}
                      {topic.rationale ? (
                        <p className="mt-1.5 text-xs italic text-primary/70">
                          爆款因子：{topic.rationale}
                        </p>
                      ) : null}
                      <div className="mt-3 flex items-center gap-2">
                        <Select
                          value={topic.status || "draft"}
                          onValueChange={value =>
                            updateMutation.mutate({
                              id: topic.id,
                              status: value as
                                | "draft"
                                | "selected"
                                | "in_production"
                                | "published",
                            })
                          }
                        >
                          <SelectTrigger className="h-7 w-28 border-border bg-input text-xs text-foreground">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="border-border bg-popover">
                            {Object.entries(STATUS_LABELS).map(
                              ([value, label]) => (
                                <SelectItem
                                  key={value}
                                  value={value}
                                  className="text-xs text-foreground"
                                >
                                  {label}
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() =>
                            deleteMutation.mutate({ id: topic.id })
                          }
                          disabled={deleteMutation.isPending}
                        >
                          删除
                        </Button>
                      </div>
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
