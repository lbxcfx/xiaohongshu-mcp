import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, BookOpen, Brain, Share2, Sparkles, Target, TrendingUp, Upload } from "lucide-react";
import { useLocation } from "wouter";

interface Props { id: string; }

const modules = [
  { icon: Target, label: "账号定位策划师", desc: "AI分析爆款账号特质，精准定位赛道与人设", color: "text-purple-400", bg: "bg-purple-400/10", path: "/positioning" },
  { icon: TrendingUp, label: "选题信息中台", desc: "抓取全网热点爆款，建立专属选题库", color: "text-cyan-400", bg: "bg-cyan-400/10", path: "/topic-hub" },
  { icon: Sparkles, label: "AI选题生成", desc: "结合热点与人设，生成5条爆款潜质选题", color: "text-pink-400", bg: "bg-pink-400/10", path: "/topics" },
  { icon: Brain, label: "AI爆款因子分析", desc: "360度解析爆款内容，提炼可复制公式", color: "text-amber-400", bg: "bg-amber-400/10", path: "/viral-analysis" },
  { icon: BookOpen, label: "AI脚本编导", desc: "基于爆款公式定制化生成高转化脚本", color: "text-green-400", bg: "bg-green-400/10", path: "/scripts" },
  { icon: Upload, label: "AI素材生成", desc: "上传真人素材或AI生成数字人口播", color: "text-blue-400", bg: "bg-blue-400/10", path: "/materials" },
  { icon: Share2, label: "多平台适配", desc: "一键适配小红书、抖音、Instagram等5大平台", color: "text-violet-400", bg: "bg-violet-400/10", path: "/platform" },
];

export default function ProjectDetail({ id }: Props) {
  const [, setLocation] = useLocation();
  const projectId = parseInt(id);
  const { data: project, isLoading } = trpc.projects.get.useQuery({ id: projectId });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 shimmer rounded" />
        <div className="h-24 shimmer rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1,2,3,4,5,6,7].map(i => <div key={i} className="h-36 shimmer rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h3 className="text-lg font-semibold text-foreground mb-2">项目不存在</h3>
        <Button onClick={() => setLocation("/projects")} variant="outline">返回项目列表</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/projects")} className="h-8 w-8 text-muted-foreground">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{project.description || "AI营销增长项目"}</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {project.industry && <span className="text-sm bg-primary/10 text-primary px-3 py-1 rounded-full">{project.industry}</span>}
        {project.platform && <span className="text-sm bg-cyan-400/10 text-cyan-400 px-3 py-1 rounded-full">{project.platform}</span>}
        <span className={`text-sm px-3 py-1 rounded-full ${project.status === "active" ? "bg-green-400/10 text-green-400" : "bg-muted text-muted-foreground"}`}>
          {project.status === "active" ? "进行中" : "已归档"}
        </span>
      </div>

      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">功能模块</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {modules.map((mod, i) => (
            <Card key={mod.label} onClick={() => setLocation(`/projects/${id}${mod.path}`)}
              className="bg-card border-border hover:border-primary/40 cursor-pointer transition-all group hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl ${mod.bg} flex items-center justify-center`}>
                    <mod.icon className={`w-5 h-5 ${mod.color}`} />
                  </div>
                  <span className="text-xs text-muted-foreground/30 font-mono">0{i + 1}</span>
                </div>
                <h3 className="font-semibold text-foreground text-sm mb-1.5 group-hover:text-primary transition-colors">{mod.label}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{mod.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
