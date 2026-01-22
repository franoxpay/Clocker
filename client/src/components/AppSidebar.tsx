import { Link, useLocation } from "wouter";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import {
  LayoutDashboard,
  Link as LinkIcon,
  Globe,
  FileText,
  Settings,
  LogOut,
  Users,
  CreditCard,
  Cog,
  BarChart3,
  ArrowLeft,
  Activity,
  Wallet,
  Trophy,
  ChevronUp,
  ChevronDown,
  Gift,
} from "lucide-react";
const logoPreta = "/images/logo-dark.png";
const logoBranca = "/images/logo-light.png";

const userNavItems = [
  { key: "dashboard", path: "/", icon: LayoutDashboard, label: "nav.dashboard" },
  { key: "offers", path: "/offers", icon: LinkIcon, label: "nav.offers" },
  { key: "domains", path: "/domains", icon: Globe, label: "nav.domains" },
  { key: "logs", path: "/logs", icon: FileText, label: "nav.logs" },
  { key: "analytics", path: "/analytics", icon: BarChart3, label: "nav.analytics" },
  { key: "subscription", path: "/subscription", icon: CreditCard, label: "nav.subscription" },
  { key: "settings", path: "/settings", icon: Settings, label: "nav.settings" },
];

const adminNavItems = [
  { key: "dashboard", path: "/confg-admin/dashboard", icon: LayoutDashboard, label: "nav.admin.dashboard" },
  { key: "users", path: "/confg-admin/users", icon: Users, label: "nav.admin.users" },
  { key: "plans", path: "/confg-admin/plans", icon: CreditCard, label: "nav.admin.plans" },
  { key: "billing", path: "/confg-admin/billing", icon: Wallet, label: "nav.admin.billing" },
  { key: "domains", path: "/confg-admin/domains", icon: Globe, label: "nav.admin.domains" },
  { key: "monitoring", path: "/confg-admin/monitoring", icon: Activity, label: "nav.admin.monitoring" },
  { key: "referrals", path: "/confg-admin/referrals", icon: Gift, label: "nav.admin.referrals" },
  { key: "settings", path: "/confg-admin/settings", icon: Cog, label: "nav.admin.settings" },
];

interface AppSidebarProps {
  isAdmin?: boolean;
}

const MILESTONES = [
  { target: 1000, label: "1K" },
  { target: 10000, label: "10K" },
  { target: 50000, label: "50K" },
  { target: 100000, label: "100K" },
  { target: 250000, label: "250K" },
  { target: 500000, label: "500K" },
  { target: 1000000, label: "1M" },
  { target: 5000000, label: "5M" },
  { target: 10000000, label: "10M" },
];

function formatClickCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return count.toLocaleString();
}

function getNextMilestone(clicks: number) {
  for (const milestone of MILESTONES) {
    if (clicks < milestone.target) {
      return milestone;
    }
  }
  return { target: clicks * 2, label: formatClickCount(clicks * 2) };
}

function getPreviousMilestone(clicks: number) {
  let prev = { target: 0, label: "0" };
  for (const milestone of MILESTONES) {
    if (clicks >= milestone.target) {
      prev = milestone;
    } else {
      break;
    }
  }
  return prev;
}

export function AppSidebar({ isAdmin = false }: AppSidebarProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { theme } = useTheme();
  const [location] = useLocation();
  const [isJourneyOpen, setIsJourneyOpen] = useState(false);

  const { data: clickStats } = useQuery<{ 
    totalClicks: number; 
    monthlyClicksUsed: number; 
    monthlyClicksLimit: number | null;
    isUnlimited: boolean;
  }>({
    queryKey: ["/api/user/click-stats"],
    enabled: !!user && !isAdmin,
    refetchInterval: 60000,
  });

  const navItems = isAdmin ? adminNavItems : userNavItems;
  const groupLabel = isAdmin ? t("nav.admin") : "Menu";

  const getPlanBadge = () => {
    if (!user?.planId) return null;
    const planNames: Record<number, string> = {
      1: "Starter",
      2: "Professional",
      3: "Enterprise",
    };
    return planNames[user.planId] || "Free";
  };

  const getUserInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return "U";
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center">
          <img 
            src={theme === "dark" ? logoBranca : logoPreta} 
            alt="Clerion" 
            className="h-10 w-auto"
          />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{groupLabel}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = isAdmin
                  ? location === item.path
                  : item.path === "/"
                    ? location === "/"
                    : location.startsWith(item.path);

                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link href={item.path} data-testid={`nav-${item.key}`}>
                        <item.icon className="w-4 h-4" />
                        <span>{t(item.label)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {!isAdmin && user?.isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>{t("nav.admin")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link href="/confg-admin" data-testid="nav-admin-panel">
                      <Cog className="w-4 h-4" />
                      <span>Painel Admin</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link href="/" data-testid="nav-back-to-user">
                      <ArrowLeft className="w-4 h-4" />
                      <span>{t("nav.backToUser")}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4">
        {!isAdmin && clickStats && (
          <Collapsible
            open={isJourneyOpen}
            onOpenChange={setIsJourneyOpen}
            className="mb-3"
          >
            <CollapsibleTrigger asChild>
              <button
                className="w-full flex items-center gap-2 p-2 rounded-md hover-elevate text-left"
                data-testid="button-click-journey"
              >
                <div className="p-1.5 rounded-md bg-primary/10">
                  <Trophy className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("clickJourney.title")}
                  </p>
                  <p className="text-sm font-bold" data-testid="text-total-clicks">
                    {formatClickCount(clickStats.totalClicks)} {t("clickJourney.totalClicks")}
                  </p>
                </div>
                {isJourneyOpen ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 px-2">
              {(() => {
                const total = clickStats.totalClicks;
                const nextMilestone = getNextMilestone(total);
                const prevMilestone = getPreviousMilestone(total);
                const progressRange = nextMilestone.target - prevMilestone.target;
                const progressCurrent = total - prevMilestone.target;
                const progressPercent = progressRange > 0 ? Math.min(100, (progressCurrent / progressRange) * 100) : 0;

                const monthlyUsed = clickStats.monthlyClicksUsed;
                const monthlyLimit = clickStats.monthlyClicksLimit;
                const isUnlimited = clickStats.isUnlimited;
                const usagePercent = monthlyLimit ? Math.min(100, (monthlyUsed / monthlyLimit) * 100) : 0;
                
                const getUsageColor = () => {
                  if (isUnlimited) return "text-green-500";
                  if (usagePercent >= 100) return "text-red-500";
                  if (usagePercent >= 80) return "text-orange-500";
                  if (usagePercent >= 50) return "text-yellow-500";
                  return "text-green-500";
                };

                const getProgressColor = () => {
                  if (isUnlimited) return "bg-green-500";
                  if (usagePercent >= 100) return "bg-red-500";
                  if (usagePercent >= 80) return "bg-orange-500";
                  if (usagePercent >= 50) return "bg-yellow-500";
                  return "bg-green-500";
                };

                return (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{prevMilestone.label}</span>
                        <span>{nextMilestone.label}</span>
                      </div>
                      <Progress value={progressPercent} className="h-2" />
                      <p className="text-xs text-center text-primary" data-testid="text-progress">
                        {prevMilestone.label} - {nextMilestone.label} · {Math.round(progressPercent)}% {t("clickJourney.complete")}
                      </p>
                    </div>
                    <div className="p-3 rounded-md bg-muted/50">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <span>{t("clickJourney.monthlyUsage")}</span>
                        <span>/</span>
                        <span className="font-medium text-foreground">{t("clickJourney.limit")}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xl font-bold">
                        <span className={getUsageColor()} data-testid="text-monthly-used">
                          {monthlyUsed.toLocaleString()}
                        </span>
                        <span className="text-muted-foreground">/</span>
                        <span>
                          {isUnlimited ? t("clickJourney.unlimited") : (monthlyLimit?.toLocaleString() ?? "0")}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </CollapsibleContent>
          </Collapsible>
        )}

        <div className="flex items-center gap-3 mb-3">
          <Avatar className="w-9 h-9">
            <AvatarImage
              src={user?.profileImageUrl || undefined}
              alt={user?.firstName || user?.email || "User"}
              className="object-cover"
            />
            <AvatarFallback>{getUserInitials()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" data-testid="text-user-name">
              {user?.firstName && user?.lastName 
                ? `${user.firstName} ${user.lastName}` 
                : user?.email}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start"
          asChild
          data-testid="button-logout"
        >
          <a href="/api/logout">
            <LogOut className="w-4 h-4 mr-2" />
            {t("nav.logout")}
          </a>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
