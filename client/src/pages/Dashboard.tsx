import { useState } from "react";
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
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  MousePointerClick,
  Link as LinkIcon,
  TrendingUp,
  AlertTriangle,
  AlertCircle,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";

interface DashboardStats {
  todayClicks: number;
  totalClicks: number;
  totalBlackClicks: number;
  activeOffers: number;
  clicksByPeriod: Array<{
    date: string;
    clicks: number;
    blackClicks: number;
    whiteClicks: number;
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
  subscriptionStatus: string | null;
}

const PERIODS = [
  { label: "7D", value: 7 },
  { label: "14D", value: 14 },
  { label: "30D", value: 30 },
];

export default function Dashboard() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [period, setPeriod] = useState(7);

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats", period],
    queryFn: () =>
      fetch(`/api/dashboard/stats?days=${period}`, { credentials: "include" }).then((r) => r.json()),
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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return format(date, period === 7 ? "dd/MM" : "dd/MM", {
      locale: language === "pt-BR" ? ptBR : enUS,
    });
  };

  const formatNumber = (num: number) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
    return num.toLocaleString();
  };

  const statCards = [
    {
      title: language === "pt-BR" ? "Cliques Totais" : "Total Clicks",
      value: stats?.totalClicks ?? 0,
      icon: TrendingUp,
      color: "text-primary",
      testId: "stat-total-clicks",
    },
    {
      title: language === "pt-BR" ? "Cliques Hoje" : "Clicks Today",
      value: stats?.todayClicks ?? 0,
      icon: MousePointerClick,
      color: "text-chart-2",
      testId: "stat-today-clicks",
    },
    {
      title: language === "pt-BR" ? "Cliques Black" : "Black Clicks",
      value: stats?.totalBlackClicks ?? 0,
      icon: ShieldCheck,
      color: "text-chart-3",
      testId: "stat-black-clicks",
    },
    {
      title: language === "pt-BR" ? "Ofertas Ativas" : "Active Offers",
      value: stats?.activeOffers ?? 0,
      icon: LinkIcon,
      color: "text-chart-4",
      testId: "stat-active-offers",
    },
  ];

  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "var(--radius)",
    fontSize: "0.75rem",
  };

  const labelBlack = language === "pt-BR" ? "Black" : "Black";
  const labelWhite = language === "pt-BR" ? "White" : "White";
  const labelTotal = language === "pt-BR" ? "Total" : "Total";

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
        <Alert
          variant="destructive"
          className="border-orange-500 bg-orange-500/10"
          data-testid="alert-grace-period"
        >
          <Clock className="h-4 w-4 text-orange-500" />
          <AlertTitle className="text-orange-600 dark:text-orange-400">
            {language === "pt-BR" ? "Atenção: Conta Será Suspensa" : "Warning: Account Will Be Suspended"}
          </AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>
              {usage?.subscriptionStatus === "past_due" || usage?.subscriptionStatus === "canceled"
                ? language === "pt-BR"
                  ? `Sua assinatura está pendente. Renove para continuar usando o serviço. Sua conta será suspensa em ${formatDistanceToNow(new Date(usage.gracePeriodEndsAt), { locale: ptBR, addSuffix: false })}.`
                  : `Your subscription is pending. Renew to continue using the service. Your account will be suspended in ${formatDistanceToNow(new Date(usage.gracePeriodEndsAt), { locale: enUS, addSuffix: false })}.`
                : language === "pt-BR"
                ? `Você excedeu seu limite de cliques. Sua conta será suspensa em ${formatDistanceToNow(new Date(usage.gracePeriodEndsAt), { locale: ptBR, addSuffix: false })}.`
                : `You have exceeded your click limit. Your account will be suspended in ${formatDistanceToNow(new Date(usage.gracePeriodEndsAt), { locale: enUS, addSuffix: false })}.`}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/subscription")}
              data-testid="button-upgrade-grace"
            >
              {usage?.subscriptionStatus === "past_due" || usage?.subscriptionStatus === "canceled"
                ? language === "pt-BR"
                  ? "Renovar Assinatura"
                  : "Renew Subscription"
                : language === "pt-BR"
                ? "Fazer Upgrade Agora"
                : "Upgrade Now"}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {usage &&
        !usage.isUnlimited &&
        usage.clicksLimit &&
        getClicksPercent() >= 80 &&
        getClicksPercent() < 100 &&
        !usage.gracePeriodEndsAt && (
          <Alert
            variant="default"
            className={
              getClicksPercent() >= 95
                ? "border-orange-500 bg-orange-500/10"
                : "border-yellow-500 bg-yellow-500/10"
            }
            data-testid="alert-clicks-warning"
          >
            <AlertTriangle
              className={`h-4 w-4 ${getClicksPercent() >= 95 ? "text-orange-500" : "text-yellow-500"}`}
            />
            <AlertTitle
              className={
                getClicksPercent() >= 95
                  ? "text-orange-600 dark:text-orange-400"
                  : "text-yellow-600 dark:text-yellow-400"
              }
            >
              {getClicksPercent() >= 95
                ? language === "pt-BR"
                  ? "Limite Quase Atingido!"
                  : "Almost at Limit!"
                : language === "pt-BR"
                ? "Atenção ao Limite de Cliques"
                : "Click Limit Warning"}
            </AlertTitle>
            <AlertDescription>
              {language === "pt-BR"
                ? `Você usou ${getClicksPercent().toFixed(0)}% do seu limite mensal de cliques. Considere fazer upgrade do seu plano.`
                : `You have used ${getClicksPercent().toFixed(0)}% of your monthly click limit. Consider upgrading your plan.`}
            </AlertDescription>
          </Alert>
        )}

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.testId}>
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
                <div className="text-2xl font-bold" data-testid={card.testId}>
                  {formatNumber(card.value)}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Usage progress bar */}
      {usage && !usage.isUnlimited && usage.clicksLimit && (
        <Card data-testid="card-usage">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {language === "pt-BR" ? "Uso Mensal de Cliques" : "Monthly Click Usage"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={getClicksPercent()} className="h-2" indicatorClassName={getProgressColor()} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{usage.clicksThisMonth.toLocaleString()} {language === "pt-BR" ? "usados" : "used"}</span>
              <span>{usage.clicksLimit.toLocaleString()} {language === "pt-BR" ? "limite" : "limit"}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Area Chart with period selector */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>
            {language === "pt-BR" ? `Cliques — Últimos ${period} Dias` : `Clicks — Last ${period} Days`}
          </CardTitle>
          <div className="flex gap-1" data-testid="period-selector">
            {PERIODS.map((p) => (
              <Button
                key={p.value}
                variant={period === p.value ? "default" : "outline"}
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => setPeriod(p.value)}
                data-testid={`button-period-${p.value}`}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <div className="h-72 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats?.clicksByPeriod ?? []} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradBlack" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradWhite" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-4))" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(var(--chart-4))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    className="text-xs"
                    tick={{ fontSize: 11 }}
                    interval={period === 7 ? 0 : period === 14 ? 1 : 3}
                  />
                  <YAxis className="text-xs" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={formatDate}
                    formatter={(value: number, name: string) => [value.toLocaleString(), name]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "0.75rem", paddingTop: "12px" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="clicks"
                    name={labelTotal}
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#gradTotal)"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="blackClicks"
                    name={labelBlack}
                    stroke="hsl(var(--chart-3))"
                    strokeWidth={2}
                    fill="url(#gradBlack)"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="whiteClicks"
                    name={labelWhite}
                    stroke="hsl(var(--chart-4))"
                    strokeWidth={2}
                    fill="url(#gradWhite)"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
