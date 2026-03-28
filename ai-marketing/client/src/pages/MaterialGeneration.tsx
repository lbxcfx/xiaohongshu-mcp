import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Upload, Video, Image, User, Trash2, Plus, Tag,
  Loader2, Sparkles, RefreshCw, ExternalLink, CheckCircle, AlertCircle, Clock
} from "lucide-react";

interface Props { projectId: string; }

const TYPE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string; bg: string; desc: string }> = {
  real_person: { icon: User, label: "真人口播", color: "text-blue-400", bg: "bg-blue-400/10", desc: "上传真人拍摄的口播素材" },
  digital_avatar: { icon: Video, label: "数字人", color: "text-purple-400", bg: "bg-purple-400/10", desc: "AI生成数字人口播素材" },
  before_after: { icon: Image, label: "术前术后", color: "text-pink-400", bg: "bg-pink-400/10", desc: "医美前后对比素材" },
  other: { icon: Upload, label: "其他素材", color: "text-muted-foreground", bg: "bg-muted", desc: "其他类型素材" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  uploading: { label: "上传中", color: "text-amber-400 bg-amber-400/10", icon: Clock },
  processing: { label: "生成中", color: "text-blue-400 bg-blue-400/10", icon: Loader2 },
  ready: { label: "可用", color: "text-green-400 bg-green-400/10", icon: CheckCircle },
  failed: { label: "失败", color: "text-destructive bg-destructive/10", icon: AlertCircle },
};

// HeyGen popular avatars
const HEYGEN_AVATARS = [
  { id: "Abigail_expressive_2024112501", name: "Abigail（英文女性）" },
  { id: "Anna_public_3_20240108", name: "Anna（英文女性）" },
  { id: "Daisy-inskirt-20220818", name: "Daisy（英文女性）" },
  { id: "Eric_public_pro1_20230608", name: "Eric（英文男性）" },
  { id: "Tyler-incasualsuit-20220721", name: "Tyler（英文男性）" },
];

const HEYGEN_VOICES = [
  { id: "2d5b0e6cf36f460aa7fc47e3eee4ba54", name: "Aria（英文女声）" },
  { id: "1bd001e7e50f421d891986aad5158bc8", name: "Roger（英文男声）" },
  { id: "a0e99841-438c-4a64-b679-ae501e7d6091", name: "Sarah（英文女声）" },
];

export default function MaterialGeneration({ projectId }: Props) {
  const pid = parseInt(projectId);
  const utils = trpc.useUtils();

  // Manual add form
  const [form, setForm] = useState({
    title: "", type: "real_person" as "real_person" | "digital_avatar" | "before_after" | "other",
    fileUrl: "", bodyPart: "", treatmentType: "", style: "", tagInput: "", tags: [] as string[],
  });
  const [activeType, setActiveType] = useState<string | null>(null);

  // Digital avatar form
  const [avatarForm, setAvatarForm] = useState({
    title: "",
    scriptContent: "",
    avatarId: HEYGEN_AVATARS[0].id,
    voiceId: HEYGEN_VOICES[0].id,
    heygenApiKey: "",
  });
  const [generatingVideoId, setGeneratingVideoId] = useState<string | null>(null);
  const [generatingMaterialId, setGeneratingMaterialId] = useState<number | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [generationResult, setGenerationResult] = useState<{ status: string; videoUrl?: string; thumbnailUrl?: string; error?: string } | null>(null);

  const { data: materials, isLoading } = trpc.materials.list.useQuery({ projectId: pid });

  const createMutation = trpc.materials.create.useMutation({
    onSuccess: () => {
      utils.materials.list.invalidate({ projectId: pid });
      setForm({ title: "", type: "real_person", fileUrl: "", bodyPart: "", treatmentType: "", style: "", tagInput: "", tags: [] });
      toast.success("素材已添加");
    },
    onError: () => toast.error("添加失败"),
  });

  const deleteMutation = trpc.materials.delete.useMutation({
    onSuccess: () => { utils.materials.list.invalidate({ projectId: pid }); toast.success("已删除"); },
  });

  const generateAvatarMutation = trpc.digitalAvatar.generate.useMutation({
    onSuccess: (data) => {
      setGeneratingVideoId(data.videoId);
      setGeneratingMaterialId(data.materialId);
      setGenerationResult({ status: "processing" });
      utils.materials.list.invalidate({ projectId: pid });
      toast.success("数字人视频生成任务已提交，通常需要1-3分钟");
    },
    onError: (e) => toast.error(e.message || "数字人生成失败"),
  });

  const checkStatusMutation = trpc.digitalAvatar.checkStatus.useMutation({
    onSuccess: (data) => {
      setCheckingStatus(false);
      setGenerationResult(data);
      if (data.status === "completed") {
        utils.materials.list.invalidate({ projectId: pid });
        toast.success("数字人视频生成完成！");
        setGeneratingVideoId(null);
        setGeneratingMaterialId(null);
      } else if (data.status === "failed") {
        toast.error("视频生成失败：" + (data.error || "未知错误"));
        setGeneratingVideoId(null);
        setGeneratingMaterialId(null);
      } else {
        toast.info("视频仍在生成中，请稍后再查询");
      }
    },
    onError: (e) => { setCheckingStatus(false); toast.error(e.message || "状态查询失败"); },
  });

  const handleAddTag = () => {
    if (form.tagInput.trim() && !form.tags.includes(form.tagInput.trim())) {
      setForm({ ...form, tags: [...form.tags, form.tagInput.trim()], tagInput: "" });
    }
  };

  const handleCreate = () => {
    if (!form.title) { toast.error("请填写素材标题"); return; }
    createMutation.mutate({
      projectId: pid, title: form.title, type: form.type,
      fileUrl: form.fileUrl || undefined, tags: form.tags.length > 0 ? form.tags : undefined,
      bodyPart: form.bodyPart || undefined, treatmentType: form.treatmentType || undefined, style: form.style || undefined,
    });
  };

  const handleGenerateAvatar = () => {
    if (!avatarForm.title) { toast.error("请填写素材标题"); return; }
    if (!avatarForm.scriptContent) { toast.error("请填写口播脚本内容"); return; }
    if (!avatarForm.heygenApiKey) { toast.error("请填写HeyGen API Key"); return; }
    generateAvatarMutation.mutate({ projectId: pid, ...avatarForm });
  };

  const handleCheckStatus = () => {
    if (!generatingVideoId || !generatingMaterialId || !avatarForm.heygenApiKey) return;
    setCheckingStatus(true);
    checkStatusMutation.mutate({
      videoId: generatingVideoId,
      materialId: generatingMaterialId,
      heygenApiKey: avatarForm.heygenApiKey,
    });
  };

  const filteredMaterials = activeType ? materials?.filter(m => m.type === activeType) : materials;

  const renderTags = (tags: unknown) => {
    if (!tags || !Array.isArray(tags) || tags.length === 0) return null;
    return (
      <div className="flex gap-1 mt-1.5 flex-wrap">
        {tags.map((tag, idx) => (
          <span key={idx} className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">{String(tag)}</span>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Upload className="w-6 h-6 text-blue-400" />AI素材生成
        </h1>
        <p className="text-muted-foreground text-sm mt-1">管理口播素材、AI数字人视频和医美术前术后素材库</p>
      </div>

      {/* Type Filter */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(TYPE_CONFIG).map(([type, config]) => {
          const TypeIcon = config.icon;
          const count = materials?.filter(m => m.type === type).length || 0;
          return (
            <button key={type} onClick={() => setActiveType(activeType === type ? null : type)}
              className={`p-4 rounded-xl border text-left transition-all ${activeType === type ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/30"}`}>
              <div className={`w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center mb-2`}>
                <TypeIcon className={`w-4 h-4 ${config.color}`} />
              </div>
              <div className={`text-sm font-medium ${activeType === type ? "text-primary" : "text-foreground"}`}>{config.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{count} 个素材</div>
            </button>
          );
        })}
      </div>

      <Tabs defaultValue="manual" className="space-y-4">
        <TabsList className="bg-secondary/50 border border-border">
          <TabsTrigger value="manual" className="text-xs flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" />手动添加素材
          </TabsTrigger>
          <TabsTrigger value="avatar" className="text-xs flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />AI数字人生成
            <span className="text-xs bg-purple-400/20 text-purple-400 px-1 rounded">NEW</span>
          </TabsTrigger>
        </TabsList>

        {/* ── 手动添加 Tab ─────────────────────────────────────────────────── */}
        <TabsContent value="manual">
          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Plus className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">添加素材到素材库</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-foreground text-xs">素材标题 *</Label>
                  <Input placeholder="素材描述名称" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="bg-input border-border text-foreground h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-foreground text-xs">素材类型</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as "real_person" | "digital_avatar" | "before_after" | "other" })}>
                    <SelectTrigger className="bg-input border-border text-foreground h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {Object.entries(TYPE_CONFIG).map(([v, c]) => (
                        <SelectItem key={v} value={v} className="text-foreground">{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-foreground text-xs">文件URL（可选）</Label>
                  <Input placeholder="https://..." value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })}
                    className="bg-input border-border text-foreground h-9" />
                </div>
                {form.type === "before_after" && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-foreground text-xs">部位</Label>
                      <Input placeholder="例：眼部、鼻部、面部" value={form.bodyPart} onChange={(e) => setForm({ ...form, bodyPart: e.target.value })}
                        className="bg-input border-border text-foreground h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-foreground text-xs">手术/项目类型</Label>
                      <Input placeholder="例：双眼皮、隆鼻、填充" value={form.treatmentType} onChange={(e) => setForm({ ...form, treatmentType: e.target.value })}
                        className="bg-input border-border text-foreground h-9" />
                    </div>
                  </>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-foreground text-xs flex items-center gap-1"><Tag className="w-3 h-3" />标签</Label>
                <div className="flex gap-2">
                  <Input placeholder="输入标签后按Enter" value={form.tagInput}
                    onChange={(e) => setForm({ ...form, tagInput: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                    className="bg-input border-border text-foreground h-9 flex-1" />
                  <Button variant="outline" size="sm" onClick={handleAddTag} className="h-9 border-border">添加</Button>
                </div>
                {form.tags.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap mt-1">
                    {form.tags.map(tag => (
                      <Badge key={tag} variant="secondary" className="text-xs cursor-pointer" onClick={() => setForm({ ...form, tags: form.tags.filter(t => t !== tag) })}>
                        {tag} ×
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <Button onClick={handleCreate} disabled={!form.title || createMutation.isPending} className="h-9 text-sm">
                <Plus className="w-4 h-4 mr-1.5" />添加素材
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── AI数字人生成 Tab ─────────────────────────────────────────────── */}
        <TabsContent value="avatar" className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />AI数字人口播视频生成
              </CardTitle>
              <p className="text-xs text-muted-foreground">接入HeyGen API，将脚本文字转换为数字人口播视频素材</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* API Key */}
              <div className="p-3 rounded-lg bg-purple-400/5 border border-purple-400/20">
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-purple-400/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs text-purple-400 font-bold">!</span>
                  </div>
                  <div>
                    <p className="text-xs text-purple-400 font-medium">需要HeyGen API Key</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      前往 <a href="https://app.heygen.com/settings?nav=API" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline inline-flex items-center gap-0.5">HeyGen控制台 <ExternalLink className="w-2.5 h-2.5" /></a> 获取API Key。每月免费额度1个视频，付费计划按分钟计费。
                    </p>
                  </div>
                </div>
                <Input placeholder="输入您的HeyGen API Key（heyXXXXXXXX）" value={avatarForm.heygenApiKey}
                  onChange={(e) => setAvatarForm({ ...avatarForm, heygenApiKey: e.target.value })}
                  className="bg-input border-border text-foreground h-9 mt-2 text-xs font-mono" type="password" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-foreground text-xs">素材标题 *</Label>
                  <Input placeholder="例：医美咨询口播v1" value={avatarForm.title}
                    onChange={(e) => setAvatarForm({ ...avatarForm, title: e.target.value })}
                    className="bg-input border-border text-foreground h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-foreground text-xs">数字人形象</Label>
                  <Select value={avatarForm.avatarId} onValueChange={(v) => setAvatarForm({ ...avatarForm, avatarId: v })}>
                    <SelectTrigger className="bg-input border-border text-foreground h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {HEYGEN_AVATARS.map(a => (
                        <SelectItem key={a.id} value={a.id} className="text-foreground text-xs">{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-foreground text-xs">配音声音</Label>
                  <Select value={avatarForm.voiceId} onValueChange={(v) => setAvatarForm({ ...avatarForm, voiceId: v })}>
                    <SelectTrigger className="bg-input border-border text-foreground h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {HEYGEN_VOICES.map(v => (
                        <SelectItem key={v.id} value={v.id} className="text-foreground text-xs">{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-foreground text-xs">口播脚本内容 * <span className="text-muted-foreground">（最多1500字）</span></Label>
                <Textarea placeholder="粘贴从AI脚本编导生成的脚本内容，或直接输入口播文案..."
                  value={avatarForm.scriptContent}
                  onChange={(e) => setAvatarForm({ ...avatarForm, scriptContent: e.target.value })}
                  className="bg-input border-border text-foreground resize-none text-sm" rows={6} />
                <p className="text-xs text-muted-foreground text-right">{avatarForm.scriptContent.length}/1500</p>
              </div>

              <Button onClick={handleGenerateAvatar}
                disabled={generateAvatarMutation.isPending || !avatarForm.title || !avatarForm.scriptContent || !avatarForm.heygenApiKey}
                className="w-full h-10 text-sm bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-400/20">
                {generateAvatarMutation.isPending
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />提交生成任务...</>
                  : <><Sparkles className="w-4 h-4 mr-2" />生成数字人口播视频</>}
              </Button>

              {/* Generation Status */}
              {generationResult && (
                <div className={`p-4 rounded-xl border ${generationResult.status === "completed" ? "border-green-400/30 bg-green-400/5" : generationResult.status === "failed" ? "border-destructive/30 bg-destructive/5" : "border-blue-400/30 bg-blue-400/5"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {generationResult.status === "completed" ? (
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      ) : generationResult.status === "failed" ? (
                        <AlertCircle className="w-4 h-4 text-destructive" />
                      ) : (
                        <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                      )}
                      <span className="text-sm font-medium text-foreground">
                        {generationResult.status === "completed" ? "视频生成完成！" : generationResult.status === "failed" ? "生成失败" : "视频生成中..."}
                      </span>
                    </div>
                    {generatingVideoId && generationResult.status === "processing" && (
                      <Button size="sm" variant="outline" onClick={handleCheckStatus} disabled={checkingStatus}
                        className="h-7 text-xs border-border">
                        {checkingStatus ? <Loader2 className="w-3 h-3 animate-spin" /> : <><RefreshCw className="w-3 h-3 mr-1" />查询状态</>}
                      </Button>
                    )}
                  </div>
                  {generationResult.status === "completed" && generationResult.videoUrl && (
                    <div className="mt-3 space-y-2">
                      {generationResult.thumbnailUrl && (
                        <img src={generationResult.thumbnailUrl} alt="视频封面" className="w-full max-w-xs rounded-lg" />
                      )}
                      <a href={generationResult.videoUrl} target="_blank" rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex items-center gap-1">
                        <ExternalLink className="w-3.5 h-3.5" />查看/下载视频
                      </a>
                    </div>
                  )}
                  {generationResult.status === "failed" && (
                    <p className="text-xs text-destructive mt-1">{generationResult.error}</p>
                  )}
                  {generationResult.status === "processing" && (
                    <p className="text-xs text-muted-foreground mt-1">视频通常需要1-3分钟生成，请点击"查询状态"按钮检查进度</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Materials List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">素材库 <span className="text-muted-foreground">({filteredMaterials?.length || 0})</span></h2>
          <Button variant="ghost" size="sm" onClick={() => utils.materials.list.invalidate({ projectId: pid })} className="text-xs text-muted-foreground h-7">
            <RefreshCw className="w-3 h-3 mr-1" />刷新
          </Button>
        </div>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1,2,3,4].map(i => <div key={i} className="h-24 shimmer rounded-xl" />)}
          </div>
        ) : filteredMaterials?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Upload className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>暂无素材，点击上方添加或生成</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredMaterials?.map((m) => {
              const config = TYPE_CONFIG[m.type] || TYPE_CONFIG.other;
              const statusConfig = STATUS_CONFIG[m.status || "ready"] || STATUS_CONFIG.ready;
              const TypeIcon = config.icon;
              const StatusIcon = statusConfig.icon;
              return (
                <Card key={m.id} className="bg-card border-border hover:border-primary/30 transition-all group">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl ${config.bg} flex items-center justify-center shrink-0`}>
                        <TypeIcon className={`w-5 h-5 ${config.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-sm font-medium text-foreground truncate">{m.title}</h3>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className={`text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1 ${statusConfig.color}`}>
                                <StatusIcon className="w-2.5 h-2.5" />{statusConfig.label}
                              </span>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${config.bg} ${config.color}`}>{config.label}</span>
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate({ id: m.id })}
                            className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        {(m.bodyPart || m.treatmentType) && (
                          <div className="flex gap-1.5 mt-1.5 flex-wrap">
                            {m.bodyPart && <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{m.bodyPart}</span>}
                            {m.treatmentType && <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{m.treatmentType}</span>}
                          </div>
                        )}
                        {renderTags(m.tags)}
                        {m.fileUrl && (
                          <a href={m.fileUrl} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-primary/70 hover:text-primary flex items-center gap-1 mt-1.5">
                            <ExternalLink className="w-3 h-3" />查看素材
                          </a>
                        )}
                      </div>
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
