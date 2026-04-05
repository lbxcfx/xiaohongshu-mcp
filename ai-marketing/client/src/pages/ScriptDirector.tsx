import { useMemo, useState } from "react";
import { Streamdown } from "streamdown";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  Sparkles,
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
  videoAnalysisStatus?: string;
  videoAnalysisResult?: string;
  authorName?: string;
  likedCount?: number;
  [key: string]: unknown;
};

const STATUS_OPTIONS = [
  { value: "draft", label: "草稿" },
  { value: "review", label: "审核中" },
  { value: "approved", label: "已通过" },
  { value: "produced", label: "已制作" },
];

export default function ScriptDirector({ projectId }: Props) {
  const pid = Number.parseInt(projectId, 10);
  const utils = trpc.useUtils();

  const [selectedTopicId, setSelectedTopicId] = useState<string>("");
  const [selectedHubItemId, setSelectedHubItemId] = useState<string>("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [viewScript, setViewScript] = useState<{
    title: string;
    content: string;
  } | null>(null);

  const { data: topics } = trpc.topics.list.useQuery({ projectId: pid });
  const { data: hubItems } = trpc.topicHub.list.useQuery({ projectId: pid });
  const { data: scripts, isLoading } = trpc.scripts.list.useQuery({
    projectId: pid,
  });

  const generateMutation = trpc.scripts.generateForTopic.useMutation({
    onSuccess: data => {
      utils.scripts.list.invalidate({ projectId: pid });
      setExpandedId(data.id);
      toast.success("脚本生成完成！");
    },
    onError: error => toast.error(error.message || "生成失败"),
  });
  const updateMutation = trpc.scripts.update.useMutation({
    onSuccess: () => utils.scripts.list.invalidate({ projectId: pid }),
  });
  const deleteMutation = trpc.scripts.delete.useMutation({
    onSuccess: () => {
      utils.scripts.list.invalidate({ projectId: pid });
      toast.success("已删除");
    },
  });

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

  const handleGenerate = () => {
    const topicId = Number(selectedTopicId);
    const hubItemId = Number(selectedHubItemId);
    if (!topicId || !hubItemId) {
      toast.error("请选择一个选题和一个爆款视频");
      return;
    }
    generateMutation.mutate({ projectId: pid, topicId, hubItemId });
  };

  const handleCopy = (id: number, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success("脚本已复制");
  };

  const hasTopics = (topics?.length ?? 0) > 0;
  const hasVideos = analyzedVideos.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <BookOpen className="h-6 w-6 text-green-400" />
          AI 爆款脚本生成
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          选择一个选题 + 一个爆款视频，AI 基于爆款因子分析生成可直接拍摄的短视频脚本
        </p>
      </div>

      {/* 生成区域 */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            生成新脚本
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* 选择选题 */}
            <div className="space-y-1.5">
              <label className="text-sm text-foreground">选题 *</label>
              {hasTopics ? (
                <Select
                  value={selectedTopicId}
                  onValueChange={setSelectedTopicId}
                >
                  <SelectTrigger className="border-border bg-input text-foreground">
                    <SelectValue placeholder="选择一个选题" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64 border-border bg-popover">
                    {topics?.map(t => (
                      <SelectItem
                        key={t.id}
                        value={String(t.id)}
                        className="text-foreground"
                      >
                        <span className="truncate">{t.title}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-400">
                  请先前往「AI 智能选题」页面生成选题
                </p>
              )}
            </div>

            {/* 选择爆款视频 */}
            <div className="space-y-1.5">
              <label className="text-sm text-foreground">
                参考爆款视频 *
              </label>
              {hasVideos ? (
                <Select
                  value={selectedHubItemId}
                  onValueChange={setSelectedHubItemId}
                >
                  <SelectTrigger className="border-border bg-input text-foreground">
                    <SelectValue placeholder="选择一个已分析的爆款视频" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64 border-border bg-popover">
                    {analyzedVideos.map(item => (
                      <SelectItem
                        key={item.id}
                        value={String(item.id)}
                        className="text-foreground"
                      >
                        <span className="truncate">{item.title}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-400">
                  请先前往「选题中台」搜索视频并等待爆款因子分析完成
                </p>
              )}
            </div>
          </div>

          {/* 选中信息预览 */}
          {selectedTopicId && selectedHubItemId && (
            <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">即将生成：</p>
              <p className="mt-1 text-sm text-foreground">
                <span className="font-medium">选题：</span>
                {topics?.find(t => t.id === Number(selectedTopicId))?.title}
              </p>
              <p className="mt-0.5 text-sm text-foreground">
                <span className="font-medium">参考视频：</span>
                {analyzedVideos.find(
                  v => v.id === Number(selectedHubItemId)
                )?.title}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {hasTopics ? `✓ ${topics?.length} 个选题` : "✗ 无选题"} ·{" "}
              {hasVideos
                ? `✓ ${analyzedVideos.length} 个爆款分析`
                : "✗ 无爆款分析"}
            </p>
            <Button
              onClick={handleGenerate}
              disabled={
                !selectedTopicId ||
                !selectedHubItemId ||
                generateMutation.isPending
              }
              className="glow-purple h-10 px-6"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <BookOpen className="mr-2 h-4 w-4" />
                  生成爆款脚本
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 脚本列表 */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="h-20 shimmer rounded-xl" />
          ))}
        </div>
      ) : (scripts?.length ?? 0) === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <BookOpen className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p>还没有脚本，选择选题和爆款视频后生成</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-foreground">已生成脚本</h2>
            <Badge variant="outline">{scripts?.length}</Badge>
          </div>

          <div className="space-y-3">
            {scripts?.map(s => (
              <Card key={s.id} className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">
                          {s.title}
                        </h3>
                        {s.platform && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                            {s.platform}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value={s.status || "draft"}
                          onValueChange={v =>
                            updateMutation.mutate({
                              id: s.id,
                              status: v as
                                | "draft"
                                | "review"
                                | "approved"
                                | "produced",
                            })
                          }
                        >
                          <SelectTrigger className="h-7 w-24 border-border bg-input text-xs text-foreground">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="border-border bg-popover">
                            {STATUS_OPTIONS.map(o => (
                              <SelectItem
                                key={o.value}
                                value={o.value}
                                className="text-xs text-foreground"
                              >
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="text-xs text-muted-foreground">
                          {new Date(s.createdAt).toLocaleDateString("zh-CN")}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {s.fullScript && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground"
                          onClick={() =>
                            handleCopy(s.id, s.fullScript || "")
                          }
                        >
                          {copiedId === s.id ? (
                            <Check className="h-3.5 w-3.5 text-green-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                      {s.fullScript && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs text-primary"
                          onClick={() =>
                            setViewScript({
                              title: s.title,
                              content: s.fullScript || "",
                            })
                          }
                        >
                          <Video className="mr-1 h-3.5 w-3.5" />
                          查看脚本
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        onClick={() =>
                          setExpandedId(
                            expandedId === s.id ? null : s.id
                          )
                        }
                      >
                        {expandedId === s.id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          deleteMutation.mutate({ id: s.id })
                        }
                        className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive"
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                  {expandedId === s.id && s.fullScript && (
                    <div className="mt-4 border-t border-border pt-4">
                      <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed text-foreground/90">
                        <Streamdown>{s.fullScript}</Streamdown>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* 脚本全屏查看 Dialog */}
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
