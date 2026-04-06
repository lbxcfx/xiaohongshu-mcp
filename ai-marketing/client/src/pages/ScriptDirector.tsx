import { useMemo, useState } from "react";
import { Streamdown } from "streamdown";
import {
  BookOpen,
  Check,
  Copy,
  ExternalLink,
  Heart,
  Loader2,
  MessageCircle,
  RefreshCw,
  Share2,
  Sparkles,
  Target,
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

interface Props {
  projectId: string;
}

type HubTags = {
  coverUrl?: string;
  coverDownloadPath?: string;
  authorName?: string;
  likedCount?: number;
  commentCount?: number;
  sharedCount?: number;
  duration?: number;
  videoAnalysisStatus?: string;
  videoAnalysisResult?: string;
  [key: string]: unknown;
};

const STATUS_OPTIONS = [
  { value: "draft", label: "草稿" },
  { value: "review", label: "审核中" },
  { value: "approved", label: "已通过" },
  { value: "produced", label: "已制作" },
];

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

export default function ScriptDirector({ projectId }: Props) {
  const pid = Number.parseInt(projectId, 10);
  const utils = trpc.useUtils();

  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [viewScript, setViewScript] = useState<{
    title: string;
    content: string;
  } | null>(null);

  const { data: positionings } = trpc.positioning.list.useQuery({
    projectId: pid,
  });
  const { data: topicPlans, isLoading: topicPlansLoading } =
    trpc.topicPlans.list.useQuery({
      projectId: pid,
    });
  const { data: hubItems } = trpc.topicHub.list.useQuery({ projectId: pid });
  const { data: scripts, isLoading: scriptsLoading } =
    trpc.scripts.list.useQuery({
      projectId: pid,
    });

  const generateMutation = trpc.scripts.generateForTopicPlan.useMutation({
    onSuccess: async () => {
      await utils.scripts.list.invalidate({ projectId: pid });
      toast.success("脚本生成完成");
    },
    onError: error => toast.error(error.message || "脚本生成失败"),
  });

  const batchGenerateMutation =
    trpc.scripts.generateBatchFromTopicPlans.useMutation({
      onSuccess: async data => {
        await utils.scripts.list.invalidate({ projectId: pid });
        if (data.generatedCount > 0) {
          toast.success(`已生成 ${data.generatedCount} 条脚本`);
        } else {
          toast.success("当前没有需要新生成的脚本");
        }
      },
      onError: error => toast.error(error.message || "批量生成失败"),
    });

  const updateMutation = trpc.scripts.update.useMutation({
    onSuccess: () => utils.scripts.list.invalidate({ projectId: pid }),
  });

  const deleteMutation = trpc.scripts.delete.useMutation({
    onSuccess: async () => {
      await utils.scripts.list.invalidate({ projectId: pid });
      toast.success("已删除");
    },
  });

  const completedPositioning = useMemo(
    () =>
      positionings?.find(
        item => item.status === "completed" && item.positioningRecommendation
      ) ?? null,
    [positionings]
  );

  const planRows = useMemo(() => {
    const hubItemMap = new Map((hubItems ?? []).map(item => [item.id, item]));
    const scriptMap = new Map<number, NonNullable<typeof scripts>[number]>();

    for (const script of scripts ?? []) {
      const topicPlanId = Number(script.topicPlanId ?? 0);
      if (!Number.isFinite(topicPlanId) || topicPlanId <= 0) continue;
      if (!scriptMap.has(topicPlanId)) {
        scriptMap.set(topicPlanId, script);
      }
    }

    return (topicPlans ?? [])
      .map(plan => ({
        plan,
        hubItem: hubItemMap.get(plan.hubItemId) ?? null,
        script: scriptMap.get(plan.id) ?? null,
      }))
      .sort((a, b) => {
        const aLiked = Number(
          ((a.hubItem?.tags ?? {}) as HubTags).likedCount ?? 0
        );
        const bLiked = Number(
          ((b.hubItem?.tags ?? {}) as HubTags).likedCount ?? 0
        );
        return bLiked - aLiked || b.plan.id - a.plan.id;
      });
  }, [hubItems, scripts, topicPlans]);

  const generatedCount = useMemo(
    () => planRows.filter(item => item.script).length,
    [planRows]
  );

  const handleCopy = (id: number, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success("脚本已复制");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <BookOpen className="h-6 w-6 text-green-400" />
            爆款复刻
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            基于选题策划生成的题目、账号定位内容和爆款因子分析结果，通过 Ark
            生成对应的视频口播脚本。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void Promise.all([
                utils.scripts.list.invalidate({ projectId: pid }),
                utils.topicPlans.list.invalidate({ projectId: pid }),
              ]);
            }}
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            刷新
          </Button>
          <Button
            onClick={() =>
              batchGenerateMutation.mutate({
                projectId: pid,
                regenerateAll: false,
              })
            }
            disabled={
              batchGenerateMutation.isPending ||
              !completedPositioning ||
              planRows.length === 0
            }
            className="h-10 px-5"
          >
            {batchGenerateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                批量生成中...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                一键生成缺失脚本
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border bg-card md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Target className="h-4 w-4 text-primary" />
              生成依据
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <p>1. 使用账号定位内容，统一脚本的人设、受众和品牌调性。</p>
            <p>
              2. 使用源视频的爆款因子分析结果，复用钩子、结构、痛点和互动逻辑。
            </p>
            <p>3. 使用选题策划生成的最终题目，确保脚本紧扣当前要拍的主题。</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-foreground">
              进度统计
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-muted-foreground">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">选题策划 {planRows.length}</Badge>
              <Badge variant="secondary">已生成 {generatedCount}</Badge>
            </div>
            <p>
              当前页面只围绕“选题策划”结果生成脚本，不再使用旧的手动选题方式。
            </p>
          </CardContent>
        </Card>
      </div>

      {topicPlansLoading || scriptsLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(item => (
            <div key={item} className="h-80 rounded-3xl shimmer" />
          ))}
        </div>
      ) : !completedPositioning ? (
        <Card className="border-border bg-card">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            请先完成账号定位，再生成爆款复刻脚本。
          </CardContent>
        </Card>
      ) : planRows.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            当前还没有选题策划结果。请先到“选题策划”页面生成题目。
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {planRows.map(({ plan, hubItem, script }) => {
            const tags = ((hubItem?.tags ?? {}) as HubTags) ?? {};
            const cover =
              toLocalAssetUrl(tags.coverDownloadPath) || tags.coverUrl;
            const duration = formatDuration(tags.duration);
            const isGenerating =
              generateMutation.isPending &&
              generateMutation.variables?.topicPlanId === plan.id;

            return (
              <Card
                key={plan.id}
                className="overflow-hidden rounded-3xl border-border bg-card"
              >
                <CardContent className="p-0">
                  <div className="grid gap-0 lg:grid-cols-[320px_minmax(0,1fr)]">
                    <div className="border-b border-border/70 bg-muted/20 p-4 lg:border-b-0 lg:border-r">
                      <div className="relative overflow-hidden rounded-2xl bg-muted">
                        <div className="aspect-[3/4]">
                          {cover ? (
                            <img
                              src={cover}
                              alt={hubItem?.title || plan.title}
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
                          <p className="text-xs text-muted-foreground">
                            源爆款视频
                          </p>
                          <p className="mt-1 line-clamp-2 text-sm font-medium text-foreground">
                            {hubItem?.title || "未找到源视频"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {tags.authorName || "小红书作者"}
                          </p>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Heart className="h-3.5 w-3.5" />
                            {formatCount(tags.likedCount)}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageCircle className="h-3.5 w-3.5" />
                            {formatCount(tags.commentCount)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Share2 className="h-3.5 w-3.5" />
                            {formatCount(tags.sharedCount)}
                          </span>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            选题策划题目
                          </p>
                          <p className="mt-1 text-sm font-medium leading-6 text-foreground">
                            {plan.title}
                          </p>
                          <p className="mt-2 text-xs leading-6 text-muted-foreground">
                            生成依据：{plan.rationale || "无"}
                          </p>
                        </div>
                        {hubItem?.url ? (
                          <a
                            href={hubItem.url}
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
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            复刻脚本
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            输入：账号定位 + 爆款因子分析 + 选题策划题目
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {script ? (
                            <Select
                              value={script.status || "draft"}
                              onValueChange={value =>
                                updateMutation.mutate({
                                  id: script.id,
                                  status: value as
                                    | "draft"
                                    | "review"
                                    | "approved"
                                    | "produced",
                                })
                              }
                            >
                              <SelectTrigger className="h-8 w-24 border-border bg-input text-xs text-foreground">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="border-border bg-popover">
                                {STATUS_OPTIONS.map(option => (
                                  <SelectItem
                                    key={option.value}
                                    value={option.value}
                                    className="text-xs text-foreground"
                                  >
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : null}

                          <Button
                            size="sm"
                            className="h-8 px-3 text-xs"
                            onClick={() =>
                              generateMutation.mutate({
                                projectId: pid,
                                topicPlanId: plan.id,
                              })
                            }
                            disabled={isGenerating}
                          >
                            {isGenerating ? (
                              <>
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                生成中
                              </>
                            ) : script ? (
                              "重新生成"
                            ) : (
                              "生成脚本"
                            )}
                          </Button>

                          {script ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground"
                              onClick={() =>
                                handleCopy(script.id, script.fullScript || "")
                              }
                            >
                              {copiedId === script.id ? (
                                <Check className="h-3.5 w-3.5 text-green-400" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          ) : null}

                          {script ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs text-primary"
                              onClick={() =>
                                setViewScript({
                                  title: script.title,
                                  content: script.fullScript || "",
                                })
                              }
                            >
                              <Video className="mr-1 h-3.5 w-3.5" />
                              查看全文
                            </Button>
                          ) : null}

                          {script ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                deleteMutation.mutate({ id: script.id })
                              }
                              className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive"
                            >
                              删除
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      {script?.fullScript ? (
                        <div className="rounded-2xl border border-border/70 bg-background/20 p-4">
                          <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed text-foreground/90">
                            <Streamdown>{script.fullScript}</Streamdown>
                          </div>
                        </div>
                      ) : (
                        <div className="flex min-h-[260px] items-center justify-center rounded-3xl border border-dashed border-border/70 bg-background/20 px-6 text-center text-sm text-muted-foreground">
                          当前还没有脚本。点击“生成脚本”后，会根据这条选题策划结果生成对应口播脚本。
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

      <Dialog
        open={!!viewScript}
        onOpenChange={open => {
          if (!open) setViewScript(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="h-5 w-5 text-green-400" />
              {viewScript?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed text-foreground/90">
            <Streamdown>{viewScript?.content || ""}</Streamdown>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
