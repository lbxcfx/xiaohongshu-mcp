import { useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  Heart,
  Loader2,
  MessageCircle,
  RefreshCw,
  Share2,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
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
import { trpc } from "@/lib/trpc";

interface Props {
  projectId: string;
}

type SearchMode = "keyword" | "link";

type TopicHubTagMeta = {
  sourceLabel?: string;
  searchMode?: SearchMode;
  coverUrl?: string;
  coverDownloadPath?: string;
  authorName?: string;
  authorAvatar?: string;
  likedCount?: number;
  commentCount?: number;
  sharedCount?: number;
  duration?: number;
  noteId?: string;
  videoDownloadPath?: string;
  videoDownloadStatus?: "idle" | "pending" | "success" | "failed" | "skipped";
  videoDownloadAttempts?: number;
  videoDownloadError?: string;
  videoAnalysisStatus?: "pending" | "analyzing" | "completed" | "failed";
  videoAnalysisError?: string;
};

const SORT_OPTIONS = [
  "综合",
  "最新",
  "最多点赞",
  "最多评论",
  "最多收藏",
] as const;
const NOTE_TYPE_OPTIONS = ["不限", "视频", "图文"] as const;
const PUBLISH_TIME_OPTIONS = ["不限", "一天内", "一周内", "半年内"] as const;
const SEARCH_SCOPE_OPTIONS = ["不限", "已看过", "未看过", "已关注"] as const;
const LOCATION_OPTIONS = ["不限", "同城", "附近"] as const;

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

export default function TopicHub({ projectId }: Props) {
  const pid = Number.parseInt(projectId, 10);
  const utils = trpc.useUtils();

  const [industry, setIndustry] = useState("");
  const [profileLinks, setProfileLinks] = useState("");
  const [sortBy, setSortBy] =
    useState<(typeof SORT_OPTIONS)[number]>("最多点赞");
  const [noteType, setNoteType] =
    useState<(typeof NOTE_TYPE_OPTIONS)[number]>("视频");
  const [publishTime, setPublishTime] =
    useState<(typeof PUBLISH_TIME_OPTIONS)[number]>("一周内");
  const [searchScope, setSearchScope] =
    useState<(typeof SEARCH_SCOPE_OPTIONS)[number]>("不限");
  const [location, setLocation] =
    useState<(typeof LOCATION_OPTIONS)[number]>("不限");
  const [pollingEnabled, setPollingEnabled] = useState(false);

  const { data: items, isLoading } = trpc.topicHub.list.useQuery(
    { projectId: pid },
    { refetchInterval: pollingEnabled ? 5000 : false }
  );

  const searchMutation = trpc.topicHub.searchXiaohongshuMulti.useMutation({
    onMutate: async () => {
      await utils.topicHub.list.cancel({ projectId: pid });
      utils.topicHub.list.setData({ projectId: pid }, []);
    },
    onSuccess: data => {
      utils.topicHub.list.setData({ projectId: pid }, data.items);
      toast.success(`已抓取 ${data.count} 个视频，请按需点击 AI分析`);
    },
    onError: error => {
      toast.error(error.message || "搜索失败");
    },
  });

  const deleteMutation = trpc.topicHub.delete.useMutation({
    onSuccess: async () => {
      await utils.topicHub.list.invalidate({ projectId: pid });
      toast.success("已删除");
    },
    onError: () => {
      toast.error("删除失败");
    },
  });

  const analyzeMutation = trpc.topicHub.requestVideoAnalysis.useMutation({
    onSuccess: async () => {
      await utils.topicHub.list.invalidate({ projectId: pid });
      toast.success("已加入下载/分析队列");
      setPollingEnabled(true);
    },
    onError: error => {
      toast.error(error.message || "AI分析触发失败");
    },
  });

  const videoItems = useMemo(() => {
    return (items ?? [])
      .filter(item => item.platform === "xiaohongshu")
      .sort((a, b) => {
        const aLikes = (a.tags as TopicHubTagMeta)?.likedCount ?? 0;
        const bLikes = (b.tags as TopicHubTagMeta)?.likedCount ?? 0;
        return bLikes - aLikes;
      });
  }, [items]);

  useEffect(() => {
    const hasActive = videoItems.some(item => {
      const meta = (item.tags ?? {}) as TopicHubTagMeta;
      return (
        meta.videoDownloadStatus === "pending" ||
        meta.videoAnalysisStatus === "pending" ||
        meta.videoAnalysisStatus === "analyzing"
      );
    });
    setPollingEnabled(hasActive);
  }, [videoItems]);

  const analysisStats = useMemo(() => {
    let downloading = 0;
    let analyzing = 0;
    let completed = 0;
    for (const item of videoItems) {
      const meta = (item.tags ?? {}) as TopicHubTagMeta;
      if (meta.videoDownloadStatus === "pending") downloading++;
      if (
        meta.videoAnalysisStatus === "pending" ||
        meta.videoAnalysisStatus === "analyzing"
      ) {
        analyzing++;
      }
      if (meta.videoAnalysisStatus === "completed") completed++;
    }
    return { downloading, analyzing, completed, total: videoItems.length };
  }, [videoItems]);

  function handleSearch() {
    const trimmedKeyword = industry.trim();
    const trimmedLinks = profileLinks.trim();

    if (!trimmedKeyword && !trimmedLinks) {
      toast.error("关键词搜索和链接搜索至少填写一项");
      return;
    }

    searchMutation.mutate({
      projectId: pid,
      industry: trimmedKeyword || undefined,
      checklist: trimmedLinks || undefined,
      targetPlatform: "xiaohongshu",
      filters: {
        sort_by: sortBy,
        note_type: noteType,
        publish_time: publishTime,
        search_type: searchScope,
        location,
      },
    });
  }

  function openViralAnalysisPage() {
    window.location.assign(`/projects/${pid}/viral-analysis`);
  }

  const searchHint =
    industry.trim() && profileLinks.trim()
      ? "本次最多抓取 15 个视频：关键词 10 个，链接 5 个。"
      : "本次最多抓取 15 个视频。";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <TrendingUp className="h-6 w-6 text-rose-500" />
          选题中台
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          搜索结果仅展示作品列表，不自动下载。请对需要深入处理的视频手动点击
          `AI分析`。
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-foreground">
            小红书内容搜索
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm text-foreground">关键词搜索</Label>
              <Input
                value={industry}
                onChange={event => setIndustry(event.target.value)}
                placeholder="例如：护肤、抗衰、医美"
                className="border-border bg-input text-foreground"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm text-foreground">链接搜索</Label>
              <Input
                value={profileLinks}
                onChange={event => setProfileLinks(event.target.value)}
                placeholder="粘贴用户主页链接，支持多个"
                className="border-border bg-input text-foreground"
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-5 xl:grid-cols-6">
            <div className="space-y-1.5">
              <Label className="text-sm text-foreground">内容类型</Label>
              <Select
                value={noteType}
                onValueChange={value => setNoteType(value as typeof noteType)}
              >
                <SelectTrigger className="border-border bg-input text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover">
                  {NOTE_TYPE_OPTIONS.map(option => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm text-foreground">发布时间</Label>
              <Select
                value={publishTime}
                onValueChange={value =>
                  setPublishTime(value as typeof publishTime)
                }
              >
                <SelectTrigger className="border-border bg-input text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover">
                  {PUBLISH_TIME_OPTIONS.map(option => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm text-foreground">搜索范围</Label>
              <Select
                value={searchScope}
                onValueChange={value =>
                  setSearchScope(value as typeof searchScope)
                }
              >
                <SelectTrigger className="border-border bg-input text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover">
                  {SEARCH_SCOPE_OPTIONS.map(option => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm text-foreground">位置</Label>
              <Select
                value={location}
                onValueChange={value => setLocation(value as typeof location)}
              >
                <SelectTrigger className="border-border bg-input text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover">
                  {LOCATION_OPTIONS.map(option => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm text-foreground">排序</Label>
              <Select
                value={sortBy}
                onValueChange={value => setSortBy(value as typeof sortBy)}
              >
                <SelectTrigger className="border-border bg-input text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover">
                  {SORT_OPTIONS.map(option => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                onClick={handleSearch}
                disabled={searchMutation.isPending}
                className="w-full"
              >
                {searchMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    抓取中
                  </>
                ) : (
                  "抓取视频"
                )}
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{searchHint}</p>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-foreground">搜索结果</h2>
            <Badge variant="outline">{videoItems.length}</Badge>
            {analysisStats.downloading > 0 && (
              <Badge
                variant="outline"
                className="border-blue-500/30 text-blue-400"
              >
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                下载中 {analysisStats.downloading}
              </Badge>
            )}
            {analysisStats.analyzing > 0 && (
              <Badge
                variant="outline"
                className="border-amber-500/30 text-amber-400"
              >
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                分析中 {analysisStats.analyzing}
              </Badge>
            )}
            {analysisStats.completed > 0 && (
              <Badge
                variant="outline"
                className="border-emerald-500/30 text-emerald-400"
              >
                <Sparkles className="mr-1 h-3 w-3" />
                已分析 {analysisStats.completed}/{analysisStats.total}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => utils.topicHub.list.invalidate({ projectId: pid })}
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            刷新
          </Button>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
            {[1, 2, 3, 4, 5].map(item => (
              <div key={item} className="h-96 rounded-3xl shimmer" />
            ))}
          </div>
        ) : videoItems.length === 0 ? (
          <Card className="border-border bg-card">
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              暂无内容，请先执行关键词搜索或链接搜索。
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
            {videoItems.map(item => {
              const meta = (item.tags ?? {}) as TopicHubTagMeta;
              const localCover = toLocalAssetUrl(meta.coverDownloadPath);
              const cover = localCover || meta.coverUrl;
              const duration = formatDuration(meta.duration);
              const isBusy =
                analyzeMutation.isPending &&
                analyzeMutation.variables?.id === item.id;
              const isActive =
                meta.videoDownloadStatus === "pending" ||
                meta.videoAnalysisStatus === "pending" ||
                meta.videoAnalysisStatus === "analyzing";
              const canViewResult =
                meta.videoAnalysisStatus === "completed" ||
                meta.videoAnalysisStatus === "failed";

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

                    {meta.videoAnalysisStatus === "completed" && (
                      <div className="absolute top-3 right-3 rounded-full bg-emerald-500/90 px-2 py-1 text-xs text-white">
                        已分析
                      </div>
                    )}
                    {meta.videoAnalysisStatus === "failed" && (
                      <div className="absolute top-3 right-3 rounded-full bg-red-500/90 px-2 py-1 text-xs text-white">
                        失败
                      </div>
                    )}
                    {isActive && (
                      <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-amber-500/90 px-2 py-1 text-xs text-white">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        处理中
                      </div>
                    )}
                  </div>

                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="secondary">
                        {meta.sourceLabel || "小红书"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        热度值 {item.engagementScore ?? 0}
                      </span>
                    </div>

                    <div>
                      <p className="line-clamp-2 text-sm font-medium text-foreground">
                        {item.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {meta.authorName || "小红书用户"}
                      </p>
                      {normalizeTopicHubContent(item.content) ? (
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                          {normalizeTopicHubContent(item.content)}
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
                        variant={canViewResult ? "outline" : "default"}
                        className="h-7 rounded-full px-3 text-xs"
                        onClick={() => {
                          if (canViewResult) {
                            openViralAnalysisPage();
                            return;
                          }
                          analyzeMutation.mutate({
                            id: item.id,
                            projectId: pid,
                          });
                        }}
                        disabled={isBusy || isActive}
                      >
                        {isBusy || isActive ? (
                          <>
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            处理中
                          </>
                        ) : canViewResult ? (
                          "查看分析"
                        ) : (
                          "AI分析"
                        )}
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        onClick={() => deleteMutation.mutate({ id: item.id })}
                      >
                        删除
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
