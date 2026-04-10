import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Archive,
  ArrowRight,
  FolderOpen,
  MoreVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { useLocation } from "wouter";

type ProjectForm = {
  name: string;
  description: string;
  industry: string;
  platform: string;
};

const emptyForm: ProjectForm = {
  name: "",
  description: "",
  industry: "",
  platform: "",
};

export default function Projects() {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ProjectForm>(emptyForm);
  const utils = trpc.useUtils();

  const { data: projects, isLoading } = trpc.projects.list.useQuery();
  const projectList = projects ?? [];

  const createMutation = trpc.projects.create.useMutation({
    onSuccess: async project => {
      await utils.projects.list.invalidate();
      setOpen(false);
      setForm(emptyForm);
      toast.success("项目创建成功");
      if (project?.id) {
        setLocation(`/projects/${project.id}`);
      }
    },
    onError: () => toast.error("创建失败，请重试"),
  });

  const deleteMutation = trpc.projects.delete.useMutation({
    onSuccess: async () => {
      await utils.projects.list.invalidate();
      toast.success("项目已删除");
    },
  });

  const archiveMutation = trpc.projects.update.useMutation({
    onSuccess: async () => {
      await utils.projects.list.invalidate();
      toast.success("项目已归档");
    },
  });

  const openProject = (projectId: number) => {
    setLocation(`/projects/${projectId}`);
  };

  const handleCreate = () => {
    createMutation.mutate(form);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">我的项目</h1>
          <p className="text-muted-foreground text-sm mt-1">
            管理你的所有营销项目
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="glow-purple">
              <Plus className="w-4 h-4 mr-2" />
              新建项目
            </Button>
          </DialogTrigger>

          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">创建新项目</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label className="text-foreground text-sm">项目名称 *</Label>
                <Input
                  placeholder="例如：美业账号运营项目"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="bg-input border-border text-foreground"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-foreground text-sm">项目描述</Label>
                <Textarea
                  placeholder="简要描述项目目标和背景..."
                  value={form.description}
                  onChange={e =>
                    setForm({ ...form, description: e.target.value })
                  }
                  className="bg-input border-border text-foreground resize-none"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-foreground text-sm">行业赛道</Label>
                  <Input
                    placeholder="例如：医美/美妆/健康"
                    value={form.industry}
                    onChange={e =>
                      setForm({ ...form, industry: e.target.value })
                    }
                    className="bg-input border-border text-foreground"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-foreground text-sm">主要平台</Label>
                  <Input
                    placeholder="例如：小红书/抖音"
                    value={form.platform}
                    onChange={e =>
                      setForm({ ...form, platform: e.target.value })
                    }
                    className="bg-input border-border text-foreground"
                  />
                </div>
              </div>

              <Button
                onClick={handleCreate}
                disabled={!form.name || createMutation.isPending}
                className="w-full"
              >
                {createMutation.isPending ? "创建中..." : "创建项目"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(item => (
            <div key={item} className="h-40 rounded-xl shimmer" />
          ))}
        </div>
      ) : projectList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <FolderOpen className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            还没有项目
          </h3>
          <p className="text-muted-foreground text-sm mb-6 max-w-sm">
            创建你的第一个营销项目，开始 AI 驱动的内容创作之旅
          </p>
          <Button onClick={() => setOpen(true)} className="glow-purple">
            <Plus className="w-4 h-4 mr-2" />
            创建第一个项目
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projectList.map(project => (
            <Card
              key={project.id}
              className="bg-card border-border hover:border-primary/40 transition-all group cursor-pointer"
              onClick={() => openProject(project.id)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3 gap-3">
                  <div className="flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        openProject(project.id);
                      }}
                      className="font-semibold text-foreground group-hover:text-primary transition-colors truncate text-left w-full"
                    >
                      {project.name}
                    </button>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${
                        project.status === "active"
                          ? "bg-green-400/10 text-green-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {project.status === "active" ? "进行中" : "已归档"}
                    </span>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      asChild
                      onClick={e => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent
                      align="end"
                      className="bg-popover border-border"
                    >
                      <DropdownMenuItem
                        onClick={e => {
                          e.stopPropagation();
                          archiveMutation.mutate({
                            id: project.id,
                            status: "archived",
                          });
                        }}
                        className="text-foreground cursor-pointer"
                      >
                        <Archive className="w-4 h-4 mr-2" />
                        归档项目
                      </DropdownMenuItem>

                      <DropdownMenuItem
                        onClick={e => {
                          e.stopPropagation();
                          deleteMutation.mutate({ id: project.id });
                        }}
                        className="text-destructive cursor-pointer focus:text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        删除项目
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {project.description ? (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                    {project.description}
                  </p>
                ) : null}

                <div className="flex gap-2 flex-wrap mb-4">
                  {project.industry ? (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      {project.industry}
                    </span>
                  ) : null}
                  {project.platform ? (
                    <span className="text-xs bg-cyan-400/10 text-cyan-400 px-2 py-0.5 rounded-full">
                      {project.platform}
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {new Date(project.createdAt).toLocaleDateString("zh-CN")}
                  </span>
                  <span className="text-xs text-primary flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    进入项目
                    <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* 新建项目引导卡 */}
          <Card
            className="border-2 border-dashed border-border/50 bg-transparent hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-all group"
            onClick={() => setOpen(true)}
          >
            <CardContent className="p-5 flex flex-col items-center justify-center min-h-[160px] gap-3">
              <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <Plus className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <span className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">
                新建项目
              </span>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
