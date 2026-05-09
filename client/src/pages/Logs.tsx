import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useLanguage } from "@/contexts/LanguageContext";
import { getCountryName } from "@/lib/countries";
import type { ClickLog, Offer, Domain } from "@shared/schema";
import { ChevronLeft, ChevronRight, Filter, Info } from "lucide-react";
import { format } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";

interface LogsResponse {
  logs: Array<ClickLog & { offer?: Offer }>;
  total: number;
  page: number;
  limit: number;
}

// ── Decision reason display helpers ─────────────────────────────
type ReasonCategory = 'valid' | 'bot' | 'params' | 'device' | 'country' | 'unknown';

function getReasonCategory(reason: string | undefined): ReasonCategory {
  if (!reason || reason === 'valid_traffic') return 'valid';
  if (reason.startsWith('bot_detected') || reason.startsWith('rate_limited')) return 'bot';
  if (reason.startsWith('invalid_device')) return 'device';
  if (reason.startsWith('invalid_country')) return 'country';
  if (
    reason.startsWith('invalid_') ||
    reason.startsWith('missing_') ||
    reason === 'missing_params'
  ) return 'params';
  return 'unknown';
}

function getReasonLabel(reason: string | undefined, lang: string): string {
  if (!reason || reason === 'valid_traffic') return lang === 'pt-BR' ? 'Tráfego Real' : 'Real Traffic';
  const map: Record<string, { pt: string; en: string }> = {
    'bot_detected:rate_limited':       { pt: 'Limite de Taxa', en: 'Rate Limited' },
    'bot_detected:datacenter_ip':      { pt: 'IP Datacenter', en: 'Datacenter IP' },
    'bot_detected:proxy_ip':           { pt: 'IP Proxy', en: 'Proxy IP' },
    'bot_detected:facebook_crawler':   { pt: 'Crawler Facebook', en: 'Facebook Crawler' },
    'bot_detected:headless_browser':   { pt: 'Navegador Headless', en: 'Headless Browser' },
    'bot_detected:facebook_background':{ pt: 'Facebook Background', en: 'Facebook Background' },
    'bot_detected:empty_ua':           { pt: 'UA Vazio', en: 'Empty UA' },
    'bot_detected:fake_chrome_version':{ pt: 'Chrome Falso', en: 'Fake Chrome' },
    'bot_detected:unresolved_macro':   { pt: 'Macro Não Resolvida', en: 'Unresolved Macro' },
    'bot_detected:ua_pattern':         { pt: 'UA de Bot', en: 'Bot UA Pattern' },
    'bot_detected:ua_typo':            { pt: 'UA com Erro', en: 'UA Typo' },
    'invalid_xcode':                   { pt: 'xcode Inválido', en: 'Invalid xcode' },
    'invalid_fbcl_format':             { pt: 'fbcl Inválido', en: 'Invalid fbcl' },
    'missing_params':                  { pt: 'Params Ausentes', en: 'Missing Params' },
    'missing_xcode':                   { pt: 'xcode Ausente', en: 'Missing xcode' },
    'missing_ttclid':                  { pt: 'ttclid Ausente', en: 'Missing ttclid' },
    'missing_utm_medium':              { pt: 'utm_medium Ausente', en: 'Missing utm_medium' },
    'missing_utm_content':             { pt: 'utm_content Ausente', en: 'Missing utm_content' },
    'missing_utm_campaign':            { pt: 'utm_campaign Ausente', en: 'Missing utm_campaign' },
  };
  if (map[reason]) return lang === 'pt-BR' ? map[reason].pt : map[reason].en;
  if (reason.startsWith('invalid_device:')) {
    const d = reason.replace('invalid_device:', '');
    return lang === 'pt-BR' ? `Dispositivo: ${d}` : `Device: ${d}`;
  }
  if (reason.startsWith('invalid_country:')) {
    const c = reason.replace('invalid_country:', '');
    return lang === 'pt-BR' ? `País: ${c}` : `Country: ${c}`;
  }
  if (reason.startsWith('bot_detected:')) {
    const sub = reason.replace('bot_detected:', '');
    return lang === 'pt-BR' ? `Bot: ${sub}` : `Bot: ${sub}`;
  }
  return reason;
}

function ReasonBadge({ log, lang }: { log: ClickLog & { offer?: Offer }; lang: string }) {
  const params = (log.allParams as any) || {};
  const reason: string | undefined = params.decisionReason ?? (log.redirectedTo === 'black' ? 'valid_traffic' : undefined);
  const category = getReasonCategory(reason);
  const label = getReasonLabel(reason, lang);

  const colorMap: Record<ReasonCategory, string> = {
    valid:   'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    bot:     'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    params:  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    device:  'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    country: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    unknown: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  };

  const tooltipLines: Array<[string, string]> = [
    [lang === 'pt-BR' ? 'Decisão' : 'Decision', reason ?? '—'],
    [lang === 'pt-BR' ? 'Bot detectado' : 'Bot detected', String(params.isBotDetected ?? '—')],
  ];
  if (params.botReasons?.length) {
    tooltipLines.push([lang === 'pt-BR' ? 'Motivos bot' : 'Bot reasons', (params.botReasons as string[]).join(', ')]);
  }
  if (params.botConfidence) {
    tooltipLines.push([lang === 'pt-BR' ? 'Confiança' : 'Confidence', params.botConfidence]);
  }
  tooltipLines.push(
    ['paramsValid', String(params.paramsValid ?? '—')],
    ['xcodeValid',  String(params.xcodeValid  ?? '—')],
    ['fbclValid',   String(params.fbclValid   ?? '—')],
    ['deviceAllowed',  String(params.deviceAllowed  ?? '—')],
    ['countryAllowed', String(params.countryAllowed ?? '—')],
  );
  if (params.isDatacenter !== undefined) tooltipLines.push(['isDatacenter',    String(params.isDatacenter)]);
  if (params.isProxy !== undefined)      tooltipLines.push(['isProxy',         String(params.isProxy)]);
  if (params.isCorporateProxy !== undefined) tooltipLines.push(['corporateProxy', String(params.isCorporateProxy)]);
  if (params.route)    tooltipLines.push(['route',    params.route]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            data-testid={`badge-reason-${log.id}`}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium cursor-help ${colorMap[category]}`}
          >
            {label}
            <Info className="w-3 h-3 opacity-60" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs p-3 space-y-1 text-xs">
          {tooltipLines.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="text-muted-foreground min-w-[90px] shrink-0">{k}:</span>
              <span className="font-mono break-all">{v}</span>
            </div>
          ))}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function Logs() {
  const { t, language } = useLanguage();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    offerId: "",
    domainId: "",
    redirectType: "",
    platform: "",
    reason: "",
  });

  const { data: offers = [] } = useQuery<Offer[]>({
    queryKey: ["/api/offers"],
  });

  const { data: domains = [] } = useQuery<Domain[]>({
    queryKey: ["/api/domains"],
  });

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: "50",
    ...(filters.offerId && { offerId: filters.offerId }),
    ...(filters.domainId && { domainId: filters.domainId }),
    ...(filters.redirectType && { redirectType: filters.redirectType }),
    ...(filters.platform && { platform: filters.platform }),
    ...(filters.reason && { reason: filters.reason }),
  });

  const { data, isLoading } = useQuery<LogsResponse>({
    queryKey: [`/api/logs?${queryParams.toString()}`],
  });

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  const formatTimestamp = (date: Date | string) => {
    return format(new Date(date), "dd/MM/yyyy HH:mm:ss", {
      locale: language === "pt-BR" ? ptBR : enUS,
    });
  };

  const resetFilters = () => {
    setFilters({ offerId: "", domainId: "", redirectType: "", platform: "", reason: "" });
    setPage(1);
  };

  const pt = language === "pt-BR";

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-4 h-4" />
            {t("logs.filter")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
            <div>
              <Select
                value={filters.offerId}
                onValueChange={(value) => { setFilters({ ...filters, offerId: value }); setPage(1); }}
              >
                <SelectTrigger data-testid="filter-offer">
                  <SelectValue placeholder={t("logs.offer")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}</SelectItem>
                  {offers.map((offer) => (
                    <SelectItem key={offer.id} value={String(offer.id)}>{offer.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Select
                value={filters.domainId}
                onValueChange={(value) => { setFilters({ ...filters, domainId: value }); setPage(1); }}
              >
                <SelectTrigger data-testid="filter-domain">
                  <SelectValue placeholder={t("logs.domain")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}</SelectItem>
                  {domains.map((domain) => (
                    <SelectItem key={domain.id} value={String(domain.id)}>{domain.subdomain}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Select
                value={filters.platform}
                onValueChange={(value) => { setFilters({ ...filters, platform: value }); setPage(1); }}
              >
                <SelectTrigger data-testid="filter-platform">
                  <SelectValue placeholder={t("logs.platform")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Select
                value={filters.redirectType}
                onValueChange={(value) => { setFilters({ ...filters, redirectType: value }); setPage(1); }}
              >
                <SelectTrigger data-testid="filter-redirect-type">
                  <SelectValue placeholder={t("logs.redirectType")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}</SelectItem>
                  <SelectItem value="black">{t("logs.black")}</SelectItem>
                  <SelectItem value="white">{t("logs.white")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Select
                value={filters.reason}
                onValueChange={(value) => { setFilters({ ...filters, reason: value }); setPage(1); }}
              >
                <SelectTrigger data-testid="filter-reason">
                  <SelectValue placeholder={pt ? "Motivo" : "Reason"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}</SelectItem>
                  <SelectItem value="valid_traffic">{pt ? "Tráfego Real" : "Real Traffic"}</SelectItem>
                  <SelectItem value="bot_detected">{pt ? "Bot Detectado" : "Bot Detected"}</SelectItem>
                  <SelectItem value="rate_limited">{pt ? "Limite de Taxa" : "Rate Limited"}</SelectItem>
                  <SelectItem value="invalid_params">{pt ? "Params Inválidos" : "Invalid Params"}</SelectItem>
                  <SelectItem value="invalid_device">{pt ? "Dispositivo Inválido" : "Invalid Device"}</SelectItem>
                  <SelectItem value="invalid_country">{pt ? "País Inválido" : "Invalid Country"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button variant="outline" onClick={resetFilters} data-testid="button-reset-filters">
              {pt ? "Limpar" : "Clear"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !data?.logs.length ? (
            <div className="p-12 text-center text-muted-foreground">
              {t("logs.noLogs")}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("logs.timestamp")}</TableHead>
                      <TableHead>{t("logs.offer")}</TableHead>
                      <TableHead>{t("logs.redirectType")}</TableHead>
                      <TableHead>{pt ? "Motivo" : "Reason"}</TableHead>
                      <TableHead>{t("logs.country")}</TableHead>
                      <TableHead>{t("logs.device")}</TableHead>
                      <TableHead>{pt ? "URL de Entrada" : "Request URL"}</TableHead>
                      <TableHead>{t("logs.ip")}</TableHead>
                      <TableHead className="max-w-xs">{t("logs.userAgent")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.logs.map((log) => (
                      <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                        <TableCell className="text-sm font-mono whitespace-nowrap">
                          {formatTimestamp(log.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{log.offer?.name || "-"}</div>
                          <Badge variant="outline" className="text-xs">
                            {log.offer?.platform === "tiktok" ? "TikTok" : "Facebook"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={log.redirectedTo === "black" ? "default" : "secondary"}>
                            {log.redirectedTo === "black" ? t("logs.black") : t("logs.white")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <ReasonBadge log={log} lang={language} />
                        </TableCell>
                        <TableCell>
                          {log.country ? getCountryName(log.country, language) : "-"}
                        </TableCell>
                        <TableCell className="capitalize">{log.device || "-"}</TableCell>
                        <TableCell className="max-w-[280px]">
                          {log.requestUrl ? (
                            <div
                              className="text-xs font-mono text-muted-foreground truncate cursor-pointer hover:text-foreground"
                              title={log.requestUrl}
                              onClick={() => navigator.clipboard.writeText(log.requestUrl || "")}
                            >
                              {(() => {
                                try {
                                  const url = new URL(log.requestUrl);
                                  return url.pathname + url.search;
                                } catch {
                                  return log.requestUrl;
                                }
                              })()}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              {(log.allParams as any)?.referer ? (
                                (() => {
                                  try {
                                    const url = new URL((log.allParams as any).referer);
                                    return url.hostname.replace('www.', '').replace('m.', '');
                                  } catch {
                                    return (log.allParams as any).referer;
                                  }
                                })()
                              ) : (pt ? "Sem dados" : "No data")}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm font-mono">{log.ipAddress || "-"}</TableCell>
                        <TableCell className="max-w-xs">
                          <div
                            className="text-xs text-muted-foreground truncate"
                            title={log.userAgent || ""}
                          >
                            {log.userAgent || "-"}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between p-4 border-t">
                <div className="text-sm text-muted-foreground">
                  {pt
                    ? `Mostrando ${data.logs.length} de ${data.total} registros`
                    : `Showing ${data.logs.length} of ${data.total} records`}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    data-testid="button-prev-page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm">{page} / {totalPages || 1}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    data-testid="button-next-page"
                  >
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
