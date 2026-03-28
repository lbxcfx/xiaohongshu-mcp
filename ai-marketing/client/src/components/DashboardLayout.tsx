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
  BarChart3,
  BookOpen,
  Brain,
  ChevronDown,
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
        icon: BookOpen,
        label: "脚本编导",
        path: "/scripts",
        projectRelative: true,
      },
      {
        icon: Upload,
        label: "素材生成",
        path: "/materials",
        projectRelative: true,
      },
      {
        icon: Share2,
        label: "多平台适配",
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
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
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
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const displayName = user?.username || "访客模式，无需登录，直接使用";
  const isLoggedIn = Boolean(user?.is_logged_in);

  const projectMatch = location.match(/^\/projects\/(\d+)/);
  const currentProjectId = projectMatch ? projectMatch[1] : null;

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
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
            <div className="flex items-center gap-3 px-2 w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-sidebar-accent rounded-lg transition-colors shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-sidebar-foreground/60" />
              </button>
              {!isCollapsed && (
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-md bg-primary/20 flex items-center justify-center shrink-0">
                    <Zap className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span className="font-bold text-sm gradient-text truncate">
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
                  <SidebarGroupLabel className="text-xs text-sidebar-foreground/40 uppercase tracking-wider px-2 mb-1">
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
                          className={`h-9 transition-all font-normal ${
                            active
                              ? "bg-primary/15 text-primary"
                              : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                          } ${disabled ? "opacity-40" : ""}`}
                        >
                          <item.icon
                            className={`h-4 w-4 shrink-0 ${active ? "text-primary" : ""}`}
                          />
                          <span className="text-sm">{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroup>
            ))}
          </SidebarContent>

          <SidebarFooter className="p-3 border-t border-sidebar-border">
            {isLoggedIn ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-sidebar-accent transition-colors w-full text-left focus:outline-none">
                    <Avatar className="h-8 w-8 border border-border shrink-0">
                      <AvatarFallback className="text-xs font-medium bg-primary/20 text-primary">
                        {(displayName || "小").slice(0, 1)}
                      </AvatarFallback>
                    </Avatar>
                    {!isCollapsed && (
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate leading-none text-sidebar-foreground">
                          {displayName}
                        </p>
                        <p className="text-xs text-sidebar-foreground/50 truncate mt-1">
                          点击可退出登录
                        </p>
                      </div>
                    )}
                    {!isCollapsed && (
                      <ChevronDown className="h-3.5 w-3.5 text-sidebar-foreground/40 shrink-0" />
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
                className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-sidebar-accent transition-colors w-full text-left focus:outline-none"
              >
                <Avatar className="h-8 w-8 border border-border shrink-0">
                  <AvatarFallback className="text-xs font-medium bg-primary/20 text-primary">
                    G
                  </AvatarFallback>
                </Avatar>
                {!isCollapsed && (
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate leading-none text-sidebar-foreground">
                      {displayName}
                    </p>
                    <p className="text-xs text-sidebar-foreground/50 truncate mt-1">
                      点击前往登录
                    </p>
                  </div>
                )}
              </button>
            )}
          </SidebarFooter>
        </Sidebar>

        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${
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
          <div className="flex border-b border-border h-14 items-center justify-between bg-background/95 px-4 backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg" />
              <span className="font-semibold text-sm">AI营销增长引擎</span>
            </div>
          </div>
        )}
        <main className="flex-1 p-6 min-h-screen">{children}</main>
      </SidebarInset>
    </>
  );
}
