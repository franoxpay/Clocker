import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  BarChart,
  Bar,
  Cell,
} from "recharts";
import {
  Link as LinkIcon,
  TrendingUp,
  AlertTriangle,
  AlertCircle,
  Clock,
  ShieldCheck,
  Monitor,
  Smartphone,
  Globe,
  Search,
  Info,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";
import type { Offer } from "@shared/schema";

interface DashboardStats {
  todayClicks: number;
  totalClicks: number;
  totalBlackClicks: number;
  activeOffers: number;
  useHourly: boolean;
  clicksByPeriod: Array<{
    date: string;
    clicks: number;
    blackClicks: number;
    whiteClicks: number;
  }>;
}

interface BreakdownItem {
  name: string;
  black: number;
  white: number;
  total: number;
}

interface OfferBreakdownItem {
  offerId: number;
  offerName: string;
  total: number;
  black: number;
  white: number;
  blackRate: number;
}

interface DashboardBreakdown {
  byDevice: BreakdownItem[];
  byOS: BreakdownItem[];
  byBrowser: BreakdownItem[];
  byOffer: OfferBreakdownItem[];
}

interface FailReasonData {
  total: number;
  white: number;
  black: number;
  byReason: Array<{ reason: string; count: number; pct: number }>;
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

type BreakdownFilter = "total" | "black" | "white";

const FAIL_REASON_LABELS: Record<string, { pt: string; en: string; severity: "critical" | "high" | "medium" | "low" }> = {
  missing_facebook_params: { pt: "Parâmetros do Facebook ausentes (fbcl/xcode)", en: "Missing Facebook params (fbcl/xcode)", severity: "critical" },
  missing_ttclid: { pt: "ttclid ausente (TikTok)", en: "Missing ttclid (TikTok)", severity: "critical" },
  missing_utm_medium: { pt: "utm_medium ausente", en: "Missing utm_medium", severity: "high" },
  missing_utm_content: { pt: "utm_content ausente", en: "Missing utm_content", severity: "high" },
  missing_utm_campaign: { pt: "utm_campaign ausente", en: "Missing utm_campaign", severity: "high" },
  missing_xcode: { pt: "xcode ausente na URL", en: "Missing xcode in URL", severity: "high" },
  invalid_xcode: { pt: "xcode inválido/incorreto", en: "Invalid/incorrect xcode", severity: "high" },
  invalid_fbcl_format: { pt: "Formato do fbclid inválido", en: "Invalid fbclid format", severity: "medium" },
  datacenter_ip: { pt: "IP de datacenter (bot/servidor)", en: "Datacenter IP (bot/server)", severity: "low" },
  proxy_ip: { pt: "IP de proxy/VPN", en: "Proxy/VPN IP", severity: "low" },
  bot_detected: { pt: "User-Agent de bot detectado", en: "Bot user-agent detected", severity: "low" },
  rate_limited: { pt: "IP com excesso de cliques/min", en: "IP rate limited", severity: "low" },
  fake_chrome_version: { pt: "Versão fake do Chrome", en: "Fake Chrome version", severity: "low" },
  "ua_typo:Bulid": { pt: "User-Agent com typo (Bulid)", en: "UA typo (Bulid)", severity: "low" },
  unresolved_macro: { pt: "Macro não substituída pelo ad server", en: "Unresolved tracking macro", severity: "medium" },
  unknown: { pt: "Motivo não registrado", en: "Reason not logged", severity: "low" },
};

const FAIL_REASON_TIPS: Record<string, { pt: string; en: string }> = {
  missing_facebook_params: {
    pt: "Usuários reais do Facebook estão chegando sem fbcl ou xcode. Verifique se a URL da campanha contém ?fbcl={{fbclid}}&xcode=SEU_XCODE e se não há redirecionamentos intermediários que removem os parâmetros.",
    en: "Real Facebook users are arriving without fbcl or xcode. Check that your campaign URL contains ?fbcl={{fbclid}}&xcode=YOUR_XCODE and that no intermediate redirects strip the params.",
  },
  invalid_xcode: {
    pt: "O xcode na URL não bate com o registrado na oferta. Copie o xcode exato da página de configuração da oferta e cole na URL do anúncio.",
    en: "The xcode in the URL doesn't match the one saved for this offer. Copy the exact xcode from the offer settings and paste it in your ad URL.",
  },
  missing_xcode: {
    pt: "O xcode não está presente na URL. Adicione &xcode=SEU_XCODE ao final da URL do anúncio.",
    en: "xcode is not present in the URL. Add &xcode=YOUR_XCODE to the end of your ad URL.",
  },
  missing_ttclid: {
    pt: "Cliques do TikTok chegando sem ttclid. Verifique se o pixel TikTok está ativo e se a URL usa o macro {{ttclid}}.",
    en: "TikTok clicks arriving without ttclid. Make sure the TikTok pixel is active and your URL uses the {{ttclid}} macro.",
  },
  invalid_fbcl_format: {
    pt: "O fbclid tem formato inválido. Isso pode ocorrer quando o link é compartilhado fora do Facebook — o fbclid original é modificado.",
    en: "fbclid has an invalid format. This can happen when the link is shared outside Facebook — the original fbclid gets modified.",
  },
  missing_utm_medium: {
    pt: "utm_medium ausente. Adicione utm_medium=paid (ou o valor correto) à URL da campanha no Ads Manager.",
    en: "utm_medium missing. Add utm_medium=paid (or the correct value) to your campaign URL in Ads Manager.",
  },
};

function BreakdownPanel({
  title,
  icon: Icon,
  data,
  isLoading,
  isPt,
}: {
  title: string;
  icon: React.ElementType;
  data: BreakdownItem[];
  isLoading: boolean;
  isPt: boolean;
}) {
  const [filter, setFilter] = useState<BreakdownFilter>("total");

  const getValue = (item: BreakdownItem) => {
    if (filter === "black") return item.black;
    if (filter === "white") return item.white;
    return item.total;
  };

  const maxVal = Math.max(...data.map(getValue), 1);

  const filterButtons: { key: BreakdownFilter; label: string }[] = [
    { key: "total", label: isPt ? "Total" : "Total" },
    { key: "black", label: "Black" },
    { key: "white", label: "White" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Icon className="w-4 h-4 text-muted-foreground" />
            {title}
          </CardTitle>
          <div className="flex gap-1">
            {filterButtons.map((btn) => (
              <button
                key={btn.key}
                onClick={() => setFilter(btn.key)}
                data-testid={`breakdown-filter-${btn.key}`}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors border ${
                  filter === btn.key
                    ? btn.key === "black"
                      ? "bg-chart-3/20 border-chart-3 text-chart-3"
                      : btn.key === "white"
                      ? "bg-chart-4/20 border-chart-4 text-chart-4"
                      : "bg-primary/20 border-primary text-primary"
                    : "border-input bg-background text-muted-foreground hover:bg-accent"
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {isPt ? "Sem dados para o período" : "No data for this period"}
          </p>
        ) : (
          <div className="space-y-2.5">
            {data.map((item) => {
              const val = getValue(item);
              const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
              const blackPct = val > 0 ? Math.round((item.black / (filter === "total" ? item.total : val)) * 100) : 0;

              return (
                <div key={item.name} className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-medium truncate max-w-[60%]">{item.name}</span>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      {filter === "total" && (
                        <span className="text-chart-3 font-medium">{blackPct}% black</span>
                      )}
                      <span className="font-semibold text-foreground">{val.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    {filter === "total" ? (
                      <div className="h-full flex">
                        <div
                          className="h-full bg-chart-3 transition-all duration-300"
                          style={{ width: `${(item.black / maxVal) * 100}%` }}
                        />
                        <div
                          className="h-full bg-chart-4 transition-all duration-300"
                          style={{ width: `${(item.white / maxVal) * 100}%` }}
                        />
                      </div>
                    ) : (
                      <div
                        className={`h-full transition-all duration-300 ${
                          filter === "black" ? "bg-chart-3" : "bg-chart-4"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
            {filter === "total" && data.length > 0 && (
              <div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-chart-3" /> Black
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-chart-4" /> White
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { t, language } = useLanguage();
  const isPt = language === "pt-BR";
  const locale = isPt ? ptBR : enUS;
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const [filters, setFilters] = useState({
    offerId: "",
    platform: "",
    dateRange: "today",
    startDate: "",
    endDate: "",
  });

  const { data: offers = [] } = useQuery<Offer[]>({
    queryKey: ["/api/offers"],
  });

  const buildQuery = () => {
    const params = new URLSearchParams();
    params.set("dateRange", filters.dateRange);
    if (filters.offerId && filters.offerId !== "all") params.set("offerId", filters.offerId);
    if (filters.platform && filters.platform !== "all") params.set("platform", filters.platform);
    if (filters.dateRange === "custom") {
      if (filters.startDate) params.set("startDate", filters.startDate);
      if (filters.endDate) params.set("endDate", filters.endDate);
    }
    return params.toString();
  };

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats", filters.offerId, filters.platform, filters.dateRange, filters.startDate, filters.endDate],
    queryFn: () =>
      fetch(`/api/dashboard/stats?${buildQuery()}`, { credentials: "include" }).then((r) => r.json()),
  });

  const { data: breakdown, isLoading: breakdownLoading } = useQuery<DashboardBreakdown>({
    queryKey: ["/api/dashboard/breakdown", filters.offerId, filters.platform, filters.dateRange, filters.startDate, filters.endDate],
    queryFn: () =>
      fetch(`/api/dashboard/breakdown?${buildQuery()}`, { credentials: "include" }).then((r) => r.json()),
  });

  const { data: failReasons, isLoading: failReasonsLoading } = useQuery<FailReasonData>({
    queryKey: ["/api/dashboard/fail-reasons", filters.offerId, filters.platform, filters.dateRange, filters.startDate, filters.endDate],
    queryFn: () =>
      fetch(`/api/dashboard/fail-reasons?${buildQuery()}`, { credentials: "include" }).then((r) => r.json()),
  });

  const { data: usage } = useQuery<UserUsage>({
    queryKey: ["/api/user/usage"],
    refetchInterval: 30000,
  });

  const resetFilters = () =>
    setFilters({ offerId: "", platform: "", dateRange: "today", startDate: "", endDate: "" });

  const getClicksPercent = () => {
    if (!usage || usage.isUnlimited || !usage.clicksLimit) return 0;
    return Math.min((usage.clicksThisMonth / usage.clicksLimit) * 100, 100);
  };

  const getProgressColor = () => {
    const p = getClicksPercent();
    if (p >= 100) return "bg-destructive";
    if (p >= 95) return "bg-orange-500";
    if (p >= 80) return "bg-yellow-500";
    return "bg-primary";
  };

  const formatNumber = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return n.toLocaleString();
  };

  const chartTitle = () => {
    if (isPt) {
      switch (filters.dateRange) {
        case "today": return "Cliques — Hoje (por hora)";
        case "yesterday": return "Cliques — Ontem (por hora)";
        case "week": return "Cliques — Essa Semana";
        case "month": return "Cliques — Esse Mês";
        case "custom": return "Cliques — Período Personalizado";
        default: return "Cliques — Todo Período";
      }
    } else {
      switch (filters.dateRange) {
        case "today": return "Clicks — Today (by hour)";
        case "yesterday": return "Clicks — Yesterday (by hour)";
        case "week": return "Clicks — This Week";
        case "month": return "Clicks — This Month";
        case "custom": return "Clicks — Custom Range";
        default: return "Clicks — All Time";
      }
    }
  };

  const totalWhiteClicks = (stats?.totalClicks ?? 0) - (stats?.totalBlackClicks ?? 0);
  const blackRate = stats?.totalClicks ? Math.round(((stats.totalBlackClicks ?? 0) / stats.totalClicks) * 100) : 0;

  const statCards = [
    {
      title: isPt ? "Cliques Totais" : "Total Clicks",
      value: stats?.totalClicks ?? 0,
      icon: TrendingUp,
      color: "text-primary",
      testId: "stat-total-clicks",
    },
    {
      title: isPt ? "Cliques Black" : "Black Clicks",
      value: stats?.totalBlackClicks ?? 0,
      icon: ShieldCheck,
      color: "text-chart-3",
      testId: "stat-black-clicks",
    },
    {
      title: isPt ? "Ofertas Ativas" : "Active Offers",
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

  const xAxisInterval = () => {
    if (stats?.useHourly) return 3;
    const len = stats?.clicksByPeriod?.length ?? 7;
    if (len <= 7) return 0;
    if (len <= 14) return 1;
    return 3;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Alerts */}
      {usage?.isSuspended && (
        <Alert variant="destructive" data-testid="alert-suspended">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{isPt ? "Conta Suspensa" : "Account Suspended"}</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>
              {isPt
                ? "Sua conta foi suspensa por exceder o limite de cliques. Suas ofertas não estão funcionando."
                : "Your account has been suspended for exceeding the click limit. Your offers are not working."}
            </span>
            <Button variant="outline" size="sm" onClick={() => navigate("/subscription")} data-testid="button-upgrade-suspended">
              {isPt ? "Fazer Upgrade" : "Upgrade Now"}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {usage?.gracePeriodEndsAt && !usage?.isSuspended && (
        <Alert variant="destructive" className="border-orange-500 bg-orange-500/10" data-testid="alert-grace-period">
          <Clock className="h-4 w-4 text-orange-500" />
          <AlertTitle className="text-orange-600 dark:text-orange-400">
            {isPt ? "Atenção: Conta Será Suspensa" : "Warning: Account Will Be Suspended"}
          </AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>
              {usage?.subscriptionStatus === "past_due" || usage?.subscriptionStatus === "canceled"
                ? isPt
                  ? `Sua assinatura está pendente. Renove para continuar. Suspensão em ${formatDistanceToNow(new Date(usage.gracePeriodEndsAt), { locale, addSuffix: false })}.`
                  : `Your subscription is pending. Renew to continue. Suspension in ${formatDistanceToNow(new Date(usage.gracePeriodEndsAt), { locale, addSuffix: false })}.`
                : isPt
                ? `Você excedeu seu limite. Suspensão em ${formatDistanceToNow(new Date(usage.gracePeriodEndsAt), { locale, addSuffix: false })}.`
                : `You exceeded your limit. Suspension in ${formatDistanceToNow(new Date(usage.gracePeriodEndsAt), { locale, addSuffix: false })}.`}
            </span>
            <Button variant="outline" size="sm" onClick={() => navigate("/subscription")} data-testid="button-upgrade-grace">
              {usage?.subscriptionStatus === "past_due" || usage?.subscriptionStatus === "canceled"
                ? isPt ? "Renovar Assinatura" : "Renew Subscription"
                : isPt ? "Fazer Upgrade Agora" : "Upgrade Now"}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {usage && !usage.isUnlimited && usage.clicksLimit && getClicksPercent() >= 80 && getClicksPercent() < 100 && !usage.gracePeriodEndsAt && (
        <Alert
          variant="default"
          className={getClicksPercent() >= 95 ? "border-orange-500 bg-orange-500/10" : "border-yellow-500 bg-yellow-500/10"}
          data-testid="alert-clicks-warning"
        >
          <AlertTriangle className={`h-4 w-4 ${getClicksPercent() >= 95 ? "text-orange-500" : "text-yellow-500"}`} />
          <AlertTitle className={getClicksPercent() >= 95 ? "text-orange-600 dark:text-orange-400" : "text-yellow-600 dark:text-yellow-400"}>
            {getClicksPercent() >= 95
              ? isPt ? "Limite Quase Atingido!" : "Almost at Limit!"
              : isPt ? "Atenção ao Limite de Cliques" : "Click Limit Warning"}
          </AlertTitle>
          <AlertDescription>
            {isPt
              ? `Você usou ${getClicksPercent().toFixed(0)}% do seu limite mensal de cliques.`
              : `You have used ${getClicksPercent().toFixed(0)}% of your monthly click limit.`}
          </AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{isPt ? "Oferta" : "Offer"}</Label>
          <Select value={filters.offerId} onValueChange={(v) => setFilters({ ...filters, offerId: v })}>
            <SelectTrigger className="w-44" data-testid="filter-dashboard-offer">
              <SelectValue placeholder={isPt ? "Todas as ofertas" : "All offers"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isPt ? "Todas as ofertas" : "All offers"}</SelectItem>
              {offers.map((offer) => (
                <SelectItem key={offer.id} value={String(offer.id)}>
                  {offer.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{isPt ? "Plataforma" : "Platform"}</Label>
          <Select value={filters.platform} onValueChange={(v) => setFilters({ ...filters, platform: v })}>
            <SelectTrigger className="w-36" data-testid="filter-dashboard-platform">
              <SelectValue placeholder={isPt ? "Todas" : "All"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isPt ? "Todas" : "All"}</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
              <SelectItem value="facebook">Facebook</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{isPt ? "Período" : "Period"}</Label>
          <Select value={filters.dateRange} onValueChange={(v) => setFilters({ ...filters, dateRange: v })}>
            <SelectTrigger className="w-44" data-testid="filter-dashboard-date">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">{isPt ? "Hoje" : "Today"}</SelectItem>
              <SelectItem value="yesterday">{isPt ? "Ontem" : "Yesterday"}</SelectItem>
              <SelectItem value="week">{isPt ? "Essa semana" : "This week"}</SelectItem>
              <SelectItem value="month">{isPt ? "Esse mês" : "This month"}</SelectItem>
              <SelectItem value="all">{isPt ? "Todo período" : "All time"}</SelectItem>
              <SelectItem value="custom">{isPt ? "Personalizado" : "Custom"}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filters.dateRange === "custom" && (
          <>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">{isPt ? "Data início" : "Start date"}</Label>
              <Input
                type="date"
                className="w-40 h-10"
                value={filters.startDate}
                max={filters.endDate || undefined}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                data-testid="filter-dashboard-start-date"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">{isPt ? "Data fim" : "End date"}</Label>
              <Input
                type="date"
                className="w-40 h-10"
                value={filters.endDate}
                min={filters.startDate || undefined}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                data-testid="filter-dashboard-end-date"
              />
            </div>
          </>
        )}

        <Button variant="outline" onClick={resetFilters} data-testid="button-reset-dashboard-filters">
          {isPt ? "Limpar" : "Clear"}
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.testId}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
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
              {isPt ? "Uso Mensal de Cliques" : "Monthly Click Usage"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={getClicksPercent()} className="h-2" indicatorClassName={getProgressColor()} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{usage.clicksThisMonth.toLocaleString()} {isPt ? "usados" : "used"}</span>
              <span>{usage.clicksLimit.toLocaleString()} {isPt ? "limite" : "limit"}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Area Chart */}
      <Card>
        <CardHeader>
          <CardTitle>{chartTitle()}</CardTitle>
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
                    className="text-xs"
                    tick={{ fontSize: 11 }}
                    interval={xAxisInterval()}
                  />
                  <YAxis className="text-xs" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number, name: string) => [value.toLocaleString(), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: "0.75rem", paddingTop: "12px" }} />
                  <Area
                    type="monotone"
                    dataKey="clicks"
                    name="Total"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#gradTotal)"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="blackClicks"
                    name="Black"
                    stroke="hsl(var(--chart-3))"
                    strokeWidth={2}
                    fill="url(#gradBlack)"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="whiteClicks"
                    name="White"
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

      {/* Per-offer detailed table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            {isPt ? "Detalhamento por Oferta" : "Breakdown by Offer"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {breakdownLoading ? (
            <div className="p-6 space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !breakdown?.byOffer?.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {isPt ? "Sem dados para o período selecionado" : "No data for the selected period"}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{isPt ? "Oferta" : "Offer"}</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">{isPt ? "Total" : "Total"}</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Black</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">White</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">% Black</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.byOffer.map((row, idx) => (
                    <tr
                      key={row.offerId}
                      className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
                      data-testid={`row-offer-${row.offerId}`}
                    >
                      <td className="px-4 py-3 font-medium">{row.offerName}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.total.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-chart-3">{row.black.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-chart-4">{row.white.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold ${
                          row.blackRate >= 50
                            ? "bg-chart-3/15 text-chart-3"
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {row.blackRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {breakdown.byOffer.length > 1 && (
                  <tfoot>
                    <tr className="border-t border-border bg-muted/20">
                      <td className="px-4 py-3 font-semibold text-muted-foreground">{isPt ? "Total" : "Total"}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {breakdown.byOffer.reduce((s, r) => s + r.total, 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-chart-3">
                        {breakdown.byOffer.reduce((s, r) => s + r.black, 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-chart-4">
                        {breakdown.byOffer.reduce((s, r) => s + r.white, 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {(() => {
                          const tot = breakdown.byOffer.reduce((s, r) => s + r.total, 0);
                          const blk = breakdown.byOffer.reduce((s, r) => s + r.black, 0);
                          const rate = tot > 0 ? Math.round((blk / tot) * 100) : 0;
                          return (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold ${
                              rate >= 50 ? "bg-chart-3/15 text-chart-3" : "bg-muted text-muted-foreground"
                            }`}>
                              {rate}%
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Traffic Diagnostics Panel */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">
              {isPt ? "Diagnóstico de Tráfego — Por que White?" : "Traffic Diagnostics — Why White?"}
            </CardTitle>
            <div className="group relative ml-auto">
              <Info className="w-4 h-4 text-muted-foreground cursor-help" />
              <div className="absolute right-0 top-6 z-10 hidden group-hover:block w-72 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground shadow-lg">
                {isPt
                  ? "Mostra o motivo exato pelo qual cada clique foi enviado para a página white. Use isso para identificar onde o tráfego está sendo filtrado incorretamente."
                  : "Shows the exact reason each click was sent to the white page. Use this to identify where traffic is being incorrectly filtered."}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {failReasonsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : !failReasons || failReasons.white === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {isPt ? "Sem cliques white no período selecionado" : "No white clicks in the selected period"}
            </p>
          ) : (
            <div className="space-y-4">
              {/* Summary row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                  <div className="text-lg font-bold">{failReasons.total.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{isPt ? "Total registrado" : "Total logged"}</div>
                </div>
                <div className="rounded-lg border border-chart-3/30 bg-chart-3/10 p-3 text-center">
                  <div className="text-lg font-bold text-chart-3">{failReasons.black.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Black (passou)</div>
                </div>
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-center">
                  <div className="text-lg font-bold text-destructive">{failReasons.white.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">White (filtrado)</div>
                </div>
              </div>

              {/* Reason breakdown */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  {isPt ? "Motivos (cliques white)" : "Reasons (white clicks)"}
                </div>
                {failReasons.byReason.map((item) => {
                  const label = FAIL_REASON_LABELS[item.reason] ?? { pt: item.reason, en: item.reason, severity: "low" };
                  const severityColor = {
                    critical: "text-destructive",
                    high: "text-orange-500",
                    medium: "text-yellow-500",
                    low: "text-muted-foreground",
                  }[label.severity];
                  const barColor = {
                    critical: "bg-destructive",
                    high: "bg-orange-500",
                    medium: "bg-yellow-500",
                    low: "bg-muted-foreground",
                  }[label.severity];

                  return (
                    <div key={item.reason} className="space-y-1" data-testid={`reason-${item.reason}`}>
                      <div className="flex items-center justify-between text-xs gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`font-medium truncate ${severityColor}`}>
                            {isPt ? label.pt : label.en}
                          </span>
                          {label.severity === "critical" && (
                            <span className="shrink-0 px-1 py-0.5 rounded text-[10px] font-bold bg-destructive/15 text-destructive">
                              {isPt ? "CRÍTICO" : "CRITICAL"}
                            </span>
                          )}
                        </div>
                        <div className="shrink-0 flex items-center gap-2 text-muted-foreground">
                          <span className={`font-semibold ${severityColor}`}>{item.count.toLocaleString()}</span>
                          <span className="text-[10px] bg-muted rounded px-1 py-0.5">{item.pct}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                          style={{ width: `${item.pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tip box */}
              {failReasons.byReason.length > 0 && (() => {
                const topReason = failReasons.byReason[0];
                const tip = FAIL_REASON_TIPS[topReason?.reason];
                return tip ? (
                  <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-700 dark:text-yellow-300">
                    <span className="font-semibold">{isPt ? "Dica: " : "Tip: "}</span>
                    {isPt ? tip.pt : tip.en}
                  </div>
                ) : null;
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Breakdown panels: Device, OS, Browser */}
      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-3">
        <BreakdownPanel
          title={isPt ? "Dispositivos" : "Devices"}
          icon={Smartphone}
          data={breakdown?.byDevice ?? []}
          isLoading={breakdownLoading}
          isPt={isPt}
        />
        <BreakdownPanel
          title={isPt ? "Sistema Operacional" : "Operating System"}
          icon={Monitor}
          data={breakdown?.byOS ?? []}
          isLoading={breakdownLoading}
          isPt={isPt}
        />
        <BreakdownPanel
          title={isPt ? "Navegadores" : "Browsers"}
          icon={Globe}
          data={breakdown?.byBrowser ?? []}
          isLoading={breakdownLoading}
          isPt={isPt}
        />
      </div>
    </div>
  );
}
