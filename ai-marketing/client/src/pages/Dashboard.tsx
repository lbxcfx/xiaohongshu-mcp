import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  CheckCircle2,
  ClipboardList,
  FileText,
  FolderOpen,
  BarChart3,
  Send,
  Share2,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  Video,
  Zap,
} from "lucide-react";
import { useLocation } from "wouter";

const COLORS = [
  "oklch(0.65 0.22 280)",
  "oklch(0.72 0.18 200)",
  "oklch(0.65 0.22 340)",
  "oklch(0.78 0.18 70)",
  "oklch(0.68 0.18 150)",
  "oklch(0.72 0.18 35)",
];

function summarize(value?: string | null, fallback = "暂无内容") {
  const text = String(value || "").trim();
  return text || fallback;
}

function formatDate(value?: string | Date | null) {
  if (!value) return "暂无时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无时间";
  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function calcProgress(counts: {
  positionings: number;
  analyzedVideos: number;
  topicPlans: number;
  scripts: number;
  readyMaterials: number;
  published: number;
}) {
  const steps = [
    counts.positionings > 0,
    counts.analyzedVideos > 0,
    counts.topicPlans > 0,
    counts.scripts > 0,
    counts.readyMaterials > 0,
    counts.published > 0,
  ];
  return Math.round(
    (steps.filter(Boolean).length / Math.max(steps.length, 1)) * 100
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const { data: projects } = trpc.projects.list.useQuery();
  const { data: contentResults, isLoading: resultsLoading } =
    trpc.dashboard.contentResults.useQuery();

  const projectResults = contentResults?.projects ?? [];
  const featuredProject = projectResults[0] ?? null;

  const statCards = [
    {
      icon: FolderOpen,
      label: "项目总数",
      value: stats?.projects ?? 0,
      color: "text-purple-400",
      bg: "bg-purple-400/10",
    },
    {
      icon: Brain,
      label: "AI分析",
      value: stats?.analyses ?? 0,
      color: "text-cyan-400",
      bg: "bg-cyan-400/10",
    },
    {
      icon: ClipboardList,
      label: "选题策划",
      value: stats?.topicPlans ?? 0,
      color: "text-orange-400",
      bg: "bg-orange-400/10",
    },
    {
      icon: BookOpen,
      label: "爆款复刻",
      value: stats?.scripts ?? 0,
      color: "text-pink-400",
      bg: "bg-pink-400/10",
    },
    {
      icon: Video,
      label: "素材视频",
      value: stats?.materials ?? 0,
      color: "text-amber-400",
      bg: "bg-amber-400/10",
    },
    {
      icon: Send,
      label: "分发记录",
      value: stats?.publications ?? 0,
      color: "text-green-400",
      bg: "bg-green-400/10",
    },
  ];

  const barData = [
    { name: "爆款源", value: stats?.topicHubItems ?? 0 },
    { name: "AI分析", value: stats?.analyses ?? 0 },
    { name: "选题", value: stats?.topicPlans ?? 0 },
    { name: "脚本", value: stats?.scripts ?? 0 },
    { name: "视频", value: stats?.materials ?? 0 },
    { name: "发布", value: stats?.publications ?? 0 },
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

  const featuredResults = featuredProject
    ? [
        {
          icon: Target,
          label: "账号定位",
          title: featuredProject.latest.positioning?.title,
          content: featuredProject.latest.positioning?.content,
          path: "/positioning",
          color: "text-purple-400",
        },
        {
          icon: Brain,
          label: "爆款分析",
          title: featuredProject.latest.analyzedVideo?.title,
          content: featuredProject.latest.analyzedVideo?.content,
          path: "/viral-analysis",
          color: "text-cyan-400",
        },
        {
          icon: ClipboardList,
          label: "选题策划",
          title: featuredProject.latest.topicPlan?.title,
          content: featuredProject.latest.topicPlan?.content,
          path: "/topic-planning",
          color: "text-orange-400",
        },
        {
          icon: FileText,
          label: "脚本内容",
          title: featuredProject.latest.script?.title,
          content: featuredProject.latest.script?.content,
          path: "/scripts",
          color: "text-pink-400",
        },
        {
          icon: Video,
          label: "素材视频",
          title: featuredProject.latest.material?.title,
          content: `状态：${featuredProject.latest.material?.status ?? "暂无"}`,
          path: "/materials",
          color: "text-blue-400",
        },
        {
          icon: Send,
          label: "发布结果",
          title: featuredProject.latest.publication?.title,
          content:
            featuredProject.latest.publication?.errorMessage ||
            `状态：${featuredProject.latest.publication?.status ?? "暂无"}`,
          path: "/platform",
          color: "text-green-400",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            内容生产看板 <span className="gradient-text">AI营销增长引擎</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            汇总项目从账号定位、爆款分析、选题策划到素材发布的生成结果。
          </p>
        </div>
        <Button
          onClick={() => setLocation("/projects")}
          className="glow-purple w-full lg:w-auto"
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

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="border-border bg-card xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-foreground">
              <BarChart3 className="h-4 w-4 text-primary" />
              内容生产链路
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
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
              产出分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={72}
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

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <Card className="border-border bg-card xl:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-foreground">
                <FolderOpen className="h-4 w-4 text-primary" />
                项目内容总览
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
            {resultsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(item => (
                  <div key={item} className="h-24 rounded-xl shimmer" />
                ))}
              </div>
            ) : projectResults.length > 0 ? (
              <div className="space-y-3">
                {projectResults.slice(0, 4).map(row => {
                  const progress = calcProgress(row.counts);
                  return (
                    <button
                      key={row.project.id}
                      onClick={() => setLocation(`/projects/${row.project.id}`)}
                      className="group w-full rounded-xl border border-border bg-secondary/30 p-4 text-left transition-all hover:border-primary/40 hover:bg-secondary/50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground transition-colors group-hover:text-primary">
                            {row.project.name}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            {row.project.industry && (
                              <span>{row.project.industry}</span>
                            )}
                            {row.project.platform && (
                              <span>{row.project.platform}</span>
                            )}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className="shrink-0 border-primary/30 text-primary"
                        >
                          {progress}%
                        </Badge>
                      </div>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                        <span>分析 {row.counts.analyzedVideos}</span>
                        <span>选题 {row.counts.topicPlans}</span>
                        <span>发布 {row.counts.published}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                暂无项目内容，先创建项目并生成内容。
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card xl:col-span-3">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                最新生成成果
              </CardTitle>
              {featuredProject && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setLocation(`/projects/${featuredProject.project.id}`)
                  }
                  className="h-7 justify-start text-xs text-muted-foreground md:justify-center"
                >
                  {featuredProject.project.name}
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {featuredProject ? (
              <div className="grid gap-3 md:grid-cols-2">
                {featuredResults.map(item => (
                  <button
                    key={item.label}
                    onClick={() =>
                      setLocation(
                        `/projects/${featuredProject.project.id}${item.path}`
                      )
                    }
                    className="group min-h-32 rounded-xl border border-border bg-secondary/30 p-4 text-left transition-all hover:border-primary/40 hover:bg-secondary/50"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <item.icon className={`h-4 w-4 ${item.color}`} />
                        {item.label}
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                    </div>
                    <div className="mt-3 line-clamp-1 text-sm font-medium text-foreground">
                      {summarize(item.title, "暂无生成结果")}
                    </div>
                    <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                      {summarize(item.content)}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                暂无生成成果。完成爆款分析、选题策划、脚本和素材生成后会在这里展示。
              </div>
            )}
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
                    <span className="text-xs text-muted-foreground">
                      {formatDate(project.updatedAt)}
                    </span>
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
