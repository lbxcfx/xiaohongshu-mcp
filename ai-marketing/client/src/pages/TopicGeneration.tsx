import { useMemo } from "react";
import { Streamdown } from "streamdown";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  ShoppingBag,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useState } from "react";

interface Props {
  projectId: string;
}

const TOPIC_TYPE_META: Record<
  string,
  { icon: React.ElementType; label: string; color: string; bg: string }
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

type HubTags = {
  videoAnalysisStatus?: string;
  videoAnalysisResult?: string;
  likedCount?: number;
  authorName?: string;
  [key: string]: unknown;
};

export default function TopicGeneration({ projectId }: Props) {
  const pid = Number.parseInt(projectId, 10);
  const utils = trpc.useUtils();

  const [expandedPositioning, setExpandedPositioning] = useState(false);
  const [selectedAnalysis, setSelectedAnalysis] = useState<{
    title: string;
    result: string;
  } | null>(null);

  const { data: positionings } = trpc.positioning.list.useQuery({
    projectId: pid,
  });
  const { data: hubItems } = trpc.topicHub.list.useQuery({ projectId: pid });
  const { data: topics, isLoading: topicsLoading } = trpc.topics.list.useQuery({
    projectId: pid,
  });

  const generateMutation = trpc.topics.generate.useMutation({
    onSuccess: () => {
      utils.topics.list.invalidate({ projectId: pid });
      toast.success("已生成 10 条选题！");
    },
    onError: error => toast.error(error.message || "生成失败，请重试"),
  });
  const updateMutation = trpc.topics.update.useMutation({
    onSuccess: () => utils.topics.list.invalidate({ projectId: pid }),
  });
  const deleteMutation = trpc.topics.delete.useMutation({
    onSuccess: () => {
      utils.topics.list.invalidate({ projectId: pid });
      toast.success("已删除");
    },
  });

  const completedPositioning = useMemo(
    () =>
      positionings?.find(
        p => p.status === "completed" && p.positioningRecommendation
      ),
    [positionings]
  );

  const analyzedVideos = useMemo(
    () =>
      (hubItems ?? []).filter(item => {
        const tags = (item.tags ?? {}) as HubTags;
        return (
          tags.videoAnalysisStatus === "completed" &&
          typeof tags.videoAnalysisResult === "string"
        );
      }),
    [hubItems]
  );

  const hasData = !!completedPositioning || analyzedVideos.length > 0;

  const topicTypeStats = useMemo(() => {
    const stats = { persona: 0, traffic: 0, marketing: 0 };
    for (const t of topics ?? []) {
      if (t.topicType in stats) stats[t.topicType as keyof typeof stats]++;
    }
    return stats;
  }, [topics]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Sparkles className="h-6 w-6 text-pink-400" />
          AI 智能选题
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          基于账号定位 + 爆款视频因子分析，AI 自动生成高爆款潜质选题
        </p>
      </div>

      {/* 数据源概览 */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* 账号定位卡片 */}
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
                  未完成
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {completedPositioning ? (
              <div>
                <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                  {completedPositioning.positioningRecommendation?.slice(0, 200)}
                  ...
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-7 px-2 text-xs text-primary"
                  onClick={() =>
                    setExpandedPositioning(!expandedPositioning)
                  }
                >
                  {expandedPositioning ? (
                    <>
                      <ChevronUp className="mr-1 h-3 w-3" />
                      收起
                    </>
                  ) : (
                    <>
                      <ChevronDown className="mr-1 h-3 w-3" />
                      查看完整定位
                    </>
                  )}
                </Button>
                {expandedPositioning && (
                  <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-border/50 bg-muted/20 p-4">
                    <div className="prose prose-sm prose-invert max-w-none text-xs leading-relaxed text-foreground/80">
                      <Streamdown>
                        {completedPositioning.positioningRecommendation || ""}
                      </Streamdown>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                请先前往「账号定位」页面完成定位分析
              </p>
            )}
          </CardContent>
        </Card>

        {/* 爆款因子分析卡片 */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium">
              <span className="flex items-center gap-2 text-foreground">
                <Video className="h-4 w-4 text-rose-400" />
                爆款视频因子分析
              </span>
              <Badge variant="outline">
                {analyzedVideos.length} 条已分析
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analyzedVideos.length > 0 ? (
              <div className="space-y-2">
                {analyzedVideos.slice(0, 5).map(item => {
                  const tags = (item.tags ?? {}) as HubTags;
                  return (
                    <div
                      key={item.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 transition-colors hover:border-primary/30 hover:bg-muted/40"
                      onClick={() =>
                        setSelectedAnalysis({
                          title: item.title,
                          result: String(tags.videoAnalysisResult || ""),
                        })
                      }
                    >
                      <Sparkles className="h-3 w-3 shrink-0 text-emerald-400" />
                      <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                        {item.title}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {tags.authorName || ""}
                      </span>
                    </div>
                  );
                })}
                {analyzedVideos.length > 5 && (
                  <p className="text-xs text-muted-foreground">
                    还有 {analyzedVideos.length - 5} 条分析结果...
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                请先前往「选题中台」搜索视频并等待爆款因子分析完成
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 生成按钮 */}
      <Card className="border-border bg-card">
        <CardContent className="flex items-center justify-between p-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              一键生成 10 条选题
            </p>
            <p className="text-xs text-muted-foreground">
              {completedPositioning ? "✓ 账号定位" : "✗ 账号定位"} ·{" "}
              {analyzedVideos.length > 0
                ? `✓ ${analyzedVideos.length} 条爆款分析`
                : "✗ 爆款分析"}
              {hasData
                ? " — 数据就绪，可生成选题"
                : " — 请先完成至少一项数据准备"}
            </p>
          </div>
          <Button
            onClick={() => generateMutation.mutate({ projectId: pid })}
            disabled={!hasData || generateMutation.isPending}
            className="glow-purple h-10 px-6"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                AI 生成选题
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* 选题列表 */}
      {topicsLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 shimmer rounded-xl" />
          ))}
        </div>
      ) : (topics?.length ?? 0) === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <Sparkles className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p>还没有选题，点击上方按钮生成</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-foreground">
              已生成选题
            </h2>
            <Badge variant="outline">{topics?.length}</Badge>
            {topicTypeStats.persona > 0 && (
              <Badge
                variant="outline"
                className="border-purple-400/30 text-purple-400"
              >
                <Users className="mr-1 h-3 w-3" />
                人设型 {topicTypeStats.persona}
              </Badge>
            )}
            {topicTypeStats.traffic > 0 && (
              <Badge
                variant="outline"
                className="border-cyan-400/30 text-cyan-400"
              >
                <TrendingUp className="mr-1 h-3 w-3" />
                流量型 {topicTypeStats.traffic}
              </Badge>
            )}
            {topicTypeStats.marketing > 0 && (
              <Badge
                variant="outline"
                className="border-green-400/30 text-green-400"
              >
                <ShoppingBag className="mr-1 h-3 w-3" />
                营销型 {topicTypeStats.marketing}
              </Badge>
            )}
          </div>

          <div className="space-y-3">
            {topics?.map(topic => {
              const typeInfo =
                TOPIC_TYPE_META[topic.topicType || "traffic"] ??
                TOPIC_TYPE_META.traffic;
              const viralInfo =
                VIRAL_META[topic.viralPotential || "medium"] ??
                VIRAL_META.medium;
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
                        {topic.description && (
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {topic.description}
                          </p>
                        )}
                        {topic.rationale && (
                          <p className="mt-1.5 text-xs italic text-primary/70">
                            爆款因子：{topic.rationale}
                          </p>
                        )}
                        <div className="mt-3 flex items-center gap-2">
                          <Select
                            value={topic.status || "draft"}
                            onValueChange={v =>
                              updateMutation.mutate({
                                id: topic.id,
                                status: v as
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
                              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                                <SelectItem
                                  key={v}
                                  value={v}
                                  className="text-xs text-foreground"
                                >
                                  {l}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              deleteMutation.mutate({ id: topic.id })
                            }
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
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
        </>
      )}

      {/* 爆款分析详情 Dialog */}
      <Dialog
        open={!!selectedAnalysis}
        onOpenChange={open => {
          if (!open) setSelectedAnalysis(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              {selectedAnalysis?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed text-foreground/90">
            <Streamdown>{selectedAnalysis?.result || ""}</Streamdown>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
