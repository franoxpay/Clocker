import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
    offerName: string | null;
    failReason: string | null;
  }>;
  baselineTime: string | null;
}

export default function AdminMonitoring() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const dateLocale = language === "pt-BR" ? ptBR : enUS;
  const [pageTypeFilter, setPageTypeFilter] = useState<string>("all");

  const { data: metrics, isLoading } = useQuery<SystemMetrics>({
    queryKey: ["/api/admin/system-metrics", pageTypeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (pageTypeFilter && pageTypeFilter !== "all") {
        params.set("pageType", pageTypeFilter);
      }
      const url = `/api/admin/system-metrics${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch metrics");
      return res.json();
    },
    refetchInterval: 30000,
    refetchOnMount: "always",
    staleTime: 0,
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/reset-slow-baseline", { 
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to reset baseline");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/system-metrics"] });
      toast({
        title: language === "pt-BR" ? "Baseline resetado" : "Baseline reset",
        description: language === "pt-BR" 
          ? "As requisicoes lentas serao recalculadas a partir de agora" 
          : "Slow requests will be recalculated from now",
      });
    },
    onError: () => {
      toast({
        title: language === "pt-BR" ? "Erro" : "Error",
        description: language === "pt-BR" 
          ? "Nao foi possivel resetar o baseline" 
          : "Could not reset baseline",
        variant: "destructive",
      });
    },
  });

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

  const getSlowReasonExplanation = (req: SystemMetrics["slowestRequests"][0]) => {
    const reasons: string[] = [];
    
    if (req.responseTimeMs > 5000) {
      reasons.push(language === "pt-BR" ? "Tempo muito alto - possivel problema de rede ou servidor sobrecarregado" : "Very high time - possible network issue or overloaded server");
    } else if (req.responseTimeMs > 2000) {
      reasons.push(language === "pt-BR" ? "Tempo alto - latencia de rede ou processamento lento" : "High time - network latency or slow processing");
    } else if (req.responseTimeMs > 500) {
      reasons.push(language === "pt-BR" ? "Tempo moderado - pode ser latencia geografica" : "Moderate time - could be geographic latency");
    }
    
    if (req.hasError) {
      reasons.push(language === "pt-BR" ? "Requisicao com erro" : "Request with error");
    }
    
    if (req.failReason) {
      const failReasonMap: Record<string, string> = {
        "missing_params": language === "pt-BR" ? "Parametros obrigatorios ausentes" : "Missing required parameters",
        "invalid_xcode": language === "pt-BR" ? "Codigo xcode invalido" : "Invalid xcode",
        "bot_detected": language === "pt-BR" ? "Bot detectado" : "Bot detected",
        "country_blocked": language === "pt-BR" ? "Pais bloqueado" : "Country blocked",
        "device_blocked": language === "pt-BR" ? "Dispositivo bloqueado" : "Device blocked",
      };
      reasons.push(failReasonMap[req.failReason] || req.failReason);
    }
    
    if (reasons.length === 0) {
      reasons.push(language === "pt-BR" ? "Tempo de resposta dentro do esperado" : "Response time within expected range");
    }
    
    return reasons.join(". ");
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
      <div className="flex flex-wrap items-center gap-3">
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
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              {t("admin.monitoring.slowestRequests")}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <Select value={pageTypeFilter} onValueChange={setPageTypeFilter}>
                  <SelectTrigger className="w-32" data-testid="filter-page-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{language === "pt-BR" ? "Todos" : "All"}</SelectItem>
                    <SelectItem value="black">Black</SelectItem>
                    <SelectItem value="white">White</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
                data-testid="button-reset-baseline"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                {language === "pt-BR" ? "Resetar Baseline" : "Reset Baseline"}
              </Button>
            </div>
          </div>
          {metrics?.baselineTime && (
            <p className="text-xs text-muted-foreground mt-2">
              {language === "pt-BR" ? "Baseline desde: " : "Baseline since: "}
              {formatDateTime(metrics.baselineTime)}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>{t("admin.monitoring.responseTime")}</TableHead>
                <TableHead>{language === "pt-BR" ? "Tipo" : "Type"}</TableHead>
                <TableHead>{language === "pt-BR" ? "Oferta" : "Offer"}</TableHead>
                <TableHead>{t("admin.monitoring.country")}</TableHead>
                <TableHead>{t("admin.monitoring.device")}</TableHead>
                <TableHead>{t("admin.monitoring.date")}</TableHead>
                <TableHead>{t("admin.monitoring.status")}</TableHead>
                <TableHead>{language === "pt-BR" ? "Diagnostico" : "Diagnosis"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics?.slowestRequests?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    {t("admin.monitoring.noData")}
                  </TableCell>
                </TableRow>
              ) : (
                metrics?.slowestRequests?.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-mono text-sm">#{req.id}</TableCell>
                    <TableCell>
                      <span className={`font-semibold ${getStatusColor(req.responseTimeMs)}`}>
                        {req.responseTimeMs}ms
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={req.redirectedTo === "black" ? "default" : "secondary"}>
                        {req.redirectedTo === "black" ? "BLACK" : "WHITE"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{req.offerName || "-"}</TableCell>
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
                    <TableCell className="max-w-[200px]">
                      <div 
                        className="text-xs text-muted-foreground truncate cursor-help"
                        title={getSlowReasonExplanation(req)}
                      >
                        <FileText className="w-3 h-3 inline mr-1" />
                        {getSlowReasonExplanation(req).split(".")[0]}
                      </div>
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
