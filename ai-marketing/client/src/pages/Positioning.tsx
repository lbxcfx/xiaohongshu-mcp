import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Target, Sparkles, ChevronDown, ChevronUp, Loader2, Plus } from "lucide-react";
import { Streamdown } from "streamdown";

interface Props { projectId: string; }

const MONETIZATION_OPTIONS = ["电商带货", "知识付费", "品牌带货/自有产品", "广告变现", "直播打赏", "私域转化"];
const PERSONA_OPTIONS = ["权威专家型", "接地气真实分享型", "共情陪伴型", "俯视引导型", "仰视学习型", "幽默娱乐型"];

export default function Positioning({ projectId }: Props) {
  const pid = parseInt(projectId);
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    industry: "", track: "", monetizationMethod: "", targetAudience: "", personaType: "",
  });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);

  const { data: positionings, isLoading } = trpc.positioning.list.useQuery({ projectId: pid });
  const createMutation = trpc.positioning.create.useMutation({
    onSuccess: () => { utils.positioning.list.invalidate({ projectId: pid }); toast.success("定位记录已创建"); },
    onError: () => toast.error("创建失败"),
  });
  const analyzeMutation = trpc.positioning.analyze.useMutation({
    onSuccess: (data, vars) => {
      utils.positioning.list.invalidate({ projectId: pid });
      setExpandedId(vars.positioningId);
      setAnalyzingId(null);
      toast.success("AI分析完成！");
    },
    onError: () => { setAnalyzingId(null); toast.error("分析失败，请重试"); },
  });

  const handleCreate = () => {
    if (!form.industry) { toast.error("请填写行业赛道"); return; }
    createMutation.mutate({ projectId: pid, ...form });
  };

  const handleAnalyze = (p: { id: number; industry?: string | null; track?: string | null; monetizationMethod?: string | null; targetAudience?: string | null; personaType?: string | null }) => {
    setAnalyzingId(p.id);
    analyzeMutation.mutate({
      positioningId: p.id,
      industry: p.industry || form.industry,
      track: p.track || form.track,
      monetizationMethod: p.monetizationMethod || form.monetizationMethod,
      targetAudience: p.targetAudience || form.targetAudience,
      personaType: p.personaType || form.personaType,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Target className="w-6 h-6 text-purple-400" />
          AI账号定位策划师
        </h1>
        <p className="text-muted-foreground text-sm mt-1">输入账号信息，AI分析爆款账号特质，给出精准定位建议</p>
      </div>

      {/* Input Form */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />新建定位分析
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-foreground text-sm">行业 *</Label>
              <Input placeholder="例：医美、美妆、健康养生" value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                className="bg-input border-border text-foreground" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-foreground text-sm">细分赛道</Label>
              <Input placeholder="例：轻医美、抗衰、皮肤管理" value={form.track}
                onChange={(e) => setForm({ ...form, track: e.target.value })}
                className="bg-input border-border text-foreground" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-foreground text-sm">变现方式</Label>
              <Select value={form.monetizationMethod} onValueChange={(v) => setForm({ ...form, monetizationMethod: v })}>
                <SelectTrigger className="bg-input border-border text-foreground">
                  <SelectValue placeholder="选择变现方式" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {MONETIZATION_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt} className="text-foreground">{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-foreground text-sm">人设类型</Label>
              <Select value={form.personaType} onValueChange={(v) => setForm({ ...form, personaType: v })}>
                <SelectTrigger className="bg-input border-border text-foreground">
                  <SelectValue placeholder="选择人设类型" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {PERSONA_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt} className="text-foreground">{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-foreground text-sm">目标用户描述</Label>
            <Textarea placeholder="描述你的目标用户群体，例：25-40岁女性，关注皮肤问题，有一定消费能力..." value={form.targetAudience}
              onChange={(e) => setForm({ ...form, targetAudience: e.target.value })}
              className="bg-input border-border text-foreground resize-none" rows={3} />
          </div>
          <Button onClick={handleCreate} disabled={!form.industry || createMutation.isPending} className="glow-purple">
            {createMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />创建中...</> : <><Plus className="w-4 h-4 mr-2" />创建定位记录</>}
          </Button>
        </CardContent>
      </Card>

      {/* Positioning List */}
      {isLoading ? (
        <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-20 shimmer rounded-xl" />)}</div>
      ) : positionings?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>还没有定位记录，填写上方表单开始分析</p>
        </div>
      ) : (
        <div className="space-y-3">
          {positionings?.map((p) => (
            <Card key={p.id} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {p.industry && <span className="text-sm font-medium text-foreground">{p.industry}</span>}
                      {p.track && <span className="text-xs text-muted-foreground">· {p.track}</span>}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        p.status === "completed" ? "bg-green-400/10 text-green-400" :
                        p.status === "analyzing" ? "bg-amber-400/10 text-amber-400" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {p.status === "completed" ? "分析完成" : p.status === "analyzing" ? "分析中" : "待分析"}
                      </span>
                    </div>
                    <div className="flex gap-2 mt-1.5 flex-wrap">
                      {p.monetizationMethod && <span className="text-xs text-muted-foreground">{p.monetizationMethod}</span>}
                      {p.personaType && <span className="text-xs text-muted-foreground">· {p.personaType}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {p.status !== "completed" && (
                      <Button size="sm" onClick={() => handleAnalyze(p)} disabled={analyzingId === p.id}
                        className="h-8 text-xs glow-purple">
                        {analyzingId === p.id ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />分析中</> : <><Sparkles className="w-3 h-3 mr-1" />AI分析</>}
                      </Button>
                    )}
                    {p.positioningRecommendation && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
                        onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}>
                        {expandedId === p.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    )}
                  </div>
                </div>
                {expandedId === p.id && p.positioningRecommendation && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-primary" />AI定位建议
                    </div>
                    <div className="prose prose-sm prose-invert max-w-none text-foreground/90 text-sm leading-relaxed">
                      <Streamdown>{p.positioningRecommendation}</Streamdown>
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
