import { useEffect, useMemo, useState } from "react";
import { Streamdown } from "streamdown";
import { AlertTriangle, Link2, Loader2, Sparkles, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

interface Props {
  projectId: string;
}

const MONETIZATION_OPTIONS = [
  "电商带货",
  "知识付费",
  "品牌合作 / 自有产品",
  "广告变现",
  "直播转化",
  "私域转化",
];

const PERSONA_OPTIONS = [
  "权威专家型",
  "真实分享型",
  "陪伴共情型",
  "强观点型",
  "成长学习型",
  "轻松娱乐型",
];

type PositioningMeta = {
  mode?: "manual" | "video";
  provider?: string;
  sourceUrl?: string;
  stage?: string;
  error?: string;
  filePath?: string;
};

type ResultMode = "manual" | "video";

function formatTimeLabel(value?: string | Date | null) {
  if (!value) return "刚刚";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";

  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getStatusText(status?: string) {
  if (status === "completed") return "已完成";
  if (status === "analyzing") return "生成中";
  if (status === "failed") return "失败";
  return "未开始";
}

function getStatusClass(status?: string) {
  if (status === "completed") {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  }
  if (status === "analyzing") {
    return "border-amber-400/20 bg-amber-400/10 text-amber-300";
  }
  if (status === "failed") {
    return "border-red-400/20 bg-red-400/10 text-red-300";
  }

  return "border-border/60 bg-muted/20 text-muted-foreground";
}

function getVideoStageState(stage?: string) {
  switch (stage) {
    case "download.queued":
      return { progress: 16, label: "正在准备下载视频" };
    case "download.started":
      return { progress: 28, label: "正在下载视频" };
    case "download.completed":
      return { progress: 48, label: "视频下载完成，正在提交分析" };
    case "task.started":
      return { progress: 56, label: "已开始视频分析任务" };
    case "files.create.start":
      return { progress: 66, label: "正在上传视频到方舟" };
    case "files.create.done":
      return { progress: 74, label: "视频上传完成，等待文件处理" };
    case "files.retrieve.start":
    case "files.retrieve.poll":
      return { progress: 84, label: "方舟正在处理视频文件" };
    case "files.retrieve.done":
      return { progress: 88, label: "视频文件处理完成" };
    case "responses.create.start":
      return { progress: 92, label: "正在生成定位分析结果" };
    case "responses.create.done":
      return { progress: 96, label: "分析结果已生成，正在写入项目" };
    default:
      return { progress: 60, label: "正在处理视频定位任务" };
  }
}

export default function Positioning({ projectId }: Props) {
  const pid = Number.parseInt(projectId, 10);
  const utils = trpc.useUtils();

  const [resultMode, setResultMode] = useState<ResultMode>("manual");
  const [form, setForm] = useState({
    industry: "",
    track: "",
    monetizationMethod: "",
    targetAudience: "",
    personaType: "",
  });
  const [videoUrl, setVideoUrl] = useState("");
  const [manualError, setManualError] = useState("");
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoStatus, setVideoStatus] = useState("");
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoTaskId, setVideoTaskId] = useState<number | null>(null);
  const [videoResultText, setVideoResultText] = useState("");
  const [videoResultFailed, setVideoResultFailed] = useState(false);

  const { data: positionings, isLoading } = trpc.positioning.list.useQuery(
    { projectId: pid },
    {
      refetchInterval: query => {
        const items = query.state.data ?? [];
        const pendingTask = videoTaskId
          ? items.find(item => item.id === videoTaskId)
          : items.find(item => {
              const meta = ((item.analysisResult as PositioningMeta | null) ??
                {}) as PositioningMeta;
              return item.status === "analyzing" && meta.mode === "video";
            });

        return pendingTask?.status === "analyzing" ? 3000 : false;
      },
    }
  );

  const createAndAnalyzeMutation =
    trpc.positioning.createAndAnalyze.useMutation({
      onSuccess: async () => {
        setResultMode("manual");
        setManualError("");
        await utils.positioning.list.invalidate({ projectId: pid });
        toast.success("定位内容已生成并写入项目");
      },
      onError: error => {
        setResultMode("manual");
        setManualError(error.message || "定位生成失败");
        toast.error(error.message || "定位生成失败");
      },
    });

  const downloadVideoMutation =
    trpc.positioning.downloadVideoForAnalysis.useMutation();
  const analyzeVideoMutation = trpc.positioning.analyzeVideo.useMutation();

  function updateForm<Key extends keyof typeof form>(
    key: Key,
    value: (typeof form)[Key]
  ) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function handleCreate() {
    if (!form.industry.trim()) {
      toast.error("请先填写行业");
      return;
    }

    setResultMode("manual");
    setManualError("");

    createAndAnalyzeMutation.mutate({
      projectId: pid,
      industry: form.industry.trim(),
      track: form.track.trim() || undefined,
      monetizationMethod: form.monetizationMethod || undefined,
      targetAudience: form.targetAudience.trim() || undefined,
      personaType: form.personaType || undefined,
    });
  }

  async function handleVideoAnalyze() {
    const trimmedVideoUrl = videoUrl.trim();
    if (!trimmedVideoUrl) {
      toast.error("请先输入小红书视频链接");
      return;
    }

    setResultMode("video");
    setVideoResultText("");
    setVideoResultFailed(false);

    try {
      setVideoBusy(true);
      setVideoProgress(18);
      setVideoStatus("正在下载视频");

      const downloadResult = await downloadVideoMutation.mutateAsync({
        projectId: pid,
        videoUrl: trimmedVideoUrl,
      });

      setVideoProgress(52);
      setVideoStatus("视频下载完成，正在提交分析任务");

      const result = await analyzeVideoMutation.mutateAsync({
        projectId: pid,
        videoUrl: trimmedVideoUrl,
        filePath: downloadResult.filePath,
      });

      setVideoTaskId(result.id);
      setVideoProgress(76);
      setVideoStatus("任务已提交，正在生成定位内容");
      await utils.positioning.list.invalidate({ projectId: pid });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "视频定位分析失败";
      setVideoBusy(false);
      setVideoProgress(0);
      setVideoStatus("");
      setVideoResultText(message);
      setVideoResultFailed(true);
      toast.error(message);
      return;
    }

    setVideoBusy(false);
  }

  const latestRecord = useMemo(() => {
    return (
      [...(positionings ?? [])].sort((a, b) => {
        const aTime = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
        const bTime = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
        return bTime - aTime;
      })[0] ?? null
    );
  }, [positionings]);

  const latestMeta =
    ((latestRecord?.analysisResult as PositioningMeta | null) ??
      {}) as PositioningMeta;

  const currentVideoTask = useMemo(() => {
    if (videoTaskId) {
      return (positionings ?? []).find(item => item.id === videoTaskId) ?? null;
    }

    if (latestRecord?.status === "analyzing" && latestMeta.mode === "video") {
      return latestRecord;
    }

    return null;
  }, [latestMeta.mode, latestRecord, positionings, videoTaskId]);

  useEffect(() => {
    if (!currentVideoTask) return;

    const currentMeta =
      ((currentVideoTask.analysisResult as PositioningMeta | null) ??
        {}) as PositioningMeta;

    if (currentVideoTask.status === "completed") {
      setVideoBusy(false);
      setVideoProgress(100);
      setVideoStatus("");
      setVideoResultText(currentVideoTask.positioningRecommendation || "");
      setVideoResultFailed(false);
      setVideoTaskId(null);
      setResultMode("video");
      toast.success("视频定位分析完成并写入项目");
      return;
    }

    if (currentVideoTask.status === "failed") {
      setVideoBusy(false);
      setVideoProgress(0);
      setVideoStatus("");
      setVideoResultText(currentMeta.error || "视频定位分析失败，请稍后重试");
      setVideoResultFailed(true);
      setVideoTaskId(null);
      setResultMode("video");
      toast.error(currentMeta.error || "视频定位分析失败");
      return;
    }

    if (currentVideoTask.status === "analyzing") {
      const stageState = getVideoStageState(currentMeta.stage);
      setVideoBusy(false);
      setVideoProgress(current => Math.max(current, stageState.progress));
      setVideoStatus(stageState.label);
      setResultMode("video");
    }
  }, [currentVideoTask]);

  const liveResultText =
    createAndAnalyzeMutation.data?.analysis ||
    (!videoResultFailed && videoResultText ? videoResultText : "");
  const displayResultText =
    liveResultText || latestRecord?.positioningRecommendation || "";
  const displayErrorText =
    resultMode === "manual"
      ? manualError
      : videoResultFailed
        ? videoResultText
        : latestRecord?.status === "failed" && latestMeta.mode === "video"
          ? latestMeta.error || "视频定位分析失败"
          : "";
  const displayStatus =
    createAndAnalyzeMutation.isPending ||
    analyzeVideoMutation.isPending ||
    currentVideoTask?.status === "analyzing"
      ? "analyzing"
      : latestRecord?.status;
  const displayTimeLabel = liveResultText
    ? "刚刚生成"
    : formatTimeLabel(latestRecord?.updatedAt ?? latestRecord?.createdAt);
  const progressVisible =
    resultMode === "video" &&
    (videoBusy ||
      currentVideoTask?.status === "analyzing" ||
      videoProgress > 0 ||
      analyzeVideoMutation.isPending);

  return (
    <div className="space-y-6 pb-6">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          账号定位
        </h1>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <Button
          type="button"
          variant={resultMode === "manual" ? "default" : "outline"}
          className={cn(
            "h-12 rounded-2xl text-sm",
            resultMode !== "manual" &&
              "border-border/70 bg-background/30 hover:bg-background/50"
          )}
          onClick={() => setResultMode("manual")}
        >
          <Sparkles className="h-4 w-4" />
          手动定位
        </Button>
        <Button
          type="button"
          variant={resultMode === "video" ? "default" : "outline"}
          className={cn(
            "h-12 rounded-2xl text-sm",
            resultMode !== "video" &&
              "border-border/70 bg-background/30 hover:bg-background/50"
          )}
          onClick={() => setResultMode("video")}
        >
          <Video className="h-4 w-4" />
          视频反推
        </Button>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="rounded-[28px] border border-border/70 bg-card/90 p-5 lg:p-6">
          <div className="mb-5">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              输入与生成
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              {resultMode === "manual"
                ? "填写行业、赛道和目标用户信息后生成定位结果。"
                : "输入小红书视频链接后，系统会先下载视频，再上传方舟完成定位分析。"}
            </p>
          </div>

          {resultMode === "manual" ? (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm text-foreground">行业</Label>
                  <Input
                    value={form.industry}
                    onChange={event =>
                      updateForm("industry", event.target.value)
                    }
                    placeholder="例如：医美、美妆、家居、教育"
                    className="h-11 rounded-2xl border-border/70 bg-background/60"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-foreground">细分赛道</Label>
                  <Input
                    value={form.track}
                    onChange={event => updateForm("track", event.target.value)}
                    placeholder="例如：轻医美、抗衰、居家收纳"
                    className="h-11 rounded-2xl border-border/70 bg-background/60"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-foreground">变现方式</Label>
                  <Select
                    value={form.monetizationMethod}
                    onValueChange={value =>
                      updateForm("monetizationMethod", value)
                    }
                  >
                    <SelectTrigger className="h-11 rounded-2xl border-border/70 bg-background/60">
                      <SelectValue placeholder="选择变现方式" />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-popover">
                      {MONETIZATION_OPTIONS.map(option => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-foreground">人设类型</Label>
                  <Select
                    value={form.personaType}
                    onValueChange={value => updateForm("personaType", value)}
                  >
                    <SelectTrigger className="h-11 rounded-2xl border-border/70 bg-background/60">
                      <SelectValue placeholder="选择人设类型" />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-popover">
                      {PERSONA_OPTIONS.map(option => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-foreground">目标用户描述</Label>
                <Textarea
                  value={form.targetAudience}
                  onChange={event =>
                    updateForm("targetAudience", event.target.value)
                  }
                  placeholder="例如：25-35 岁一二线城市女性，关注效果安全、体验流程和决策效率"
                  className="min-h-[160px] resize-none rounded-[22px] border-border/70 bg-background/60"
                />
              </div>

              <div className="flex justify-center pt-1">
                <Button
                  type="button"
                  onClick={handleCreate}
                  disabled={createAndAnalyzeMutation.isPending}
                  className="h-11 min-w-[220px] rounded-full px-8"
                >
                  {createAndAnalyzeMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      正在创建定位
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      创建定位
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label className="text-sm text-foreground">
                  小红书视频链接
                </Label>
                <Input
                  value={videoUrl}
                  onChange={event => setVideoUrl(event.target.value)}
                  placeholder="粘贴要分析的小红书视频或笔记链接"
                  className="h-11 rounded-2xl border-border/70 bg-background/60"
                />
              </div>

              <div className="rounded-[24px] border border-cyan-400/15 bg-cyan-400/6 p-4">
                <p className="text-sm leading-7 text-cyan-100/80">
                  页面会先下载视频，再把已下载文件路径提交给后端分析。这样可以确保方舟处理的是本地可读文件，而不是小红书外链。
                </p>
              </div>

              <Button
                type="button"
                onClick={handleVideoAnalyze}
                disabled={videoBusy || Boolean(currentVideoTask)}
                className="h-11 w-full rounded-full bg-cyan-400 text-slate-950 hover:bg-cyan-300"
              >
                {videoBusy || currentVideoTask ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在分析视频
                  </>
                ) : (
                  <>
                    <Link2 className="h-4 w-4" />
                    开始视频反推
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-[28px] border border-border/70 bg-card/90 p-5 lg:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                结果展示
              </h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                当前项目只保留最近一份定位结果，这里始终展示最新内容。
              </p>
            </div>
            <div
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                getStatusClass(displayStatus)
              )}
            >
              {getStatusText(displayStatus)}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span>最近更新：{displayTimeLabel}</span>
            {latestMeta.sourceUrl ? (
              <a
                href={latestMeta.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-cyan-300 transition-colors hover:text-cyan-200"
              >
                查看源链接
              </a>
            ) : null}
          </div>

          {progressVisible ? (
            <div className="mt-5 rounded-[22px] border border-cyan-400/15 bg-cyan-400/5 p-4">
              <div className="mb-3 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.12em] text-cyan-100/75">
                <span>{videoStatus || "正在处理视频定位任务"}</span>
                <span>{videoProgress}%</span>
              </div>
              <Progress value={videoProgress} className="h-2" />
            </div>
          ) : null}

          <div className="mt-5">
            {displayErrorText ? (
              <div className="rounded-[24px] border border-red-400/25 bg-red-400/6 p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-red-200">
                  <AlertTriangle className="h-4 w-4" />
                  当前任务失败
                </div>
                <p className="mt-3 text-sm leading-7 text-red-100/75">
                  {displayErrorText}
                </p>
              </div>
            ) : displayResultText ? (
              <ScrollArea className="h-[640px] rounded-[26px] border border-border/70 bg-background/35 p-1">
                <div className="min-h-full rounded-[22px] bg-[linear-gradient(180deg,rgba(11,14,23,0.72),rgba(11,14,23,0.92))] px-5 py-6 lg:px-6">
                  <div className="prose prose-invert prose-p:leading-8 prose-headings:tracking-tight max-w-none text-[15px] text-foreground/92">
                    <Streamdown>{displayResultText}</Streamdown>
                  </div>
                </div>
              </ScrollArea>
            ) : (
              <div className="flex min-h-[640px] items-center justify-center rounded-[26px] border border-dashed border-border/70 bg-background/25 px-6">
                <div className="max-w-md text-center">
                  {isLoading ? (
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                  ) : resultMode === "manual" ? (
                    <Sparkles className="mx-auto h-6 w-6 text-primary/80" />
                  ) : (
                    <Video className="mx-auto h-6 w-6 text-cyan-300" />
                  )}
                  <p className="mt-4 text-lg font-medium tracking-tight text-foreground">
                    {isLoading ? "正在读取定位结果" : "暂无定位结果"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
