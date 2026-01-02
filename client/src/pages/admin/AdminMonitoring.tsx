import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  TrendingUp,
  Gauge,
  AlertTriangle,
  RotateCcw,
  Filter,
  FileText,
} from "lucide-react";
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
  Legend,
} from "recharts";
import { format } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";

interface SystemMetrics {
  totalClicks: number;
  successfulClicks: number;
  failedClicks: number;
  avgResponseTimeMs: number;
  minResponseTimeMs: number;
  maxResponseTimeMs: number;
  clicksByHour: Array<{
    hour: string;
    total: number;
    successful: number;
    failed: number;
    avgResponseTime: number;
  }>;
  slowestRequests: Array<{
    id: number;
    responseTimeMs: number;
    country: string | null;
    device: string | null;
    createdAt: string;
    hasError: boolean | null;
    redirectedTo: string | null;
    platform: string | null;
    allParams: Record<string, string> | null;
  }>;
}

export default function AdminMonitoring() {
  const { t, language } = useLanguage();
  const dateLocale = language === "pt-BR" ? ptBR : enUS;
  const isPt = language === "pt-BR";
  
  const [filters, setFilters] = useState({
    pageType: "all",
    platform: "all",
  });
  const [hiddenRequests, setHiddenRequests] = useState<Set<number>>(new Set());

  const { data: metrics, isLoading } = useQuery<SystemMetrics>({
    queryKey: ["/api/admin/system-metrics"],
    refetchInterval: 30000,
    refetchOnMount: "always",
    staleTime: 0,
  });
  
  const filteredSlowestRequests = (metrics?.slowestRequests || [])
    .filter(req => !hiddenRequests.has(req.id))
    .filter(req => {
      if (filters.pageType !== "all") {
        if (filters.pageType === "black" && req.redirectedTo !== "black") return false;
        if (filters.pageType === "white" && req.redirectedTo !== "white") return false;
      }
      if (filters.platform !== "all" && req.platform !== filters.platform) return false;
      return true;
    });
    
  const resetFilters = () => {
    setFilters({ pageType: "all", platform: "all" });
    setHiddenRequests(new Set());
  };

  const formatDateTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "dd/MM HH:mm", { locale: dateLocale });
    } catch {
      return dateStr;
    }
  };

  const formatHour = (hourStr: string) => {
    try {
      const date = new Date(hourStr.replace(" ", "T") + ":00:00");
      return format(date, "dd/MM HH:mm", { locale: dateLocale });
    } catch {
      return hourStr;
    }
  };

  const getStatusColor = (responseTime: number) => {
    if (responseTime < 100) return "text-green-600 dark:text-green-400";
    if (responseTime < 300) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  const successRate = metrics?.totalClicks
    ? ((metrics.successfulClicks / metrics.totalClicks) * 100).toFixed(1)
    : "0";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Activity className="w-6 h-6" />
        <h1 className="text-2xl font-bold" data-testid="text-monitoring-title">
          {t("admin.monitoring.title")}
        </h1>
        <Badge variant="outline" className="ml-auto">
          {t("admin.monitoring.last72h")}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("admin.monitoring.totalClicks")}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-clicks">
              {metrics?.totalClicks?.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("admin.monitoring.clicksDesc")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("admin.monitoring.successRate")}
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-success-rate">
              {successRate}%
            </div>
            <p className="text-xs text-muted-foreground">
              {metrics?.successfulClicks?.toLocaleString() || 0} {t("admin.monitoring.successful")} / {metrics?.failedClicks || 0} {t("admin.monitoring.failed")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("admin.monitoring.avgResponseTime")}
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getStatusColor(metrics?.avgResponseTimeMs || 0)}`} data-testid="text-avg-response">
              {metrics?.avgResponseTimeMs || 0}ms
            </div>
            <p className="text-xs text-muted-foreground">
              Min: {metrics?.minResponseTimeMs || 0}ms / Max: {metrics?.maxResponseTimeMs || 0}ms
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("admin.monitoring.performance")}
            </CardTitle>
            <Gauge className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-performance">
              {(metrics?.avgResponseTimeMs || 0) < 100 ? (
                <span className="text-green-600 dark:text-green-400">{t("admin.monitoring.excellent")}</span>
              ) : (metrics?.avgResponseTimeMs || 0) < 300 ? (
                <span className="text-yellow-600 dark:text-yellow-400">{t("admin.monitoring.good")}</span>
              ) : (
                <span className="text-red-600 dark:text-red-400">{t("admin.monitoring.slow")}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("admin.monitoring.performanceDesc")}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              {t("admin.monitoring.clicksOverTime")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics?.clicksByHour || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="hour"
                    tickFormatter={formatHour}
                    fontSize={12}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis fontSize={12} />
                  <Tooltip
                    labelFormatter={formatHour}
                    formatter={(value: number, name: string) => [
                      value,
                      name === "successful" ? t("admin.monitoring.successful") :
                      name === "failed" ? t("admin.monitoring.failed") : name
                    ]}
                  />
                  <Legend />
                  <Bar
                    dataKey="successful"
                    name={t("admin.monitoring.successful")}
                    fill="hsl(var(--chart-2))"
                    stackId="a"
                  />
                  <Bar
                    dataKey="failed"
                    name={t("admin.monitoring.failed")}
                    fill="hsl(var(--destructive))"
                    stackId="a"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              {t("admin.monitoring.responseTimeOverTime")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics?.clicksByHour || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="hour"
                    tickFormatter={formatHour}
                    fontSize={12}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis fontSize={12} unit="ms" />
                  <Tooltip
                    labelFormatter={formatHour}
                    formatter={(value: number) => [`${value}ms`, t("admin.monitoring.avgResponseTime")]}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgResponseTime"
                    name={t("admin.monitoring.avgResponseTime")}
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            {t("admin.monitoring.slowestRequests")}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select
                value={filters.pageType}
                onValueChange={(value) => setFilters({ ...filters, pageType: value })}
              >
                <SelectTrigger className="w-32" data-testid="filter-page-type">
                  <SelectValue placeholder={isPt ? "Tipo" : "Type"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isPt ? "Todos" : "All"}</SelectItem>
                  <SelectItem value="black">Black</SelectItem>
                  <SelectItem value="white">White</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filters.platform}
                onValueChange={(value) => setFilters({ ...filters, platform: value })}
              >
                <SelectTrigger className="w-32" data-testid="filter-platform">
                  <SelectValue placeholder={isPt ? "Plataforma" : "Platform"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isPt ? "Todas" : "All"}</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                  <SelectItem value="tiktok2">TikTok2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={resetFilters} data-testid="button-reset-slow-requests">
              <RotateCcw className="w-4 h-4 mr-1" />
              {isPt ? "Resetar" : "Reset"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>{t("admin.monitoring.responseTime")}</TableHead>
                <TableHead>{isPt ? "Tipo" : "Type"}</TableHead>
                <TableHead>{isPt ? "Plataforma" : "Platform"}</TableHead>
                <TableHead>{t("admin.monitoring.country")}</TableHead>
                <TableHead>{t("admin.monitoring.device")}</TableHead>
                <TableHead>{t("admin.monitoring.date")}</TableHead>
                <TableHead>{t("admin.monitoring.status")}</TableHead>
                <TableHead>{isPt ? "Detalhes" : "Details"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSlowestRequests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    {t("admin.monitoring.noData")}
                  </TableCell>
                </TableRow>
              ) : (
                filteredSlowestRequests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-mono text-sm">#{req.id}</TableCell>
                    <TableCell>
                      <span className={`font-semibold ${getStatusColor(req.responseTimeMs)}`}>
                        {req.responseTimeMs}ms
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={req.redirectedTo === "black" ? "default" : "secondary"}>
                        {req.redirectedTo || "-"}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize">{req.platform || "-"}</TableCell>
                    <TableCell>{req.country || "-"}</TableCell>
                    <TableCell className="capitalize">{req.device || "-"}</TableCell>
                    <TableCell>{formatDateTime(req.createdAt)}</TableCell>
                    <TableCell>
                      {req.hasError ? (
                        <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                          <XCircle className="w-3 h-3" />
                          {t("admin.monitoring.error")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                          <CheckCircle className="w-3 h-3" />
                          OK
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-details-${req.id}`}>
                            <FileText className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-lg">
                          <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                              <FileText className="w-5 h-5" />
                              {isPt ? "Diagnóstico da Requisição" : "Request Diagnostic"} #{req.id}
                            </DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-sm text-muted-foreground">{isPt ? "Tempo de Resposta" : "Response Time"}</p>
                                <p className={`text-lg font-semibold ${getStatusColor(req.responseTimeMs)}`}>
                                  {req.responseTimeMs}ms
                                </p>
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">{isPt ? "Tipo de Página" : "Page Type"}</p>
                                <Badge variant={req.redirectedTo === "black" ? "default" : "secondary"}>
                                  {req.redirectedTo || "-"}
                                </Badge>
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">{isPt ? "Plataforma" : "Platform"}</p>
                                <p className="font-medium capitalize">{req.platform || "-"}</p>
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">{isPt ? "País" : "Country"}</p>
                                <p className="font-medium">{req.country || "-"}</p>
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">{isPt ? "Dispositivo" : "Device"}</p>
                                <p className="font-medium capitalize">{req.device || "-"}</p>
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">{isPt ? "Data" : "Date"}</p>
                                <p className="font-medium">{formatDateTime(req.createdAt)}</p>
                              </div>
                            </div>
                            
                            <div>
                              <p className="text-sm text-muted-foreground mb-2">
                                {isPt ? "Possíveis Causas de Lentidão" : "Possible Slow Causes"}
                              </p>
                              <ul className="text-sm space-y-1">
                                {req.responseTimeMs > 500 && (
                                  <li className="text-yellow-600 dark:text-yellow-400">
                                    {isPt 
                                      ? "Tempo de resposta muito alto (>500ms)" 
                                      : "Very high response time (>500ms)"}
                                  </li>
                                )}
                                {req.platform === "tiktok" && (
                                  <li className="text-muted-foreground">
                                    {isPt 
                                      ? "TikTok usa desafio JS que adiciona latência" 
                                      : "TikTok uses JS challenge adding latency"}
                                  </li>
                                )}
                                {req.hasError && (
                                  <li className="text-red-600 dark:text-red-400">
                                    {isPt 
                                      ? "Requisição teve erro durante processamento" 
                                      : "Request had error during processing"}
                                  </li>
                                )}
                                {!req.hasError && req.responseTimeMs <= 500 && (
                                  <li className="text-green-600 dark:text-green-400">
                                    {isPt 
                                      ? "Requisição processada normalmente" 
                                      : "Request processed normally"}
                                  </li>
                                )}
                              </ul>
                            </div>

                            {req.allParams && Object.keys(req.allParams).length > 0 && (
                              <div>
                                <p className="text-sm text-muted-foreground mb-2">
                                  {isPt ? "Parâmetros da Requisição" : "Request Parameters"}
                                </p>
                                <div className="bg-muted p-2 rounded text-xs font-mono max-h-32 overflow-auto">
                                  {Object.entries(req.allParams).map(([key, value]) => (
                                    <div key={key}>
                                      <span className="text-muted-foreground">{key}:</span> {value}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
