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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Plan } from "@shared/schema";
import {
  Wallet,
  Users,
  UserPlus,
  UserX,
  Clock,
  DollarSign,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Calendar,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { format } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";

interface BillingMetrics {
  subscriptionsActive: number;
  subscriptionsInactive: number;
  subscriptionsTrial: number;
  subscriptionsSuspended: number;
  usersToday: number;
  usersThisMonth: number;
  mrr: number;
  totalRevenue: number;
}

interface Subscriber {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  planId: number | null;
  planName: string | null;
  subscriptionStatus: string;
  subscriptionStartDate: string | null;
  subscriptionEndDate: string | null;
  stripeCustomerId: string | null;
}

interface SubscribersResponse {
  subscribers: Subscriber[];
  total: number;
  page: number;
  limit: number;
}

interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  date: string | null;
  userEmail: string | null;
  description: string | null;
}

interface PaymentsResponse {
  payments: Payment[];
  hasMore: boolean;
  lastId: string | null;
}

interface ChartData {
  date: string;
  count: number;
}

const COLORS = ["#10B981", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6"];

export default function AdminBilling() {
  const { language } = useLanguage();
  const [subscribersPage, setSubscribersPage] = useState(1);
  const [subscribersLimit, setSubscribersLimit] = useState(25);
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [chartPeriod, setChartPeriod] = useState<"7d" | "30d" | "1y">("30d");

  const locale = language === "pt-BR" ? ptBR : enUS;

  const { data: metrics, isLoading: metricsLoading } = useQuery<BillingMetrics>({
    queryKey: ["/api/admin/billing/metrics"],
  });

  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });

  const subscribersUrl = `/api/admin/billing/subscribers?page=${subscribersPage}&limit=${subscribersLimit}${statusFilter !== "all" ? `&status=${statusFilter}` : ""}${planFilter !== "all" ? `&planId=${planFilter}` : ""}`;
  
  const { data: subscribersData, isLoading: subscribersLoading } = useQuery<SubscribersResponse>({
    queryKey: [subscribersUrl],
  });

  const { data: paymentsData, isLoading: paymentsLoading } = useQuery<PaymentsResponse>({
    queryKey: ["/api/admin/billing/payments"],
  });

  const { data: chartData = [] } = useQuery<ChartData[]>({
    queryKey: ["/api/admin/billing/subscriptions-chart", chartPeriod],
  });

  const totalSubscribersPages = subscribersData ? Math.ceil(subscribersData.total / subscribersLimit) : 1;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">{language === "pt-BR" ? "Ativo" : "Active"}</Badge>;
      case "inactive":
        return <Badge variant="secondary">{language === "pt-BR" ? "Inativo" : "Inactive"}</Badge>;
      case "trial":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">{language === "pt-BR" ? "Trial" : "Trial"}</Badge>;
      case "suspended":
        return <Badge variant="destructive">{language === "pt-BR" ? "Suspenso" : "Suspended"}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(language === "pt-BR" ? "pt-BR" : "en-US", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return format(new Date(dateStr), "dd/MM/yyyy", { locale });
  };

  const pieData = metrics ? [
    { name: language === "pt-BR" ? "Ativos" : "Active", value: metrics.subscriptionsActive },
    { name: language === "pt-BR" ? "Inativos" : "Inactive", value: metrics.subscriptionsInactive },
    { name: "Trial", value: metrics.subscriptionsTrial },
    { name: language === "pt-BR" ? "Suspensos" : "Suspended", value: metrics.subscriptionsSuspended },
  ].filter(d => d.value > 0) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold" data-testid="text-billing-title">
          {language === "pt-BR" ? "Faturamento" : "Billing"}
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {language === "pt-BR" ? "Assinaturas Ativas" : "Active Subscriptions"}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-green-500" data-testid="text-active-subs">
                {metrics?.subscriptionsActive || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {language === "pt-BR" ? "Assinaturas Inativas" : "Inactive Subscriptions"}
            </CardTitle>
            <UserX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-inactive-subs">
                {metrics?.subscriptionsInactive || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {language === "pt-BR" ? "Em Trial" : "On Trial"}
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-blue-500" data-testid="text-trial-subs">
                {metrics?.subscriptionsTrial || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {language === "pt-BR" ? "Suspensos" : "Suspended"}
            </CardTitle>
            <UserX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-red-500" data-testid="text-suspended-subs">
                {metrics?.subscriptionsSuspended || 0}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {language === "pt-BR" ? "Usuários Hoje" : "Users Today"}
            </CardTitle>
            <UserPlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-users-today">
                {metrics?.usersToday || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {language === "pt-BR" ? "Usuários Este Mês" : "Users This Month"}
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-users-month">
                {metrics?.usersThisMonth || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MRR</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-green-500" data-testid="text-mrr">
                {formatCurrency(metrics?.mrr || 0)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {language === "pt-BR" ? "Receita Total" : "Total Revenue"}
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-total-revenue">
                {formatCurrency(metrics?.totalRevenue || 0)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>{language === "pt-BR" ? "Novos Usuários" : "New Users"}</CardTitle>
            <Select value={chartPeriod} onValueChange={(v) => setChartPeriod(v as "7d" | "30d" | "1y")}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">7d</SelectItem>
                <SelectItem value="30d">30d</SelectItem>
                <SelectItem value="1y">1y</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#10B981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{language === "pt-BR" ? "Distribuição por Status" : "Distribution by Status"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="subscribers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="subscribers" data-testid="tab-subscribers">
            {language === "pt-BR" ? "Assinantes" : "Subscribers"}
          </TabsTrigger>
          <TabsTrigger value="payments" data-testid="tab-payments">
            {language === "pt-BR" ? "Pagamentos" : "Payments"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="subscribers">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
              <CardTitle>{language === "pt-BR" ? "Lista de Assinantes" : "Subscribers List"}</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder={language === "pt-BR" ? "Status" : "Status"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{language === "pt-BR" ? "Todos" : "All"}</SelectItem>
                    <SelectItem value="active">{language === "pt-BR" ? "Ativo" : "Active"}</SelectItem>
                    <SelectItem value="inactive">{language === "pt-BR" ? "Inativo" : "Inactive"}</SelectItem>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="suspended">{language === "pt-BR" ? "Suspenso" : "Suspended"}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={planFilter} onValueChange={setPlanFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder={language === "pt-BR" ? "Plano" : "Plan"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{language === "pt-BR" ? "Todos" : "All"}</SelectItem>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={String(plan.id)}>
                        {language === "pt-BR" ? plan.name : plan.nameEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(subscribersLimit)} onValueChange={(v) => { setSubscribersLimit(Number(v)); setSubscribersPage(1); }}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {subscribersLoading ? (
                <div className="p-6 space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !subscribersData?.subscribers.length ? (
                <div className="p-12 text-center text-muted-foreground">
                  {language === "pt-BR" ? "Nenhum assinante encontrado" : "No subscribers found"}
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{language === "pt-BR" ? "Nome" : "Name"}</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>{language === "pt-BR" ? "Plano" : "Plan"}</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>{language === "pt-BR" ? "Início" : "Start"}</TableHead>
                        <TableHead>{language === "pt-BR" ? "Fim" : "End"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subscribersData.subscribers.map((sub) => (
                        <TableRow key={sub.id} data-testid={`row-subscriber-${sub.id}`}>
                          <TableCell className="font-medium">
                            {sub.firstName || sub.lastName 
                              ? `${sub.firstName || ""} ${sub.lastName || ""}`.trim() 
                              : "-"}
                          </TableCell>
                          <TableCell>{sub.email}</TableCell>
                          <TableCell>{sub.planName || "-"}</TableCell>
                          <TableCell>{getStatusBadge(sub.subscriptionStatus)}</TableCell>
                          <TableCell>{formatDate(sub.subscriptionStartDate)}</TableCell>
                          <TableCell>{formatDate(sub.subscriptionEndDate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex items-center justify-between p-4 border-t">
                    <div className="text-sm text-muted-foreground">
                      {subscribersData.total} {language === "pt-BR" ? "assinantes" : "subscribers"}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={subscribersPage <= 1}
                        onClick={() => setSubscribersPage((p) => p - 1)}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-sm">
                        {subscribersPage} / {totalSubscribersPages || 1}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={subscribersPage >= totalSubscribersPages}
                        onClick={() => setSubscribersPage((p) => p + 1)}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle>{language === "pt-BR" ? "Histórico de Pagamentos" : "Payment History"}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {paymentsLoading ? (
                <div className="p-6 space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !paymentsData?.payments.length ? (
                <div className="p-12 text-center text-muted-foreground">
                  {language === "pt-BR" ? "Nenhum pagamento encontrado" : "No payments found"}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{language === "pt-BR" ? "Data" : "Date"}</TableHead>
                      <TableHead>{language === "pt-BR" ? "Usuário" : "User"}</TableHead>
                      <TableHead>{language === "pt-BR" ? "Valor" : "Amount"}</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentsData.payments.map((payment) => (
                      <TableRow key={payment.id} data-testid={`row-payment-${payment.id}`}>
                        <TableCell>{formatDate(payment.date)}</TableCell>
                        <TableCell>{payment.userEmail || "-"}</TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(payment.amount)}
                        </TableCell>
                        <TableCell>
                          {payment.status === "succeeded" ? (
                            <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                              {language === "pt-BR" ? "Sucesso" : "Success"}
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              {language === "pt-BR" ? "Falhou" : "Failed"}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{payment.id.slice(-8)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
