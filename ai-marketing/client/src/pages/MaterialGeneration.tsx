import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Upload, Video, Image, User, Trash2, Plus, Loader2, Sparkles,
  RefreshCw, ExternalLink, CheckCircle, AlertCircle, Clock,
  Clapperboard, ChevronRight, ChevronDown, Play, Download,
} from "lucide-react";

interface Props { projectId: string; }

const TYPE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string; bg: string; desc: string }> = {
  real_person: { icon: User, label: "真人口播", color: "text-blue-400", bg: "bg-blue-400/10", desc: "真人拍摄素材" },
  digital_avatar: { icon: Video, label: "数字人", color: "text-purple-400", bg: "bg-purple-400/10", desc: "AI数字人素材" },
  before_after: { icon: Image, label: "术前术后", color: "text-pink-400", bg: "bg-pink-400/10", desc: "医美对比素材" },
  other: { icon: Upload, label: "其他素材", color: "text-muted-foreground", bg: "bg-muted", desc: "其他类型素材" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  uploading: { label: "上传中", color: "text-amber-400 bg-amber-400/10", icon: Clock },
  processing: { label: "生成中", color: "text-blue-400 bg-blue-400/10", icon: Loader2 },
  ready: { label: "可用", color: "text-green-400 bg-green-400/10", icon: CheckCircle },
  failed: { label: "失败", color: "text-destructive bg-destructive/10", icon: AlertCircle },
};

type ShotItem = {
  shotIndex: number;
  timeRange: string;
  description: string;
  cameraInstruction: string;
  visualSuggestion: string;
  voiceOver: string;
};

type GeneratingTask = {
  materialId: number;
  taskId: string;
  shotTitle: string;
};

export default function MaterialGeneration({ projectId }: Props) {
  const pid = parseInt(projectId);
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── AI 视频生成流程状态 ─────────────────────────────────────────────────────
  const [selectedScriptId, setSelectedScriptId] = useState<string>("");
  const [shots, setShots] = useState<ShotItem[]>([]);
  const [scriptTitle, setScriptTitle] = useState("");
  const [selectedShots, setSelectedShots] = useState<Set<number>>(new Set());
  const [shotImages, setShotImages] = useState<Record<number, string>>({}); // shotIndex -> url
  const [shotImageMode, setShotImageMode] = useState<Record<number, "url" | "upload">>({}); // shotIndex -> mode
  const [generationConfig, setGenerationConfig] = useState({
    type: "real_person" as "real_person" | "digital_avatar" | "before_after" | "other",
    ratio: "9:16" as "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "21:9" | "adaptive",
    duration: 5,
    resolution: "720p" as "480p" | "720p" | "1080p",
    generateAudio: true,
  });
  const [generatingTasks, setGeneratingTasks] = useState<GeneratingTask[]>([]);
  const [previewVideo, setPreviewVideo] = useState<{ url: string; title: string } | null>(null);

  // ── 手动添加素材状态 ────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    title: "", type: "real_person" as "real_person" | "digital_avatar" | "before_after" | "other",
    fileUrl: "", bodyPart: "", treatmentType: "", tagInput: "", tags: [] as string[],
  });
  const [activeType, setActiveType] = useState<string | null>(null);

  // ── 查询 ────────────────────────────────────────────────────────────────────
  const { data: scripts } = trpc.scripts.list.useQuery({ projectId: pid });
  const { data: materials, isLoading } = trpc.materials.list.useQuery(
    { projectId: pid },
    {
      refetchInterval: generatingTasks.length > 0 ? 8000 : false,
    }
  );

  // ── Mutations ────────────────────────────────────────────────────────────────
  const storyboardMutation = trpc.videoGeneration.generateStoryboard.useMutation({
    onSuccess: (data) => {
      setShots(data.shots);
      setScriptTitle(data.scriptTitle);
      setSelectedShots(new Set());
      setShotImages({});
      toast.success(`已生成 ${data.shots.length} 个分镜头`);
    },
    onError: (e) => toast.error(e.message || "分镜头生成失败"),
  });

  const createTaskMutation = trpc.videoGeneration.createTask.useMutation({
    onSuccess: (data, variables) => {
      setGeneratingTasks(prev => [
        ...prev,
        { materialId: data.materialId, taskId: data.taskId, shotTitle: variables.title },
      ]);
      utils.materials.list.invalidate({ projectId: pid });
    },
    onError: (e) => toast.error(e.message || "任务创建失败"),
  });

  const checkStatusMutation = trpc.videoGeneration.checkStatus.useMutation({
    onSuccess: (data, variables) => {
      if (data.status === "completed") {
        setGeneratingTasks(prev => prev.filter(t => t.taskId !== variables.taskId));
        utils.materials.list.invalidate({ projectId: pid });
        toast.success("视频生成完成！");
      } else if (data.status === "failed") {
        setGeneratingTasks(prev => prev.filter(t => t.taskId !== variables.taskId));
        utils.materials.list.invalidate({ projectId: pid });
        toast.error("视频生成失败：" + (data.error || "未知错误"));
      } else {
        toast.info("视频仍在生成中，请稍后再查询");
      }
    },
    onError: (e) => toast.error(e.message || "状态查询失败"),
  });

  const createMaterialMutation = trpc.materials.create.useMutation({
    onSuccess: () => {
      utils.materials.list.invalidate({ projectId: pid });
      setForm({ title: "", type: "real_person", fileUrl: "", bodyPart: "", treatmentType: "", tagInput: "", tags: [] });
      toast.success("素材已添加");
    },
    onError: () => toast.error("添加失败"),
  });

  const deleteMutation = trpc.materials.delete.useMutation({
    onSuccess: () => { utils.materials.list.invalidate({ projectId: pid }); toast.success("已删除"); },
  });

  // ── 处理函数 ─────────────────────────────────────────────────────────────────

  function toggleShot(idx: number) {
    setSelectedShots(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  async function handleFileUpload(shotIndex: number, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const resp = await fetch(`/api/upload?projectId=${pid}`, { method: "POST", body: formData });
      const data = await resp.json() as { success: boolean; url?: string; error?: string };
      if (!data.success || !data.url) throw new Error(data.error || "上传失败");
      setShotImages(prev => ({ ...prev, [shotIndex]: data.url! }));
      toast.success("图片上传成功");
    } catch (e) {
      toast.error((e as Error).message || "图片上传失败");
    }
  }

  async function handleGenerateVideos() {
    const selectedList = shots.filter(s => selectedShots.has(s.shotIndex));
    if (selectedList.length === 0) {
      toast.error("请至少选择一个分镜头");
      return;
    }

    for (const shot of selectedList) {
      const title = `${scriptTitle} — 镜头${shot.shotIndex} (${shot.timeRange})`;
      await createTaskMutation.mutateAsync({
        projectId: pid,
        scriptId: selectedScriptId ? parseInt(selectedScriptId) : undefined,
        title,
        type: generationConfig.type,
        prompt: `${shot.description}。画面风格：${shot.visualSuggestion}。镜头指令：${shot.cameraInstruction}。口播内容：${shot.voiceOver}`,
        referenceImageUrl: shotImages[shot.shotIndex] || undefined,
        ratio: generationConfig.ratio,
        duration: generationConfig.duration,
        resolution: generationConfig.resolution,
        generateAudio: generationConfig.generateAudio,
      });
    }

    toast.success(`已提交 ${selectedList.length} 个视频生成任务`);
    setSelectedShots(new Set());
  }

  const filteredMaterials = activeType ? materials?.filter(m => m.type === activeType) : materials;

  // ── 渲染 ─────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-blue-400" />AI素材生成
        </h1>
        <p className="text-muted-foreground text-sm mt-1">基于脚本生成分镜头，调用 Seedance 1.5 Pro 生成视频素材</p>
      </div>

      {/* 素材类型统计 */}
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

      <Tabs defaultValue="ai" className="space-y-4">
        <TabsList className="bg-secondary/50 border border-border">
          <TabsTrigger value="ai" className="text-xs flex items-center gap-1.5">
            <Clapperboard className="w-3.5 h-3.5" />AI视频生成
          </TabsTrigger>
          <TabsTrigger value="manual" className="text-xs flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" />手动添加
          </TabsTrigger>
        </TabsList>

        {/* ── AI视频生成 Tab ────────────────────────────────────────────────── */}
        <TabsContent value="ai" className="space-y-4">

          {/* Step 1: 选择脚本 */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">1</span>
                选择脚本
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Select value={selectedScriptId} onValueChange={setSelectedScriptId}>
                  <SelectTrigger className="bg-input border-border text-foreground h-9 flex-1">
                    <SelectValue placeholder="选择已生成的脚本..." />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {scripts?.map(s => (
                      <SelectItem key={s.id} value={String(s.id)} className="text-foreground text-sm">
                        {s.title}
                      </SelectItem>
                    ))}
                    {(!scripts || scripts.length === 0) && (
                      <SelectItem value="__none__" disabled className="text-muted-foreground text-xs">
                        暂无脚本，请先在脚本编导页生成
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => {
                    if (!selectedScriptId) { toast.error("请先选择脚本"); return; }
                    storyboardMutation.mutate({ projectId: pid, scriptId: parseInt(selectedScriptId) });
                  }}
                  disabled={!selectedScriptId || storyboardMutation.isPending}
                  className="h-9 whitespace-nowrap"
                >
                  {storyboardMutation.isPending
                    ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />生成中...</>
                    : <><Clapperboard className="w-4 h-4 mr-1.5" />生成分镜头</>
                  }
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Step 2: 分镜头列表 */}
          {shots.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">2</span>
                  分镜头列表
                  <Badge variant="secondary" className="text-xs ml-auto">{selectedShots.size}/{shots.length} 已选</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">勾选要生成视频的分镜头，可为每个镜头添加参考图片</p>
                <div className="space-y-3">
                  {shots.map(shot => {
                    const isSelected = selectedShots.has(shot.shotIndex);
                    const imgUrl = shotImages[shot.shotIndex];
                    const mode = shotImageMode[shot.shotIndex] || "url";
                    return (
                      <div key={shot.shotIndex}
                        className={`rounded-xl border p-3 transition-all cursor-pointer ${isSelected ? "border-primary bg-primary/5" : "border-border bg-secondary/20 hover:border-border/60"}`}
                        onClick={() => toggleShot(shot.shotIndex)}
                      >
                        <div className="flex items-start gap-3">
                          {/* 复选框 */}
                          <div className={`w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors ${isSelected ? "bg-primary border-primary" : "border-muted-foreground"}`}>
                            {isSelected && <CheckCircle className="w-3 h-3 text-primary-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-xs font-semibold text-primary">镜头 {shot.shotIndex}</span>
                              <Badge variant="outline" className="text-xs h-4">{shot.timeRange}</Badge>
                            </div>
                            <p className="text-sm text-foreground mb-1">{shot.description}</p>
                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1"><Video className="w-3 h-3" />{shot.cameraInstruction}</span>
                            </div>
                            {shot.voiceOver && (
                              <p className="text-xs text-muted-foreground mt-1 italic">口播："{shot.voiceOver}"</p>
                            )}
                            {/* 参考图片 */}
                            {isSelected && (
                              <div className="mt-3 space-y-2" onClick={e => e.stopPropagation()}>
                                <p className="text-xs text-muted-foreground font-medium">参考图片（可选）</p>
                                <div className="flex gap-1.5 mb-2">
                                  <button
                                    onClick={() => setShotImageMode(prev => ({ ...prev, [shot.shotIndex]: "url" }))}
                                    className={`text-xs px-2 py-1 rounded border transition-colors ${mode === "url" ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground"}`}
                                  >URL</button>
                                  <button
                                    onClick={() => setShotImageMode(prev => ({ ...prev, [shot.shotIndex]: "upload" }))}
                                    className={`text-xs px-2 py-1 rounded border transition-colors ${mode === "upload" ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground"}`}
                                  >本地上传</button>
                                </div>
                                {mode === "url" ? (
                                  <div className="flex gap-2">
                                    <Input
                                      placeholder="粘贴图片 URL..."
                                      value={imgUrl || ""}
                                      onChange={e => setShotImages(prev => ({ ...prev, [shot.shotIndex]: e.target.value }))}
                                      className="bg-input border-border h-8 text-xs flex-1"
                                    />
                                    {imgUrl && (
                                      <button onClick={() => setShotImages(prev => { const n = { ...prev }; delete n[shot.shotIndex]; return n; })}
                                        className="text-xs text-muted-foreground hover:text-destructive">清除</button>
                                    )}
                                  </div>
                                ) : (
                                  <div>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      ref={fileInputRef}
                                      onChange={async e => {
                                        const file = e.target.files?.[0];
                                        if (file) await handleFileUpload(shot.shotIndex, file);
                                        e.target.value = "";
                                      }}
                                    />
                                    <Button variant="outline" size="sm" className="h-8 text-xs border-border"
                                      onClick={() => fileInputRef.current?.click()}>
                                      <Upload className="w-3 h-3 mr-1.5" />选择图片
                                    </Button>
                                    {imgUrl && <span className="text-xs text-green-400 ml-2">已上传</span>}
                                  </div>
                                )}
                                {imgUrl && mode === "url" && (
                                  <img src={imgUrl} alt="参考图" className="w-20 h-14 object-cover rounded border border-border mt-1" />
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: 生成配置 */}
          {shots.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">3</span>
                  生成配置
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-foreground">素材类型</Label>
                    <Select value={generationConfig.type} onValueChange={v => setGenerationConfig(prev => ({ ...prev, type: v as typeof prev.type }))}>
                      <SelectTrigger className="bg-input border-border h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        {Object.entries(TYPE_CONFIG).map(([v, c]) => (
                          <SelectItem key={v} value={v} className="text-foreground text-xs">{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-foreground">宽高比</Label>
                    <Select value={generationConfig.ratio} onValueChange={v => setGenerationConfig(prev => ({ ...prev, ratio: v as typeof prev.ratio }))}>
                      <SelectTrigger className="bg-input border-border h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        {["9:16", "16:9", "1:1", "3:4", "4:3", "adaptive"].map(r => (
                          <SelectItem key={r} value={r} className="text-foreground text-xs">{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-foreground">时长（秒）</Label>
                    <Select value={String(generationConfig.duration)} onValueChange={v => setGenerationConfig(prev => ({ ...prev, duration: parseInt(v) }))}>
                      <SelectTrigger className="bg-input border-border h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        {[4, 5, 6, 8, 10, 12].map(d => (
                          <SelectItem key={d} value={String(d)} className="text-foreground text-xs">{d}s</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-foreground">分辨率</Label>
                    <Select value={generationConfig.resolution} onValueChange={v => setGenerationConfig(prev => ({ ...prev, resolution: v as typeof prev.resolution }))}>
                      <SelectTrigger className="bg-input border-border h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        {["480p", "720p", "1080p"].map(r => (
                          <SelectItem key={r} value={r} className="text-foreground text-xs">{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="generateAudio"
                    checked={generationConfig.generateAudio}
                    onChange={e => setGenerationConfig(prev => ({ ...prev, generateAudio: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="generateAudio" className="text-xs text-foreground cursor-pointer">生成同步音频（Seedance 1.5 Pro 支持）</Label>
                </div>
                <Button
                  onClick={handleGenerateVideos}
                  disabled={selectedShots.size === 0 || createTaskMutation.isPending}
                  className="w-full h-10 text-sm"
                >
                  {createTaskMutation.isPending
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />提交中...</>
                    : <><Sparkles className="w-4 h-4 mr-2" />生成 {selectedShots.size} 个视频</>
                  }
                </Button>
              </CardContent>
            </Card>
          )}

          {/* 生成中任务 */}
          {generatingTasks.length > 0 && (
            <Card className="bg-card border-border border-blue-400/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                  生成中的任务 ({generatingTasks.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {generatingTasks.map(task => (
                  <div key={task.taskId} className="flex items-center justify-between p-2.5 rounded-lg bg-blue-400/5 border border-blue-400/20">
                    <div>
                      <p className="text-sm text-foreground">{task.shotTitle}</p>
                      <p className="text-xs text-muted-foreground font-mono">{task.taskId}</p>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 text-xs border-border"
                      onClick={() => checkStatusMutation.mutate({ materialId: task.materialId, taskId: task.taskId })}
                      disabled={checkStatusMutation.isPending}
                    >
                      {checkStatusMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <><RefreshCw className="w-3 h-3 mr-1" />查询状态</>}
                    </Button>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">视频通常需要 1-5 分钟生成，可点击"查询状态"检查进度</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── 手动添加 Tab ────────────────────────────────────────────────────── */}
        <TabsContent value="manual">
          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Plus className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">手动添加素材到素材库</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-foreground text-xs">素材标题 *</Label>
                  <Input placeholder="素材描述名称" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                    className="bg-input border-border text-foreground h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-foreground text-xs">素材类型</Label>
                  <Select value={form.type} onValueChange={v => setForm({ ...form, type: v as typeof form.type })}>
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
                  <Input placeholder="https://..." value={form.fileUrl} onChange={e => setForm({ ...form, fileUrl: e.target.value })}
                    className="bg-input border-border text-foreground h-9" />
                </div>
                {form.type === "before_after" && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-foreground text-xs">部位</Label>
                      <Input placeholder="例：眼部、鼻部" value={form.bodyPart} onChange={e => setForm({ ...form, bodyPart: e.target.value })}
                        className="bg-input border-border text-foreground h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-foreground text-xs">手术/项目类型</Label>
                      <Input placeholder="例：双眼皮、填充" value={form.treatmentType} onChange={e => setForm({ ...form, treatmentType: e.target.value })}
                        className="bg-input border-border text-foreground h-9" />
                    </div>
                  </>
                )}
              </div>
              <Button onClick={() => {
                if (!form.title) { toast.error("请填写素材标题"); return; }
                createMaterialMutation.mutate({
                  projectId: pid, title: form.title, type: form.type,
                  fileUrl: form.fileUrl || undefined, tags: form.tags.length > 0 ? form.tags : undefined,
                  bodyPart: form.bodyPart || undefined, treatmentType: form.treatmentType || undefined,
                });
              }} disabled={!form.title || createMaterialMutation.isPending} className="h-9 text-sm">
                <Plus className="w-4 h-4 mr-1.5" />添加素材
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── 素材库列表 ─────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">
            素材库 <span className="text-muted-foreground">({filteredMaterials?.length || 0})</span>
          </h2>
          <Button variant="ghost" size="sm" onClick={() => utils.materials.list.invalidate({ projectId: pid })} className="text-xs text-muted-foreground h-7">
            <RefreshCw className="w-3 h-3 mr-1" />刷新
          </Button>
        </div>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-24 shimmer rounded-xl" />)}
          </div>
        ) : filteredMaterials?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Upload className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>暂无素材，使用上方"AI视频生成"或"手动添加"功能添加素材</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredMaterials?.map(m => {
              const config = TYPE_CONFIG[m.type] || TYPE_CONFIG.other;
              const statusConfig = STATUS_CONFIG[(m.status as string) || "ready"] || STATUS_CONFIG.ready;
              const TypeIcon = config.icon;
              const StatusIcon = statusConfig.icon;
              const mExt = m as typeof m & { seedanceTaskId?: string };
              return (
                <Card key={m.id} className="bg-card border-border hover:border-primary/30 transition-all group">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl ${config.bg} flex items-center justify-center shrink-0`}>
                        <TypeIcon className={`w-5 h-5 ${config.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="text-sm font-medium text-foreground truncate">{m.title}</h3>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className={`text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1 ${statusConfig.color}`}>
                                <StatusIcon className={`w-2.5 h-2.5 ${m.status === "processing" ? "animate-spin" : ""}`} />
                                {statusConfig.label}
                              </span>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${config.bg} ${config.color}`}>{config.label}</span>
                              {mExt.seedanceTaskId && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-violet-400/10 text-violet-400">Seedance</span>
                              )}
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate({ id: m.id })}
                            className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        {/* 视频/文件操作 */}
                        {m.fileUrl && (
                          <div className="flex gap-2 mt-2">
                            <Button size="sm" variant="outline" className="h-7 text-xs border-border"
                              onClick={() => setPreviewVideo({ url: m.fileUrl!, title: m.title })}>
                              <Play className="w-3 h-3 mr-1" />预览
                            </Button>
                            <a href={m.fileUrl} download target="_blank" rel="noopener noreferrer">
                              <Button size="sm" variant="ghost" className="h-7 text-xs">
                                <Download className="w-3 h-3 mr-1" />下载
                              </Button>
                            </a>
                          </div>
                        )}
                        {/* 处理中任务查询 */}
                        {m.status === "processing" && mExt.seedanceTaskId && (
                          <Button size="sm" variant="outline" className="h-7 text-xs border-border mt-2"
                            onClick={() => checkStatusMutation.mutate({ materialId: m.id, taskId: mExt.seedanceTaskId! })}
                            disabled={checkStatusMutation.isPending}
                          >
                            <RefreshCw className="w-3 h-3 mr-1" />查询状态
                          </Button>
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

      {/* 视频预览弹窗 */}
      <Dialog open={!!previewVideo} onOpenChange={() => setPreviewVideo(null)}>
        <DialogContent className="max-w-2xl bg-background border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground text-sm">{previewVideo?.title}</DialogTitle>
          </DialogHeader>
          {previewVideo && (
            <div className="space-y-3">
              <video
                src={previewVideo.url}
                controls
                autoPlay
                className="w-full rounded-lg max-h-96"
              />
              <a href={previewVideo.url} download target="_blank" rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1">
                <ExternalLink className="w-3.5 h-3.5" />在新标签页查看 / 下载
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
