import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle,
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
  Wand2,
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
  ratio: "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "21:9" | "adaptive";
  duration: number;
  resolution: "480p" | "720p" | "1080p";
  generateAudio: boolean;
};

const DEFAULT_CONFIG: GenerationConfig = {
  type: "real_person",
  ratio: "9:16",
  duration: 5,
  resolution: "720p",
  generateAudio: true,
};

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
    Record<number, "direct" | "storyboard">
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
    if (!data.success || !data.url) {
      throw new Error("参考图上传失败");
    }
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
      prompt,
      referenceImageUrl: shotImages[directKey(row.script.id)] || undefined,
      ratio: config.ratio,
      duration: config.duration,
      resolution: config.resolution,
      generateAudio: config.generateAudio,
    });

    toast.success("已提交脚本直出视频任务");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Sparkles className="h-6 w-6 text-blue-400" />
            素材智造
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            每条爆款复刻脚本独立生成分镜，并按镜头生成可投放的视频素材。
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

      {scriptsLoading || materialsLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(item => (
            <div key={item} className="h-64 rounded-3xl shimmer" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            当前还没有可用脚本。请先到“爆款复刻”生成脚本。
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
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
                <CardContent className="grid gap-0 p-0 lg:grid-cols-[280px_minmax(0,1fr)]">
                  <div className="border-b border-border/70 bg-muted/20 p-4 lg:border-b-0 lg:border-r">
                    <div className="aspect-[3/4] overflow-hidden rounded-2xl bg-muted">
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
                    <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                      <p>{tags.authorName || "小红书作者"}</p>
                      <div className="flex gap-3">
                        <span className="flex items-center gap-1">
                          <Heart className="h-3.5 w-3.5" />
                          {formatCount(Number(tags.likedCount || 0))}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageCircle className="h-3.5 w-3.5" />
                          {formatCount(Number(tags.commentCount || 0))}
                        </span>
                        <span className="flex items-center gap-1">
                          <Share2 className="h-3.5 w-3.5" />
                          {formatCount(Number(tags.sharedCount || 0))}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 p-5">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-foreground">
                          {row.script.title}
                        </h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {row.plan?.title || "未关联选题"}
                        </p>
                      </div>
                      <Button
                        onClick={() =>
                          storyboardMutation.mutate({
                            projectId: pid,
                            scriptId: row.script.id,
                          })
                        }
                        disabled={isStoryboardLoading}
                      >
                        {isStoryboardLoading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Clapperboard className="mr-2 h-4 w-4" />
                        )}
                        生成分镜
                      </Button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                          生成方式
                        </Label>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant={
                              generationMode === "direct"
                                ? "default"
                                : "outline"
                            }
                            size="sm"
                            className="flex-1"
                            onClick={() =>
                              setModeByScript(prev => ({
                                ...prev,
                                [row.script.id]: "direct",
                              }))
                            }
                          >
                            <Wand2 className="mr-1 h-3.5 w-3.5" />
                            脚本直出
                          </Button>
                          <Button
                            type="button"
                            variant={
                              generationMode === "storyboard"
                                ? "default"
                                : "outline"
                            }
                            size="sm"
                            className="flex-1"
                            onClick={() =>
                              setModeByScript(prev => ({
                                ...prev,
                                [row.script.id]: "storyboard",
                              }))
                            }
                          >
                            <Clapperboard className="mr-1 h-3.5 w-3.5" />
                            先分镜
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                          素材类型
                        </Label>
                        <Select
                          value={currentConfig.type}
                          onValueChange={value =>
                            setConfigs(prev => ({
                              ...prev,
                              [row.script.id]: {
                                ...currentConfig,
                                type: value as GenerationConfig["type"],
                              },
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="real_person">
                              真人口播
                            </SelectItem>
                            <SelectItem value="digital_avatar">
                              数字人
                            </SelectItem>
                            <SelectItem value="before_after">
                              术前术后
                            </SelectItem>
                            <SelectItem value="other">其他素材</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                          视频比例
                        </Label>
                        <Select
                          value={currentConfig.ratio}
                          onValueChange={value =>
                            setConfigs(prev => ({
                              ...prev,
                              [row.script.id]: {
                                ...currentConfig,
                                ratio: value as GenerationConfig["ratio"],
                              },
                            }))
                          }
                        >
                          <SelectTrigger>
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
                            ].map(value => (
                              <SelectItem key={value} value={value}>
                                {value}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                          视频时长
                        </Label>
                        <Select
                          value={String(currentConfig.duration)}
                          onValueChange={value =>
                            setConfigs(prev => ({
                              ...prev,
                              [row.script.id]: {
                                ...currentConfig,
                                duration: Number(value),
                              },
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[4, 5, 6, 8, 10, 12].map(value => (
                              <SelectItem key={value} value={String(value)}>
                                {value}s
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                          视频分辨率
                        </Label>
                        <Select
                          value={currentConfig.resolution}
                          onValueChange={value =>
                            setConfigs(prev => ({
                              ...prev,
                              [row.script.id]: {
                                ...currentConfig,
                                resolution:
                                  value as GenerationConfig["resolution"],
                              },
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["480p", "720p", "1080p"].map(value => (
                              <SelectItem key={value} value={value}>
                                {value}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border/70 bg-muted/10 p-4">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            当前脚本的 Seedance 参数
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            可直接用脚本文本生成视频，也可以先拆成分镜再逐镜头生成。
                          </p>
                        </div>
                        <label className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground">
                          <input
                            type="checkbox"
                            checked={currentConfig.generateAudio}
                            onChange={event =>
                              setConfigs(prev => ({
                                ...prev,
                                [row.script.id]: {
                                  ...currentConfig,
                                  generateAudio: event.target.checked,
                                },
                              }))
                            }
                          />
                          生成音频
                        </label>
                      </div>
                    </div>

                    {generationMode === "direct" ? (
                      <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/10 p-4">
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-foreground">
                            脚本文本直出视频
                          </p>
                          <p className="text-xs text-muted-foreground">
                            直接把当前脚本正文提交给 Seedance
                            生成完整视频，不经过分镜拆解。
                          </p>
                        </div>
                        <Input
                          placeholder="可选：直出视频参考图 URL"
                          value={shotImages[directKey(row.script.id)] || ""}
                          onChange={event =>
                            setShotImages(prev => ({
                              ...prev,
                              [directKey(row.script.id)]: event.target.value,
                            }))
                          }
                        />
                        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-primary">
                          <Upload className="h-3.5 w-3.5" />
                          上传直出参考图
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async event => {
                              const file = event.target.files?.[0];
                              if (!file) return;
                              try {
                                await handleUploadByKey(
                                  directKey(row.script.id),
                                  file
                                );
                                toast.success("直出参考图上传成功");
                              } catch (error) {
                                toast.error(
                                  (error as Error).message ||
                                    "直出参考图上传失败"
                                );
                              }
                            }}
                          />
                        </label>
                        <Button
                          onClick={() => void handleGenerateDirect(row)}
                          disabled={createTaskMutation.isPending}
                        >
                          {createTaskMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Wand2 className="mr-2 h-4 w-4" />
                          )}
                          脚本直出视频
                        </Button>
                      </div>
                    ) : shots.length > 0 ? (
                      <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/10 p-4">
                        {shots.map(shot => {
                          const selected = (
                            selectedShots[row.script.id] ?? []
                          ).includes(shot.shotIndex);
                          return (
                            <div
                              key={shot.shotIndex}
                              className="rounded-2xl border border-border bg-card p-4"
                            >
                              <div className="flex items-start gap-3">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedShots(prev => ({
                                      ...prev,
                                      [row.script.id]: selected
                                        ? (prev[row.script.id] ?? []).filter(
                                            item => item !== shot.shotIndex
                                          )
                                        : [
                                            ...(prev[row.script.id] ?? []),
                                            shot.shotIndex,
                                          ],
                                    }))
                                  }
                                  className={`mt-1 flex h-5 w-5 items-center justify-center rounded border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground"}`}
                                >
                                  {selected ? (
                                    <CheckCircle className="h-3.5 w-3.5" />
                                  ) : null}
                                </button>
                                <div className="min-w-0 flex-1 space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="secondary">
                                      镜头 {shot.shotIndex}
                                    </Badge>
                                    <Badge variant="outline">
                                      {shot.timeRange}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-foreground">
                                    {shot.description}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    镜头指令：{shot.cameraInstruction}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    视觉建议：{shot.visualSuggestion}
                                  </p>
                                  <Input
                                    placeholder="参考图 URL，可不填"
                                    value={
                                      shotImages[
                                        shotKey(row.script.id, shot.shotIndex)
                                      ] || ""
                                    }
                                    onChange={event =>
                                      setShotImages(prev => ({
                                        ...prev,
                                        [shotKey(
                                          row.script.id,
                                          shot.shotIndex
                                        )]: event.target.value,
                                      }))
                                    }
                                  />
                                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-primary">
                                    <Upload className="h-3.5 w-3.5" />
                                    上传本地参考图
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={async event => {
                                        const file = event.target.files?.[0];
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
                                              "参考图上传失败"
                                          );
                                        }
                                      }}
                                    />
                                  </label>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <Button
                          onClick={() => void handleGenerateByStoryboard(row)}
                          disabled={createTaskMutation.isPending}
                        >
                          {createTaskMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="mr-2 h-4 w-4" />
                          )}
                          生成选中素材
                        </Button>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                        当前还没有分镜头。点击上方“生成分镜”后，可按镜头生成视频素材。
                      </div>
                    )}

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">已生成素材</CardTitle>
                        <Badge variant="secondary">
                          {row.materials.length}
                        </Badge>
                      </div>
                      {row.materials.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                          还没有生成素材。
                        </div>
                      ) : (
                        <div className="grid gap-3 xl:grid-cols-2">
                          {row.materials.map(material => (
                            <div
                              key={material.id}
                              className="rounded-2xl border border-border bg-card p-4"
                            >
                              <p className="text-sm font-medium text-foreground">
                                {material.title}
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {material.fileUrl ? (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        setPreviewVideo({
                                          url: material.fileUrl!,
                                          title: material.title,
                                        })
                                      }
                                    >
                                      <Play className="mr-1 h-3.5 w-3.5" />
                                      预览
                                    </Button>
                                    <a
                                      href={material.fileUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <Button variant="outline" size="sm">
                                        <ExternalLink className="mr-1 h-3.5 w-3.5" />
                                        打开
                                      </Button>
                                    </a>
                                  </>
                                ) : null}
                                {material.status === "processing" &&
                                material.seedanceTaskId ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      checkStatusMutation.mutate({
                                        materialId: material.id,
                                        taskId: material.seedanceTaskId!,
                                      })
                                    }
                                  >
                                    <RefreshCw className="mr-1 h-3.5 w-3.5" />
                                    查询状态
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          ))}
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

      <Dialog open={!!previewVideo} onOpenChange={() => setPreviewVideo(null)}>
        <DialogContent className="max-w-3xl bg-background border-border">
          <DialogHeader>
            <DialogTitle className="text-sm text-foreground">
              {previewVideo?.title}
            </DialogTitle>
          </DialogHeader>
          {previewVideo ? (
            <video
              src={previewVideo.url}
              controls
              autoPlay
              className="max-h-[70vh] w-full rounded-xl"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
