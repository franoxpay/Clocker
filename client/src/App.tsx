import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { LanguageProvider, useLanguage } from "@/contexts/LanguageContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { useAuth } from "@/hooks/useAuth";
import { AppSidebar } from "@/components/AppSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertTriangle, X, MessageCircle } from "lucide-react";
import { useState, Suspense } from "react";

import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import Offers from "@/pages/Offers";
import Domains from "@/pages/Domains";
import Logs from "@/pages/Logs";
import Analytics from "@/pages/Analytics";
import Subscription from "@/pages/Subscription";
import Settings from "@/pages/Settings";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminPlans from "@/pages/admin/AdminPlans";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminMonitoring from "@/pages/admin/AdminMonitoring";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminBilling from "@/pages/admin/AdminBilling";
import AdminDomains from "@/pages/admin/AdminDomains";
import AdminReferrals from "@/pages/admin/AdminReferrals";
import AdminEmails from "@/pages/admin/AdminEmails";
import NotFound from "@/pages/not-found";
import ResetPassword from "@/pages/ResetPassword";

function PageLoadingFallback() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="space-y-4 w-64">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}

function UserRoutes() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoadingFallback />}>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/offers" component={Offers} />
          <Route path="/domains" component={Domains} />
          <Route path="/logs" component={Logs} />
          <Route path="/analytics" component={Analytics} />
          <Route path="/subscription" component={Subscription} />
          <Route path="/settings" component={Settings} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </ErrorBoundary>
  );
}

function AdminRoutes() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoadingFallback />}>
        <Switch>
          <Route path="/confg-admin" component={AdminDashboard} />
          <Route path="/confg-admin/dashboard" component={AdminDashboard} />
          <Route path="/confg-admin/users" component={AdminUsers} />
          <Route path="/confg-admin/plans" component={AdminPlans} />
          <Route path="/confg-admin/billing" component={AdminBilling} />
          <Route path="/confg-admin/domains" component={AdminDomains} />
          <Route path="/confg-admin/monitoring" component={AdminMonitoring} />
          <Route path="/confg-admin/referrals" component={AdminReferrals} />
          <Route path="/confg-admin/emails" component={AdminEmails} />
          <Route path="/confg-admin/settings" component={AdminSettings} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </ErrorBoundary>
  );
}

interface UserUsage {
  clicksThisMonth: number;
  clicksLimit: number | null;
  isUnlimited: boolean;
  gracePeriodEndsAt: string | null;
  isSuspended: boolean;
}

function AuthenticatedLayout() {
  const [location, navigate] = useLocation();
  const { language } = useLanguage();
  const { user } = useAuth();
  const isAdminRoute = location.startsWith("/confg-admin");
  const [dismissedAlert, setDismissedAlert] = useState(false);

  const { data: usage } = useQuery<UserUsage>({
    queryKey: ["/api/user/usage"],
    refetchInterval: 60000,
    enabled: !user?.isAdmin,
  });

  const { data: supportConfig } = useQuery<{ whatsapp: string | null }>({
    queryKey: ["/api/support-whatsapp"],
  });

  const isOverLimit = usage && !usage.isUnlimited && usage.clicksLimit && usage.clicksThisMonth >= usage.clicksLimit;
  const isSuspended = usage?.isSuspended;
  const showLimitAlert = (isOverLimit || isSuspended) && !dismissedAlert && !isAdminRoute;

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
                {supportConfig?.whatsapp && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`https://wa.me/${supportConfig.whatsapp!.replace(/\D/g, '')}`, '_blank')}
                    data-testid="button-support-whatsapp"
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    {language === "pt-BR" ? "Suporte" : "Support"}
                  </Button>
                )}
                <NotificationBell />
                <LanguageToggle />
                <ThemeToggle />
              </div>
            </header>
            {showLimitAlert && (
              <div className="flex items-center justify-between gap-3 px-4 py-2 bg-destructive/10 border-b border-destructive/20" data-testid="alert-click-limit-exceeded">
                <div className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="text-destructive font-medium">
                    {isSuspended 
                      ? (language === "pt-BR" 
                          ? "Sua conta foi suspensa. Faça upgrade para reativar suas ofertas." 
                          : "Your account has been suspended. Upgrade to reactivate your offers.")
                      : (language === "pt-BR" 
                          ? "Você atingiu o limite de cliques do seu plano." 
                          : "You have reached your plan's click limit.")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    size="sm" 
                    variant="destructive"
                    onClick={() => navigate("/subscription")}
                    data-testid="button-upgrade-limit"
                  >
                    {language === "pt-BR" ? "Fazer Upgrade" : "Upgrade Now"}
                  </Button>
                  {!isSuspended && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => setDismissedAlert(true)}
                      data-testid="button-dismiss-limit-alert"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            )}
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

  if (location.startsWith("/reset-password")) {
    return <ResetPassword />;
  }

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
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <LanguageProvider>
            <TooltipProvider>
              <Suspense fallback={<PageLoadingFallback />}>
                <AppContent />
              </Suspense>
              <Toaster />
            </TooltipProvider>
          </LanguageProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
