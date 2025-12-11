import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
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
} from "recharts";
import { MousePointerClick, Link as LinkIcon, Globe, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";

interface DashboardStats {
  todayClicks: number;
  totalClicks: number;
  activeOffers: number;
  activeDomains: number;
  clicksLast7Days: Array<{
    date: string;
    clicks: number;
    blackClicks: number;
    whiteClicks: number;
  }>;
  clicksByOffer: Array<{
    name: string;
    clicks: number;
  }>;
  clicksByDomain: Array<{
    name: string;
    clicks: number;
  }>;
}

export default function Dashboard() {
  const { t, language } = useLanguage();
  const { user } = useAuth();

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return format(date, "dd/MM", { locale: language === "pt-BR" ? ptBR : enUS });
  };

  const statCards = [
    {
      title: t("dashboard.todayClicks"),
      value: stats?.todayClicks ?? 0,
      icon: MousePointerClick,
      color: "text-primary",
    },
    {
      title: t("dashboard.totalClicks"),
      value: stats?.totalClicks ?? 0,
      icon: TrendingUp,
      color: "text-chart-2",
    },
    {
      title: t("dashboard.activeOffers"),
      value: stats?.activeOffers ?? 0,
      icon: LinkIcon,
      color: "text-chart-3",
    },
    {
      title: t("dashboard.activeDomains"),
      value: stats?.activeDomains ?? 0,
      icon: Globe,
      color: "text-chart-4",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold" data-testid="title-dashboard">
          {t("dashboard.title")}
        </h1>
        {user?.clicksUsedThisMonth !== undefined && user?.planId && (
          <div className="text-sm text-muted-foreground">
            {language === "pt-BR" ? "Clicks usados: " : "Clicks used: "}
            <span className="font-medium text-foreground">
              {user.clicksUsedThisMonth.toLocaleString()}
            </span>
          </div>
        )}
      </div>

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
                  data-testid={`stat-${index}`}
                >
                  {card.value.toLocaleString()}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.clicksChart")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats?.clicksLast7Days ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={formatDate}
                    className="text-xs"
                  />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)",
                    }}
                    labelFormatter={formatDate}
                  />
                  <Line
                    type="monotone"
                    dataKey="clicks"
                    name={language === "pt-BR" ? "Total" : "Total"}
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="blackClicks"
                    name="Black"
                    stroke="hsl(var(--chart-3))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="whiteClicks"
                    name="White"
                    stroke="hsl(var(--chart-4))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.clicksByOffer")}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : stats?.clicksByOffer?.length ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.clicksByOffer.slice(0, 5)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" />
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      className="text-xs"
                      width={100}
                      tickFormatter={(value) => value.length > 12 ? `${value.slice(0, 12)}...` : value}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "var(--radius)",
                      }}
                    />
                    <Bar 
                      dataKey="clicks" 
                      fill="hsl(var(--primary))" 
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                {t("offers.noOffers")}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.clicksByDomain")}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : stats?.clicksByDomain?.length ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.clicksByDomain.slice(0, 5)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" />
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      className="text-xs"
                      width={120}
                      tickFormatter={(value) => value.length > 15 ? `${value.slice(0, 15)}...` : value}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "var(--radius)",
                      }}
                    />
                    <Bar 
                      dataKey="clicks" 
                      fill="hsl(var(--chart-2))" 
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                {t("domains.noDomains")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
