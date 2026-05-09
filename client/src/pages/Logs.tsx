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
    redirectType: "",
    platform: "",
  });

  const { data: offers = [] } = useQuery<Offer[]>({
    queryKey: ["/api/offers"],
  });

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: "50",
    ...(filters.offerId && filters.offerId !== "all" && { offerId: filters.offerId }),
    ...(filters.redirectType && filters.redirectType !== "all" && { redirectType: filters.redirectType }),
    ...(filters.platform && filters.platform !== "all" && { platform: filters.platform }),
  });

  const { data, isLoading } = useQuery<LogsResponse>({
    queryKey: [`/api/logs?${queryParams.toString()}`],
  });

  const totalPages = data ? Math.ceil(data.total / (data.limit || 50)) : 0;

  const formatTimestamp = (date: Date | string) => {
    return format(new Date(date), "dd/MM/yyyy HH:mm:ss", {
      locale: language === "pt-BR" ? ptBR : enUS,
    });
  };

  const resetFilters = () => {
    setFilters({ offerId: "", redirectType: "", platform: "" });
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
          <div className="grid gap-4 md:grid-cols-4">
            <Select
              value={filters.offerId}
              onValueChange={(v) => { setFilters({ ...filters, offerId: v }); setPage(1); }}
            >
              <SelectTrigger data-testid="filter-offer">
                <SelectValue placeholder={t("logs.offer")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")}</SelectItem>
                {offers.map((o) => (
                  <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.platform}
              onValueChange={(v) => { setFilters({ ...filters, platform: v }); setPage(1); }}
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

            <Select
              value={filters.redirectType}
              onValueChange={(v) => { setFilters({ ...filters, redirectType: v }); setPage(1); }}
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
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !data?.logs.length ? (
            <div className="p-12 text-center text-muted-foreground">{t("logs.noLogs")}</div>
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
                          <div className="text-sm font-medium">{log.offer?.name || "-"}</div>
                          <Badge variant="outline" className="text-xs mt-0.5">
                            {log.offer?.platform === "tiktok" ? "TikTok" : "Facebook"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={log.redirectedTo === "black" ? "default" : "secondary"}>
                            {log.redirectedTo === "black" ? t("logs.black") : t("logs.white")}
                          </Badge>
                        </TableCell>
                        <TableCell>{log.country ? getCountryName(log.country, language) : "-"}</TableCell>
                        <TableCell className="capitalize">{log.device || "-"}</TableCell>
                        <TableCell className="max-w-[260px]">
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
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              {pt ? "Sem dados" : "No data"}
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
                  {pt
                    ? `Mostrando ${data.logs.length} de ${data.total} registros`
                    : `Showing ${data.logs.length} of ${data.total} records`}
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
