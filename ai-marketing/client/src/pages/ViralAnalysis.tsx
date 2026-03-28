import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Brain, Loader2, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { Streamdown } from "streamdown";

interface Props { projectId: string; }

export default function ViralAnalysis({ projectId }: Props) {
  const pid = parseInt(projectId);
  const utils = trpc.useUtils();
  const [form, setForm] = useState({ referenceContent: "", contentUrl: "", accountPositioning: "" });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);

  const { data: analyses, isLoading } = trpc.viralAnalysis.list.useQuery({ projectId: pid });
  const analyzeMutation = trpc.viralAnalysis.analyze.useMutation({
    onSuccess: (data) => {
      utils.viralAnalysis.list.invalidate({ projectId: pid });
      setAnalyzingId(null);
      setExpandedId(data.id);
      setForm({ referenceContent: "", contentUrl: "", accountPositioning: "" });
      toast.success("爆款因子分析完成！");
    },
    onError: () => { setAnalyzingId(null); toast.error("分析失败，请重试"); },
  });

  const handleAnalyze = () => {
    if (!form.referenceContent) { toast.error("请输入参考内容"); return; }
    setAnalyzingId(-1);
    analyzeMutation.mutate({ projectId: pid, ...form });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Brain className="w-6 h-6 text-amber-400" />AI爆款因子分析
        </h1>
        <p className="text-muted-foreground text-sm mt-1">360度解析爆款内容底层逻辑，提炼可复制的爆款公式</p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />新建分析
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-foreground text-sm">参考内容 *</Label>
            <Textarea placeholder="粘贴爆款帖文内容、视频脚本或内容描述..." value={form.referenceContent}
              onChange={(e) => setForm({ ...form, referenceContent: e.target.value })}
              className="bg-input border-border text-foreground resize-none" rows={5} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-foreground text-sm">内容链接（可选）</Label>
              <Input placeholder="https://..." value={form.contentUrl}
                onChange={(e) => setForm({ ...form, contentUrl: e.target.value })}
                className="bg-input border-border text-foreground" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-foreground text-sm">账号定位（可选，用于匹配分析）</Label>
              <Input placeholder="例：接地气真实分享型医美博主" value={form.accountPositioning}
                onChange={(e) => setForm({ ...form, accountPositioning: e.target.value })}
                className="bg-input border-border text-foreground" />
            </div>
          </div>
          <Button onClick={handleAnalyze} disabled={!form.referenceContent || analyzingId === -1} className="glow-purple">
            {analyzingId === -1 ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />分析中（约15秒）...</> : <><Brain className="w-4 h-4 mr-2" />AI深度分析</>}
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-20 shimmer rounded-xl" />)}</div>
      ) : analyses?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Brain className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>还没有分析记录，输入爆款内容开始分析</p>
        </div>
      ) : (
        <div className="space-y-3">
          {analyses?.map((a) => (
            <Card key={a.id} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        a.status === "completed" ? "bg-green-400/10 text-green-400" :
                        a.status === "analyzing" ? "bg-amber-400/10 text-amber-400" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {a.status === "completed" ? "分析完成" : a.status === "analyzing" ? "分析中" : "待分析"}
                      </span>
                      <span className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleDateString("zh-CN")}</span>
                    </div>
                    <p className="text-sm text-foreground line-clamp-2">{a.referenceContent}</p>
                  </div>
                  {a.viralFormula && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground shrink-0"
                      onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}>
                      {expandedId === a.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  )}
                </div>
                {expandedId === a.id && a.viralFormula && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                      <Brain className="w-3 h-3 text-amber-400" />爆款因子分析报告
                    </div>
                    <div className="prose prose-sm prose-invert max-w-none text-foreground/90 text-sm leading-relaxed">
                      <Streamdown>{a.viralFormula}</Streamdown>
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
