import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { getCountryName } from "@/lib/countries";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import { TrendingUp, Users, Globe, Smartphone, Clock, Calendar, Download, FileText, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { Offer } from "@shared/schema";

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
  byDevice: Array<{
    name: string;
    total: number;
    black: number;
    white: number;
    conversionRate: string;
  }>;
  byPlatform: Array<{
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
  byWeekday: Array<{
    day: string;
    total: number;
    black: number;
    white: number;
    conversionRate: string;
  }>;
}

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export default function Analytics() {
  const { language } = useLanguage();
  const isPt = language === "pt-BR";
  
  const [filters, setFilters] = useState({
    offerId: "",
    startDate: "",
    endDate: "",
  });

  const { data: offers = [] } = useQuery<Offer[]>({
    queryKey: ["/api/offers"],
  });

  const { data: stats, isLoading } = useQuery<AdvancedStats>({
    queryKey: ["/api/analytics/advanced", filters.offerId, filters.startDate, filters.endDate],
    queryFn: async ({ queryKey }) => {
      const [, offerId, startDate, endDate] = queryKey as string[];
      const params = new URLSearchParams();
      if (offerId && offerId !== 'all') params.set('offerId', offerId);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      
      const url = params.toString() 
        ? `/api/analytics/advanced?${params.toString()}`
        : '/api/analytics/advanced';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const resetFilters = () => {
    setFilters({ offerId: "", startDate: "", endDate: "" });
  };

  const t = {
    title: isPt ? "Analytics Avancado" : "Advanced Analytics",
    totalClicks: isPt ? "Total de Cliques" : "Total Clicks",
    conversionRate: isPt ? "Taxa de Conversao" : "Conversion Rate",
    blackClicks: isPt ? "Cliques Black" : "Black Clicks",
    whiteClicks: isPt ? "Cliques White" : "White Clicks",
    byCountry: isPt ? "Por Pais" : "By Country",
    byDevice: isPt ? "Por Dispositivo" : "By Device",
    byPlatform: isPt ? "Por Plataforma" : "By Platform",
    byHour: isPt ? "Por Hora" : "By Hour",
    byWeekday: isPt ? "Por Dia da Semana" : "By Weekday",
    noData: isPt ? "Sem dados disponiveis" : "No data available",
    black: "Black",
    white: "White",
    exportReport: isPt ? "Exportar Relatorio" : "Export Report",
    exportLogs: isPt ? "Exportar Logs" : "Export Logs",
    exportAnalytics: isPt ? "Exportar Analytics" : "Export Analytics",
    exportSummary: isPt ? "Relatorio Completo" : "Full Report",
    exportByCountry: isPt ? "Por Pais" : "By Country",
    exportByDevice: isPt ? "Por Dispositivo" : "By Device",
  };

  const handleExport = (type: string, reportType?: string) => {
    let url = `/api/export/${type}?format=csv`;
    if (reportType) {
      url += `&type=${reportType}`;
    }
    window.open(url, "_blank");
  };

  const statCards = [
    {
      title: t.totalClicks,
      value: stats?.totalClicks || 0,
      icon: Users,
      color: "text-primary",
    },
    {
      title: t.conversionRate,
      value: `${stats?.conversionRate || 0}%`,
      icon: TrendingUp,
      color: "text-green-500",
    },
    {
      title: t.blackClicks,
      value: stats?.totalBlack || 0,
      icon: Globe,
      color: "text-chart-3",
    },
    {
      title: t.whiteClicks,
      value: stats?.totalWhite || 0,
      icon: Smartphone,
      color: "text-chart-4",
    },
  ];

  const pieData = stats
    ? [
        { name: t.black, value: stats.totalBlack },
        { name: t.white, value: stats.totalWhite },
      ]
    : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold" data-testid="title-analytics">
          {t.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" data-testid="button-export-analytics">
                <Download className="w-4 h-4 mr-2" />
                {t.exportAnalytics}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport("analytics", "summary")} data-testid="export-analytics-summary">
                <FileText className="w-4 h-4 mr-2" />
                {t.exportSummary}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("analytics", "country")} data-testid="export-analytics-country">
                <Globe className="w-4 h-4 mr-2" />
                {t.exportByCountry}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("analytics", "device")} data-testid="export-analytics-device">
                <Smartphone className="w-4 h-4 mr-2" />
                {t.exportByDevice}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" onClick={() => handleExport("logs")} data-testid="button-export-logs">
            <Download className="w-4 h-4 mr-2" />
            {t.exportLogs}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-4 h-4" />
            {isPt ? "Filtros" : "Filters"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">
                {isPt ? "Oferta" : "Offer"}
              </label>
              <Select
                value={filters.offerId}
                onValueChange={(value) => setFilters({ ...filters, offerId: value })}
              >
                <SelectTrigger data-testid="filter-analytics-offer">
                  <SelectValue placeholder={isPt ? "Todas as ofertas" : "All offers"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isPt ? "Todas" : "All"}</SelectItem>
                  {offers.map((offer) => (
                    <SelectItem key={offer.id} value={String(offer.id)}>
                      {offer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">
                {isPt ? "Data Inicial" : "Start Date"}
              </label>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                data-testid="filter-analytics-start-date"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">
                {isPt ? "Data Final" : "End Date"}
              </label>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                data-testid="filter-analytics-end-date"
              />
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={resetFilters} data-testid="button-reset-analytics-filters">
                {isPt ? "Limpar Filtros" : "Clear Filters"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

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
                  data-testid={`analytics-stat-${index}`}
                >
                  {typeof card.value === "number"
                    ? card.value.toLocaleString()
                    : card.value}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <CardTitle>{t.byCountry}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : stats?.byCountry?.length ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.byCountry} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" />
                    <YAxis
                      type="category"
                      dataKey="name"
                      className="text-xs"
                      width={60}
                      tickFormatter={(val) => getCountryName(val, language)}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "var(--radius)",
                      }}
                      formatter={(value: number, name: string) => [
                        value.toLocaleString(),
                        name === "black" ? t.black : name === "white" ? t.white : "Total",
                      ]}
                      labelFormatter={(label) => getCountryName(label, language)}
                    />
                    <Bar dataKey="black" stackId="a" fill="hsl(var(--chart-3))" />
                    <Bar dataKey="white" stackId="a" fill="hsl(var(--chart-4))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                {t.noData}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Smartphone className="w-4 h-4 text-muted-foreground" />
            <CardTitle>{t.byDevice}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : stats?.byDevice?.length ? (
              <div className="h-64 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.byDevice}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) =>
                        `${name} ${(percent * 100).toFixed(0)}%`
                      }
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="total"
                    >
                      {stats.byDevice.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "var(--radius)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                {t.noData}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <CardTitle>{t.byHour}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : stats?.byHour ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.byHour}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="hour"
                      className="text-xs"
                      interval={2}
                    />
                    <YAxis className="text-xs" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "var(--radius)",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="black"
                      stackId="1"
                      stroke="hsl(var(--chart-3))"
                      fill="hsl(var(--chart-3))"
                      fillOpacity={0.6}
                    />
                    <Area
                      type="monotone"
                      dataKey="white"
                      stackId="1"
                      stroke="hsl(var(--chart-4))"
                      fill="hsl(var(--chart-4))"
                      fillOpacity={0.6}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                {t.noData}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <CardTitle>{t.byWeekday}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : stats?.byWeekday ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.byWeekday}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="day" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "var(--radius)",
                      }}
                    />
                    <Bar dataKey="black" stackId="a" fill="hsl(var(--chart-3))" />
                    <Bar dataKey="white" stackId="a" fill="hsl(var(--chart-4))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                {t.noData}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <CardTitle>{t.byPlatform}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : stats?.byPlatform?.length ? (
            <div className="grid gap-4 md:grid-cols-3">
              {stats.byPlatform.map((platform, index) => (
                <div
                  key={platform.name}
                  className="p-4 rounded-md bg-muted/50"
                  data-testid={`platform-stat-${index}`}
                >
                  <div className="text-lg font-semibold capitalize">
                    {platform.name}
                  </div>
                  <div className="text-2xl font-bold">
                    {platform.total.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {platform.conversionRate}% {isPt ? "conversao" : "conversion"}
                  </div>
                  <div className="flex gap-4 mt-2 text-xs">
                    <span className="text-chart-3">
                      {t.black}: {platform.black}
                    </span>
                    <span className="text-chart-4">
                      {t.white}: {platform.white}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-muted-foreground">
              {t.noData}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
