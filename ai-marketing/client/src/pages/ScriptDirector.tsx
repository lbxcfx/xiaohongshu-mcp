import { useMemo, useState } from "react";
import { Streamdown } from "streamdown";
import {
  BookOpen,
  Check,
  Copy,
  Heart,
  Loader2,
  MessageCircle,
  RefreshCw,
  Share2,
  Sparkles,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";

interface Props {
  projectId: string;
}

type HubTags = {
  coverUrl?: string;
  coverDownloadPath?: string;
  videoDownloadPath?: string;
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

// 从 Markdown 脚本中提取纯文本预览（去掉表格、标题符号、加粗等）
function extractPreview(markdown: string, maxLen = 280): string {
  const lines = markdown
    .split("\n")
    .map(l => l.trim())
    .filter(
      l =>
        l.length > 0 &&
        !l.startsWith("|") && // 表格行
        !l.startsWith("#") && // 标题行
        !/^[-*]{3,}$/.test(l) // 分隔线
    );
  const text = lines
    .join(" ")
    .replace(/\*\*?([^*]+)\*\*?/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`[^`]+`/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
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
            当前还没有选题策划结果。请先到"选题策划"页面生成题目。
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
                  <div className="grid gap-0 lg:grid-cols-[240px_minmax(0,1fr)]">
                    {/* 左侧：封面 + 源视频信息 */}
                    <div className="flex flex-col border-b border-border/70 bg-muted/20 p-4 lg:border-b-0 lg:border-r">
                      <div className="relative overflow-hidden rounded-xl bg-muted">
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
                          <div className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white">
                            {duration}
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-3 space-y-2">
                        <p className="line-clamp-2 text-xs font-medium leading-5 text-foreground">
                          {hubItem?.title || "未找到源视频"}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Heart className="h-3 w-3" />
                            {formatCount(tags.likedCount)}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageCircle className="h-3 w-3" />
                            {formatCount(tags.commentCount)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Share2 className="h-3 w-3" />
                            {formatCount(tags.sharedCount)}
                          </span>
                        </div>
                        {toLocalAssetUrl(
                          tags.videoDownloadPath as string | undefined
                        ) ? (
                          <a
                            href={toLocalAssetUrl(
                              tags.videoDownloadPath as string | undefined
                            )}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs text-primary transition-colors hover:bg-primary/10"
                          >
                            <Video className="h-3 w-3" />
                            本地视频
                          </a>
                        ) : null}
                      </div>
                    </div>

                    {/* 右侧：选题题目 + 脚本操作 + 预览 */}
                    <div className="flex flex-col gap-0 p-5 lg:p-6">
                      {/* 选题题目 */}
                      <div className="mb-4">
                        <p className="text-base font-semibold leading-6 text-foreground">
                          {plan.title}
                        </p>
                        {plan.rationale && (
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                            {plan.rationale}
                          </p>
                        )}
                      </div>

                      <Separator className="mb-4 opacity-40" />

                      {/* 操作栏 */}
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          复刻脚本
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          {script && (
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
                              <SelectTrigger className="h-7 w-20 border-border bg-input text-xs text-foreground">
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
                          )}
                          <Button
                            size="sm"
                            className="h-7 px-3 text-xs"
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
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                生成中
                              </>
                            ) : script ? (
                              "重新生成"
                            ) : (
                              "生成脚本"
                            )}
                          </Button>
                          {script && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                deleteMutation.mutate({ id: script.id })
                              }
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                            >
                              删除
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* 脚本预览 */}
                      {script?.fullScript ? (
                        <div className="flex flex-1 flex-col gap-3 rounded-xl border border-border/60 bg-background/20 p-4">
                          <p className="line-clamp-[9] text-sm leading-7 text-foreground/85">
                            {extractPreview(script.fullScript)}
                          </p>
                          <div className="flex items-center gap-2 border-t border-border/40 pt-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-primary hover:text-primary"
                              onClick={() =>
                                setViewScript({
                                  title: script.title,
                                  content: script.fullScript || "",
                                })
                              }
                            >
                              <Video className="mr-1 h-3.5 w-3.5" />
                              查看完整脚本
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground"
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
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border/60 bg-background/20 px-6 py-10 text-center text-sm text-muted-foreground">
                          点击"生成脚本"，将基于本条选题策划结果生成口播脚本。
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
