import { Link, useLocation } from "wouter";
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
} from "lucide-react";
const logoPreta = "/images/logo-dark.png";
const logoBranca = "/images/logo-light.png";

const userNavItems = [
  { key: "dashboard", path: "/", icon: LayoutDashboard, label: "nav.dashboard" },
  { key: "offers", path: "/offers", icon: LinkIcon, label: "nav.offers" },
  { key: "domains", path: "/domains", icon: Globe, label: "nav.domains" },
  { key: "logs", path: "/logs", icon: FileText, label: "nav.logs" },
  { key: "analytics", path: "/analytics", icon: BarChart3, label: "nav.analytics" },
  { key: "settings", path: "/settings", icon: Settings, label: "nav.settings" },
];

const adminNavItems = [
  { key: "users", path: "/confg-admin/users", icon: Users, label: "nav.admin.users" },
  { key: "plans", path: "/confg-admin/plans", icon: CreditCard, label: "nav.admin.plans" },
  { key: "shared-domains", path: "/confg-admin/shared-domains", icon: Globe, label: "nav.admin.sharedDomains" },
  { key: "settings", path: "/confg-admin/settings", icon: Cog, label: "nav.admin.settings" },
];

interface AppSidebarProps {
  isAdmin?: boolean;
}

export function AppSidebar({ isAdmin = false }: AppSidebarProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { theme } = useTheme();
  const [location] = useLocation();

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
            className="h-8 w-auto"
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
      </SidebarContent>

      <SidebarFooter className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="w-9 h-9">
            <AvatarImage
              src={user?.profileImageUrl || undefined}
              alt={user?.email || "User"}
              className="object-cover"
            />
            <AvatarFallback>{getUserInitials()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" data-testid="text-user-email">
              {user?.email}
            </p>
            {getPlanBadge() && (
              <Badge variant="secondary" className="text-xs" data-testid="badge-user-plan">
                {getPlanBadge()}
              </Badge>
            )}
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
