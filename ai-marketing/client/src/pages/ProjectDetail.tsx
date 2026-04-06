import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft,
  BookOpen,
  Brain,
  ClipboardList,
  Share2,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
} from "lucide-react";
import { useLocation } from "wouter";

interface Props {
  id: string;
}

const modules = [
  {
    icon: Target,
    label: "账号定位",
    desc: "AI分析爆款账号特质，精准定位赛道与人设",
    color: "text-purple-400",
    bg: "bg-purple-400/10",
    path: "/positioning",
  },
  {
    icon: TrendingUp,
    label: "选题中台",
    desc: "抓取全网热点爆款，建立专属选题库",
    color: "text-cyan-400",
    bg: "bg-cyan-400/10",
    path: "/topic-hub",
  },
  {
    icon: Sparkles,
    label: "选题生成",
    desc: "结合热点与人设，生成高潜力选题",
    color: "text-pink-400",
    bg: "bg-pink-400/10",
    path: "/topics",
  },
  {
    icon: Brain,
    label: "爆款分析",
    desc: "结构化解析视频内容，提炼可复制爆款因子",
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    path: "/viral-analysis",
  },
  {
    icon: ClipboardList,
    label: "选题策划",
    desc: "基于账号定位与爆款分析结果规划选题方向",
    color: "text-orange-400",
    bg: "bg-orange-400/10",
    path: "/topic-planning",
  },
  {
    icon: BookOpen,
    label: "爆款复刻",
    desc: "基于爆款公式定制化生成高转化脚本",
    color: "text-green-400",
    bg: "bg-green-400/10",
    path: "/scripts",
  },
  {
    icon: Upload,
    label: "素材智造",
    desc: "上传真人素材或AI生成数字人口播",
    color: "text-blue-400",
    bg: "bg-blue-400/10",
    path: "/materials",
  },
  {
    icon: Share2,
    label: "一键分发",
    desc: "一键适配小红书、抖音、Instagram等多平台",
    color: "text-violet-400",
    bg: "bg-violet-400/10",
    path: "/platform",
  },
];

export default function ProjectDetail({ id }: Props) {
  const [, setLocation] = useLocation();
  const projectId = Number.parseInt(id, 10);
  const { data: project, isLoading } = trpc.projects.get.useQuery({
    id: projectId,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 shimmer rounded" />
        <div className="h-24 shimmer rounded-xl" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <div key={i} className="h-36 shimmer rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h3 className="mb-2 text-lg font-semibold text-foreground">
          项目不存在
        </h3>
        <Button onClick={() => setLocation("/projects")} variant="outline">
          返回项目列表
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/projects")}
          className="h-8 w-8 text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {project.description || "AI营销增长项目"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {project.industry && (
          <span className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
            {project.industry}
          </span>
        )}
        {project.platform && (
          <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-sm text-cyan-400">
            {project.platform}
          </span>
        )}
        <span
          className={`rounded-full px-3 py-1 text-sm ${
            project.status === "active"
              ? "bg-green-400/10 text-green-400"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {project.status === "active" ? "进行中" : "已归档"}
        </span>
      </div>

      <div>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          功能模块
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {modules.map((mod, i) => (
            <Card
              key={mod.label}
              onClick={() => setLocation(`/projects/${id}${mod.path}`)}
              className="group cursor-pointer border-border bg-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
            >
              <CardContent className="p-5">
                <div className="mb-3 flex items-start justify-between">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${mod.bg}`}
                  >
                    <mod.icon className={`h-5 w-5 ${mod.color}`} />
                  </div>
                  <span className="font-mono text-xs text-muted-foreground/30">
                    0{i + 1}
                  </span>
                </div>
                <h3 className="mb-1.5 text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                  {mod.label}
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {mod.desc}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
