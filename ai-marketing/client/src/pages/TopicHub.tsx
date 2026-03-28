import { useMemo, useState } from "react";
import {
  Download,
  ExternalLink,
  Heart,
  Loader2,
  MessageCircle,
  RefreshCw,
  Share2,
  TrendingUp,
  User,
  Users,
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
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

interface Props {
  projectId: string;
}

type SearchMode = "keyword" | "mine" | "authors";

type TopicHubTagMeta = {
  source?: string;
  sourceLabel?: string;
  searchMode?: SearchMode;
  targetPlatform?: string;
  noteId?: string;
  xsecToken?: string;
  coverUrl?: string;
  coverDownloadPath?: string;
  videoDownloadPath?: string;
  authorName?: string;
  authorAvatar?: string;
  likedCount?: number;
  commentCount?: number;
  sharedCount?: number;
  duration?: number;
  authorKeywords?: string[];
  filters?: {
    sort_by?: string;
    note_type?: string;
    publish_time?: string;
    search_scope?: string;
    location?: string;
  };
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
const SEARCH_TYPE_OPTIONS = ["不限", "已看过", "未看过", "已关注"] as const;
const LOCATION_OPTIONS = ["不限", "同城", "附近"] as const;

const SEARCH_MODE_OPTIONS: Array<{
  value: SearchMode;
  title: string;
  description: string;
  icon: typeof TrendingUp;
}> = [
  {
    value: "keyword",
    title: "关键词搜索",
    description: "按关键词搜索平台内容，并保留 3 个相关视频。",
    icon: TrendingUp,
  },
  {
    value: "mine",
    title: "我的内容",
    description: "从自己已发布内容里筛出与关键词相关的 3 个视频。",
    icon: User,
  },
  {
    value: "authors",
    title: "指定博主",
    description: "输入关注博主账号，定向筛出与关键词相关的 3 个视频。",
    icon: Users,
  },
];

function formatCount(value?: number) {
  if (!value) return "0";
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return String(value);
}

function formatDuration(seconds?: number) {
  if (!seconds) return undefined;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function TopicHub({ projectId }: Props) {
  const pid = Number.parseInt(projectId, 10);
  const utils = trpc.useUtils();
  const [searchMode, setSearchMode] = useState<SearchMode>("keyword");
  const [industry, setIndustry] = useState("");
  const [checklist, setChecklist] = useState("");
  const [bloggerAccounts, setBloggerAccounts] = useState("");
  const [sortBy, setSortBy] =
    useState<(typeof SORT_OPTIONS)[number]>("最多点赞");
  const [noteType, setNoteType] =
    useState<(typeof NOTE_TYPE_OPTIONS)[number]>("视频");
  const [publishTime, setPublishTime] =
    useState<(typeof PUBLISH_TIME_OPTIONS)[number]>("一周内");
  const [searchType, setSearchType] =
    useState<(typeof SEARCH_TYPE_OPTIONS)[number]>("不限");
  const [location, setLocation] =
    useState<(typeof LOCATION_OPTIONS)[number]>("不限");

  const { data: items, isLoading } = trpc.topicHub.list.useQuery({
    projectId: pid,
  });

  const searchMutation = trpc.topicHub.searchXiaohongshuMulti.useMutation({
    onSuccess: async data => {
      await utils.topicHub.list.invalidate({ projectId: pid });
      toast.success(`已抓取 ${data.count} 个视频`);
    },
    onError: error => {
      toast.error(error.message || "抓取失败");
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

  const videoItems = useMemo(() => {
    return (items ?? []).filter(item => item.platform === "xiaohongshu");
  }, [items]);

  function handleSearch() {
    if (!industry.trim()) {
      toast.error("请输入关键词");
      return;
    }

    if (searchMode === "authors" && !bloggerAccounts.trim()) {
      toast.error("请输入博主账号");
      return;
    }

    searchMutation.mutate({
      projectId: pid,
      industry: industry.trim(),
      mode: searchMode,
      targetPlatform: "xiaohongshu",
      checklist: checklist.trim() || undefined,
      bloggerAccounts: bloggerAccounts.trim() || undefined,
      filters: {
        sort_by: sortBy,
        note_type: noteType,
        publish_time: publishTime,
        search_type: searchType,
        location,
      },
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <TrendingUp className="h-6 w-6 text-rose-500" />
          选题信息中心
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          支持 3 种搜索模式：关键词搜索、我的内容、指定博主。每次最多保留 3
          个视频。
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-foreground">
            小红书内容搜索
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-3">
            {SEARCH_MODE_OPTIONS.map(option => {
              const Icon = option.icon;
              const active = option.value === searchMode;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSearchMode(option.value)}
                  className={`rounded-2xl border p-4 text-left transition-colors ${
                    active
                      ? "border-rose-500 bg-rose-500/10"
                      : "border-border bg-muted/20 hover:border-rose-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      className={`h-4 w-4 ${active ? "text-rose-500" : "text-muted-foreground"}`}
                    />
                    <span className="text-sm font-medium text-foreground">
                      {option.title}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {option.description}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm text-foreground">关键词</Label>
              <Input
                value={industry}
                onChange={event => setIndustry(event.target.value)}
                placeholder="例如：护肤、抗衰、医美"
                className="border-border bg-input text-foreground"
              />
            </div>

            {searchMode === "authors" ? (
              <div className="space-y-1.5">
                <Label className="text-sm text-foreground">博主账号</Label>
                <Input
                  value={bloggerAccounts}
                  onChange={event => setBloggerAccounts(event.target.value)}
                  placeholder="多个账号可用逗号、空格或换行分隔"
                  className="border-border bg-input text-foreground"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-sm text-foreground">补充关键词</Label>
                <Input
                  value={checklist}
                  onChange={event => setChecklist(event.target.value)}
                  placeholder="可选，用于补充搜索词"
                  className="border-border bg-input text-foreground"
                />
              </div>
            )}
          </div>

          {searchMode === "authors" ? (
            <div className="space-y-1.5">
              <Label className="text-sm text-foreground">补充关键词</Label>
              <Textarea
                value={checklist}
                onChange={event => setChecklist(event.target.value)}
                placeholder="可选，用于补充搜索词"
                className="resize-none border-border bg-input text-foreground"
                rows={3}
              />
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-4">
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
                value={searchType}
                onValueChange={value =>
                  setSearchType(value as typeof searchType)
                }
              >
                <SelectTrigger className="border-border bg-input text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover">
                  {SEARCH_TYPE_OPTIONS.map(option => (
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
          </div>

          <div className="flex items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                当前模式：
                {SEARCH_MODE_OPTIONS.find(option => option.value === searchMode)
                  ?.title ?? "未知"}
              </p>
              <p className="text-xs text-muted-foreground">
                每次最多保留 3 个视频。
              </p>
            </div>

            <div className="flex gap-3">
              <div className="w-40 space-y-1.5">
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

              <Button
                onClick={handleSearch}
                disabled={searchMutation.isPending}
                className="min-w-40 self-end"
              >
                {searchMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    抓取中...
                  </>
                ) : (
                  "抓取 3 个视频"
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-foreground">搜索结果</h2>
            <Badge variant="outline">{videoItems.length}</Badge>
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map(item => (
              <div key={item} className="h-96 rounded-3xl shimmer" />
            ))}
          </div>
        ) : videoItems.length === 0 ? (
          <Card className="border-border bg-card">
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              暂无内容，请先选择搜索模式并开始抓取。
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {videoItems.map(item => {
              const meta = (item.tags ?? {}) as TopicHubTagMeta;
              const cover = meta.coverUrl;
              const likedCount = formatCount(meta.likedCount);
              const commentCount = formatCount(meta.commentCount);
              const sharedCount = formatCount(meta.sharedCount);
              const duration = formatDuration(meta.duration);

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
                  </div>

                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="secondary">
                        {meta.sourceLabel || "小红书"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        热度分 {item.engagementScore ?? 0}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 overflow-hidden rounded-full bg-muted">
                        {meta.authorAvatar ? (
                          <img
                            src={meta.authorAvatar}
                            alt={meta.authorName || "作者"}
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {meta.authorName || "小红书用户"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          小红书视频
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="line-clamp-2 text-sm font-medium text-foreground">
                        {item.title}
                      </p>
                      {item.content ? (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {item.content}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Heart className="h-3.5 w-3.5" />
                        {likedCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="h-3.5 w-3.5" />
                        {commentCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <Share2 className="h-3.5 w-3.5" />
                        {sharedCount}
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
                          查看原视频
                        </a>
                      ) : null}

                      {meta.videoDownloadPath ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-600">
                          <Download className="h-3.5 w-3.5" />
                          已下载
                        </span>
                      ) : null}

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteMutation.mutate({ id: item.id })}
                        className="h-7 px-2 text-xs text-muted-foreground"
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
