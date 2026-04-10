import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import {
  BookOpen,
  Brain,
  ChevronDown,
  ClipboardList,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  PanelLeft,
  Share2,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  Zap,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";

type NavItem = {
  icon: React.ElementType;
  label: string;
  path: string;
  projectRelative?: boolean;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    label: "工作台",
    items: [
      { icon: LayoutDashboard, label: "数据看板", path: "/dashboard" },
      { icon: FolderOpen, label: "我的项目", path: "/projects" },
    ],
  },
  {
    label: "AI 功能模块",
    items: [
      {
        icon: Target,
        label: "账号定位",
        path: "/positioning",
        projectRelative: true,
      },
      {
        icon: TrendingUp,
        label: "选题中台",
        path: "/topic-hub",
        projectRelative: true,
      },
      {
        icon: Sparkles,
        label: "选题生成",
        path: "/topics",
        projectRelative: true,
      },
      {
        icon: Brain,
        label: "爆款分析",
        path: "/viral-analysis",
        projectRelative: true,
      },
      {
        icon: ClipboardList,
        label: "选题策划",
        path: "/topic-planning",
        projectRelative: true,
      },
      {
        icon: BookOpen,
        label: "爆款复刻",
        path: "/scripts",
        projectRelative: true,
      },
      {
        icon: Upload,
        label: "素材智造",
        path: "/materials",
        projectRelative: true,
      },
      {
        icon: Share2,
        label: "一键分发",
        path: "/platform",
        projectRelative: true,
      },
    ],
  },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? Number.parseInt(saved, 10) : DEFAULT_WIDTH;
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  return (
    <SidebarProvider
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
}) {
  const { user, loading, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const isLoggedIn = Boolean(user?.is_logged_in);
  const isReady = !loading;
  const displayName = loading
    ? "读取账号中..."
    : isLoggedIn
      ? user?.username || "小红书用户"
      : "前往登录小红书";

  const projectMatch = location.match(/^\/projects\/(\d+)/);
  const currentProjectId = projectMatch ? projectMatch[1] : null;

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = event.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => setIsResizing(false);

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  const getNavPath = (item: NavItem) => {
    if (item.projectRelative && currentProjectId) {
      return `/projects/${currentProjectId}${item.path}`;
    }
    return item.path;
  };

  const isActive = (item: NavItem) => {
    const navPath = getNavPath(item);
    return location === navPath || location.startsWith(`${navPath}/`);
  };

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r border-sidebar-border bg-sidebar"
        >
          <SidebarHeader className="h-16 justify-center border-b border-sidebar-border">
            <div className="flex w-full items-center gap-3 px-2">
              <button
                onClick={toggleSidebar}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-sidebar-accent"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-sidebar-foreground/60" />
              </button>
              {!isCollapsed && (
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/20">
                    <Zap className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <span className="truncate text-sm font-bold gradient-text">
                    AI营销增长引擎
                  </span>
                </div>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 py-2">
            {navSections.map(section => (
              <SidebarGroup key={section.label} className="px-2 py-1">
                {!isCollapsed && (
                  <SidebarGroupLabel className="mb-1 px-2 text-xs uppercase tracking-wider text-sidebar-foreground/55">
                    {section.label}
                  </SidebarGroupLabel>
                )}
                <SidebarMenu>
                  {section.items.map(item => {
                    const active = isActive(item);
                    const navPath = getNavPath(item);
                    const disabled = item.projectRelative && !currentProjectId;

                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          isActive={active}
                          onClick={() => {
                            if (disabled) {
                              setLocation("/projects");
                              return;
                            }
                            setLocation(navPath);
                          }}
                          tooltip={item.label}
                          className={`h-9 font-normal transition-all ${
                            active
                              ? "bg-primary/15 text-primary"
                              : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                          } ${disabled ? "opacity-35" : ""}`}
                        >
                          <item.icon
                            className={`h-4 w-4 shrink-0 ${active ? "text-primary" : ""}`}
                          />
                          <span className="text-[13.5px]">{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroup>
            ))}
          </SidebarContent>

          <SidebarFooter className="border-t border-sidebar-border p-3">
            {!isReady ? (
              <div className="flex w-full items-center gap-3 rounded-lg px-2 py-2">
                <Avatar className="h-8 w-8 shrink-0 border border-border">
                  <AvatarFallback className="bg-primary/20 text-xs font-medium text-primary">
                    ...
                  </AvatarFallback>
                </Avatar>
                {!isCollapsed && (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-none text-sidebar-foreground">
                      {displayName}
                    </p>
                    <p className="mt-1 truncate text-xs text-sidebar-foreground/50">
                      正在同步登录状态
                    </p>
                  </div>
                )}
              </div>
            ) : isLoggedIn ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sidebar-accent focus:outline-none">
                    <Avatar className="h-8 w-8 shrink-0 border border-border">
                      <AvatarFallback className="bg-primary/20 text-xs font-medium text-primary">
                        {(displayName || "小").slice(0, 1)}
                      </AvatarFallback>
                    </Avatar>
                    {!isCollapsed && (
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium leading-none text-sidebar-foreground">
                          {displayName}
                        </p>
                        <p className="mt-1 truncate text-xs text-sidebar-foreground/50">
                          点击可退出登录
                        </p>
                      </div>
                    )}
                    {!isCollapsed && (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/40" />
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="cursor-pointer text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    退出登录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <button
                onClick={() => setLocation("/")}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sidebar-accent focus:outline-none"
              >
                <Avatar className="h-8 w-8 shrink-0 border border-border">
                  <AvatarFallback className="bg-primary/20 text-xs font-medium text-primary">
                    G
                  </AvatarFallback>
                </Avatar>
                {!isCollapsed && (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-none text-sidebar-foreground">
                      {displayName}
                    </p>
                    <p className="mt-1 truncate text-xs text-sidebar-foreground/50">
                      点击前往登录
                    </p>
                  </div>
                )}
              </button>
            )}
          </SidebarFooter>
        </Sidebar>

        <div
          className={`absolute right-0 top-0 h-full w-1 cursor-col-resize transition-colors hover:bg-primary/20 ${
            isCollapsed ? "hidden" : ""
          }`}
          onMouseDown={() => {
            if (!isCollapsed) setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset className="bg-background">
        {isMobile && (
          <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg" />
              <span className="text-sm font-semibold">AI营销增长引擎</span>
            </div>
          </div>
        )}
        <main className="min-h-screen flex-1 p-6">{children}</main>
      </SidebarInset>
    </>
  );
}
