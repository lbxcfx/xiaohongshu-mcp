import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Brain,
  Share2,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  Zap,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { XhsLoginDialog } from "@/components/XhsLoginDialog";

const features = [
  {
    icon: Target,
    color: "text-purple-400",
    bg: "bg-purple-400/10",
    title: "账号定位",
    desc: "分析赛道、用户和人设，快速确定内容方向。",
  },
  {
    icon: TrendingUp,
    color: "text-cyan-400",
    bg: "bg-cyan-400/10",
    title: "选题中台",
    desc: "统一管理热点、爆款和人工采集的内容线索。",
  },
  {
    icon: Sparkles,
    color: "text-pink-400",
    bg: "bg-pink-400/10",
    title: "选题生成",
    desc: "结合行业信息生成高潜力选题和执行建议。",
  },
  {
    icon: Brain,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    title: "爆款分析",
    desc: "拆解标题、结构、节奏和互动点，提炼复用方法。",
  },
  {
    icon: BookOpen,
    color: "text-green-400",
    bg: "bg-green-400/10",
    title: "脚本编导",
    desc: "根据人设和选题生成可直接执行的脚本。",
  },
  {
    icon: Upload,
    color: "text-blue-400",
    bg: "bg-blue-400/10",
    title: "素材生成",
    desc: "支持素材管理和 AI 辅助生成，提高生产效率。",
  },
  {
    icon: Share2,
    color: "text-violet-400",
    bg: "bg-violet-400/10",
    title: "多平台适配",
    desc: "一键适配不同平台的内容结构和表达方式。",
  },
  {
    icon: BarChart3,
    color: "text-rose-400",
    bg: "bg-rose-400/10",
    title: "数据看板",
    desc: "查看模块使用情况和内容产出节奏。",
  },
];

const workflow = [
  { step: "01", title: "账号定位", desc: "明确赛道、人设和变现方式。" },
  { step: "02", title: "选题策划", desc: "基于热点和爆款提炼高潜力主题。" },
  { step: "03", title: "爆款拆解", desc: "分析结构、表达和互动设计。" },
  { step: "04", title: "脚本生成", desc: "按目标平台生成可执行脚本。" },
  { step: "05", title: "素材生成", desc: "整理真实素材并接入 AI 生成能力。" },
  { step: "06", title: "平台适配", desc: "适配不同平台的标题、文案和节奏。" },
];

export default function Home() {
  const [, setLocation] = useLocation();
  const [loginOpen, setLoginOpen] = useState(false);
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user?.is_logged_in) {
      setLocation("/dashboard");
    }
  }, [loading, setLocation, user?.is_logged_in]);

  const openLoginDialog = () => {
    if (loading) return;
    if (user?.is_logged_in) {
      setLocation("/dashboard");
      return;
    }
    setLoginOpen(true);
  };

  const loginLabel = loading ? "检测登录状态..." : "请登录";

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            <span className="font-bold text-lg gradient-text">AI 营销增长引擎</span>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={openLoginDialog} size="sm" disabled={loading}>
              {loginLabel}
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </nav>

      <section className="relative pt-32 pb-24 px-6">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-cyan-500/5 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm font-medium mb-8">
            <Sparkles className="w-3.5 h-3.5" />
            AI 驱动的一站式内容生产平台
          </div>

          <h1 className="text-5xl md:text-7xl font-bold leading-tight mb-6">
            <span className="gradient-text">AI 营销增长引擎</span>
            <br />
            <span className="text-foreground/90 text-4xl md:text-5xl">
              让爆款内容可复制、可规模化
            </span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            进入前会先检测当前登录状态。已登录直接进入工作台，未登录才打开小红书官网登录页。
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              onClick={openLoginDialog}
              size="lg"
              disabled={loading}
              className="glow-purple text-base px-8 h-12"
            >
              <Zap className="w-4 h-4 mr-2" />
              {loginLabel}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>

          <div className="mt-16 grid grid-cols-3 gap-8 max-w-lg mx-auto">
            {[
              { value: "7", label: "AI 功能模块" },
              { value: "5", label: "适配平台" },
              { value: "∞", label: "内容可能性" },
            ].map(stat => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl font-bold gradient-text">{stat.value}</div>
                <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              全链路 <span className="gradient-text">AI 内容生产</span> 工作流
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              从内容定位到平台适配，每个环节都由 AI 辅助，提高创作效率和执行稳定性。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((feature, index) => (
              <div
                key={feature.title}
                className="group relative p-6 rounded-2xl border border-border bg-card hover:border-primary/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5"
              >
                <div className={`w-10 h-10 rounded-xl ${feature.bg} flex items-center justify-center mb-4`}>
                  <feature.icon className={`w-5 h-5 ${feature.color}`} />
                </div>
                <h3 className="font-semibold text-foreground mb-2 text-sm">{feature.title}</h3>
                <p className="text-muted-foreground text-xs leading-relaxed">{feature.desc}</p>
                <div className="absolute top-4 right-4 text-xs text-muted-foreground/30 font-mono">
                  0{index + 1}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-6 border-t border-border/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold mb-4">
              <span className="gradient-text">6 步工作流</span>，从零到发布
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {workflow.map(item => (
              <div key={item.step} className="flex gap-4 p-5 rounded-xl border border-border bg-card">
                <div className="text-2xl font-bold gradient-text shrink-0 font-mono">{item.step}</div>
                <div>
                  <h3 className="font-semibold text-foreground mb-1">{item.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <div className="p-10 rounded-3xl border border-primary/20 bg-primary/5 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-cyan-500/10 pointer-events-none" />
            <div className="relative">
              <h2 className="text-3xl font-bold mb-4 gradient-text">开始你的 AI 内容增长之旅</h2>
              <p className="text-muted-foreground mb-8">
                点击后先检测当前状态。已登录直接进入 dashboard，未登录才打开小红书官网登录页。
              </p>
              <Button
                onClick={openLoginDialog}
                size="lg"
                disabled={loading}
                className="glow-purple px-10 h-12 text-base"
              >
                <Zap className="w-4 h-4 mr-2" />
                {loginLabel}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <XhsLoginDialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onSuccess={() => setLocation("/dashboard")}
      />

      <footer className="border-t border-border/50 py-8 px-6 text-center text-muted-foreground text-sm">
        <p>© 2025 AI 营销增长引擎 · 一站式内容生产平台</p>
      </footer>
    </div>
  );
}
