import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Share2, Loader2, Copy, Check, ChevronDown, ChevronUp,
  Image, Download, Hash, Package, Sparkles, RefreshCw
} from "lucide-react";

interface Props { projectId: string; }

const PLATFORMS = [
  { id: "xiaohongshu", label: "小红书", emoji: "📕", color: "text-red-400 bg-red-400/10" },
  { id: "douyin", label: "抖音", emoji: "🎵", color: "text-pink-400 bg-pink-400/10" },
  { id: "instagram", label: "Instagram", emoji: "📸", color: "text-purple-400 bg-purple-400/10" },
  { id: "tiktok", label: "TikTok", emoji: "🎬", color: "text-cyan-400 bg-cyan-400/10" },
  { id: "youtube", label: "YouTube", emoji: "▶️", color: "text-red-500 bg-red-500/10" },
] as const;

type PlatformId = typeof PLATFORMS[number]["id"];

type AdaptationData = {
  title?: string;
  caption?: string;
  hashtags?: string[];
  formatNotes?: string;
  coverUrl?: string;
  aiHashtags?: string[];
};

export default function PlatformAdaptation({ projectId }: Props) {
  const pid = parseInt(projectId);
  const [selectedScript, setSelectedScript] = useState<string>("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>(["xiaohongshu", "douyin"]);
  const [industry, setIndustry] = useState("");
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatedAdaptations, setGeneratedAdaptations] = useState<Record<string, AdaptationData>>({});

  // Cover generation state
  const [generatingCoverFor, setGeneratingCoverFor] = useState<string | null>(null);
  const [generatingHashtagsFor, setGeneratingHashtagsFor] = useState<string | null>(null);

  const { data: scripts } = trpc.scripts.list.useQuery({ projectId: pid });
  const { data: adaptations } = trpc.platformAdaptation.list.useQuery(
    { scriptId: parseInt(selectedScript) },
    { enabled: !!selectedScript && !isNaN(parseInt(selectedScript)) }
  );

  const generateMutation = trpc.platformAdaptation.generate.useMutation({
    onSuccess: (data) => {
      setGenerating(false);
      const newAdaptations: Record<string, AdaptationData> = {};
      for (const a of data.adaptations) {
        newAdaptations[a.platform] = { title: a.title, caption: a.caption, hashtags: a.hashtags, formatNotes: a.formatNotes };
      }
      setGeneratedAdaptations(newAdaptations);
      setExpandedPlatform(Object.keys(newAdaptations)[0] || null);
      toast.success(`已生成 ${data.adaptations.length} 个平台适配文案！`);
    },
    onError: () => { setGenerating(false); toast.error("生成失败，请重试"); },
  });

  const generateCoverMutation = trpc.contentPackage.generateCover.useMutation({
    onSuccess: (data, variables) => {
      setGeneratingCoverFor(null);
      setGeneratedAdaptations(prev => ({
        ...prev,
        [variables.platform]: { ...prev[variables.platform], coverUrl: data.coverUrl },
      }));
      toast.success("封面图生成完成！");
    },
    onError: (e) => { setGeneratingCoverFor(null); toast.error(e.message || "封面图生成失败"); },
  });

  const generateHashtagsMutation = trpc.contentPackage.generateHashtags.useMutation({
    onSuccess: (data, variables) => {
      setGeneratingHashtagsFor(null);
      setGeneratedAdaptations(prev => ({
        ...prev,
        [variables.platform]: { ...prev[variables.platform], aiHashtags: data.hashtags },
      }));
      toast.success(`已生成 ${data.hashtags.length} 个话题标签！`);
    },
    onError: (e) => { setGeneratingHashtagsFor(null); toast.error(e.message || "话题标签生成失败"); },
  });

  const handleTogglePlatform = (pid: PlatformId) => {
    setSelectedPlatforms(prev =>
      prev.includes(pid) ? prev.filter(p => p !== pid) : [...prev, pid]
    );
  };

  const handleGenerate = () => {
    if (!selectedScript) { toast.error("请选择脚本"); return; }
    if (selectedPlatforms.length === 0) { toast.error("请选择至少一个平台"); return; }
    const script = scripts?.find(s => s.id === parseInt(selectedScript));
    if (!script?.fullScript) { toast.error("所选脚本内容为空"); return; }
    setGenerating(true);
    setGeneratedAdaptations({});
    generateMutation.mutate({
      projectId: pid,
      scriptId: parseInt(selectedScript),
      scriptContent: script.fullScript,
      platforms: selectedPlatforms,
      industry: industry || script.title || "通用",
    });
  };

  const handleGenerateCover = (platformId: string, adaptation: AdaptationData) => {
    setGeneratingCoverFor(platformId);
    generateCoverMutation.mutate({
      projectId: pid,
      title: adaptation.title || "内容封面",
      platform: platformId,
      industry: industry || "通用",
      style: "现代简约",
    });
  };

  const handleGenerateHashtags = (platformId: string, adaptation: AdaptationData) => {
    setGeneratingHashtagsFor(platformId);
    generateHashtagsMutation.mutate({
      projectId: pid,
      title: adaptation.title || "",
      caption: adaptation.caption,
      platform: platformId,
      industry: industry || "通用",
    });
  };

  const handleDownloadPackage = (platformId: string, adaptation: AdaptationData) => {
    const platform = PLATFORMS.find(p => p.id === platformId);
    const allHashtags = [...(adaptation.hashtags || []), ...(adaptation.aiHashtags || [])];
    const content = [
      `=== ${platform?.label || platformId} 内容包 ===`,
      "",
      "【标题】",
      adaptation.title || "",
      "",
      "【正文/Caption】",
      adaptation.caption || "",
      "",
      "【话题标签】",
      allHashtags.join(" "),
      "",
      "【发布建议】",
      adaptation.formatNotes || "",
      "",
      adaptation.coverUrl ? `【封面图URL】\n${adaptation.coverUrl}` : "",
    ].filter(Boolean).join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${platformId}-content-package.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${platform?.label} 内容包已下载`);
  };

  const handleDownloadAllPackages = () => {
    const allContent: string[] = [];
    for (const [platformId, adaptation] of Object.entries(displayAdaptations)) {
      const platform = PLATFORMS.find(p => p.id === platformId);
      const allHashtags = [...(adaptation.hashtags || []), ...(adaptation.aiHashtags || [])];
      allContent.push(
        `${"=".repeat(50)}`,
        `${platform?.emoji || ""} ${platform?.label || platformId} 内容包`,
        `${"=".repeat(50)}`,
        "",
        `【标题】\n${adaptation.title || ""}`,
        "",
        `【正文/Caption】\n${adaptation.caption || ""}`,
        "",
        `【话题标签】\n${allHashtags.join(" ")}`,
        "",
        `【发布建议】\n${adaptation.formatNotes || ""}`,
        adaptation.coverUrl ? `\n【封面图URL】\n${adaptation.coverUrl}` : "",
        "",
      );
    }
    const blob = new Blob([allContent.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `all-platforms-content-package.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("全平台内容包已下载！");
  };

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
    toast.success("已复制");
  };

  const displayAdaptations: Record<string, AdaptationData> = Object.keys(generatedAdaptations).length > 0
    ? generatedAdaptations
    : adaptations?.reduce((acc, a) => {
        acc[a.platform] = { title: a.title || undefined, caption: a.caption || undefined, hashtags: a.hashtags as string[] | undefined, formatNotes: a.formatNotes || undefined };
        return acc;
      }, {} as Record<string, AdaptationData>) || {};

  const hasAdaptations = Object.keys(displayAdaptations).length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Share2 className="w-6 h-6 text-violet-400" />多平台适配
        </h1>
        <p className="text-muted-foreground text-sm mt-1">一键将脚本适配为各平台专属文案，并生成AI封面图和内容包</p>
      </div>

      {/* Config Card */}
      <Card className="bg-card border-border">
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-foreground text-sm">选择脚本 *</Label>
              <Select value={selectedScript} onValueChange={setSelectedScript}>
                <SelectTrigger className="bg-input border-border text-foreground">
                  <SelectValue placeholder="选择要适配的脚本" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {scripts?.map(s => (
                    <SelectItem key={s.id} value={String(s.id)} className="text-foreground text-sm">
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-foreground text-sm">行业（用于优化文案和封面）</Label>
              <input
                type="text"
                placeholder="例：医美、美妆"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full h-10 px-3 rounded-md bg-input border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-foreground text-sm">目标平台</Label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {PLATFORMS.map((p) => (
                <label key={p.id} className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${selectedPlatforms.includes(p.id) ? "border-primary bg-primary/10" : "border-border bg-input hover:border-primary/30"}`}>
                  <Checkbox checked={selectedPlatforms.includes(p.id)} onCheckedChange={() => handleTogglePlatform(p.id)}
                    className="border-border" />
                  <span className="text-sm">{p.emoji}</span>
                  <span className={`text-sm font-medium ${selectedPlatforms.includes(p.id) ? "text-primary" : "text-foreground"}`}>{p.label}</span>
                </label>
              ))}
            </div>
          </div>

          <Button onClick={handleGenerate} disabled={!selectedScript || selectedPlatforms.length === 0 || generating} className="glow-purple">
            {generating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />适配生成中...</> : <><Share2 className="w-4 h-4 mr-2" />一键生成适配文案</>}
          </Button>
        </CardContent>
      </Card>

      {/* Adaptations Results */}
      {hasAdaptations && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">适配结果</h2>
            <Button size="sm" variant="outline" onClick={handleDownloadAllPackages}
              className="h-8 text-xs border-border text-muted-foreground hover:text-foreground flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5" />下载全平台内容包
            </Button>
          </div>

          {PLATFORMS.filter(p => displayAdaptations[p.id]).map((platform) => {
            const adaptation = displayAdaptations[platform.id];
            if (!adaptation) return null;
            const isExpanded = expandedPlatform === platform.id;
            const allHashtags = [...(adaptation.hashtags || []), ...(adaptation.aiHashtags || [])];
            return (
              <Card key={platform.id} className="bg-card border-border">
                <CardHeader className="pb-0 pt-4 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{platform.emoji}</span>
                      <CardTitle className="text-sm font-medium text-foreground">{platform.label}</CardTitle>
                      {adaptation.title && (
                        <span className="text-xs text-muted-foreground truncate max-w-48">· {adaptation.title}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {adaptation.caption && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
                          onClick={() => handleCopy(`${platform.id}-caption`, `${adaptation.title || ""}\n\n${adaptation.caption || ""}\n\n${allHashtags.join(" ")}`)}>
                          {copiedKey === `${platform.id}-caption` ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
                        onClick={() => setExpandedPlatform(isExpanded ? null : platform.id)}>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent className="px-4 pb-4 pt-3 space-y-4">
                    {adaptation.title && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">标题</div>
                        <p className="text-sm font-semibold text-foreground">{adaptation.title}</p>
                      </div>
                    )}
                    {adaptation.caption && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">正文 / Caption</div>
                        <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{adaptation.caption}</p>
                      </div>
                    )}

                    {/* Hashtags Section */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="text-xs text-muted-foreground">话题标签</div>
                        <Button size="sm" variant="ghost" onClick={() => handleGenerateHashtags(platform.id, adaptation)}
                          disabled={generatingHashtagsFor === platform.id}
                          className="h-6 text-xs text-muted-foreground hover:text-cyan-400 px-2">
                          {generatingHashtagsFor === platform.id
                            ? <><Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />生成中</>
                            : <><Hash className="w-2.5 h-2.5 mr-1" />AI生成标签</>}
                        </Button>
                      </div>
                      {allHashtags.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {allHashtags.map((tag: string, idx: number) => (
                            <span key={idx} className={`text-xs px-2 py-0.5 rounded-full cursor-pointer hover:opacity-80 ${idx < (adaptation.hashtags?.length || 0) ? "bg-primary/10 text-primary" : "bg-cyan-400/10 text-cyan-400"}`}
                              onClick={() => handleCopy(`tag-${idx}`, tag)}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">点击"AI生成标签"获取专属话题标签</p>
                      )}
                    </div>

                    {/* AI Cover Image Section */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Image className="w-3 h-3" />AI封面图
                          <span className="text-xs bg-violet-400/20 text-violet-400 px-1 rounded ml-1">NEW</span>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => handleGenerateCover(platform.id, adaptation)}
                          disabled={generatingCoverFor === platform.id}
                          className="h-6 text-xs text-muted-foreground hover:text-violet-400 px-2">
                          {generatingCoverFor === platform.id
                            ? <><Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />生成中（约10-20s）</>
                            : <><Sparkles className="w-2.5 h-2.5 mr-1" />{adaptation.coverUrl ? "重新生成" : "AI生成封面"}</>}
                        </Button>
                      </div>
                      {adaptation.coverUrl ? (
                        <div className="space-y-2">
                          <img src={adaptation.coverUrl} alt="AI生成封面" className="w-full max-w-sm rounded-xl border border-border" />
                          <div className="flex gap-2">
                            <a href={adaptation.coverUrl} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline flex items-center gap-1">
                              <Download className="w-3 h-3" />下载封面图
                            </a>
                            <button onClick={() => handleCopy(`cover-${platform.id}`, adaptation.coverUrl || "")}
                              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                              {copiedKey === `cover-${platform.id}` ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                              复制图片URL
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="h-20 rounded-xl border border-dashed border-border flex items-center justify-center">
                          <p className="text-xs text-muted-foreground">点击"AI生成封面"创建专属封面图</p>
                        </div>
                      )}
                    </div>

                    {adaptation.formatNotes && (
                      <div className="p-3 rounded-lg bg-secondary/30 border border-border">
                        <div className="text-xs text-muted-foreground mb-1">发布建议</div>
                        <p className="text-xs text-foreground/80">{adaptation.formatNotes}</p>
                      </div>
                    )}

                    {/* Download Package Button */}
                    <Button size="sm" variant="outline" onClick={() => handleDownloadPackage(platform.id, adaptation)}
                      className="w-full h-8 text-xs border-border text-muted-foreground hover:text-foreground flex items-center gap-1.5">
                      <Download className="w-3.5 h-3.5" />下载 {platform.label} 内容包（.txt）
                    </Button>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {!selectedScript && (
        <div className="text-center py-12 text-muted-foreground">
          <Share2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>选择脚本后，AI将自动生成各平台专属文案</p>
          <p className="text-xs mt-1 opacity-70">支持生成AI封面图、专属话题标签和内容包下载</p>
        </div>
      )}

      {selectedScript && !hasAdaptations && !generating && (
        <div className="text-center py-8 text-muted-foreground">
          <RefreshCw className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">点击"一键生成适配文案"开始</p>
        </div>
      )}
    </div>
  );
}
