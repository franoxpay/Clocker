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
  ArrowLeft,
  Activity,
  Wallet,
  Trophy,
  ChevronUp,
  ChevronDown,
  Gift,
  Mail,
} from "lucide-react";

const logoPreta = "/images/logo-dark.png";
const logoBranca = "/images/logo-light.png";

// ─── User navigation: split into semantic groups ───────────────────────────
const userMainItems = [
  { key: "dashboard",    path: "/",            icon: LayoutDashboard, label: "nav.dashboard" },
  { key: "offers",       path: "/offers",       icon: LinkIcon,        label: "nav.offers" },
  { key: "domains",      path: "/domains",      icon: Globe,           label: "nav.domains" },
  { key: "logs",         path: "/logs",         icon: FileText,        label: "nav.logs" },
];

const userAccountItems = [
  { key: "subscription", path: "/subscription", icon: CreditCard,      label: "nav.subscription" },
  { key: "settings",     path: "/settings",     icon: Settings,        label: "nav.settings" },
];

// ─── Admin navigation: split into 3 semantic groups ───────────────────────
const adminOverviewItems = [
  { key: "dashboard",   path: "/confg-admin/dashboard",   icon: LayoutDashboard, label: "nav.admin.dashboard" },
  { key: "monitoring",  path: "/confg-admin/monitoring",  icon: Activity,        label: "nav.admin.monitoring" },
];

const adminUsersItems = [
  { key: "users",       path: "/confg-admin/users",       icon: Users,           label: "nav.admin.users" },
  { key: "billing",     path: "/confg-admin/billing",     icon: Wallet,          label: "nav.admin.billing" },
  { key: "referrals",   path: "/confg-admin/referrals",   icon: Gift,            label: "nav.admin.referrals" },
];

const adminPlatformItems = [
  { key: "plans",       path: "/confg-admin/plans",       icon: CreditCard,      label: "nav.admin.plans" },
  { key: "domains",     path: "/confg-admin/domains",     icon: Globe,           label: "nav.admin.domains" },
  { key: "emails",      path: "/confg-admin/emails",      icon: Mail,            label: "nav.admin.emails" },
  { key: "settings",    path: "/confg-admin/settings",    icon: Cog,             label: "nav.admin.settings" },
];

// ─── Milestone progression ─────────────────────────────────────────────────
const MILESTONES = [
  { target: 1000,     label: "1K" },
  { target: 10000,    label: "10K" },
  { target: 50000,    label: "50K" },
  { target: 100000,   label: "100K" },
  { target: 250000,   label: "250K" },
  { target: 500000,   label: "500K" },
  { target: 1000000,  label: "1M" },
  { target: 5000000,  label: "5M" },
  { target: 10000000, label: "10M" },
];

function formatClickCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
  if (count >= 1000)    return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return count.toLocaleString();
}

function getNextMilestone(clicks: number) {
  for (const m of MILESTONES) {
    if (clicks < m.target) return m;
  }
  return { target: clicks * 2, label: formatClickCount(clicks * 2) };
}

function getPreviousMilestone(clicks: number) {
  let prev = { target: 0, label: "0" };
  for (const m of MILESTONES) {
    if (clicks >= m.target) prev = m;
    else break;
  }
  return prev;
}

// ─── Plan badge config ────────────────────────────────────────────────────
const PLAN_NAMES: Record<number, string> = { 1: "Starter", 2: "Pro", 3: "Enterprise" };

type PlanVariant = "default" | "secondary" | "outline";
const PLAN_VARIANTS: Record<number, PlanVariant> = { 1: "secondary", 2: "default", 3: "default" };

// ─── NavGroup helper ──────────────────────────────────────────────────────
interface NavItem {
  key: string;
  path: string;
  icon: React.ElementType;
  label: string;
}

function NavGroup({
  label,
  items,
  isAdmin,
  location,
  t,
}: {
  label?: string;
  items: NavItem[];
  isAdmin: boolean;
  location: string;
  t: (key: string) => string;
}) {
  return (
    <SidebarGroup>
      {label && <SidebarGroupLabel className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/60 px-3 pt-3 pb-1">{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const isActive = isAdmin
              ? location === item.path
              : item.path === "/"
                ? location === "/" || location === ""
                : location.startsWith(item.path);

            return (
              <SidebarMenuItem key={item.key}>
                <SidebarMenuButton asChild isActive={isActive}>
                  <Link href={item.path} data-testid={`nav-${item.key}`}>
                    <item.icon className="w-4 h-4 shrink-0" />
                    <span>{t(item.label)}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

// ─── Main component ───────────────────────────────────────────────────────
interface AppSidebarProps {
  isAdmin?: boolean;
}

export function AppSidebar({ isAdmin = false }: AppSidebarProps) {
  const { t, language } = useLanguage();
  const isPt = language === "pt-BR";
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

  // ── Derived values ────────────────────────────────────────────────────
  const planName = user?.planId ? (PLAN_NAMES[user.planId] ?? null) : null;
  const planVariant: PlanVariant = user?.planId ? (PLAN_VARIANTS[user.planId] ?? "secondary") : "secondary";

  const getUserInitials = () => {
    if (user?.firstName && user?.lastName) return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    if (user?.email) return user.email[0].toUpperCase();
    return "U";
  };

  const displayName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.email ?? "";

  // Monthly usage metrics
  const monthlyUsed  = clickStats?.monthlyClicksUsed  ?? 0;
  const monthlyLimit = clickStats?.monthlyClicksLimit  ?? null;
  const isUnlimited  = clickStats?.isUnlimited         ?? false;
  const usagePercent = monthlyLimit ? Math.min(100, (monthlyUsed / monthlyLimit) * 100) : 0;

  const getUsageColor = () => {
    if (isUnlimited)          return "text-emerald-500";
    if (usagePercent >= 100)  return "text-red-500";
    if (usagePercent >= 80)   return "text-orange-500";
    if (usagePercent >= 50)   return "text-yellow-500";
    return "text-emerald-500";
  };

  const getProgressColor = () => {
    if (isUnlimited)          return "bg-emerald-500";
    if (usagePercent >= 100)  return "bg-red-500";
    if (usagePercent >= 80)   return "bg-orange-500";
    if (usagePercent >= 50)   return "bg-yellow-500";
    return "bg-emerald-500";
  };

  // Milestone progress
  const totalClicks     = clickStats?.totalClicks ?? 0;
  const nextMilestone   = getNextMilestone(totalClicks);
  const prevMilestone   = getPreviousMilestone(totalClicks);
  const progressRange   = nextMilestone.target - prevMilestone.target;
  const progressCurrent = totalClicks - prevMilestone.target;
  const progressPercent = progressRange > 0 ? Math.min(100, (progressCurrent / progressRange) * 100) : 0;

  return (
    <Sidebar>
      {/* ── Logo ──────────────────────────────────────────────────────── */}
      <SidebarHeader className="p-4">
        <div className="flex items-center">
          <img
            src={theme === "dark" ? logoBranca : logoPreta}
            alt="Cleryon"
            className="h-10 w-auto"
          />
        </div>
      </SidebarHeader>

      {/* ── Navigation ───────────────────────────────────────────────── */}
      <SidebarContent className="py-2">
        {!isAdmin ? (
          <>
            {/* Core work navigation — no label, prominent */}
            <NavGroup
              items={userMainItems}
              isAdmin={false}
              location={location}
              t={t}
            />

            {/* Divider */}
            <div className="mx-3 my-1 h-px bg-sidebar-border/50" />

            {/* Account management */}
            <NavGroup
              label={isPt ? "Conta" : "Account"}
              items={userAccountItems}
              isAdmin={false}
              location={location}
              t={t}
            />

            {/* Admin shortcut (if user is also admin) */}
            {user?.isAdmin && (
              <>
                <div className="mx-3 my-1 h-px bg-sidebar-border/50" />
                <SidebarGroup>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                          <Link href="/confg-admin" data-testid="nav-admin-panel">
                            <Cog className="w-4 h-4 shrink-0" />
                            <span>{isPt ? "Painel Admin" : "Admin Panel"}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </>
            )}
          </>
        ) : (
          <>
            {/* Admin — 3 semantic groups */}
            <NavGroup
              label={isPt ? "Visão Geral" : "Overview"}
              items={adminOverviewItems}
              isAdmin={true}
              location={location}
              t={t}
            />

            <div className="mx-3 my-1 h-px bg-sidebar-border/50" />

            <NavGroup
              label={isPt ? "Usuários" : "Users"}
              items={adminUsersItems}
              isAdmin={true}
              location={location}
              t={t}
            />

            <div className="mx-3 my-1 h-px bg-sidebar-border/50" />

            <NavGroup
              label={isPt ? "Plataforma" : "Platform"}
              items={adminPlatformItems}
              isAdmin={true}
              location={location}
              t={t}
            />

            {/* Back to user panel */}
            <div className="mx-3 my-1 h-px bg-sidebar-border/50" />
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link href="/" data-testid="nav-back-to-user">
                        <ArrowLeft className="w-4 h-4 shrink-0" />
                        <span>{t("nav.backToUser")}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <SidebarFooter className="border-t border-sidebar-border/50 p-3 space-y-3">

        {/* Click Journey — compact always-visible + expandable detail */}
        {!isAdmin && clickStats && (
          <Collapsible open={isJourneyOpen} onOpenChange={setIsJourneyOpen}>
            <CollapsibleTrigger asChild>
              <button
                className="w-full group rounded-lg border border-sidebar-border/60 bg-sidebar-accent/30 hover:bg-sidebar-accent/60 transition-colors p-2.5 text-left"
                data-testid="button-click-journey"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1 rounded-md bg-primary/10 shrink-0">
                    <Trophy className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground leading-none mb-0.5">
                      {t("clickJourney.title")}
                    </p>
                    <p className="text-sm font-bold leading-none" data-testid="text-total-clicks">
                      {formatClickCount(totalClicks)}
                      <span className="text-xs font-normal text-muted-foreground ml-1">{t("clickJourney.totalClicks")}</span>
                    </p>
                  </div>
                  {isJourneyOpen
                    ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                </div>

                {/* Mini progress bar — always visible */}
                <div className="space-y-1">
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{prevMilestone.label}</span>
                    <span className="text-primary font-medium">{Math.round(progressPercent)}%</span>
                    <span>{nextMilestone.label}</span>
                  </div>
                </div>
              </button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="mt-2 rounded-lg border border-sidebar-border/60 bg-sidebar-accent/20 p-3 space-y-3">
                {/* Monthly usage */}
                <div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                    <span>{t("clickJourney.monthlyUsage")}</span>
                    <span className={`font-semibold ${getUsageColor()}`} data-testid="text-monthly-used">
                      {isUnlimited
                        ? t("clickJourney.unlimited")
                        : `${monthlyUsed.toLocaleString()} / ${monthlyLimit?.toLocaleString() ?? "0"}`}
                    </span>
                  </div>
                  {!isUnlimited && monthlyLimit && (
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${getProgressColor()}`}
                        style={{ width: `${usagePercent}%` }}
                      />
                    </div>
                  )}
                  {isUnlimited && (
                    <div className="h-1.5 rounded-full bg-emerald-500/20 overflow-hidden">
                      <div className="h-full w-full rounded-full bg-emerald-500/40" />
                    </div>
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* User info + logout ─────────────────────────────────────── */}
        <div className="flex items-center gap-2.5">
          <Avatar className="w-8 h-8 shrink-0">
            <AvatarImage
              src={user?.profileImageUrl || undefined}
              alt={displayName}
              className="object-cover"
            />
            <AvatarFallback className="text-xs font-semibold">{getUserInitials()}</AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate leading-tight" data-testid="text-user-name">
              {displayName}
            </p>
            {planName && (
              <Badge
                variant={planVariant}
                className="mt-0.5 h-4 px-1.5 text-[10px] font-semibold leading-none"
              >
                {planName}
              </Badge>
            )}
          </div>

          <a
            href="/api/logout"
            className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
            title={t("nav.logout")}
            data-testid="button-logout"
          >
            <LogOut className="w-3.5 h-3.5" />
          </a>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
