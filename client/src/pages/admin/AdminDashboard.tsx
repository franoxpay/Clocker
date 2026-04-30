import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { format } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";
import { Link } from "wouter";

interface DashboardMetrics {
  clicksToday: { total: number; black: number; white: number; failed: number };
  clicksLast7Days: { total: number; black: number; white: number; failed: number };
  clicksByDay: Array<{ date: string; total: number; black: number; white: number; failed: number }>;
  usersTotal: { total: number; paid: number; free: number };
  usersByPlan: Array<{ planId: number; planName: string; count: number }>;
}

interface UsersNewData {
  date: string;
  count: number;
}

interface UserRanking {
  id: string;
  email: string;
  planName: string | null;
  totalClicks: number;
  clicksToday: number;
}

interface RankingResponse {
  users: UserRanking[];
  total: number;
}

export default function AdminDashboard() {
  const { language } = useLanguage();
  const dateLocale = language === "pt-BR" ? ptBR : enUS;
  const isPt = language === "pt-BR";

  const [platformFilter, setPlatformFilter] = useState("all");
  const [usersPeriod, setUsersPeriod] = useState<"7d" | "30d" | "1y">("7d");
  const [rankingPeriod, setRankingPeriod] = useState<"today" | "7d" | "30d">("today");
  const [rankingPage, setRankingPage] = useState(1);
  const rankingLimit = 25;

  const { data: metrics, isLoading: metricsLoading } = useQuery<DashboardMetrics>({
    queryKey: ["/api/admin/dashboard", platformFilter],
    queryFn: async ({ queryKey }) => {
      const [, platform] = queryKey;
      const params = new URLSearchParams();
      if (platform && platform !== "all") params.set("platform", platform as string);
      const url = params.toString() ? `/api/admin/dashboard?${params}` : "/api/admin/dashboard";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    refetchInterval: 300000,
  });

  const { data: usersNewData, isLoading: usersNewLoading } = useQuery<UsersNewData[]>({
    queryKey: ["/api/admin/users-new", usersPeriod],
    queryFn: async ({ queryKey }) => {
      const [, period] = queryKey;
      const res = await fetch(`/api/admin/users-new?period=${period}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    refetchInterval: 300000,
  });

  const { data: rankingData, isLoading: rankingLoading } = useQuery<RankingResponse>({
    queryKey: ["/api/admin/users-ranking", rankingPage, rankingPeriod, platformFilter],
    queryFn: async ({ queryKey }) => {
      const [, page, period, platform] = queryKey;
      const params = new URLSearchParams({
        page: String(page),
        limit: String(rankingLimit),
        period: period as string,
      });
      if (platform && platform !== "all") params.set("platform", platform as string);
      const res = await fetch(`/api/admin/users-ranking?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    refetchInterval: 300000,
  });

  const totalRankingPages = Math.ceil((rankingData?.total || 0) / rankingLimit);

  const t = {
    title: isPt ? "Dashboard" : "Dashboard",
    clicksToday: isPt ? "Clicks Hoje" : "Clicks Today",
    clicksLast7Days: isPt ? "Clicks Ultimos 7 Dias" : "Clicks Last 7 Days",
    black: "Black",
    white: "White",
    failed: isPt ? "Falhas" : "Failed",
    total: "Total",
    usersTotal: isPt ? "Usuarios Totais" : "Total Users",
    usersPaid: isPt ? "Pagos" : "Paid",
    usersFree: isPt ? "Gratuitos" : "Free",
    newUsers: isPt ? "Novos Usuarios" : "New Users",
    last7Days: isPt ? "Ultimos 7 dias" : "Last 7 days",
    last30Days: isPt ? "Ultimos 30 dias" : "Last 30 days",
    lastYear: isPt ? "Ultimo ano" : "Last year",
    planDistribution: isPt ? "Distribuicao por Plano" : "Plan Distribution",
    usersRanking: isPt ? "Ranking de Usuarios por Clicks" : "Users Ranking by Clicks",
    email: "Email",
    plan: isPt ? "Plano" : "Plan",
    totalClicks: isPt ? "Clicks Totais" : "Total Clicks",
    todayClicks: isPt ? "Clicks Hoje" : "Today Clicks",
    actions: isPt ? "Acoes" : "Actions",
    allPlatforms: isPt ? "Todas" : "All",
    platform: isPt ? "Plataforma" : "Platform",
    period: isPt ? "Periodo" : "Period",
    today: isPt ? "Hoje" : "Today",
    noData: isPt ? "Sem dados" : "No data",
    clicksEvolution: isPt ? "Evolucao de Clicks (7 dias)" : "Clicks Evolution (7 days)",
    users: isPt ? "usuarios" : "users",
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      if (usersPeriod === "1y") {
        return format(date, "MMM/yy", { locale: dateLocale });
      }
      return format(date, "dd/MM", { locale: dateLocale });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-32" data-testid="filter-platform">
              <SelectValue placeholder={t.platform} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.allPlatforms}</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
              <SelectItem value="facebook">Facebook</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t.clicksToday}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="space-y-1">
                <div className="text-2xl font-bold" data-testid="clicks-today-total">
                  {metrics?.clicksToday.total.toLocaleString() || 0}
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>B: {metrics?.clicksToday.black || 0}</span>
                  <span>W: {metrics?.clicksToday.white || 0}</span>
                  <span className="text-destructive">F: {metrics?.clicksToday.failed || 0}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t.clicksLast7Days}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="space-y-1">
                <div className="text-2xl font-bold" data-testid="clicks-7days-total">
                  {metrics?.clicksLast7Days.total.toLocaleString() || 0}
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>B: {metrics?.clicksLast7Days.black || 0}</span>
                  <span>W: {metrics?.clicksLast7Days.white || 0}</span>
                  <span className="text-destructive">F: {metrics?.clicksLast7Days.failed || 0}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t.usersTotal}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="space-y-1">
                <div className="text-2xl font-bold" data-testid="users-total">
                  {metrics?.usersTotal.total.toLocaleString() || 0}
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="text-green-600">{t.usersPaid}: {metrics?.usersTotal.paid || 0}</span>
                  <span>{t.usersFree}: {metrics?.usersTotal.free || 0}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t.planDistribution}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-full" />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {metrics?.usersByPlan.map((plan) => (
                  <Badge key={plan.planId} variant="secondary" className="text-xs">
                    {plan.planName}: {plan.count}
                  </Badge>
                ))}
                {!metrics?.usersByPlan.length && (
                  <span className="text-xs text-muted-foreground">{t.noData}</span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base font-medium">{t.clicksEvolution}</CardTitle>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : metrics?.clicksByDay.length ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.clicksByDay}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(val) => format(new Date(val), "dd/MM", { locale: dateLocale })}
                      className="text-xs"
                    />
                    <YAxis className="text-xs" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px",
                      }}
                    />
                    <Legend />
                    <Bar dataKey="black" name={t.black} fill="hsl(var(--chart-1))" stackId="a" />
                    <Bar dataKey="white" name={t.white} fill="hsl(var(--chart-2))" stackId="a" />
                    <Bar dataKey="failed" name={t.failed} fill="hsl(var(--destructive))" stackId="a" />
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
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base font-medium">{t.newUsers}</CardTitle>
            <Select value={usersPeriod} onValueChange={(v) => setUsersPeriod(v as "7d" | "30d" | "1y")}>
              <SelectTrigger className="w-36" data-testid="filter-users-period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">{t.last7Days}</SelectItem>
                <SelectItem value="30d">{t.last30Days}</SelectItem>
                <SelectItem value="1y">{t.lastYear}</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {usersNewLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : usersNewData?.length ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={usersNewData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tickFormatter={formatDate} className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px",
                      }}
                      formatter={(value: number) => [value, t.users]}
                    />
                    <Bar dataKey="count" name={t.newUsers} fill="hsl(var(--chart-3))" />
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
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base font-medium">{t.usersRanking}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={rankingPeriod} onValueChange={(v) => { setRankingPeriod(v as "today" | "7d" | "30d"); setRankingPage(1); }}>
              <SelectTrigger className="w-32" data-testid="filter-ranking-period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">{t.today}</SelectItem>
                <SelectItem value="7d">{t.last7Days}</SelectItem>
                <SelectItem value="30d">{t.last30Days}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {rankingLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : rankingData?.users.length ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>{t.email}</TableHead>
                    <TableHead>{t.plan}</TableHead>
                    <TableHead className="text-right">{t.totalClicks}</TableHead>
                    <TableHead className="text-right">{t.todayClicks}</TableHead>
                    <TableHead className="text-right">{t.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rankingData.users.map((user, index) => (
                    <TableRow key={user.id} data-testid={`ranking-row-${user.id}`}>
                      <TableCell className="font-medium">
                        {(rankingPage - 1) * rankingLimit + index + 1}
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        {user.planName ? (
                          <Badge variant="outline">{user.planName}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {user.totalClicks.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {user.clicksToday.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/confg-admin/users?search=${encodeURIComponent(user.email)}`}>
                          <Button size="icon" variant="ghost" data-testid={`view-user-${user.id}`}>
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalRankingPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-sm text-muted-foreground">
                    {isPt ? `Pagina ${rankingPage} de ${totalRankingPages}` : `Page ${rankingPage} of ${totalRankingPages}`}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="outline"
                      disabled={rankingPage <= 1}
                      onClick={() => setRankingPage((p) => Math.max(1, p - 1))}
                      data-testid="ranking-prev-page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      disabled={rankingPage >= totalRankingPages}
                      onClick={() => setRankingPage((p) => p + 1)}
                      data-testid="ranking-next-page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
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
