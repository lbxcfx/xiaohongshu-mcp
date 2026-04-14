import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle,
  CheckCircle2,
  Clapperboard,
  ExternalLink,
  Heart,
  Loader2,
  MessageCircle,
  Play,
  RefreshCw,
  Share2,
  Sparkles,
  Upload,
  VideoIcon,
  Wand2,
  XCircle,
} from "lucide-react";

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
  [key: string]: unknown;
};

type ShotItem = {
  shotIndex: number;
  timeRange: string;
  description: string;
  cameraInstruction: string;
  visualSuggestion: string;
  voiceOver: string;
};

type GenerationConfig = {
  type: "real_person" | "digital_avatar" | "before_after" | "other";
  taskType:
    | "quick_video"
    | "product_i2v"
    | "video_clone"
    | "asset_remix"
    | "long_marketing";
  ratio: "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "21:9" | "adaptive";
  duration: number;
  resolution: "480p" | "720p" | "1080p";
  generateAudio: boolean;
  subtitlesEnabled: boolean;
};

const DEFAULT_CONFIG: GenerationConfig = {
  type: "real_person",
  taskType: "quick_video",
  ratio: "9:16",
  duration: 5,
  resolution: "720p",
  generateAudio: true,
  subtitlesEnabled: true,
};

const TYPE_LABELS: Record<GenerationConfig["type"], string> = {
  real_person: "真人口播",
  digital_avatar: "数字人",
  before_after: "术前术后",
  other: "其他素材",
};

const PIXELLE_TASK_LABELS: Record<GenerationConfig["taskType"], string> = {
  quick_video: "快速短视频",
  product_i2v: "商品图动起来",
  video_clone: "参考视频复刻",
  asset_remix: "多素材混剪",
  long_marketing: "多分镜营销视频",
};

const PIXELLE_TASK_TYPES: GenerationConfig["taskType"][] = [
  "video_clone",
  "asset_remix",
  "long_marketing",
];

function toLocalAssetUrl(filePath?: string) {
  if (!filePath) return undefined;
  const normalized = filePath.replace(/\\/g, "/");
  const marker = "/.data/";
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex < 0) return undefined;
  return `/_local/${normalized.slice(markerIndex + marker.length)}`;
}

function formatCount(value?: number) {
  if (!value) return "0";
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`;
  return String(value);
}

function shotKey(scriptId: number, shotIndex: number) {
  return `${scriptId}:${shotIndex}`;
}

function directKey(scriptId: number) {
  return `direct:${scriptId}`;
}

function pixelleVideoKey(scriptId: number) {
  return `pixelle-video:${scriptId}`;
}

function pixelleImageKey(scriptId: number) {
  return `pixelle-image:${scriptId}`;
}

function materialTags(material: { tags?: unknown }) {
  return Array.isArray(material.tags) ? material.tags.map(String) : [];
}

function materialProvider(material: {
  provider?: string | null;
  tags?: unknown;
}) {
  if (
    material.provider === "pixelle" ||
    materialTags(material).includes("pixelle")
  ) {
    return "pixelle";
  }
  return "seedance";
}

function materialTaskId(material: {
  pixelleTaskId?: string | null;
  seedanceTaskId?: string | null;
}) {
  return material.pixelleTaskId || material.seedanceTaskId;
}

// 素材状态配置
function getMaterialStatus(status: string) {
  switch (status) {
    case "ready":
    case "completed":
      return {
        label: "已就绪",
        className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
        icon: CheckCircle2,
      };
    case "processing":
      return {
        label: "生成中",
        className: "border-amber-500/30 bg-amber-500/10 text-amber-400",
        icon: Loader2,
      };
    case "failed":
      return {
        label: "失败",
        className: "border-red-500/30 bg-red-500/10 text-red-400",
        icon: XCircle,
      };
    default:
      return {
        label: "待处理",
        className: "border-border/50 bg-muted/30 text-muted-foreground",
        icon: VideoIcon,
      };
  }
}

export default function MaterialGeneration({ projectId }: Props) {
  const pid = Number.parseInt(projectId, 10);
  const utils = trpc.useUtils();

  const [storyboards, setStoryboards] = useState<Record<number, ShotItem[]>>(
    {}
  );
  const [selectedShots, setSelectedShots] = useState<Record<number, number[]>>(
    {}
  );
  const [shotImages, setShotImages] = useState<Record<string, string>>({});
  const [configs, setConfigs] = useState<Record<number, GenerationConfig>>({});
  const [modeByScript, setModeByScript] = useState<
    Record<number, "direct" | "storyboard" | "pixelle">
  >({});
  const [previewVideo, setPreviewVideo] = useState<{
    url: string;
    title: string;
  } | null>(null);

  const { data: scripts, isLoading: scriptsLoading } =
    trpc.scripts.list.useQuery({ projectId: pid });
  const { data: topicPlans } = trpc.topicPlans.list.useQuery({
    projectId: pid,
  });
  const { data: hubItems } = trpc.topicHub.list.useQuery({ projectId: pid });
  const { data: materials, isLoading: materialsLoading } =
    trpc.materials.list.useQuery({ projectId: pid });

  const storyboardMutation =
    trpc.videoGeneration.generateStoryboard.useMutation({
      onSuccess: (data, variables) => {
        setStoryboards(prev => ({ ...prev, [variables.scriptId]: data.shots }));
        setSelectedShots(prev => ({
          ...prev,
          [variables.scriptId]: data.shots.map(shot => shot.shotIndex),
        }));
        toast.success(`已生成 ${data.shots.length} 个分镜头`);
      },
      onError: error => toast.error(error.message || "分镜头生成失败"),
    });

  const createTaskMutation = trpc.videoGeneration.createTask.useMutation({
    onSuccess: async () => {
      await utils.materials.list.invalidate({ projectId: pid });
    },
    onError: error => toast.error(error.message || "素材任务创建失败"),
  });

  const checkStatusMutation = trpc.videoGeneration.checkStatus.useMutation({
    onSuccess: async () => {
      await utils.materials.list.invalidate({ projectId: pid });
    },
  });

  const rows = useMemo(() => {
    const planMap = new Map((topicPlans ?? []).map(item => [item.id, item]));
    const hubMap = new Map((hubItems ?? []).map(item => [item.id, item]));
    const materialMap = new Map<
      number,
      NonNullable<typeof materials>[number][]
    >();

    for (const material of materials ?? []) {
      const scriptId = Number(material.scriptId ?? 0);
      if (!scriptId) continue;
      materialMap.set(scriptId, [
        ...(materialMap.get(scriptId) ?? []),
        material,
      ]);
    }

    return (scripts ?? [])
      .map(script => {
        const plan = planMap.get(Number(script.topicPlanId ?? 0)) ?? null;
        const hubItem = plan ? (hubMap.get(plan.hubItemId) ?? null) : null;
        return {
          script,
          plan,
          hubItem,
          materials: materialMap.get(script.id) ?? [],
        };
      })
      .sort((a, b) => {
        const aLiked = Number(
          ((a.hubItem?.tags ?? {}) as HubTags).likedCount ?? 0
        );
        const bLiked = Number(
          ((b.hubItem?.tags ?? {}) as HubTags).likedCount ?? 0
        );
        return bLiked - aLiked || b.script.id - a.script.id;
      });
  }, [hubItems, materials, scripts, topicPlans]);

  async function handleUploadByKey(key: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`/api/upload?projectId=${pid}`, {
      method: "POST",
      body: formData,
    });
    const data = (await response.json()) as { success?: boolean; url?: string };
    if (!data.success || !data.url) throw new Error("素材上传失败");
    setShotImages(prev => ({ ...prev, [key]: data.url! }));
  }

  async function handleGenerateByStoryboard(row: (typeof rows)[number]) {
    const shots = storyboards[row.script.id] ?? [];
    const selected = new Set(selectedShots[row.script.id] ?? []);
    const config = configs[row.script.id] ?? DEFAULT_CONFIG;
    const targets = shots.filter(item => selected.has(item.shotIndex));
    if (targets.length === 0) {
      toast.error("请至少勾选一个分镜头");
      return;
    }

    for (const shot of targets) {
      await createTaskMutation.mutateAsync({
        projectId: pid,
        scriptId: row.script.id,
        title: `${row.script.title} - 镜头${shot.shotIndex}`,
        type: config.type,
        prompt: `画面描述：${shot.description}。镜头指令：${shot.cameraInstruction}。视觉建议：${shot.visualSuggestion}。口播内容：${shot.voiceOver}`,
        referenceImageUrl:
          shotImages[shotKey(row.script.id, shot.shotIndex)] || undefined,
        taskType: "product_i2v",
        ratio: config.ratio,
        duration: config.duration,
        resolution: config.resolution,
        generateAudio: config.generateAudio,
      });
    }
    toast.success(`已提交 ${targets.length} 个素材生成任务`);
  }

  async function handleGenerateDirect(row: (typeof rows)[number]) {
    const config = configs[row.script.id] ?? DEFAULT_CONFIG;
    const prompt = (row.script.fullScript || row.script.title || "").trim();
    if (!prompt) {
      toast.error("当前脚本内容为空，无法直出视频");
      return;
    }

    await createTaskMutation.mutateAsync({
      projectId: pid,
      scriptId: row.script.id,
      title: `${row.script.title} - 脚本直出`,
      type: config.type,
      taskType: shotImages[directKey(row.script.id)]
        ? "product_i2v"
        : "quick_video",
      prompt,
      referenceImageUrl: shotImages[directKey(row.script.id)] || undefined,
      ratio: config.ratio,
      duration: config.duration,
      resolution: config.resolution,
      generateAudio: config.generateAudio,
    });
    toast.success("已提交脚本直出视频任务");
  }

  async function handleGeneratePixelle(row: (typeof rows)[number]) {
    const config = configs[row.script.id] ?? DEFAULT_CONFIG;
    const prompt = (row.script.fullScript || row.script.title || "").trim();
    const taskType = PIXELLE_TASK_TYPES.includes(config.taskType)
      ? config.taskType
      : "video_clone";
    const referenceVideoUrl = shotImages[pixelleVideoKey(row.script.id)] || "";
    const referenceImageUrl = shotImages[pixelleImageKey(row.script.id)] || "";

    if (!prompt) {
      toast.error("当前脚本内容为空，无法创建 Pixelle 任务");
      return;
    }

    if (taskType === "video_clone" && !referenceVideoUrl) {
      toast.error("参考视频复刻需要先填写或上传参考视频");
      return;
    }

    await createTaskMutation.mutateAsync({
      projectId: pid,
      scriptId: row.script.id,
      title: `${row.script.title} - ${PIXELLE_TASK_LABELS[taskType]}`,
      provider: "pixelle",
      taskType,
      type: config.type,
      prompt,
      referenceVideoUrl: referenceVideoUrl || undefined,
      referenceImageUrl: referenceImageUrl || undefined,
      productImageUrls: referenceImageUrl ? [referenceImageUrl] : undefined,
      ratio: config.ratio,
      duration: config.duration,
      resolution: config.resolution,
      generateAudio: config.generateAudio,
      subtitlesEnabled: config.subtitlesEnabled,
    });
    toast.success("已提交 Pixelle 编排任务");
  }

  function updateConfig(scriptId: number, patch: Partial<GenerationConfig>) {
    setConfigs(prev => ({
      ...prev,
      [scriptId]: { ...(prev[scriptId] ?? DEFAULT_CONFIG), ...patch },
    }));
  }

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Sparkles className="h-6 w-6 text-blue-400" />
            素材智造
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            每条爆款复刻脚本可生成分镜，并按镜头生成可投放的视频素材。
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            void utils.materials.list.invalidate({ projectId: pid })
          }
        >
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          刷新
        </Button>
      </div>

      {/* 列表 */}
      {scriptsLoading || materialsLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(item => (
            <div key={item} className="h-64 rounded-3xl shimmer" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex min-h-[280px] flex-col items-center justify-center rounded-3xl border border-dashed border-border/60 bg-card/40 px-8 py-14 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-400/10">
            <VideoIcon className="h-8 w-8 text-blue-400" />
          </div>
          <h3 className="text-base font-semibold text-foreground">
            还没有可用脚本
          </h3>
          <p className="mt-2.5 max-w-sm text-sm leading-7 text-muted-foreground">
            请先到「爆款复刻」页面生成脚本，完成后回到这里生成视频素材。
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {rows.map(row => {
            const tags = ((row.hubItem?.tags ?? {}) as HubTags) ?? {};
            const cover =
              toLocalAssetUrl(tags.coverDownloadPath) || tags.coverUrl;
            const shots = storyboards[row.script.id] ?? [];
            const currentConfig = configs[row.script.id] ?? DEFAULT_CONFIG;
            const generationMode = modeByScript[row.script.id] ?? "direct";
            const isStoryboardLoading =
              storyboardMutation.isPending &&
              storyboardMutation.variables?.scriptId === row.script.id;

            return (
              <Card
                key={row.script.id}
                className="overflow-hidden rounded-3xl border-border bg-card"
              >
                <CardContent className="grid gap-0 p-0 lg:grid-cols-[240px_minmax(0,1fr)]">
                  {/* 左侧：封面 + 源视频信息 */}
                  <div className="flex flex-col gap-4 border-b border-border/70 bg-muted/15 p-5 lg:border-b-0 lg:border-r">
                    <div className="overflow-hidden rounded-2xl bg-muted">
                      <div className="aspect-[3/4]">
                        {cover ? (
                          <img
                            src={cover}
                            alt={row.script.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                            暂无封面
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1.5 text-xs text-muted-foreground">
                      <p className="font-medium text-foreground/80">
                        {tags.authorName || "小红书作者"}
                      </p>
                      <div className="flex gap-3">
                        <span className="flex items-center gap-1">
                          <Heart className="h-3 w-3" />
                          {formatCount(Number(tags.likedCount || 0))}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageCircle className="h-3 w-3" />
                          {formatCount(Number(tags.commentCount || 0))}
                        </span>
                        <span className="flex items-center gap-1">
                          <Share2 className="h-3 w-3" />
                          {formatCount(Number(tags.sharedCount || 0))}
                        </span>
                      </div>
                    </div>

                    {/* 素材统计 */}
                    {row.materials.length > 0 && (
                      <div className="rounded-xl border border-border/60 bg-background/30 px-3 py-2.5">
                        <p className="text-xs text-muted-foreground">
                          已生成素材
                        </p>
                        <p className="mt-0.5 text-xl font-bold text-foreground">
                          {row.materials.length}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(["ready", "processing", "failed"] as const).map(
                            s => {
                              const count = row.materials.filter(
                                m => m.status === s
                              ).length;
                              if (!count) return null;
                              const st = getMaterialStatus(s);
                              return (
                                <span
                                  key={s}
                                  className={`rounded-full border px-2 py-0.5 text-[11px] ${st.className}`}
                                >
                                  {st.label} {count}
                                </span>
                              );
                            }
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 右侧：内容区 */}
                  <div className="divide-y divide-border/50">
                    {/* 脚本标题区 */}
                    <div className="flex items-start justify-between gap-3 px-5 py-4">
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold text-foreground">
                          {row.script.title}
                        </h2>
                        {row.plan?.title && (
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {row.plan.title}
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          storyboardMutation.mutate({
                            projectId: pid,
                            scriptId: row.script.id,
                          })
                        }
                        disabled={isStoryboardLoading}
                        className="shrink-0 rounded-full"
                      >
                        {isStoryboardLoading ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Clapperboard className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        生成分镜
                      </Button>
                    </div>

                    {/* 生成配置区 */}
                    <div className="space-y-4 px-5 py-4">
                      {/* 生成模式 + 配置参数 */}
                      <div className="flex flex-wrap items-end gap-3">
                        {/* 生成方式 Tab */}
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">
                            生成方式
                          </Label>
                          <Tabs
                            value={generationMode}
                            onValueChange={v =>
                              setModeByScript(prev => ({
                                ...prev,
                                [row.script.id]: v as
                                  | "direct"
                                  | "storyboard"
                                  | "pixelle",
                              }))
                            }
                          >
                            <TabsList className="h-9 rounded-xl bg-muted/50 px-1">
                              <TabsTrigger
                                value="direct"
                                className="rounded-lg px-3 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                              >
                                <Wand2 className="mr-1 h-3 w-3" />
                                脚本直出
                              </TabsTrigger>
                              <TabsTrigger
                                value="storyboard"
                                className="rounded-lg px-3 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                              >
                                <Clapperboard className="mr-1 h-3 w-3" />
                                分镜生成
                              </TabsTrigger>
                              <TabsTrigger
                                value="pixelle"
                                className="rounded-lg px-3 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                              >
                                <VideoIcon className="mr-1 h-3 w-3" />
                                Pixelle
                              </TabsTrigger>
                            </TabsList>
                          </Tabs>
                        </div>

                        {/* 素材类型 */}
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">
                            素材类型
                          </Label>
                          <Select
                            value={currentConfig.type}
                            onValueChange={v =>
                              updateConfig(row.script.id, {
                                type: v as GenerationConfig["type"],
                              })
                            }
                          >
                            <SelectTrigger className="h-9 w-[110px] rounded-xl text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(TYPE_LABELS).map(([v, label]) => (
                                <SelectItem key={v} value={v}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {generationMode === "pixelle" && (
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">
                              Pixelle 类型
                            </Label>
                            <Select
                              value={
                                PIXELLE_TASK_TYPES.includes(
                                  currentConfig.taskType
                                )
                                  ? currentConfig.taskType
                                  : "video_clone"
                              }
                              onValueChange={v =>
                                updateConfig(row.script.id, {
                                  taskType: v as GenerationConfig["taskType"],
                                })
                              }
                            >
                              <SelectTrigger className="h-9 w-[138px] rounded-xl text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PIXELLE_TASK_TYPES.map(v => (
                                  <SelectItem key={v} value={v}>
                                    {PIXELLE_TASK_LABELS[v]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {/* 视频比例 */}
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">
                            比例
                          </Label>
                          <Select
                            value={currentConfig.ratio}
                            onValueChange={v =>
                              updateConfig(row.script.id, {
                                ratio: v as GenerationConfig["ratio"],
                              })
                            }
                          >
                            <SelectTrigger className="h-9 w-[90px] rounded-xl text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[
                                "9:16",
                                "16:9",
                                "1:1",
                                "3:4",
                                "4:3",
                                "adaptive",
                              ].map(v => (
                                <SelectItem key={v} value={v}>
                                  {v}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* 时长 */}
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">
                            时长
                          </Label>
                          <Select
                            value={String(currentConfig.duration)}
                            onValueChange={v =>
                              updateConfig(row.script.id, {
                                duration: Number(v),
                              })
                            }
                          >
                            <SelectTrigger className="h-9 w-[76px] rounded-xl text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[4, 5, 6, 8, 10, 12].map(v => (
                                <SelectItem key={v} value={String(v)}>
                                  {v}s
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* 分辨率 */}
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">
                            分辨率
                          </Label>
                          <Select
                            value={currentConfig.resolution}
                            onValueChange={v =>
                              updateConfig(row.script.id, {
                                resolution: v as GenerationConfig["resolution"],
                              })
                            }
                          >
                            <SelectTrigger className="h-9 w-[84px] rounded-xl text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {["480p", "720p", "1080p"].map(v => (
                                <SelectItem key={v} value={v}>
                                  {v}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* 生成音频 Switch */}
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">
                            生成音频
                          </Label>
                          <div className="flex h-9 items-center">
                            <Switch
                              checked={currentConfig.generateAudio}
                              onCheckedChange={v =>
                                updateConfig(row.script.id, {
                                  generateAudio: v,
                                })
                              }
                            />
                          </div>
                        </div>

                        {generationMode === "pixelle" && (
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">
                              字幕
                            </Label>
                            <div className="flex h-9 items-center">
                              <Switch
                                checked={currentConfig.subtitlesEnabled}
                                onCheckedChange={v =>
                                  updateConfig(row.script.id, {
                                    subtitlesEnabled: v,
                                  })
                                }
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 生成区域 */}
                      {generationMode === "pixelle" ? (
                        <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/10 p-4">
                          <p className="text-xs leading-6 text-muted-foreground">
                            Pixelle
                            负责参考视频复刻、多素材混剪和多分镜编排；后端统一创建任务，简单短视频仍由
                            Seedance 处理。
                          </p>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">
                                参考视频
                              </Label>
                              <div className="flex items-center gap-2">
                                <Input
                                  placeholder="视频 URL 或上传本地视频"
                                  value={
                                    shotImages[
                                      pixelleVideoKey(row.script.id)
                                    ] || ""
                                  }
                                  onChange={e =>
                                    setShotImages(prev => ({
                                      ...prev,
                                      [pixelleVideoKey(row.script.id)]:
                                        e.target.value,
                                    }))
                                  }
                                  className="h-9 rounded-xl text-xs"
                                />
                                <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                                  <Upload className="h-3.5 w-3.5" />
                                  上传
                                  <input
                                    type="file"
                                    accept="video/*"
                                    className="hidden"
                                    onChange={async e => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      try {
                                        await handleUploadByKey(
                                          pixelleVideoKey(row.script.id),
                                          file
                                        );
                                        toast.success("参考视频上传成功");
                                      } catch (error) {
                                        toast.error(
                                          (error as Error).message || "上传失败"
                                        );
                                      }
                                    }}
                                  />
                                </label>
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">
                                商品图
                              </Label>
                              <div className="flex items-center gap-2">
                                <Input
                                  placeholder="商品图 URL 或上传图片"
                                  value={
                                    shotImages[
                                      pixelleImageKey(row.script.id)
                                    ] || ""
                                  }
                                  onChange={e =>
                                    setShotImages(prev => ({
                                      ...prev,
                                      [pixelleImageKey(row.script.id)]:
                                        e.target.value,
                                    }))
                                  }
                                  className="h-9 rounded-xl text-xs"
                                />
                                <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                                  <Upload className="h-3.5 w-3.5" />
                                  上传
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={async e => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      try {
                                        await handleUploadByKey(
                                          pixelleImageKey(row.script.id),
                                          file
                                        );
                                        toast.success("商品图上传成功");
                                      } catch (error) {
                                        toast.error(
                                          (error as Error).message || "上传失败"
                                        );
                                      }
                                    }}
                                  />
                                </label>
                              </div>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => void handleGeneratePixelle(row)}
                            disabled={createTaskMutation.isPending}
                            className="rounded-full px-5"
                          >
                            {createTaskMutation.isPending ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <VideoIcon className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            创建 Pixelle 任务
                          </Button>
                        </div>
                      ) : generationMode === "direct" ? (
                        <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/10 p-4">
                          <p className="text-xs text-muted-foreground">
                            直接把当前脚本正文提交给 Seedance
                            生成完整视频，无需分镜拆解。
                          </p>
                          <div className="flex items-center gap-2">
                            <Input
                              placeholder="可选：参考图 URL"
                              value={shotImages[directKey(row.script.id)] || ""}
                              onChange={e =>
                                setShotImages(prev => ({
                                  ...prev,
                                  [directKey(row.script.id)]: e.target.value,
                                }))
                              }
                              className="h-9 rounded-xl text-xs"
                            />
                            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                              <Upload className="h-3.5 w-3.5" />
                              上传图片
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={async e => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  try {
                                    await handleUploadByKey(
                                      directKey(row.script.id),
                                      file
                                    );
                                    toast.success("参考图上传成功");
                                  } catch (error) {
                                    toast.error(
                                      (error as Error).message || "上传失败"
                                    );
                                  }
                                }}
                              />
                            </label>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => void handleGenerateDirect(row)}
                            disabled={createTaskMutation.isPending}
                            className="rounded-full px-5"
                          >
                            {createTaskMutation.isPending ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            脚本直出视频
                          </Button>
                        </div>
                      ) : shots.length > 0 ? (
                        <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/10 p-4">
                          <div className="space-y-2">
                            {shots.map(shot => {
                              const selected = (
                                selectedShots[row.script.id] ?? []
                              ).includes(shot.shotIndex);
                              return (
                                <div
                                  key={shot.shotIndex}
                                  className={`rounded-xl border p-3 transition-colors ${
                                    selected
                                      ? "border-primary/40 bg-primary/5"
                                      : "border-border/60 bg-background/30"
                                  }`}
                                >
                                  <div className="flex items-start gap-3">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSelectedShots(prev => ({
                                          ...prev,
                                          [row.script.id]: selected
                                            ? (
                                                prev[row.script.id] ?? []
                                              ).filter(
                                                i => i !== shot.shotIndex
                                              )
                                            : [
                                                ...(prev[row.script.id] ?? []),
                                                shot.shotIndex,
                                              ],
                                        }))
                                      }
                                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                                        selected
                                          ? "border-primary bg-primary text-primary-foreground"
                                          : "border-muted-foreground/50"
                                      }`}
                                    >
                                      {selected && (
                                        <CheckCircle className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                    <div className="min-w-0 flex-1 space-y-1.5">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <Badge
                                          variant="secondary"
                                          className="text-xs"
                                        >
                                          镜头 {shot.shotIndex}
                                        </Badge>
                                        <Badge
                                          variant="outline"
                                          className="text-xs"
                                        >
                                          {shot.timeRange}
                                        </Badge>
                                      </div>
                                      <p className="text-sm text-foreground">
                                        {shot.description}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        镜头：{shot.cameraInstruction}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        视觉：{shot.visualSuggestion}
                                      </p>
                                      <div className="flex items-center gap-2 pt-1">
                                        <Input
                                          placeholder="参考图 URL（可选）"
                                          value={
                                            shotImages[
                                              shotKey(
                                                row.script.id,
                                                shot.shotIndex
                                              )
                                            ] || ""
                                          }
                                          onChange={e =>
                                            setShotImages(prev => ({
                                              ...prev,
                                              [shotKey(
                                                row.script.id,
                                                shot.shotIndex
                                              )]: e.target.value,
                                            }))
                                          }
                                          className="h-8 rounded-lg text-xs"
                                        />
                                        <label className="shrink-0 cursor-pointer rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                                          <Upload className="h-3.5 w-3.5" />
                                          <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={async e => {
                                              const file = e.target.files?.[0];
                                              if (!file) return;
                                              try {
                                                await handleUploadByKey(
                                                  shotKey(
                                                    row.script.id,
                                                    shot.shotIndex
                                                  ),
                                                  file
                                                );
                                                toast.success("参考图上传成功");
                                              } catch (error) {
                                                toast.error(
                                                  (error as Error).message ||
                                                    "上传失败"
                                                );
                                              }
                                            }}
                                          />
                                        </label>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <Button
                            size="sm"
                            onClick={() => void handleGenerateByStoryboard(row)}
                            disabled={createTaskMutation.isPending}
                            className="rounded-full px-5"
                          >
                            {createTaskMutation.isPending ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            生成选中素材
                          </Button>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-border/60 px-5 py-6 text-center text-sm text-muted-foreground">
                          还没有分镜头。点击右上角「生成分镜」后，可按镜头生成视频素材。
                        </div>
                      )}
                    </div>

                    {/* 已生成素材区 */}
                    {row.materials.length > 0 && (
                      <>
                        <Separator />
                        <div className="space-y-3 px-5 py-4">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground">
                              已生成素材
                            </p>
                            <Badge variant="secondary">
                              {row.materials.length}
                            </Badge>
                          </div>
                          <div className="grid gap-2.5 sm:grid-cols-2">
                            {row.materials.map(material => {
                              const st = getMaterialStatus(
                                material.status ?? "pending"
                              );
                              const StatusIcon = st.icon;
                              const provider = materialProvider(material);
                              const taskId = materialTaskId(material);
                              return (
                                <div
                                  key={material.id}
                                  className="flex items-start justify-between gap-3 rounded-2xl border border-border/60 bg-background/30 p-3.5"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-foreground">
                                      {material.title}
                                    </p>
                                    <div className="mt-1.5">
                                      <div className="flex flex-wrap gap-1.5">
                                        <span
                                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${st.className}`}
                                        >
                                          <StatusIcon
                                            className={`h-3 w-3 ${material.status === "processing" ? "animate-spin" : ""}`}
                                          />
                                          {st.label}
                                        </span>
                                        <Badge
                                          variant="outline"
                                          className="rounded-full px-2 py-0.5 text-xs"
                                        >
                                          {provider === "pixelle"
                                            ? "Pixelle"
                                            : "Seedance"}
                                        </Badge>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 flex-col gap-1.5">
                                    {material.fileUrl && (
                                      <>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 rounded-full px-3 text-xs"
                                          onClick={() =>
                                            setPreviewVideo({
                                              url: material.fileUrl!,
                                              title: material.title,
                                            })
                                          }
                                        >
                                          <Play className="mr-1 h-3 w-3" />
                                          预览
                                        </Button>
                                        <a
                                          href={material.fileUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 w-full rounded-full px-3 text-xs"
                                          >
                                            <ExternalLink className="mr-1 h-3 w-3" />
                                            打开
                                          </Button>
                                        </a>
                                      </>
                                    )}
                                    {material.status === "processing" &&
                                      taskId && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 rounded-full px-3 text-xs"
                                          onClick={() =>
                                            checkStatusMutation.mutate({
                                              materialId: material.id,
                                              taskId,
                                              provider,
                                            })
                                          }
                                        >
                                          <RefreshCw className="mr-1 h-3 w-3" />
                                          查询
                                        </Button>
                                      )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 视频预览弹窗 */}
      <Dialog open={!!previewVideo} onOpenChange={() => setPreviewVideo(null)}>
        <DialogContent className="max-w-3xl border-border bg-background">
          <DialogHeader>
            <DialogTitle className="text-sm text-foreground">
              {previewVideo?.title}
            </DialogTitle>
          </DialogHeader>
          {previewVideo && (
            <video
              src={previewVideo.url}
              controls
              autoPlay
              className="max-h-[70vh] w-full rounded-xl"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
