import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, Download, Filter, Info, X } from "lucide-react";
import { format } from "date-fns";
import { getCountryName } from "@/lib/countries";

interface AdminClickLog {
  id: number;
  createdAt: string;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  offerId: number | null;
  offerName: string | null;
  platform: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  country: string | null;
  device: string | null;
  redirectedTo: string;
  requestUrl: string | null;
  responseTimeMs: number | null;
  allParams: Record<string, any>;
}

interface AdminClickLogsResponse {
  logs: AdminClickLog[];
  total: number;
  page: number;
  limit: number;
}

const REASON_COLOR: Record<string, string> = {
  valid_traffic: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  bot_detected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  invalid_device: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  invalid_country: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  invalid_params: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
};

function reasonColor(reason: string | undefined): string {
  if (!reason || reason === "valid_traffic") return REASON_COLOR.valid_traffic;
  if (reason.startsWith("bot_detected")) return REASON_COLOR.bot_detected;
  if (reason.startsWith("invalid_device")) return REASON_COLOR.invalid_device;
  if (reason.startsWith("invalid_country")) return REASON_COLOR.invalid_country;
  if (reason.startsWith("invalid_") || reason.startsWith("missing_")) return REASON_COLOR.invalid_params;
  return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
}

function bool(v: any) {
  if (v === true || v === "true") return <span className="text-green-600 font-mono">✓</span>;
  if (v === false || v === "false") return <span className="text-red-500 font-mono">✗</span>;
  return <span className="text-muted-foreground">—</span>;
}

function TechTooltip({ params }: { params: Record<string, any> }) {
  const fields: Array<[string, any]> = [
    ["decisionReason", params.decisionReason],
    ["finalDecision", params.finalDecision],
    ["isBotDetected", params.isBotDetected],
    ["botReasons", Array.isArray(params.botReasons) ? params.botReasons.join(", ") : params.botReasons],
    ["botConfidence", params.botConfidence],
    ["paramsValid", params.paramsValid],
    ["xcodeValid", params.xcodeValid],
    ["fbclValid", params.fbclValid],
    ["deviceAllowed", params.deviceAllowed],
    ["countryAllowed", params.countryAllowed],
    ["isDatacenter", params.isDatacenter],
    ["isProxy", params.isProxy],
    ["isCorporateProxy", params.isCorporateProxy],
    ["route", params.route],
    ["platform", params.platform],
    ["failReason", params.failReason],
  ].filter(([, v]) => v !== undefined && v !== null);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="text-muted-foreground hover:text-foreground">
            <Info className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-sm p-3 space-y-1 text-xs">
          {fields.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="text-muted-foreground min-w-[100px] shrink-0">{k}:</span>
              <span className="font-mono break-all">{String(v)}</span>
            </div>
          ))}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const EMPTY_FILTERS = {
  userId: "",
  email: "",
  offerId: "",
  redirectType: "",
  reason: "",
  platform: "",
  country: "",
  device: "",
  ip: "",
  startDate: "",
  endDate: "",
  botDetected: "",
  corporateProxy: "",
  datacenter: "",
  proxy: "",
};

export default function AdminClickLogs() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const setFilter = (key: keyof typeof EMPTY_FILTERS, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const resetFilters = () => { setFilters(EMPTY_FILTERS); setPage(1); };

  const qp = new URLSearchParams({ page: String(page), limit: "50" });
  (Object.entries(filters) as [string, string][]).forEach(([k, v]) => {
    if (v && v !== "all") qp.set(k, v);
  });

  const { data, isLoading } = useQuery<AdminClickLogsResponse>({
    queryKey: [`/api/admin/click-logs?${qp.toString()}`],
  });

  const totalPages = data ? Math.ceil(data.total / (data.limit || 50)) : 0;

  const exportCsv = () => {
    const exportQp = new URLSearchParams(qp);
    exportQp.set("limit", "10000");
    exportQp.set("page", "1");
    window.open(`/api/admin/click-logs/export?${exportQp.toString()}`, "_blank");
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Logs de Tráfego Global</h1>
        <Button variant="outline" size="sm" onClick={exportCsv} data-testid="button-export-csv">
          <Download className="w-4 h-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-4">
            <Input placeholder="User ID" value={filters.userId} onChange={e => setFilter("userId", e.target.value)} data-testid="filter-userId" />
            <Input placeholder="E-mail do usuário" value={filters.email} onChange={e => setFilter("email", e.target.value)} data-testid="filter-email" />
            <Input placeholder="IP" value={filters.ip} onChange={e => setFilter("ip", e.target.value)} data-testid="filter-ip" />
            <Input placeholder="País (BR, US...)" value={filters.country} onChange={e => setFilter("country", e.target.value)} data-testid="filter-country" />
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <Input type="date" value={filters.startDate} onChange={e => setFilter("startDate", e.target.value)} data-testid="filter-startDate" />
            <Input type="date" value={filters.endDate} onChange={e => setFilter("endDate", e.target.value)} data-testid="filter-endDate" />

            <Select value={filters.redirectType} onValueChange={v => setFilter("redirectType", v)}>
              <SelectTrigger data-testid="filter-redirectType"><SelectValue placeholder="Tipo (black/white)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="black">Black</SelectItem>
                <SelectItem value="white">White</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.platform} onValueChange={v => setFilter("platform", v)}>
              <SelectTrigger data-testid="filter-platform"><SelectValue placeholder="Plataforma" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="tiktok">TikTok</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            <Select value={filters.reason} onValueChange={v => setFilter("reason", v)}>
              <SelectTrigger data-testid="filter-reason"><SelectValue placeholder="Motivo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="valid_traffic">Tráfego Real</SelectItem>
                <SelectItem value="bot_detected">Bot Detectado</SelectItem>
                <SelectItem value="rate_limited">Rate Limited</SelectItem>
                <SelectItem value="invalid_params">Params Inválidos</SelectItem>
                <SelectItem value="invalid_device">Dispositivo Inválido</SelectItem>
                <SelectItem value="invalid_country">País Inválido</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.device} onValueChange={v => setFilter("device", v)}>
              <SelectTrigger data-testid="filter-device"><SelectValue placeholder="Dispositivo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="smartphone">Smartphone</SelectItem>
                <SelectItem value="tablet">Tablet</SelectItem>
                <SelectItem value="desktop">Desktop</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.botDetected} onValueChange={v => setFilter("botDetected", v)}>
              <SelectTrigger data-testid="filter-botDetected"><SelectValue placeholder="Bot?" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="true">Sim</SelectItem>
                <SelectItem value="false">Não</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.corporateProxy} onValueChange={v => setFilter("corporateProxy", v)}>
              <SelectTrigger data-testid="filter-corporateProxy"><SelectValue placeholder="Corp Proxy?" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="true">Sim</SelectItem>
                <SelectItem value="false">Não</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.datacenter} onValueChange={v => setFilter("datacenter", v)}>
              <SelectTrigger data-testid="filter-datacenter"><SelectValue placeholder="Datacenter?" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="true">Sim</SelectItem>
                <SelectItem value="false">Não</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={resetFilters} data-testid="button-reset-filters">
              <X className="w-3.5 h-3.5 mr-1" /> Limpar Filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !data?.logs.length ? (
            <div className="p-12 text-center text-muted-foreground">Nenhum log encontrado com os filtros atuais.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Data/Hora</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Oferta</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>País</TableHead>
                      <TableHead>Dispositivo</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead>DC</TableHead>
                      <TableHead>Proxy</TableHead>
                      <TableHead>Corp</TableHead>
                      <TableHead>Bot</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead className="max-w-[200px]">URL</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.logs.map((log) => {
                      const p = log.allParams || {};
                      const reason: string | undefined = p.decisionReason;
                      const displayReason = reason || (log.redirectedTo === "black" ? "valid_traffic" : "—");
                      return (
                        <TableRow key={log.id} data-testid={`row-admin-log-${log.id}`}>
                          <TableCell className="text-xs font-mono whitespace-nowrap">
                            {format(new Date(log.createdAt), "dd/MM HH:mm:ss")}
                          </TableCell>
                          <TableCell>
                            <div className="text-xs font-medium">{log.userEmail || log.userId?.substring(0, 8)}</div>
                            {log.userName && <div className="text-xs text-muted-foreground">{log.userName}</div>}
                          </TableCell>
                          <TableCell>
                            <div className="text-xs">{log.offerName || "-"}</div>
                            <Badge variant="outline" className="text-xs">
                              {log.platform === "tiktok" ? "TT" : log.platform === "facebook" ? "FB" : log.platform || "-"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={log.redirectedTo === "black" ? "default" : "secondary"} className="text-xs">
                              {log.redirectedTo}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${reasonColor(reason)}`}>
                              {displayReason.length > 28 ? displayReason.substring(0, 28) + "…" : displayReason}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">{log.country ? getCountryName(log.country, "pt-BR") : "—"}</TableCell>
                          <TableCell className="text-xs capitalize">{log.device || "—"}</TableCell>
                          <TableCell className="text-xs font-mono">{log.ipAddress || "—"}</TableCell>
                          <TableCell className="text-center">{bool(p.isDatacenter)}</TableCell>
                          <TableCell className="text-center">{bool(p.isProxy)}</TableCell>
                          <TableCell className="text-center">{bool(p.isCorporateProxy)}</TableCell>
                          <TableCell className="text-center">{bool(p.isBotDetected)}</TableCell>
                          <TableCell className="text-xs font-mono">{p.route || "—"}</TableCell>
                          <TableCell className="max-w-[180px]">
                            {log.requestUrl ? (
                              <div
                                className="text-xs font-mono text-muted-foreground truncate cursor-pointer hover:text-foreground"
                                title={log.requestUrl}
                                onClick={() => navigator.clipboard.writeText(log.requestUrl || "")}
                              >
                                {(() => {
                                  try {
                                    const u = new URL(log.requestUrl);
                                    return u.pathname + u.search;
                                  } catch {
                                    return log.requestUrl;
                                  }
                                })()}
                              </div>
                            ) : "—"}
                          </TableCell>
                          <TableCell>
                            <TechTooltip params={p} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between p-4 border-t">
                <div className="text-sm text-muted-foreground">
                  {data.logs.length} de {data.total} registros
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage(p => p - 1)} data-testid="button-prev-page">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm">{page} / {totalPages || 1}</span>
                  <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} data-testid="button-next-page">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
