import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { MousePointerClick, Link as LinkIcon, Globe, TrendingUp, AlertTriangle, AlertCircle, Clock } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";

interface DashboardStats {
  todayClicks: number;
  totalClicks: number;
  activeOffers: number;
  activeDomains: number;
  clicksLast7Days: Array<{
    date: string;
    clicks: number;
    blackClicks: number;
    whiteClicks: number;
  }>;
  clicksByOffer: Array<{
    name: string;
    clicks: number;
  }>;
  clicksByDomain: Array<{
    name: string;
    clicks: number;
  }>;
}

interface UserUsage {
  offersCount: number;
  offersLimit: number | null;
  domainsCount: number;
  domainsLimit: number | null;
  clicksThisMonth: number;
  clicksLimit: number | null;
  isUnlimited: boolean;
  gracePeriodEndsAt: string | null;
  isSuspended: boolean;
  clicksResetDate: string | null;
}

export default function Dashboard() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: usage } = useQuery<UserUsage>({
    queryKey: ["/api/user/usage"],
    refetchInterval: 30000,
  });

  const getClicksPercent = () => {
    if (!usage || usage.isUnlimited || !usage.clicksLimit) return 0;
    return Math.min((usage.clicksThisMonth / usage.clicksLimit) * 100, 100);
  };

  const getProgressColor = () => {
    const percent = getClicksPercent();
    if (percent >= 100) return "bg-destructive";
    if (percent >= 95) return "bg-orange-500";
    if (percent >= 80) return "bg-yellow-500";
    return "bg-primary";
  };

  const formatClicks = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}k`;
    return num.toString();
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return format(date, "dd/MM", { locale: language === "pt-BR" ? ptBR : enUS });
  };

  const statCards = [
    {
      title: t("dashboard.todayClicks"),
      value: stats?.todayClicks ?? 0,
      icon: MousePointerClick,
      color: "text-primary",
    },
    {
      title: t("dashboard.totalClicks"),
      value: stats?.totalClicks ?? 0,
      icon: TrendingUp,
      color: "text-chart-2",
    },
    {
      title: t("dashboard.activeOffers"),
      value: stats?.activeOffers ?? 0,
      icon: LinkIcon,
      color: "text-chart-3",
    },
    {
      title: t("dashboard.activeDomains"),
      value: stats?.activeDomains ?? 0,
      icon: Globe,
      color: "text-chart-4",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold" data-testid="title-dashboard">
          {t("dashboard.title")}
        </h1>
      </div>

      {usage?.isSuspended && (
        <Alert variant="destructive" data-testid="alert-suspended">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{language === "pt-BR" ? "Conta Suspensa" : "Account Suspended"}</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>
              {language === "pt-BR" 
                ? "Sua conta foi suspensa por exceder o limite de cliques. Suas ofertas não estão funcionando." 
                : "Your account has been suspended for exceeding the click limit. Your offers are not working."}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate("/subscription")}
              data-testid="button-upgrade-suspended"
            >
              {language === "pt-BR" ? "Fazer Upgrade" : "Upgrade Now"}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {usage?.gracePeriodEndsAt && !usage?.isSuspended && (
        <Alert variant="destructive" className="border-orange-500 bg-orange-500/10" data-testid="alert-grace-period">
          <Clock className="h-4 w-4 text-orange-500" />
          <AlertTitle className="text-orange-600 dark:text-orange-400">
            {language === "pt-BR" ? "Período de Tolerância" : "Grace Period"}
          </AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>
              {language === "pt-BR" 
                ? `Você excedeu seu limite de cliques. Sua conta será suspensa em ${formatDistanceToNow(new Date(usage.gracePeriodEndsAt), { locale: ptBR, addSuffix: false })}.` 
                : `You have exceeded your click limit. Your account will be suspended in ${formatDistanceToNow(new Date(usage.gracePeriodEndsAt), { locale: enUS, addSuffix: false })}.`}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate("/subscription")}
              data-testid="button-upgrade-grace"
            >
              {language === "pt-BR" ? "Fazer Upgrade Agora" : "Upgrade Now"}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {usage && !usage.isUnlimited && usage.clicksLimit && getClicksPercent() >= 80 && getClicksPercent() < 100 && !usage.gracePeriodEndsAt && (
        <Alert variant="default" className={getClicksPercent() >= 95 ? "border-orange-500 bg-orange-500/10" : "border-yellow-500 bg-yellow-500/10"} data-testid="alert-clicks-warning">
          <AlertTriangle className={`h-4 w-4 ${getClicksPercent() >= 95 ? "text-orange-500" : "text-yellow-500"}`} />
          <AlertTitle className={getClicksPercent() >= 95 ? "text-orange-600 dark:text-orange-400" : "text-yellow-600 dark:text-yellow-400"}>
            {getClicksPercent() >= 95 
              ? (language === "pt-BR" ? "Limite Quase Atingido!" : "Almost at Limit!")
              : (language === "pt-BR" ? "Atenção ao Limite de Cliques" : "Click Limit Warning")}
          </AlertTitle>
          <AlertDescription>
            {language === "pt-BR" 
              ? `Você usou ${getClicksPercent().toFixed(0)}% do seu limite mensal de cliques. Considere fazer upgrade do seu plano.` 
              : `You have used ${getClicksPercent().toFixed(0)}% of your monthly click limit. Consider upgrading your plan.`}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div 
                  className="text-2xl font-bold" 
                  data-testid={`stat-${index}`}
                >
                  {card.value.toLocaleString()}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.clicksChart")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats?.clicksLast7Days ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={formatDate}
                    className="text-xs"
                  />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)",
                    }}
                    labelFormatter={formatDate}
                  />
                  <Line
                    type="monotone"
                    dataKey="clicks"
                    name={language === "pt-BR" ? "Total" : "Total"}
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="blackClicks"
                    name="Black"
                    stroke="hsl(var(--chart-3))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="whiteClicks"
                    name="White"
                    stroke="hsl(var(--chart-4))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.clicksByOffer")}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : stats?.clicksByOffer?.length ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.clicksByOffer.slice(0, 5)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" />
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      className="text-xs"
                      width={100}
                      tickFormatter={(value) => value.length > 12 ? `${value.slice(0, 12)}...` : value}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "var(--radius)",
                      }}
                    />
                    <Bar 
                      dataKey="clicks" 
                      fill="hsl(var(--primary))" 
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                {t("offers.noOffers")}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.clicksByDomain")}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : stats?.clicksByDomain?.length ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.clicksByDomain.slice(0, 5)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" />
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      className="text-xs"
                      width={120}
                      tickFormatter={(value) => value.length > 15 ? `${value.slice(0, 15)}...` : value}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "var(--radius)",
                      }}
                    />
                    <Bar 
                      dataKey="clicks" 
                      fill="hsl(var(--chart-2))" 
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                {t("domains.noDomains")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
