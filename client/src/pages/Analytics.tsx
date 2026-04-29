import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { getCountryName } from "@/lib/countries";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  TrendingUp,
  Users,
  Globe,
  Clock,
  Download,
  FileText,
  Smartphone,
  AlertTriangle,
  ShieldCheck,
  ShieldX,
  History,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";
import type { Offer } from "@shared/schema";

interface RecentLog {
  id: number;
  ipAddress: string;
  country: string;
  device: string;
  redirectedTo: string;
  createdAt: string;
  offerName: string;
}

interface IpStat {
  ip: string;
  total: number;
  black: number;
  white: number;
  conversionRate: string;
  suspicious: boolean;
}

interface AdvancedStats {
  totalClicks: number;
  totalBlack: number;
  totalWhite: number;
  conversionRate: string;
  byCountry: Array<{
    name: string;
    total: number;
    black: number;
    white: number;
    conversionRate: string;
  }>;
  byHour: Array<{
    hour: string;
    total: number;
    black: number;
    white: number;
    conversionRate: string;
  }>;
  byIp: IpStat[];
  recentLogs: RecentLog[];
}

function getFlagEmoji(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return "🌐";
  const code = countryCode.toUpperCase();
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "var(--radius)",
  fontSize: "0.75rem",
};

export default function Analytics() {
  const { language } = useLanguage();
  const isPt = language === "pt-BR";
  const locale = isPt ? ptBR : enUS;

  const [filters, setFilters] = useState({
    offerId: "",
    dateRange: "all",
    startDate: "",
    endDate: "",
    platform: "",
  });

  const { data: offers = [] } = useQuery<Offer[]>({
    queryKey: ["/api/offers"],
  });

  const getDateRange = (range: string) => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    let startDate = "";
    let endDate = today.toISOString().split("T")[0];

    switch (range) {
      case "today":
        startDate = endDate;
        break;
      case "yesterday":
        const yest = new Date(today);
        yest.setDate(yest.getDate() - 1);
        startDate = yest.toISOString().split("T")[0];
        endDate = startDate;
        break;
      case "week":
        const w = new Date(today);
        w.setDate(w.getDate() - 7);
        startDate = w.toISOString().split("T")[0];
        break;
      case "month":
        const m = new Date(today);
        m.setMonth(m.getMonth() - 1);
        startDate = m.toISOString().split("T")[0];
        break;
      case "custom":
        startDate = filters.startDate;
        endDate = filters.endDate;
        break;
      default:
        startDate = "";
        endDate = "";
    }
    return { startDate, endDate };
  };

  const { data: stats, isLoading } = useQuery<AdvancedStats>({
    queryKey: [
      "/api/analytics/advanced",
      filters.offerId,
      filters.dateRange,
      filters.startDate,
      filters.endDate,
      filters.platform,
    ],
    queryFn: async ({ queryKey }) => {
      const [, offerId, dateRange, , , platform] = queryKey as string[];
      const { startDate, endDate } = getDateRange(dateRange);
      const params = new URLSearchParams();
      if (offerId && offerId !== "all") params.set("offerId", offerId);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (platform && platform !== "all") params.set("platform", platform);
      const url = params.toString()
        ? `/api/analytics/advanced?${params.toString()}`
        : "/api/analytics/advanced";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const resetFilters = () => {
    setFilters({ offerId: "", dateRange: "all", startDate: "", endDate: "", platform: "" });
  };

  const handleExport = (type: string, reportType?: string) => {
    let url = `/api/export/${type}?format=csv`;
    if (reportType) url += `&type=${reportType}`;
    window.open(url, "_blank");
  };

  const statCards = [
    {
      title: isPt ? "Total de Requests" : "Total Requests",
      value: stats?.totalClicks ?? 0,
      icon: Users,
      color: "text-primary",
      testId: "analytics-stat-total",
      note: isPt ? "Todos os hits no cloaker (inclui bots)" : "All cloaker hits (includes bots)",
    },
    {
      title: isPt ? "Taxa Black" : "Black Rate",
      value: `${stats?.conversionRate ?? "0"}%`,
      icon: TrendingUp,
      color: "text-green-500",
      testId: "analytics-stat-rate",
      note: isPt ? "% de requests redirecionados para black" : "% of requests redirected to black",
    },
    {
      title: isPt ? "Cliques Black" : "Black Clicks",
      value: stats?.totalBlack ?? 0,
      icon: ShieldCheck,
      color: "text-chart-3",
      testId: "analytics-stat-black",
      note: isPt ? "Redirecionados para a oferta" : "Redirected to the offer",
    },
    {
      title: isPt ? "Cliques White" : "White Clicks",
      value: stats?.totalWhite ?? 0,
      icon: ShieldX,
      color: "text-chart-4",
      testId: "analytics-stat-white",
      note: isPt ? "Redirecionados para a white page" : "Redirected to white page",
    },
  ];

  const labelBlack = "Black";
  const labelWhite = "White";

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold" data-testid="title-analytics">
          {isPt ? "Analytics Avançado" : "Advanced Analytics"}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" data-testid="button-export-analytics">
                <Download className="w-4 h-4 mr-2" />
                {isPt ? "Exportar" : "Export"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport("analytics", "summary")} data-testid="export-analytics-summary">
                <FileText className="w-4 h-4 mr-2" />
                {isPt ? "Relatório Completo" : "Full Report"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("analytics", "country")} data-testid="export-analytics-country">
                <Globe className="w-4 h-4 mr-2" />
                {isPt ? "Por País" : "By Country"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" onClick={() => handleExport("logs")} data-testid="button-export-logs">
            <Download className="w-4 h-4 mr-2" />
            {isPt ? "Exportar Logs" : "Export Logs"}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{isPt ? "Oferta" : "Offer"}</Label>
          <Select
            value={filters.offerId}
            onValueChange={(v) => setFilters({ ...filters, offerId: v })}
          >
            <SelectTrigger className="w-44" data-testid="filter-analytics-offer">
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
          <Label className="text-xs text-muted-foreground">{isPt ? "Período" : "Period"}</Label>
          <Select
            value={filters.dateRange}
            onValueChange={(v) => setFilters({ ...filters, dateRange: v })}
          >
            <SelectTrigger className="w-40" data-testid="filter-analytics-date">
              <SelectValue placeholder={isPt ? "Período" : "Period"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isPt ? "Todo período" : "All time"}</SelectItem>
              <SelectItem value="today">{isPt ? "Hoje" : "Today"}</SelectItem>
              <SelectItem value="yesterday">{isPt ? "Ontem" : "Yesterday"}</SelectItem>
              <SelectItem value="week">{isPt ? "Essa semana" : "This week"}</SelectItem>
              <SelectItem value="month">{isPt ? "Esse mês" : "This month"}</SelectItem>
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
                data-testid="filter-analytics-start-date"
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
                data-testid="filter-analytics-end-date"
              />
            </div>
          </>
        )}

        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{isPt ? "Plataforma" : "Platform"}</Label>
          <Select
            value={filters.platform}
            onValueChange={(v) => setFilters({ ...filters, platform: v })}
          >
            <SelectTrigger className="w-36" data-testid="filter-analytics-platform">
              <SelectValue placeholder={isPt ? "Plataforma" : "Platform"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isPt ? "Todas" : "All"}</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
              <SelectItem value="facebook">Facebook</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button variant="outline" onClick={resetFilters} data-testid="button-reset-analytics-filters">
          {isPt ? "Limpar" : "Clear"}
        </Button>
      </div>

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
                <>
                  <div className="text-2xl font-bold" data-testid={card.testId}>
                    {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{card.note}</p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Por País (tabela ranking) + Por Hora (area chart) */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Tabela Por País */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <CardTitle>{isPt ? "Por País" : "By Country"}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <Skeleton className="h-72 w-full mx-4" />
            ) : stats?.byCountry?.length ? (
              <div className="overflow-auto max-h-80">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card border-b border-border">
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2 font-medium">#</th>
                      <th className="px-4 py-2 font-medium">{isPt ? "País" : "Country"}</th>
                      <th className="px-4 py-2 font-medium text-right">Total</th>
                      <th className="px-4 py-2 font-medium text-right text-chart-3">Black</th>
                      <th className="px-4 py-2 font-medium text-right text-chart-4">White</th>
                      <th className="px-4 py-2 font-medium text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byCountry.map((row, i) => (
                      <tr
                        key={row.name}
                        className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                        data-testid={`country-row-${i}`}
                      >
                        <td className="px-4 py-2 text-muted-foreground text-xs">{i + 1}</td>
                        <td className="px-4 py-2 font-medium">
                          <span className="mr-2">{getFlagEmoji(row.name)}</span>
                          {getCountryName(row.name, language)}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold">
                          {row.total.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right text-chart-3">{row.black.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right text-chart-4">{row.white.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right">
                          <Badge
                            variant="outline"
                            className={
                              parseFloat(row.conversionRate) >= 50
                                ? "border-chart-3 text-chart-3"
                                : "border-muted-foreground text-muted-foreground"
                            }
                          >
                            {row.conversionRate}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-72 flex items-center justify-center text-muted-foreground px-4">
                {isPt ? "Sem dados disponíveis" : "No data available"}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gráfico Por Hora */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <CardTitle>{isPt ? "Por Hora do Dia" : "By Hour of Day"}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats?.byHour ?? []} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradHourBlack" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradHourWhite" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--chart-4))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--chart-4))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="hour"
                      className="text-xs"
                      tick={{ fontSize: 10 }}
                      interval={3}
                    />
                    <YAxis className="text-xs" tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: "0.75rem", paddingTop: "8px" }} />
                    <Area
                      type="monotone"
                      dataKey="black"
                      name={labelBlack}
                      stroke="hsl(var(--chart-3))"
                      strokeWidth={2}
                      fill="url(#gradHourBlack)"
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="white"
                      name={labelWhite}
                      stroke="hsl(var(--chart-4))"
                      strokeWidth={2}
                      fill="url(#gradHourWhite)"
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top IPs / Qualidade de Tráfego */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <AlertTriangle className="w-4 h-4 text-muted-foreground" />
          <CardTitle>{isPt ? "Top IPs / Qualidade de Tráfego" : "Top IPs / Traffic Quality"}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <Skeleton className="h-48 w-full mx-4" />
          ) : stats?.byIp?.length ? (
            <div className="overflow-auto max-h-72">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card border-b border-border">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">IP</th>
                    <th className="px-4 py-2 font-medium text-right">Total</th>
                    <th className="px-4 py-2 font-medium text-right text-chart-3">Black</th>
                    <th className="px-4 py-2 font-medium text-right text-chart-4">White</th>
                    <th className="px-4 py-2 font-medium text-right">%</th>
                    <th className="px-4 py-2 font-medium text-right">{isPt ? "Status" : "Status"}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byIp.map((row, i) => (
                    <tr
                      key={row.ip}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                      data-testid={`ip-row-${i}`}
                    >
                      <td className="px-4 py-2 font-mono text-xs">{row.ip}</td>
                      <td className="px-4 py-2 text-right font-semibold">{row.total}</td>
                      <td className="px-4 py-2 text-right text-chart-3">{row.black}</td>
                      <td className="px-4 py-2 text-right text-chart-4">{row.white}</td>
                      <td className="px-4 py-2 text-right">{row.conversionRate}%</td>
                      <td className="px-4 py-2 text-right">
                        {row.suspicious ? (
                          <Badge variant="destructive" className="text-xs">
                            {isPt ? "Suspeito" : "Suspicious"}
                          </Badge>
                        ) : row.black > 0 && row.white > 0 ? (
                          <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-500">
                            {isPt ? "Misto" : "Mixed"}
                          </Badge>
                        ) : row.black > 0 ? (
                          <Badge variant="outline" className="text-xs border-chart-3 text-chart-3">
                            Black
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs border-chart-4 text-chart-4">
                            White
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-muted-foreground">
              {isPt ? "Sem dados disponíveis" : "No data available"}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Últimos Cliques */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <History className="w-4 h-4 text-muted-foreground" />
          <CardTitle>{isPt ? "Últimos Cliques" : "Recent Clicks"}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <Skeleton className="h-48 w-full mx-4" />
          ) : stats?.recentLogs?.length ? (
            <div className="overflow-auto max-h-80">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card border-b border-border">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">IP</th>
                    <th className="px-4 py-2 font-medium">{isPt ? "País" : "Country"}</th>
                    <th className="px-4 py-2 font-medium">{isPt ? "Dispositivo" : "Device"}</th>
                    <th className="px-4 py-2 font-medium">{isPt ? "Oferta" : "Offer"}</th>
                    <th className="px-4 py-2 font-medium">{isPt ? "Resultado" : "Result"}</th>
                    <th className="px-4 py-2 font-medium text-right">{isPt ? "Quando" : "When"}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentLogs.map((log, i) => (
                    <tr
                      key={log.id}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                      data-testid={`recent-log-${i}`}
                    >
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{log.ipAddress}</td>
                      <td className="px-4 py-2">
                        <span className="mr-1">{getFlagEmoji(log.country)}</span>
                        <span className="text-xs">{log.country}</span>
                      </td>
                      <td className="px-4 py-2 text-xs capitalize">{log.device}</td>
                      <td className="px-4 py-2 text-xs max-w-28 truncate" title={log.offerName}>
                        {log.offerName}
                      </td>
                      <td className="px-4 py-2">
                        <Badge
                          variant="outline"
                          className={
                            log.redirectedTo === "black"
                              ? "border-chart-3 text-chart-3 text-xs"
                              : "border-chart-4 text-chart-4 text-xs"
                          }
                        >
                          {log.redirectedTo}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(log.createdAt), { locale, addSuffix: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-muted-foreground">
              {isPt ? "Sem dados disponíveis" : "No data available"}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
