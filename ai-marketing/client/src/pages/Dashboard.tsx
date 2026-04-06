import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  ArrowRight,
  BookOpen,
  Brain,
  ClipboardList,
  FolderOpen,
  BarChart3,
  Share2,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  Zap,
} from "lucide-react";
import { useLocation } from "wouter";

const COLORS = [
  "oklch(0.65 0.22 280)",
  "oklch(0.72 0.18 200)",
  "oklch(0.65 0.22 340)",
  "oklch(0.78 0.18 70)",
  "oklch(0.68 0.18 150)",
];

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const { data: projects } = trpc.projects.list.useQuery();

  const statCards = [
    {
      icon: FolderOpen,
      label: "项目总数",
      value: stats?.projects ?? 0,
      color: "text-purple-400",
      bg: "bg-purple-400/10",
    },
    {
      icon: Sparkles,
      label: "生成选题",
      value: stats?.topics ?? 0,
      color: "text-cyan-400",
      bg: "bg-cyan-400/10",
    },
    {
      icon: BookOpen,
      label: "创作脚本",
      value: stats?.scripts ?? 0,
      color: "text-pink-400",
      bg: "bg-pink-400/10",
    },
    {
      icon: Upload,
      label: "素材数量",
      value: stats?.materials ?? 0,
      color: "text-amber-400",
      bg: "bg-amber-400/10",
    },
    {
      icon: Share2,
      label: "分发适配",
      value: stats?.adaptations ?? 0,
      color: "text-green-400",
      bg: "bg-green-400/10",
    },
    {
      icon: Brain,
      label: "爆款分析",
      value: stats?.analyses ?? 0,
      color: "text-blue-400",
      bg: "bg-blue-400/10",
    },
  ];

  const barData = [
    { name: "选题", value: stats?.topics ?? 0 },
    { name: "脚本", value: stats?.scripts ?? 0 },
    { name: "素材", value: stats?.materials ?? 0 },
    { name: "分发", value: stats?.adaptations ?? 0 },
    { name: "分析", value: stats?.analyses ?? 0 },
  ];

  const pieData = statCards
    .slice(1)
    .map(card => ({ name: card.label, value: Math.max(card.value, 1) }));

  const modules = [
    {
      icon: Target,
      label: "账号定位",
      color: "text-purple-400",
      bg: "bg-purple-400/10",
      path: "/positioning",
    },
    {
      icon: TrendingUp,
      label: "选题中台",
      color: "text-cyan-400",
      bg: "bg-cyan-400/10",
      path: "/topic-hub",
    },
    {
      icon: Sparkles,
      label: "选题生成",
      color: "text-pink-400",
      bg: "bg-pink-400/10",
      path: "/topics",
    },
    {
      icon: Brain,
      label: "爆款分析",
      color: "text-amber-400",
      bg: "bg-amber-400/10",
      path: "/viral-analysis",
    },
    {
      icon: ClipboardList,
      label: "选题策划",
      color: "text-orange-400",
      bg: "bg-orange-400/10",
      path: "/topic-planning",
    },
    {
      icon: BookOpen,
      label: "爆款复刻",
      color: "text-green-400",
      bg: "bg-green-400/10",
      path: "/scripts",
    },
    {
      icon: Upload,
      label: "素材智造",
      color: "text-blue-400",
      bg: "bg-blue-400/10",
      path: "/materials",
    },
    {
      icon: Share2,
      label: "一键分发",
      color: "text-violet-400",
      bg: "bg-violet-400/10",
      path: "/platform",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            欢迎来到 <span className="gradient-text">AI营销增长引擎</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">AI营销增长工作台</p>
        </div>
        <Button
          onClick={() => setLocation("/projects")}
          className="glow-purple"
        >
          <FolderOpen className="mr-2 h-4 w-4" />
          新建项目
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {statCards.map(card => (
          <Card key={card.label} className="border-border bg-card">
            <CardContent className="p-4">
              <div
                className={`mb-3 flex h-8 w-8 items-center justify-center rounded-lg ${card.bg}`}
              >
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
              <div className="text-2xl font-bold text-foreground">
                {isLoading ? (
                  <div className="h-7 w-10 rounded shimmer" />
                ) : (
                  card.value
                )}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {card.label}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="border-border bg-card lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-foreground">
              <BarChart3 className="h-4 w-4 text-primary" />
              内容产出统计
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={barData}
                margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="oklch(0.22 0.02 260)"
                />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "oklch(0.55 0.02 260)", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "oklch(0.55 0.02 260)", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.12 0.018 260)",
                    border: "1px solid oklch(0.22 0.02 260)",
                    borderRadius: "8px",
                    color: "oklch(0.95 0.01 260)",
                  }}
                  cursor={{ fill: "oklch(0.22 0.02 260 / 0.3)" }}
                />
                <Bar
                  dataKey="value"
                  fill="oklch(0.65 0.22 280)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Zap className="h-4 w-4 text-primary" />
              内容分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.12 0.018 260)",
                    border: "1px solid oklch(0.22 0.02 260)",
                    borderRadius: "8px",
                    color: "oklch(0.95 0.01 260)",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-1 grid grid-cols-2 gap-1">
              {pieData.map((item, index) => (
                <div
                  key={item.name}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <div
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: COLORS[index % COLORS.length] }}
                  />
                  {item.name}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {projects && projects.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-foreground">
                <FolderOpen className="h-4 w-4 text-primary" />
                最近项目
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/projects")}
                className="h-7 text-xs text-muted-foreground"
              >
                查看全部
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {projects.slice(0, 3).map(project => (
                <div
                  key={project.id}
                  onClick={() => setLocation(`/projects/${project.id}`)}
                  className="group cursor-pointer rounded-xl border border-border bg-secondary/30 p-4 transition-all hover:border-primary/40"
                >
                  <div className="mb-2 flex items-start justify-between">
                    <h3 className="truncate text-sm font-medium text-foreground transition-colors group-hover:text-primary">
                      {project.name}
                    </h3>
                    <span
                      className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs ${
                        project.status === "active"
                          ? "bg-green-400/10 text-green-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {project.status === "active" ? "进行中" : "已归档"}
                    </span>
                  </div>
                  {project.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {project.description}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {project.industry && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        {project.industry}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          快速访问
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          {modules.map(mod => (
            <button
              key={mod.label}
              onClick={() => {
                const project = projects?.[0];
                if (project) {
                  setLocation(`/projects/${project.id}${mod.path}`);
                } else {
                  setLocation("/projects");
                }
              }}
              className="group rounded-xl border border-border bg-card p-4 text-center transition-all hover:border-primary/40 hover:bg-secondary/30"
            >
              <div
                className={`mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl ${mod.bg}`}
              >
                <mod.icon className={`h-4 w-4 ${mod.color}`} />
              </div>
              <div className="text-xs font-medium text-foreground transition-colors group-hover:text-primary">
                {mod.label}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
