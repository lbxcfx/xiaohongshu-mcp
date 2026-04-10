import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Share2,
  Video,
} from "lucide-react";

// 候选话题标签（按场景分组）
const PRESET_TAG_GROUPS = [
  {
    label: "医美护肤",
    tags: ["医美", "护肤", "皮肤管理", "变美", "美白", "抗衰", "祛斑", "提升"],
  },
  {
    label: "内容形式",
    tags: ["干货分享", "测评", "好物推荐", "种草", "教程", "日记", "真实体验"],
  },
  {
    label: "人群场景",
    tags: ["敏感肌", "油皮", "混合肌", "男士护肤", "熟龄肌", "学生党"],
  },
];

interface Props {
  projectId: string;
}

type DraftState = {
  title: string;
  content: string;
  tags: string[];
  visibility: "公开可见" | "仅自己可见" | "仅互关好友可见";
};

type MaterialTags = string[] | null;

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item =>
      String(item || "")
        .trim()
        .replace(/^#+/, "")
    )
    .filter(Boolean)
    .slice(0, 10);
}

function isSeedanceMaterial(material: {
  tags?: unknown;
  seedanceTaskId?: string | null;
}) {
  const tags = normalizeTags(material.tags as MaterialTags);
  return tags.includes("seedance") || Boolean(material.seedanceTaskId);
}

function statusLabel(status?: string | null) {
  switch (status) {
    case "published":
      return { label: "已发布", className: "bg-green-400/10 text-green-400" };
    case "publishing":
      return { label: "发布中", className: "bg-blue-400/10 text-blue-400" };
    case "failed":
      return { label: "发布失败", className: "bg-red-400/10 text-red-400" };
    case "draft":
      return { label: "草稿就绪", className: "bg-amber-400/10 text-amber-400" };
    default:
      return { label: "未发布", className: "bg-muted text-muted-foreground" };
  }
}

function toVideoSrc(fileUrl?: string | null) {
  if (!fileUrl) return "";
  if (fileUrl.startsWith("http") || fileUrl.startsWith("/_local/"))
    return fileUrl;
  return "";
}

export default function PlatformAdaptation({ projectId }: Props) {
  const pid = Number.parseInt(projectId, 10);
  const utils = trpc.useUtils();
  const [drafts, setDrafts] = useState<Record<number, DraftState>>({});
  const [tagInputs, setTagInputs] = useState<Record<number, string>>({});
  const [publishingId, setPublishingId] = useState<number | null>(null);

  const { data: scripts } = trpc.scripts.list.useQuery({ projectId: pid });
  const { data: topicPlans } = trpc.topicPlans.list.useQuery({
    projectId: pid,
  });
  const { data: materials, isLoading: materialsLoading } =
    trpc.materials.list.useQuery({ projectId: pid });
  const { data: adaptations } = trpc.platformAdaptation.listByProject.useQuery({
    projectId: pid,
  });
  const { data: publications, isLoading: publicationsLoading } =
    trpc.xhsPublish.publications.useQuery({ projectId: pid });
  const { data: loginStatus, refetch: refetchLogin } =
    trpc.xhsPublish.loginStatus.useQuery(undefined, {
      refetchInterval: false,
    });

  const publishMutation = trpc.xhsPublish.publishMaterialAuto.useMutation({
    onSuccess: async data => {
      await utils.xhsPublish.publications.invalidate({ projectId: pid });
      toast.success(
        data.postId ? `发布成功，笔记ID：${data.postId}` : "发布成功"
      );
    },
    onError: error => toast.error(error.message || "发布失败"),
    onSettled: () => setPublishingId(null),
  });

  const batchPublishMutation = trpc.xhsPublish.batchPublishAuto.useMutation({
    onSuccess: async data => {
      await utils.xhsPublish.publications.invalidate({ projectId: pid });
      const successCount = data.results.filter(item => item.success).length;
      const failedCount = data.results.length - successCount;
      toast.success(
        `批量发布完成：成功 ${successCount} 条，失败 ${failedCount} 条`
      );
    },
    onError: error => toast.error(error.message || "批量发布失败"),
  });

  const rows = useMemo(() => {
    const scriptMap = new Map((scripts ?? []).map(item => [item.id, item]));
    const planMap = new Map((topicPlans ?? []).map(item => [item.id, item]));
    const publicationMap = new Map(
      (publications ?? []).map(item => [item.materialId, item])
    );
    const adaptationMap = new Map(
      (adaptations ?? [])
        .filter(item => item.platform === "xiaohongshu")
        .map(item => [item.scriptId, item])
    );

    return (materials ?? [])
      .filter(material => isSeedanceMaterial(material))
      .map(material => {
        const script = material.scriptId
          ? scriptMap.get(material.scriptId)
          : null;
        const plan = script?.topicPlanId
          ? planMap.get(script.topicPlanId)
          : null;
        return {
          material,
          script,
          plan,
          publication: publicationMap.get(material.id) ?? null,
          adaptation: material.scriptId
            ? (adaptationMap.get(material.scriptId) ?? null)
            : null,
        };
      })
      .sort((a, b) => b.material.id - a.material.id);
  }, [adaptations, materials, publications, scripts, topicPlans]);

  const readyRows = rows.filter(
    row =>
      row.material.status === "ready" &&
      row.material.fileUrl &&
      row.publication?.status !== "published"
  );

  function getDraft(row: (typeof rows)[number]): DraftState {
    const local = drafts[row.material.id];
    if (local) return local;
    if (row.publication?.title || row.publication?.content) {
      return {
        title: row.publication.title || row.script?.title || row.material.title,
        content: "",
        tags: normalizeTags(row.publication.tags),
        visibility:
          (row.publication.visibility as DraftState["visibility"]) ||
          "公开可见",
      };
    }
    if (row.adaptation?.title || row.adaptation?.caption) {
      return {
        title: row.adaptation.title || row.script?.title || row.material.title,
        content: "",
        tags: normalizeTags(row.adaptation.hashtags),
        visibility: "公开可见",
      };
    }
    return {
      title: row.script?.title || row.material.title,
      content: "",
      tags: ["医美", "护肤", "变美"],
      visibility: "公开可见",
    };
  }

  function updateDraft(materialId: number, patch: Partial<DraftState>) {
    setDrafts(prev => ({
      ...prev,
      [materialId]: {
        ...(prev[materialId] || {
          title: "",
          content: "",
          tags: [],
          visibility: "公开可见",
        }),
        ...patch,
      },
    }));
  }

  function addTag(row: (typeof rows)[number]) {
    const nextTag = (tagInputs[row.material.id] || "")
      .trim()
      .replace(/^#+/, "");
    if (!nextTag) return;
    const draft = getDraft(row);
    updateDraft(row.material.id, {
      ...draft,
      tags: Array.from(new Set([...draft.tags, nextTag])),
    });
    setTagInputs(prev => ({ ...prev, [row.material.id]: "" }));
  }

  function handlePublish(row: (typeof rows)[number]) {
    const draft = getDraft(row);
    setPublishingId(row.material.id);
    publishMutation.mutate({
      projectId: pid,
      materialId: row.material.id,
      title: draft.title,
      content: draft.content,
      tags: draft.tags,
      visibility: draft.visibility,
    });
  }

  function handleBatchPublish() {
    if (readyRows.length === 0) {
      toast.error("暂无可自动发布的就绪视频");
      return;
    }
    batchPublishMutation.mutate({
      projectId: pid,
      materialIds: readyRows.map(row => row.material.id),
      visibility: "公开可见",
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Share2 className="h-6 w-6 text-red-400" />
            一键分发
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            自动读取素材智造生成的视频，生成小红书发布文案，并调用本地 XHS API
            发布视频笔记。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {loginStatus?.isLoggedIn ? (
            <Badge className="border-green-400/30 bg-green-400/10 text-green-400">
              <CheckCircle className="mr-1 h-3.5 w-3.5" />
              已登录 {loginStatus.username}
            </Badge>
          ) : (
            <Badge className="border-red-400/30 bg-red-400/10 text-red-400">
              <AlertCircle className="mr-1 h-3.5 w-3.5" />
              小红书未登录
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => refetchLogin()}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            刷新登录
          </Button>
          <Button
            size="sm"
            disabled={batchPublishMutation.isPending || readyRows.length === 0}
            onClick={handleBatchPublish}
          >
            {batchPublishMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            一键自动发布 {readyRows.length} 条
          </Button>
        </div>
      </div>

      {!loginStatus?.isLoggedIn && (
        <Card className="border-amber-400/30 bg-amber-400/5">
          <CardContent className="flex flex-col gap-3 p-4 text-sm text-amber-300 md:flex-row md:items-center md:justify-between">
            <span>发布前需要先完成小红书扫码登录。</span>
            <a
              href="/xhs-login"
              className="inline-flex items-center gap-1 text-primary"
            >
              去登录
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </CardContent>
        </Card>
      )}

      {materialsLoading || publicationsLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(item => (
            <div key={item} className="h-64 rounded-3xl shimmer" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            暂无可分发的视频素材。请先到“素材智造”生成视频。
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map(row => {
            const draft = getDraft(row);
            const status = statusLabel(row.publication?.status);
            const videoSrc = toVideoSrc(row.material.fileUrl);
            const isReady = row.material.status === "ready" && videoSrc;
            return (
              <Card
                key={row.material.id}
                className="overflow-hidden rounded-3xl border-border bg-card"
              >
                <CardContent className="grid gap-0 p-0 xl:grid-cols-[300px_minmax(0,1fr)]">
                  <div className="space-y-4 border-b border-border bg-muted/20 p-4 xl:border-b-0 xl:border-r">
                    <div className="aspect-[9/16] overflow-hidden rounded-2xl bg-black">
                      {videoSrc ? (
                        <video
                          src={videoSrc}
                          controls
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                          <Video className="mr-2 h-4 w-4" />
                          视频尚未就绪
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 text-xs text-muted-foreground">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">素材 #{row.material.id}</Badge>
                        <Badge className={status.className}>
                          {status.label}
                        </Badge>
                        <Badge variant="secondary">
                          {row.material.status === "ready"
                            ? "视频就绪"
                            : row.material.status}
                        </Badge>
                      </div>
                      {row.publication?.postId && (
                        <p>小红书笔记ID：{row.publication.postId}</p>
                      )}
                      {row.publication?.errorMessage && (
                        <p className="text-red-400">
                          失败原因：{row.publication.errorMessage}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4 p-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-foreground">
                          {row.material.title}
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          关联选题：
                          {row.plan?.title || row.script?.title || "未关联"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          disabled={
                            !isReady || publishingId === row.material.id
                          }
                          onClick={() => handlePublish(row)}
                          className="bg-red-500/20 text-red-300 hover:bg-red-500/30"
                        >
                          {publishingId === row.material.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="mr-2 h-4 w-4" />
                          )}
                          自动发布到小红书
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">
                          发布标题
                        </Label>
                        <Input
                          value={draft.title}
                          maxLength={100}
                          onChange={event =>
                            updateDraft(row.material.id, {
                              ...draft,
                              title: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">
                          可见范围
                        </Label>
                        <Select
                          value={draft.visibility}
                          onValueChange={value =>
                            updateDraft(row.material.id, {
                              ...draft,
                              visibility: value as DraftState["visibility"],
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="公开可见">公开可见</SelectItem>
                            <SelectItem value="仅自己可见">
                              仅自己可见
                            </SelectItem>
                            <SelectItem value="仅互关好友可见">
                              仅互关好友可见
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Separator className="opacity-50" />

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">
                          话题标签
                          <span className="ml-1.5 text-muted-foreground/50">
                            最多 10 个，点击候选标签快速添加
                          </span>
                        </Label>
                        {draft.tags.length > 0 && (
                          <span className="text-xs text-muted-foreground/60">
                            已选 {draft.tags.length}/10
                          </span>
                        )}
                      </div>

                      {/* 候选标签 */}
                      <div className="space-y-2 rounded-xl bg-muted/30 p-3">
                        {PRESET_TAG_GROUPS.map(group => (
                          <div key={group.label} className="space-y-1.5">
                            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                              {group.label}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {group.tags.map(tag => {
                                const selected = draft.tags.includes(tag);
                                const limitReached = draft.tags.length >= 10;
                                return (
                                  <button
                                    key={tag}
                                    type="button"
                                    disabled={!selected && limitReached}
                                    onClick={() => {
                                      if (selected) {
                                        updateDraft(row.material.id, {
                                          ...draft,
                                          tags: draft.tags.filter(
                                            t => t !== tag
                                          ),
                                        });
                                      } else if (!limitReached) {
                                        updateDraft(row.material.id, {
                                          ...draft,
                                          tags: [...draft.tags, tag],
                                        });
                                      }
                                    }}
                                    className={cn(
                                      "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                                      selected
                                        ? "border-primary/40 bg-primary/15 text-primary"
                                        : limitReached
                                          ? "cursor-not-allowed border-border/30 bg-muted/20 text-muted-foreground/40"
                                          : "border-border/50 bg-muted/40 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
                                    )}
                                  >
                                    #{tag}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* 已选标签 */}
                      {draft.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {draft.tags.map(tag => (
                            <Badge
                              key={tag}
                              className="cursor-pointer gap-1 rounded-full border-primary/30 bg-primary/10 pr-1.5 text-xs text-primary hover:bg-primary/20"
                              onClick={() =>
                                updateDraft(row.material.id, {
                                  ...draft,
                                  tags: draft.tags.filter(item => item !== tag),
                                })
                              }
                            >
                              #{tag}
                              <span className="opacity-60">×</span>
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* 自定义标签输入 */}
                      <div className="flex gap-2">
                        <Input
                          value={tagInputs[row.material.id] || ""}
                          placeholder="自定义标签，无需加 #"
                          className="h-8 text-sm"
                          disabled={draft.tags.length >= 10}
                          onChange={event =>
                            setTagInputs(prev => ({
                              ...prev,
                              [row.material.id]: event.target.value,
                            }))
                          }
                          onKeyDown={event => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              addTag(row);
                            }
                          }}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 shrink-0"
                          disabled={draft.tags.length >= 10}
                          onClick={() => addTag(row)}
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          添加
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
