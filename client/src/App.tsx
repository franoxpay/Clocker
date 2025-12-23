import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { useAuth } from "@/hooks/useAuth";
import { AppSidebar } from "@/components/AppSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { Skeleton } from "@/components/ui/skeleton";

import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import Offers from "@/pages/Offers";
import Domains from "@/pages/Domains";
import Logs from "@/pages/Logs";
import Analytics from "@/pages/Analytics";
import Settings from "@/pages/Settings";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminPlans from "@/pages/admin/AdminPlans";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminSharedDomains from "@/pages/admin/AdminSharedDomains";
import NotFound from "@/pages/not-found";

function UserRoutes() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/offers" component={Offers} />
      <Route path="/domains" component={Domains} />
      <Route path="/logs" component={Logs} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AdminRoutes() {
  return (
    <Switch>
      <Route path="/confg-admin" component={AdminUsers} />
      <Route path="/confg-admin/users" component={AdminUsers} />
      <Route path="/confg-admin/plans" component={AdminPlans} />
      <Route path="/confg-admin/shared-domains" component={AdminSharedDomains} />
      <Route path="/confg-admin/settings" component={AdminSettings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedLayout() {
  const [location] = useLocation();
  const isAdminRoute = location.startsWith("/confg-admin");

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <>
      <ImpersonationBanner />
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <AppSidebar isAdmin={isAdminRoute} />
          <div className="flex flex-col flex-1 overflow-hidden">
            <header className="flex items-center justify-between gap-4 p-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <div className="flex items-center gap-1">
                <NotificationBell />
                <LanguageToggle />
                <ThemeToggle />
              </div>
            </header>
            <main className="flex-1 overflow-auto">
              {isAdminRoute ? <AdminRoutes /> : <UserRoutes />}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </>
  );
}

function AppContent() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-4 w-64">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Landing />;
  }

  return <AuthenticatedLayout />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <TooltipProvider>
            <AppContent />
            <Toaster />
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
