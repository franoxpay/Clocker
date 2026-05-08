import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  AlertCircle,
  Info,
  CreditCard,
  Wrench,
  BarChart3,
  Percent,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
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
  activeStripeSubscriptions: number;
  activeManualSubscriptions: number;
  gracePeriodCount: number;
  usersToday: number;
  usersThisMonth: number;
  mrr: number;
  arr: number;
  avgTicket: number;
  ltv: number;
  inadimplenciaRate: number;
  totalRevenue: number;
}

interface Subscriber {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  planId: number | null;
  planName: string | null;
  planPrice: number | null;
  subscriptionStatus: string;
  subscriptionStartDate: string | null;
  subscriptionEndDate: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  isManualSubscription: boolean;
  isStripeSubscription: boolean;
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

const PIE_COLORS = ["#10B981", "#6B7280", "#3B82F6", "#EF4444"];

function MetricCard({
  title,
  value,
  icon: Icon,
  color,
  tooltip,
  loading,
  testId,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  tooltip?: string;
  loading?: boolean;
  testId?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {tooltip && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[220px] text-xs">
                  {tooltip}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className={`text-2xl font-bold ${color}`} data-testid={testId}>
            {value}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminBilling() {
  const { language } = useLanguage();
  const [subscribersPage, setSubscribersPage] = useState(1);
  const [subscribersLimit, setSubscribersLimit] = useState(25);
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [chartPeriod, setChartPeriod] = useState<"7d" | "30d" | "1y">("30d");

  const locale = language === "pt-BR" ? ptBR : enUS;
  const pt = language === "pt-BR";

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

  const formatCurrency = (value: number | undefined | null) => {
    if (value == null || isNaN(value)) return "R$ 0,00";
    return new Intl.NumberFormat(pt ? "pt-BR" : "en-US", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return format(new Date(dateStr), "dd/MM/yyyy", { locale });
  };

  const formatPercent = (value: number | undefined | null) => {
    if (value == null || isNaN(value)) return "0%";
    return `${value.toFixed(1)}%`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">{pt ? "Ativo" : "Active"}</Badge>;
      case "trialing":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Trial</Badge>;
      case "past_due":
        return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">{pt ? "Inadimplente" : "Past Due"}</Badge>;
      case "canceled":
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">{pt ? "Cancelado" : "Canceled"}</Badge>;
      case "unpaid":
        return <Badge variant="destructive">{pt ? "Não Pago" : "Unpaid"}</Badge>;
      case "inactive":
        return <Badge variant="secondary">{pt ? "Inativo" : "Inactive"}</Badge>;
      case "suspended":
        return <Badge variant="destructive">{pt ? "Suspenso" : "Suspended"}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeBadge = (sub: Subscriber) => {
    if (sub.isStripeSubscription) {
      return (
        <Badge className="bg-green-500/10 text-green-600 border-green-500/20 gap-1">
          <CreditCard className="h-3 w-3" />
          Stripe
        </Badge>
      );
    }
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 gap-1 cursor-help">
              <Wrench className="h-3 w-3" />
              {pt ? "Manual" : "Manual"}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-[220px] text-xs">
            {pt
              ? "Usuário ativado sem assinatura recorrente Stripe. Não há cobrança automática."
              : "User activated without a Stripe recurring subscription. No automatic billing."}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const pieData = metrics ? [
    { name: pt ? "Ativos" : "Active", value: metrics.subscriptionsActive },
    { name: pt ? "Inativos" : "Inactive", value: metrics.subscriptionsInactive },
    { name: "Trial", value: metrics.subscriptionsTrial },
    { name: pt ? "Suspensos" : "Suspended", value: metrics.subscriptionsSuspended },
  ].filter(d => d.value > 0) : [];

  return (
    <div className="space-y-6">

      {/* ROW 1 — Subscription counts */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          {pt ? "Assinaturas" : "Subscriptions"}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <MetricCard
            title={pt ? "Ativos" : "Active"}
            value={metrics?.subscriptionsActive ?? 0}
            icon={Users}
            color="text-green-500"
            loading={metricsLoading}
            testId="text-active-subs"
          />
          <MetricCard
            title={pt ? "Inativos" : "Inactive"}
            value={metrics?.subscriptionsInactive ?? 0}
            icon={UserX}
            color="text-muted-foreground"
            loading={metricsLoading}
            testId="text-inactive-subs"
          />
          <MetricCard
            title="Trial"
            value={metrics?.subscriptionsTrial ?? 0}
            icon={Clock}
            color="text-blue-500"
            loading={metricsLoading}
            testId="text-trial-subs"
          />
          <MetricCard
            title={pt ? "Suspensos" : "Suspended"}
            value={metrics?.subscriptionsSuspended ?? 0}
            icon={UserX}
            color="text-red-500"
            loading={metricsLoading}
            testId="text-suspended-subs"
          />
          <MetricCard
            title="Stripe"
            value={metrics?.activeStripeSubscriptions ?? 0}
            icon={CreditCard}
            color="text-green-600"
            tooltip={pt ? "Assinaturas ativas com stripe_subscription_id — cobrança automática real." : "Active subscriptions with Stripe ID — real automatic billing."}
            loading={metricsLoading}
            testId="text-stripe-subs"
          />
          <MetricCard
            title={pt ? "Manuais" : "Manual"}
            value={metrics?.activeManualSubscriptions ?? 0}
            icon={Wrench}
            color="text-yellow-600"
            tooltip={pt ? "Assinaturas ativas ativadas manualmente pelo admin — sem cobrança automática." : "Active subscriptions manually activated by admin — no automatic billing."}
            loading={metricsLoading}
            testId="text-manual-subs"
          />
        </div>
      </div>

      {/* ROW 2 — Financial metrics */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          {pt ? "Financeiro" : "Financials"}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <MetricCard
            title="MRR"
            value={formatCurrency(metrics?.mrr)}
            icon={TrendingUp}
            color="text-green-500"
            tooltip={pt
              ? "Receita mensal recorrente estimada: soma dos planos ativos, convertida de centavos para reais."
              : "Estimated monthly recurring revenue: sum of active plans, converted from cents to reais."}
            loading={metricsLoading}
            testId="text-mrr"
          />
          <MetricCard
            title="ARR"
            value={formatCurrency(metrics?.arr)}
            icon={BarChart3}
            color="text-green-600"
            tooltip={pt ? "Receita anual recorrente estimada (MRR × 12)." : "Estimated annual recurring revenue (MRR × 12)."}
            loading={metricsLoading}
            testId="text-arr"
          />
          <MetricCard
            title={pt ? "Receita Total" : "Total Revenue"}
            value={formatCurrency(metrics?.totalRevenue)}
            icon={DollarSign}
            color="text-foreground"
            tooltip={pt
              ? "Soma real de charges pagos no Stripe (status: succeeded). Inclui pagamentos avulsos."
              : "Real sum of succeeded Stripe charges. Includes one-time payments."}
            loading={metricsLoading}
            testId="text-total-revenue"
          />
          <MetricCard
            title={pt ? "Ticket Médio" : "Avg Ticket"}
            value={formatCurrency(metrics?.avgTicket)}
            icon={Wallet}
            color="text-foreground"
            tooltip={pt ? "MRR dividido pelo número de assinaturas ativas." : "MRR divided by active subscriptions count."}
            loading={metricsLoading}
            testId="text-avg-ticket"
          />
          <MetricCard
            title="LTV"
            value={formatCurrency(metrics?.ltv)}
            icon={TrendingUp}
            color="text-foreground"
            tooltip={pt ? "LTV estimado = Ticket Médio × 12 meses." : "Estimated LTV = Avg Ticket × 12 months."}
            loading={metricsLoading}
            testId="text-ltv"
          />
          <MetricCard
            title={pt ? "Inadimplência" : "Past Due Rate"}
            value={formatPercent(metrics?.inadimplenciaRate)}
            icon={Percent}
            color={metrics?.inadimplenciaRate && metrics.inadimplenciaRate > 10 ? "text-red-500" : "text-foreground"}
            tooltip={pt
              ? "Percentual de assinantes em grace period (pagamento falhado / aguardando nova tentativa)."
              : "Percentage of subscribers in grace period (failed payment / awaiting retry)."}
            loading={metricsLoading}
            testId="text-inadimplencia"
          />
        </div>
      </div>

      {/* ROW 3 — New users counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title={pt ? "Usuários Hoje" : "Users Today"}
          value={metrics?.usersToday ?? 0}
          icon={UserPlus}
          color="text-foreground"
          loading={metricsLoading}
          testId="text-users-today"
        />
        <MetricCard
          title={pt ? "Usuários Este Mês" : "Users This Month"}
          value={metrics?.usersThisMonth ?? 0}
          icon={Calendar}
          color="text-foreground"
          loading={metricsLoading}
          testId="text-users-month"
        />
        <MetricCard
          title={pt ? "Em Grace Period" : "In Grace Period"}
          value={metrics?.gracePeriodCount ?? 0}
          icon={AlertCircle}
          color={metrics?.gracePeriodCount && metrics.gracePeriodCount > 0 ? "text-yellow-600" : "text-muted-foreground"}
          tooltip={pt
            ? "Usuários em grace period: pagamento falhou, aguardando nova tentativa no Stripe (72h)."
            : "Users in grace period: payment failed, awaiting Stripe retry (72h)."}
          loading={metricsLoading}
          testId="text-grace-period"
        />
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {pt ? "Cobertura Stripe" : "Stripe Coverage"}
            </CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-stripe-coverage">
                {metrics && metrics.subscriptionsActive > 0
                  ? `${Math.round((metrics.activeStripeSubscriptions / metrics.subscriptionsActive) * 100)}%`
                  : "—"}
              </div>
            )}
            {!metricsLoading && metrics && (
              <p className="text-xs text-muted-foreground mt-1">
                {metrics.activeStripeSubscriptions}/{metrics.subscriptionsActive} {pt ? "com sub. Stripe" : "w/ Stripe sub"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>{pt ? "Novos Usuários" : "New Users"}</CardTitle>
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
            <div className="h-[280px]">
              {chartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  {pt ? "Sem dados para o período" : "No data for this period"}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                    <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                    <RechartsTooltip />
                    <Line type="monotone" dataKey="count" stroke="#10B981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{pt ? "Distribuição por Status" : "Distribution by Status"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {pieData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  {pt ? "Sem assinantes" : "No subscribers"}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={95}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                      labelLine={false}
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs — Subscribers + Payments */}
      <Tabs defaultValue="subscribers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="subscribers" data-testid="tab-subscribers">
            {pt ? "Assinantes" : "Subscribers"}
          </TabsTrigger>
          <TabsTrigger value="payments" data-testid="tab-payments">
            {pt ? "Pagamentos Stripe" : "Stripe Payments"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="subscribers">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
              <CardTitle>{pt ? "Lista de Assinantes" : "Subscribers List"}</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setSubscribersPage(1); }}>
                  <SelectTrigger className="w-36" data-testid="select-status-filter">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{pt ? "Todos os status" : "All statuses"}</SelectItem>
                    <SelectItem value="active">{pt ? "Ativo" : "Active"}</SelectItem>
                    <SelectItem value="inactive">{pt ? "Inativo" : "Inactive"}</SelectItem>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="suspended">{pt ? "Suspenso" : "Suspended"}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={planFilter} onValueChange={(v) => { setPlanFilter(v); setSubscribersPage(1); }}>
                  <SelectTrigger className="w-36" data-testid="select-plan-filter">
                    <SelectValue placeholder={pt ? "Plano" : "Plan"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{pt ? "Todos os planos" : "All plans"}</SelectItem>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={String(plan.id)}>
                        {pt ? plan.name : plan.nameEn}
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
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : !subscribersData?.subscribers.length ? (
                <div className="p-12 text-center text-muted-foreground">
                  {pt ? "Nenhum assinante encontrado" : "No subscribers found"}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{pt ? "Nome" : "Name"}</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>{pt ? "Plano" : "Plan"}</TableHead>
                          <TableHead>{pt ? "Preço" : "Price"}</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>{pt ? "Tipo" : "Type"}</TableHead>
                          <TableHead>{pt ? "Início" : "Start"}</TableHead>
                          <TableHead>{pt ? "Fim" : "End"}</TableHead>
                          <TableHead>Subscription ID</TableHead>
                          <TableHead>Customer ID</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {subscribersData.subscribers.map((sub) => (
                          <TableRow key={sub.id} data-testid={`row-subscriber-${sub.id}`}>
                            <TableCell className="font-medium whitespace-nowrap">
                              {sub.firstName || sub.lastName
                                ? `${sub.firstName || ""} ${sub.lastName || ""}`.trim()
                                : "-"}
                            </TableCell>
                            <TableCell className="text-sm">{sub.email}</TableCell>
                            <TableCell className="whitespace-nowrap">{sub.planName || "-"}</TableCell>
                            <TableCell className="whitespace-nowrap text-sm">
                              {sub.planPrice != null ? formatCurrency(sub.planPrice) : "-"}
                            </TableCell>
                            <TableCell>{getStatusBadge(sub.subscriptionStatus)}</TableCell>
                            <TableCell>{getTypeBadge(sub)}</TableCell>
                            <TableCell className="whitespace-nowrap text-sm">{formatDate(sub.subscriptionStartDate)}</TableCell>
                            <TableCell className="whitespace-nowrap text-sm">{formatDate(sub.subscriptionEndDate)}</TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {sub.stripeSubscriptionId ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger className="cursor-default">
                                      {sub.stripeSubscriptionId.slice(-10)}
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="font-mono text-xs">{sub.stripeSubscriptionId}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                <span className="text-muted-foreground/50">—</span>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {sub.stripeCustomerId ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger className="cursor-default">
                                      {sub.stripeCustomerId.slice(-10)}
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="font-mono text-xs">{sub.stripeCustomerId}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                <span className="text-muted-foreground/50">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex items-center justify-between p-4 border-t">
                    <div className="text-sm text-muted-foreground">
                      {subscribersData.total} {pt ? "no total" : "total"}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={subscribersPage <= 1}
                        onClick={() => setSubscribersPage((p) => p - 1)}
                        data-testid="button-prev-page"
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
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>{pt ? "Histórico de Pagamentos Stripe" : "Stripe Payment History"}</CardTitle>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[240px] text-xs">
                      {pt
                        ? "Cobranças reais do Stripe (charges). Apenas pagamentos efetivamente processados."
                        : "Real Stripe charges. Only successfully processed payments."}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {paymentsLoading ? (
                <div className="p-6 space-y-4">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : !paymentsData?.payments.length ? (
                <div className="p-12 text-center text-muted-foreground">
                  {pt ? "Nenhum pagamento encontrado" : "No payments found"}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{pt ? "Data" : "Date"}</TableHead>
                      <TableHead>{pt ? "Usuário" : "User"}</TableHead>
                      <TableHead>{pt ? "Valor" : "Amount"}</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentsData.payments.map((payment) => (
                      <TableRow key={payment.id} data-testid={`row-payment-${payment.id}`}>
                        <TableCell className="whitespace-nowrap">{formatDate(payment.date)}</TableCell>
                        <TableCell className="text-sm">{payment.userEmail || "-"}</TableCell>
                        <TableCell className="font-medium">{formatCurrency(payment.amount)}</TableCell>
                        <TableCell>
                          {payment.status === "succeeded" ? (
                            <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                              {pt ? "Sucesso" : "Success"}
                            </Badge>
                          ) : (
                            <Badge variant="destructive">{pt ? "Falhou" : "Failed"}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {payment.id.slice(-10)}
                        </TableCell>
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
