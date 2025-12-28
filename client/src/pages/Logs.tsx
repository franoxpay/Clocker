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
import { useLanguage } from "@/contexts/LanguageContext";
import { getCountryName } from "@/lib/countries";
import type { ClickLog, Offer, Domain } from "@shared/schema";
import { ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { format } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";

interface LogsResponse {
  logs: Array<ClickLog & { offer?: Offer }>;
  total: number;
  page: number;
  limit: number;
}

export default function Logs() {
  const { t, language } = useLanguage();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    offerId: "",
    domainId: "",
    redirectType: "",
    platform: "",
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
    setFilters({
      offerId: "",
      domainId: "",
      redirectType: "",
      platform: "",
    });
    setPage(1);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold" data-testid="title-logs">
          {t("logs.title")}
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-4 h-4" />
            {t("logs.filter")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div>
              <Select
                value={filters.offerId}
                onValueChange={(value) => {
                  setFilters({ ...filters, offerId: value });
                  setPage(1);
                }}
              >
                <SelectTrigger data-testid="filter-offer">
                  <SelectValue placeholder={t("logs.offer")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}</SelectItem>
                  {offers.map((offer) => (
                    <SelectItem key={offer.id} value={String(offer.id)}>
                      {offer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Select
                value={filters.domainId}
                onValueChange={(value) => {
                  setFilters({ ...filters, domainId: value });
                  setPage(1);
                }}
              >
                <SelectTrigger data-testid="filter-domain">
                  <SelectValue placeholder={t("logs.domain")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}</SelectItem>
                  {domains.map((domain) => (
                    <SelectItem key={domain.id} value={String(domain.id)}>
                      {domain.subdomain}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Select
                value={filters.platform}
                onValueChange={(value) => {
                  setFilters({ ...filters, platform: value });
                  setPage(1);
                }}
              >
                <SelectTrigger data-testid="filter-platform">
                  <SelectValue placeholder={t("logs.platform")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}</SelectItem>
                  <SelectItem value="tiktok2">TikTok</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Select
                value={filters.redirectType}
                onValueChange={(value) => {
                  setFilters({ ...filters, redirectType: value });
                  setPage(1);
                }}
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

            <Button variant="outline" onClick={resetFilters} data-testid="button-reset-filters">
              {language === "pt-BR" ? "Limpar Filtros" : "Clear Filters"}
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
                      <TableHead>{t("logs.country")}</TableHead>
                      <TableHead>{t("logs.device")}</TableHead>
                      <TableHead>{language === "pt-BR" ? "URL de Entrada" : "Request URL"}</TableHead>
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
                            {log.offer?.platform === "tiktok2" ? "TikTok" : "Facebook"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={log.redirectedTo === "black" ? "default" : "secondary"}
                          >
                            {log.redirectedTo === "black" ? t("logs.black") : t("logs.white")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {log.country ? getCountryName(log.country, language) : "-"}
                        </TableCell>
                        <TableCell className="capitalize">{log.device || "-"}</TableCell>
                        <TableCell className="max-w-[300px]">
                          {log.requestUrl ? (
                            <div 
                              className="text-xs font-mono text-muted-foreground truncate cursor-help"
                              title={(() => {
                                try {
                                  const url = new URL(log.requestUrl);
                                  return url.pathname + url.search;
                                } catch {
                                  return log.requestUrl;
                                }
                              })()}
                            >
                              {(() => {
                                try {
                                  const url = new URL(log.requestUrl);
                                  const path = url.pathname;
                                  const params = new URLSearchParams(url.search);
                                  const maskedParams: string[] = [];
                                  params.forEach((value, key) => {
                                    if (key.toLowerCase() === "xcode") {
                                      maskedParams.push(`${key}=${value}`);
                                    } else if (value.length <= 4) {
                                      maskedParams.push(`${key}=${value}***`);
                                    } else {
                                      maskedParams.push(`${key}=${value.substring(0, 4)}****`);
                                    }
                                  });
                                  return path + (maskedParams.length > 0 ? "?" + maskedParams.join("&") : "");
                                } catch {
                                  return log.requestUrl || "-";
                                }
                              })()}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              {(log.allParams as any)?.referer ? (
                                (() => {
                                  try {
                                    const url = new URL((log.allParams as any).referer);
                                    const hostname = url.hostname.replace('www.', '').replace('m.', '');
                                    if (hostname.length <= 8) return hostname;
                                    return hostname.substring(0, 4) + "***";
                                  } catch {
                                    const val = (log.allParams as any).referer || "";
                                    if (val.length <= 8) return val;
                                    return val.substring(0, 4) + "***";
                                  }
                                })()
                              ) : (
                                language === "pt-BR" ? "Sem dados" : "No data"
                              )}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm font-mono">{log.ipAddress || "-"}</TableCell>
                        <TableCell className="max-w-xs">
                          <div className="text-xs text-muted-foreground truncate" title={log.userAgent || ""}>
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
                  {language === "pt-BR"
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
                  <span className="text-sm">
                    {page} / {totalPages || 1}
                  </span>
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
