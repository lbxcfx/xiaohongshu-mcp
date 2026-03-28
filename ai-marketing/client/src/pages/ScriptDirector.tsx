import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { BookOpen, Loader2, ChevronDown, ChevronUp, Plus, Copy, Check } from "lucide-react";
import { Streamdown } from "streamdown";

interface Props { projectId: string; }

const HOOK_TYPES = [
  { value: "camp_split", label: "分阵营", desc: "制造对立，引发共鸣" },
  { value: "anti_cognition", label: "反认知", desc: "颠覆常识，制造惊喜" },
  { value: "curiosity", label: "好奇感", desc: "悬念设置，引发追问" },
];

const STATUS_OPTIONS = [
  { value: "draft", label: "草稿" },
  { value: "review", label: "审核中" },
  { value: "approved", label: "已通过" },
  { value: "produced", label: "已制作" },
];

export default function ScriptDirector({ projectId }: Props) {
  const pid = parseInt(projectId);
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    title: "", personaType: "", industry: "", hookType: "camp_split" as "camp_split" | "anti_cognition" | "curiosity",
    platform: "", duration: "", viralFormula: "",
  });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const { data: scripts, isLoading } = trpc.scripts.list.useQuery({ projectId: pid });
  const { data: analyses } = trpc.viralAnalysis.list.useQuery({ projectId: pid });
  const { data: topics } = trpc.topics.list.useQuery({ projectId: pid });

  const generateMutation = trpc.scripts.generate.useMutation({
    onSuccess: (data) => {
      utils.scripts.list.invalidate({ projectId: pid });
      setGenerating(false);
      setExpandedId(data.id);
      setForm({ title: "", personaType: "", industry: "", hookType: "camp_split", platform: "", duration: "", viralFormula: "" });
      toast.success("脚本生成完成！");
    },
    onError: () => { setGenerating(false); toast.error("生成失败，请重试"); },
  });
  const updateMutation = trpc.scripts.update.useMutation({
    onSuccess: () => utils.scripts.list.invalidate({ projectId: pid }),
  });
  const deleteMutation = trpc.scripts.delete.useMutation({
    onSuccess: () => { utils.scripts.list.invalidate({ projectId: pid }); toast.success("已删除"); },
  });

  const handleGenerate = () => {
    if (!form.title || !form.industry) { toast.error("请填写选题标题和行业"); return; }
    setGenerating(true);
    generateMutation.mutate({
      projectId: pid,
      title: form.title,
      personaType: form.personaType,
      industry: form.industry,
      hookType: form.hookType,
      platform: form.platform,
      duration: form.duration ? parseInt(form.duration) : undefined,
      viralFormula: form.viralFormula,
    });
  };

  const handleCopy = (id: number, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success("脚本已复制");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-green-400" />AI脚本编导
        </h1>
        <p className="text-muted-foreground text-sm mt-1">基于爆款公式与账号人设，定制化生成高转化视频脚本</p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />生成新脚本
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-foreground text-sm">选题标题 *</Label>
              <Input placeholder="例：气血不足最怕你做的6个动作" value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="bg-input border-border text-foreground" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-foreground text-sm">行业 *</Label>
              <Input placeholder="例：医美、健康养生" value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                className="bg-input border-border text-foreground" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-foreground text-sm">人设类型</Label>
              <Select value={form.personaType} onValueChange={(v) => setForm({ ...form, personaType: v })}>
                <SelectTrigger className="bg-input border-border text-foreground">
                  <SelectValue placeholder="选择人设" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {["权威专家型", "接地气真实分享型", "共情陪伴型", "幽默娱乐型"].map(o => (
                    <SelectItem key={o} value={o} className="text-foreground">{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-foreground text-sm">目标平台</Label>
              <Select value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v })}>
                <SelectTrigger className="bg-input border-border text-foreground">
                  <SelectValue placeholder="选择平台" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {["小红书", "抖音", "Instagram", "TikTok", "YouTube"].map(o => (
                    <SelectItem key={o} value={o} className="text-foreground">{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Hook Type */}
          <div className="space-y-1.5">
            <Label className="text-foreground text-sm">开头钩子类型</Label>
            <div className="grid grid-cols-3 gap-2">
              {HOOK_TYPES.map((h) => (
                <button key={h.value} onClick={() => setForm({ ...form, hookType: h.value as "camp_split" | "anti_cognition" | "curiosity" })}
                  className={`p-3 rounded-xl border text-left transition-all ${form.hookType === h.value ? "border-primary bg-primary/10" : "border-border bg-input hover:border-primary/40"}`}>
                  <div className={`text-sm font-medium mb-0.5 ${form.hookType === h.value ? "text-primary" : "text-foreground"}`}>{h.label}</div>
                  <div className="text-xs text-muted-foreground">{h.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Viral Formula Reference */}
          {analyses && analyses.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-foreground text-sm">引用爆款分析（可选）</Label>
              <Select value={form.viralFormula} onValueChange={(v) => setForm({ ...form, viralFormula: v })}>
                <SelectTrigger className="bg-input border-border text-foreground">
                  <SelectValue placeholder="选择参考爆款分析" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {analyses.filter(a => a.status === "completed").map(a => (
                    <SelectItem key={a.id} value={a.viralFormula || ""} className="text-foreground text-xs">
                      {a.referenceContent?.substring(0, 40)}...
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-foreground text-sm">视频时长（秒）</Label>
              <Input type="number" placeholder="例：60" value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value })}
                className="bg-input border-border text-foreground" />
            </div>
          </div>

          <Button onClick={handleGenerate} disabled={!form.title || !form.industry || generating} className="glow-purple">
            {generating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />生成中（约20秒）...</> : <><BookOpen className="w-4 h-4 mr-2" />AI生成脚本</>}
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-20 shimmer rounded-xl" />)}</div>
      ) : scripts?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>还没有脚本，填写上方表单开始生成</p>
        </div>
      ) : (
        <div className="space-y-3">
          {scripts?.map((s) => (
            <Card key={s.id} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-foreground text-sm">{s.title}</h3>
                      {s.platform && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{s.platform}</span>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Select value={s.status || "draft"} onValueChange={(v) => updateMutation.mutate({ id: s.id, status: v as "draft" | "review" | "approved" | "produced" })}>
                        <SelectTrigger className="h-7 text-xs bg-input border-border text-foreground w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border-border">
                          {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value} className="text-foreground text-xs">{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <span className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleDateString("zh-CN")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {s.fullScript && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
                        onClick={() => handleCopy(s.id, s.fullScript || "")}>
                        {copiedId === s.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </Button>
                    )}
                    {s.fullScript && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
                        onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}>
                        {expandedId === s.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate({ id: s.id })}
                      className="h-8 text-xs text-muted-foreground hover:text-destructive px-2">删除</Button>
                  </div>
                </div>
                {expandedId === s.id && s.fullScript && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                      <BookOpen className="w-3 h-3 text-green-400" />完整脚本
                    </div>
                    <div className="prose prose-sm prose-invert max-w-none text-foreground/90 text-sm leading-relaxed">
                      <Streamdown>{s.fullScript}</Streamdown>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
