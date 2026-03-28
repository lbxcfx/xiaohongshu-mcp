import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Sparkles, Loader2, CheckCircle2, Circle, TrendingUp, Users, ShoppingBag } from "lucide-react";

interface Props { projectId: string; }

const TOPIC_TYPE_ICONS: Record<string, { icon: React.ElementType; label: string; color: string; bg: string }> = {
  persona: { icon: Users, label: "人设型", color: "text-purple-400", bg: "bg-purple-400/10" },
  traffic: { icon: TrendingUp, label: "流量型", color: "text-cyan-400", bg: "bg-cyan-400/10" },
  marketing: { icon: ShoppingBag, label: "营销型", color: "text-green-400", bg: "bg-green-400/10" },
};

const VIRAL_LABELS: Record<string, { label: string; color: string }> = {
  high: { label: "高潜力", color: "text-green-400 bg-green-400/10" },
  medium: { label: "中潜力", color: "text-amber-400 bg-amber-400/10" },
  low: { label: "低潜力", color: "text-muted-foreground bg-muted" },
};

export default function TopicGeneration({ projectId }: Props) {
  const pid = parseInt(projectId);
  const utils = trpc.useUtils();
  const [form, setForm] = useState({ industry: "", personaType: "", monetizationMethod: "" });

  const { data: topics, isLoading } = trpc.topics.list.useQuery({ projectId: pid });
  const { data: hubItems } = trpc.topicHub.list.useQuery({ projectId: pid });

  const generateMutation = trpc.topics.generate.useMutation({
    onSuccess: () => { utils.topics.list.invalidate({ projectId: pid }); toast.success("已生成5条爆款选题！"); },
    onError: () => toast.error("生成失败，请重试"),
  });
  const updateMutation = trpc.topics.update.useMutation({
    onSuccess: () => utils.topics.list.invalidate({ projectId: pid }),
  });
  const deleteMutation = trpc.topics.delete.useMutation({
    onSuccess: () => { utils.topics.list.invalidate({ projectId: pid }); toast.success("已删除"); },
  });

  const handleGenerate = () => {
    if (!form.industry) { toast.error("请填写行业信息"); return; }
    const trendingTopics = hubItems?.filter(i => i.type === "trending").slice(0, 5).map(i => i.title).join("\n") || "";
    const viralPosts = hubItems?.filter(i => i.type === "viral_post").slice(0, 5).map(i => i.title).join("\n") || "";
    generateMutation.mutate({ projectId: pid, ...form, trendingTopics, viralPosts });
  };

  const STATUS_LABELS: Record<string, string> = {
    draft: "草稿", selected: "已选定", in_production: "制作中", published: "已发布",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-pink-400" />AI选题生成
        </h1>
        <p className="text-muted-foreground text-sm mt-1">结合信息中台热点与账号人设，AI生成5条高爆款潜质选题</p>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div className="space-y-1.5">
              <Label className="text-foreground text-xs">行业 *</Label>
              <Input placeholder="例：医美、美妆" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })}
                className="bg-input border-border text-foreground h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-foreground text-xs">人设类型</Label>
              <Select value={form.personaType} onValueChange={(v) => setForm({ ...form, personaType: v })}>
                <SelectTrigger className="bg-input border-border text-foreground h-9">
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
              <Label className="text-foreground text-xs">变现方式</Label>
              <Select value={form.monetizationMethod} onValueChange={(v) => setForm({ ...form, monetizationMethod: v })}>
                <SelectTrigger className="bg-input border-border text-foreground h-9">
                  <SelectValue placeholder="选择变现方式" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {["电商带货", "知识付费", "品牌带货", "广告变现"].map(o => (
                    <SelectItem key={o} value={o} className="text-foreground">{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              信息中台已有 <span className="text-primary">{hubItems?.length || 0}</span> 条素材将作为参考
            </p>
            <Button onClick={handleGenerate} disabled={!form.industry || generateMutation.isPending} className="glow-purple h-9">
              {generateMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />生成中...</> : <><Sparkles className="w-4 h-4 mr-2" />AI生成5条选题</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="h-24 shimmer rounded-xl" />)}</div>
      ) : topics?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>还没有选题，点击上方按钮生成</p>
        </div>
      ) : (
        <div className="space-y-3">
          {topics?.map((topic) => {
            const typeInfo = TOPIC_TYPE_ICONS[topic.topicType || "traffic"] || TOPIC_TYPE_ICONS.traffic;
            const viralInfo = VIRAL_LABELS[topic.viralPotential || "medium"] || VIRAL_LABELS.medium;
            const TypeIcon = typeInfo.icon;
            return (
              <Card key={topic.id} className="bg-card border-border hover:border-primary/30 transition-all">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl ${typeInfo.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                      <TypeIcon className={`w-4 h-4 ${typeInfo.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-foreground text-sm leading-snug">{topic.title}</h3>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${viralInfo.color}`}>{viralInfo.label}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${typeInfo.bg} ${typeInfo.color}`}>{typeInfo.label}</span>
                        </div>
                      </div>
                      {topic.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{topic.description}</p>}
                      {topic.rationale && <p className="text-xs text-primary/70 mt-1.5 italic line-clamp-1">💡 {topic.rationale}</p>}
                      <div className="flex items-center gap-2 mt-3">
                        <Select value={topic.status || "draft"} onValueChange={(v) => updateMutation.mutate({ id: topic.id, status: v as "draft" | "selected" | "in_production" | "published" })}>
                          <SelectTrigger className="h-7 text-xs bg-input border-border text-foreground w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-popover border-border">
                            {Object.entries(STATUS_LABELS).map(([v, l]) => (
                              <SelectItem key={v} value={v} className="text-foreground text-xs">{l}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate({ id: topic.id })}
                          className="h-7 text-xs text-muted-foreground hover:text-destructive px-2">删除</Button>
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
