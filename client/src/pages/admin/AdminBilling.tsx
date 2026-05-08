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
  Users,
  UserX,
  Clock,
  DollarSign,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Info,
  CreditCard,
  Wrench,
  BarChart3,
  Percent,
  UserPlus,
  Calendar,
  Wallet,
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

// ── Compact stat card ─────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  icon: Icon,
  iconColor,
  sub,
  tooltip,
  loading,
  testId,
  alert,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  iconColor: string;
  sub?: string;
  tooltip?: string;
  loading?: boolean;
  testId?: string;
  alert?: boolean;
}) {
  const card = (
    <Card className={`transition-colors hover:bg-muted/30 ${alert ? "border-yellow-500/40" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 mb-1.5">
              <p className="text-xs text-muted-foreground font-medium leading-none truncate">{label}</p>
            </div>
            {loading ? (
              <Skeleton className="h-6 w-20 mt-1" />
            ) : (
              <>
                <p className={`text-xl font-semibold leading-none tracking-tight ${iconColor}`} data-testid={testId}>
                  {value}
                </p>
                {sub && (
                  <p className="text-[11px] text-muted-foreground mt-1.5 leading-none">{sub}</p>
                )}
              </>
            )}
          </div>
          <div className={`p-1.5 rounded-md bg-muted/40 shrink-0`}>
            <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (!tooltip) return card;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[230px] text-xs leading-relaxed">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 select-none">
      {children}
    </p>
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

  const totalSubscribersPages = subscribersData
    ? Math.ceil(subscribersData.total / subscribersLimit)
    : 1;

  const formatCurrency = (v: number | undefined | null) => {
    if (v == null || isNaN(v)) return "R$ 0";
    return new Intl.NumberFormat(pt ? "pt-BR" : "en-US", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v);
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return format(new Date(d), "dd/MM/yy", { locale });
  };

  const formatPercent = (v: number | undefined | null) => {
    if (v == null || isNaN(v)) return "0%";
    return `${v.toFixed(1)}%`;
  };

  const coveragePct =
    metrics && metrics.subscriptionsActive > 0
      ? Math.round((metrics.activeStripeSubscriptions / metrics.subscriptionsActive) * 100)
      : 0;

  // ── Status badge ────────────────────────────────────────────────────────────
  const statusBadge = (s: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      active:    { label: pt ? "Ativo" : "Active",       cls: "bg-green-500/10 text-green-600 border-green-500/20" },
      trialing:  { label: "Trial",                        cls: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
      past_due:  { label: pt ? "Inadimplente" : "Past Due", cls: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20" },
      canceled:  { label: pt ? "Cancelado" : "Canceled", cls: "bg-red-500/10 text-red-500 border-red-500/20" },
      unpaid:    { label: pt ? "Não Pago" : "Unpaid",    cls: "bg-red-500/10 text-red-600 border-red-500/20" },
      inactive:  { label: pt ? "Inativo" : "Inactive",   cls: "bg-muted text-muted-foreground border-transparent" },
      suspended: { label: pt ? "Suspenso" : "Suspended", cls: "bg-red-500/10 text-red-500 border-red-500/20" },
    };
    const m = map[s] ?? { label: s, cls: "bg-muted text-muted-foreground" };
    return <Badge className={`text-[10px] px-1.5 py-0 leading-none h-4 border font-medium ${m.cls}`}>{m.label}</Badge>;
  };

  // ── Type badge ──────────────────────────────────────────────────────────────
  const typeBadge = (sub: Subscriber) => {
    if (sub.isStripeSubscription) {
      return (
        <Badge className="text-[10px] px-1.5 py-0 h-4 border font-medium bg-green-500/10 text-green-700 border-green-500/20 gap-1 leading-none">
          <CreditCard className="h-2.5 w-2.5" />
          Stripe
        </Badge>
      );
    }
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className="text-[10px] px-1.5 py-0 h-4 border font-medium bg-yellow-500/10 text-yellow-700 border-yellow-500/20 gap-1 leading-none cursor-help">
            <Wrench className="h-2.5 w-2.5" />
            {pt ? "Manual" : "Manual"}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-[220px] text-xs">
          {pt
            ? "Ativado manualmente pelo admin — sem assinatura Stripe recorrente."
            : "Manually activated — no Stripe recurring subscription."}
        </TooltipContent>
      </Tooltip>
    );
  };

  const pieData = metrics
    ? [
        { name: pt ? "Ativos" : "Active",    value: metrics.subscriptionsActive },
        { name: pt ? "Inativos" : "Inactive", value: metrics.subscriptionsInactive },
        { name: "Trial",                       value: metrics.subscriptionsTrial },
        { name: pt ? "Suspensos" : "Suspended", value: metrics.subscriptionsSuspended },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <TooltipProvider>
    <div className="space-y-5 max-w-[1400px]">

      {/* ── ROW 1 — Subscriptions ─────────────────────────────────────────── */}
      <div>
        <SectionLabel>{pt ? "Assinaturas" : "Subscriptions"}</SectionLabel>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
          <StatCard label={pt ? "Ativos" : "Active"}       value={metrics?.subscriptionsActive ?? 0} icon={Users}    iconColor="text-green-500"          loading={metricsLoading} testId="text-active-subs"   />
          <StatCard label={pt ? "Inativos" : "Inactive"}   value={metrics?.subscriptionsInactive ?? 0} icon={UserX} iconColor="text-muted-foreground"   loading={metricsLoading} testId="text-inactive-subs" />
          <StatCard label="Trial"                           value={metrics?.subscriptionsTrial ?? 0} icon={Clock}    iconColor="text-blue-500"            loading={metricsLoading} testId="text-trial-subs"   />
          <StatCard label={pt ? "Suspensos" : "Suspended"} value={metrics?.subscriptionsSuspended ?? 0} icon={UserX} iconColor="text-red-500"           loading={metricsLoading} testId="text-suspended-subs" />
          <StatCard
            label="Stripe"
            value={metrics?.activeStripeSubscriptions ?? 0}
            icon={CreditCard}
            iconColor="text-green-600"
            tooltip={pt ? "Assinaturas ativas com Stripe Subscription ID — cobrança automática real." : "Active subscriptions with a Stripe Subscription ID — real automatic billing."}
            loading={metricsLoading}
            testId="text-stripe-subs"
          />
          <StatCard
            label={pt ? "Manual" : "Manual"}
            value={metrics?.activeManualSubscriptions ?? 0}
            icon={Wrench}
            iconColor="text-yellow-600"
            tooltip={pt ? "Ativações manuais via admin — sem cobrança Stripe recorrente." : "Manual activations by admin — no Stripe automatic billing."}
            loading={metricsLoading}
            testId="text-manual-subs"
            alert={(metrics?.activeManualSubscriptions ?? 0) > 0}
          />
        </div>
      </div>

      {/* ── ROW 2 — Financials ────────────────────────────────────────────── */}
      <div>
        <SectionLabel>{pt ? "Financeiro" : "Financials"}</SectionLabel>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
          <StatCard
            label="MRR"
            value={formatCurrency(metrics?.mrr)}
            icon={TrendingUp}
            iconColor="text-green-500"
            sub={pt ? "Receita mensal estimada" : "Est. monthly revenue"}
            tooltip={pt ? "Soma dos planos ativos convertida de centavos para reais." : "Sum of active plan prices converted from cents to reais."}
            loading={metricsLoading}
            testId="text-mrr"
          />
          <StatCard
            label="ARR"
            value={formatCurrency(metrics?.arr)}
            icon={BarChart3}
            iconColor="text-green-600"
            sub="MRR × 12"
            tooltip={pt ? "Receita anual recorrente estimada." : "Estimated annual recurring revenue."}
            loading={metricsLoading}
            testId="text-arr"
          />
          <StatCard
            label={pt ? "Receita Total" : "Total Revenue"}
            value={formatCurrency(metrics?.totalRevenue)}
            icon={DollarSign}
            iconColor="text-foreground"
            sub={pt ? "Charges Stripe pagos" : "Stripe succeeded charges"}
            tooltip={pt ? "Soma real de todas as cobranças com status succeeded no Stripe." : "Real sum of all Stripe charges with succeeded status."}
            loading={metricsLoading}
            testId="text-total-revenue"
          />
          <StatCard
            label={pt ? "Ticket Médio" : "Avg Ticket"}
            value={formatCurrency(metrics?.avgTicket)}
            icon={Wallet}
            iconColor="text-foreground"
            sub="MRR / ativos"
            tooltip={pt ? "MRR dividido pelo número de assinantes ativos." : "MRR divided by active subscription count."}
            loading={metricsLoading}
            testId="text-avg-ticket"
          />
          <StatCard
            label="LTV"
            value={formatCurrency(metrics?.ltv)}
            icon={TrendingUp}
            iconColor="text-foreground"
            sub={pt ? "Ticket × 12 meses" : "Ticket × 12 months"}
            tooltip={pt ? "LTV estimado sem churn = Ticket Médio × 12." : "Estimated LTV without churn = Avg Ticket × 12."}
            loading={metricsLoading}
            testId="text-ltv"
          />
          <StatCard
            label={pt ? "Inadimplência" : "Past Due Rate"}
            value={formatPercent(metrics?.inadimplenciaRate)}
            icon={Percent}
            iconColor={(metrics?.inadimplenciaRate ?? 0) > 10 ? "text-red-500" : "text-foreground"}
            sub={`${metrics?.gracePeriodCount ?? 0} ${pt ? "em grace period" : "in grace period"}`}
            tooltip={pt ? "% de ativos em grace period (pagamento falhado, aguardando retry Stripe)." : "% of active subscribers in grace period (failed payment, awaiting Stripe retry)."}
            loading={metricsLoading}
            testId="text-inadimplencia"
            alert={(metrics?.gracePeriodCount ?? 0) > 0}
          />
        </div>
      </div>

      {/* ── ROW 3 — Growth + Coverage ─────────────────────────────────────── */}
      <div>
        <SectionLabel>{pt ? "Crescimento & Cobertura" : "Growth & Coverage"}</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <StatCard label={pt ? "Novos Hoje" : "New Today"}         value={metrics?.usersToday ?? 0}     icon={UserPlus}  iconColor="text-foreground" loading={metricsLoading} testId="text-users-today" />
          <StatCard label={pt ? "Novos Este Mês" : "New This Month"} value={metrics?.usersThisMonth ?? 0} icon={Calendar}  iconColor="text-foreground" loading={metricsLoading} testId="text-users-month" />
          <StatCard
            label={pt ? "Em Grace Period" : "In Grace Period"}
            value={metrics?.gracePeriodCount ?? 0}
            icon={AlertCircle}
            iconColor={(metrics?.gracePeriodCount ?? 0) > 0 ? "text-yellow-600" : "text-muted-foreground"}
            tooltip={pt ? "Usuários com pagamento falhado aguardando nova tentativa do Stripe (72h)." : "Users with failed payment awaiting Stripe retry (72h)."}
            loading={metricsLoading}
            testId="text-grace-period"
            alert={(metrics?.gracePeriodCount ?? 0) > 0}
          />
          <StatCard
            label={pt ? "Cobertura Stripe" : "Stripe Coverage"}
            value={metricsLoading ? "—" : `${coveragePct}%`}
            icon={CreditCard}
            iconColor="text-foreground"
            sub={`${metrics?.activeStripeSubscriptions ?? 0}/${metrics?.subscriptionsActive ?? 0} ${pt ? "com sub Stripe" : "w/ Stripe sub"}`}
            tooltip={pt ? "Percentual de assinantes ativos com uma subscription Stripe real." : "Percentage of active subscribers with a real Stripe subscription."}
            loading={metricsLoading}
            testId="text-stripe-coverage"
          />
        </div>
      </div>

      {/* ── ROW 4 — Charts ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Line chart — wider */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2 py-3 px-4">
            <CardTitle className="text-sm font-semibold">
              {pt ? "Novos Usuários" : "New Users"}
            </CardTitle>
            <Select value={chartPeriod} onValueChange={(v) => setChartPeriod(v as "7d" | "30d" | "1y")}>
              <SelectTrigger className="h-7 w-20 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">7d</SelectItem>
                <SelectItem value="30d">30d</SelectItem>
                <SelectItem value="1y">1y</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="h-[180px]">
              {chartData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <BarChart3 className="h-8 w-8 mb-2 opacity-20" />
                  <p className="text-xs">{pt ? "Sem dados para o período" : "No data for this period"}</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <RechartsTooltip
                      contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                    />
                    <Line type="monotone" dataKey="count" stroke="#10B981" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Donut chart */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold">
              {pt ? "Distribuição" : "Distribution"}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="h-[180px]">
              {pieData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <Users className="h-8 w-8 mb-2 opacity-20" />
                  <p className="text-xs">{pt ? "Sem assinantes" : "No subscribers"}</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="42%"
                      innerRadius={40}
                      outerRadius={65}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend
                      iconSize={8}
                      wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                      formatter={(value) => <span className="text-muted-foreground">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── ROW 5 — Subscribers + Payments ───────────────────────────────── */}
      <Tabs defaultValue="subscribers" className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <TabsList className="h-8">
            <TabsTrigger value="subscribers" className="text-xs h-7 px-3" data-testid="tab-subscribers">
              {pt ? "Assinantes" : "Subscribers"}
              {subscribersData && (
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 h-4">
                  {subscribersData.total}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="payments" className="text-xs h-7 px-3" data-testid="tab-payments">
              {pt ? "Pagamentos" : "Payments"}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── Subscribers ──────────────────────────────────────────────── */}
        <TabsContent value="subscribers" className="mt-0">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap py-3 px-4">
              <CardTitle className="text-sm font-semibold">
                {pt ? "Lista de Assinantes" : "Subscribers"}
              </CardTitle>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setSubscribersPage(1); }}>
                  <SelectTrigger className="h-7 w-32 text-xs" data-testid="select-status-filter">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{pt ? "Todos" : "All"}</SelectItem>
                    <SelectItem value="active">{pt ? "Ativo" : "Active"}</SelectItem>
                    <SelectItem value="inactive">{pt ? "Inativo" : "Inactive"}</SelectItem>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="suspended">{pt ? "Suspenso" : "Suspended"}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={planFilter} onValueChange={(v) => { setPlanFilter(v); setSubscribersPage(1); }}>
                  <SelectTrigger className="h-7 w-32 text-xs" data-testid="select-plan-filter">
                    <SelectValue placeholder={pt ? "Plano" : "Plan"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{pt ? "Todos" : "All plans"}</SelectItem>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={String(plan.id)} className="text-xs">
                        {pt ? plan.name : plan.nameEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(subscribersLimit)} onValueChange={(v) => { setSubscribersLimit(Number(v)); setSubscribersPage(1); }}>
                  <SelectTrigger className="h-7 w-16 text-xs">
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

            <div className="border-t">
              {subscribersLoading ? (
                <div className="p-4 space-y-2">
                  {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
                </div>
              ) : !subscribersData?.subscribers.length ? (
                <div className="py-10 text-center">
                  <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">
                    {pt ? "Nenhum assinante encontrado" : "No subscribers found"}
                  </p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs font-medium h-8 px-4">{pt ? "Nome" : "Name"}</TableHead>
                          <TableHead className="text-xs font-medium h-8 px-3">Email</TableHead>
                          <TableHead className="text-xs font-medium h-8 px-3">{pt ? "Plano" : "Plan"}</TableHead>
                          <TableHead className="text-xs font-medium h-8 px-3">{pt ? "Preço" : "Price"}</TableHead>
                          <TableHead className="text-xs font-medium h-8 px-3">Status</TableHead>
                          <TableHead className="text-xs font-medium h-8 px-3">{pt ? "Tipo" : "Type"}</TableHead>
                          <TableHead className="text-xs font-medium h-8 px-3">{pt ? "Início" : "Start"}</TableHead>
                          <TableHead className="text-xs font-medium h-8 px-3">{pt ? "Fim" : "End"}</TableHead>
                          <TableHead className="text-xs font-medium h-8 px-3">Sub ID</TableHead>
                          <TableHead className="text-xs font-medium h-8 px-3">Cust ID</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {subscribersData.subscribers.map((sub) => (
                          <TableRow key={sub.id} className="hover:bg-muted/30" data-testid={`row-subscriber-${sub.id}`}>
                            <TableCell className="text-xs font-medium whitespace-nowrap py-2 px-4">
                              {sub.firstName || sub.lastName
                                ? `${sub.firstName ?? ""} ${sub.lastName ?? ""}`.trim()
                                : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-xs py-2 px-3 max-w-[160px] truncate">{sub.email}</TableCell>
                            <TableCell className="text-xs py-2 px-3 whitespace-nowrap">{sub.planName ?? "—"}</TableCell>
                            <TableCell className="text-xs py-2 px-3 whitespace-nowrap tabular-nums">
                              {sub.planPrice != null ? formatCurrency(sub.planPrice) : "—"}
                            </TableCell>
                            <TableCell className="py-2 px-3">{statusBadge(sub.subscriptionStatus)}</TableCell>
                            <TableCell className="py-2 px-3">{typeBadge(sub)}</TableCell>
                            <TableCell className="text-xs py-2 px-3 whitespace-nowrap text-muted-foreground tabular-nums">
                              {formatDate(sub.subscriptionStartDate)}
                            </TableCell>
                            <TableCell className="text-xs py-2 px-3 whitespace-nowrap text-muted-foreground tabular-nums">
                              {formatDate(sub.subscriptionEndDate)}
                            </TableCell>
                            <TableCell className="py-2 px-3">
                              {sub.stripeSubscriptionId ? (
                                <Tooltip>
                                  <TooltipTrigger className="font-mono text-[10px] text-muted-foreground cursor-default">
                                    …{sub.stripeSubscriptionId.slice(-8)}
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="font-mono text-xs">{sub.stripeSubscriptionId}</p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-muted-foreground/40 text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell className="py-2 px-3">
                              {sub.stripeCustomerId ? (
                                <Tooltip>
                                  <TooltipTrigger className="font-mono text-[10px] text-muted-foreground cursor-default">
                                    …{sub.stripeCustomerId.slice(-8)}
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="font-mono text-xs">{sub.stripeCustomerId}</p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-muted-foreground/40 text-xs">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-t bg-muted/20">
                    <p className="text-[11px] text-muted-foreground">
                      {subscribersData.total} {pt ? "no total" : "total"}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        disabled={subscribersPage <= 1}
                        onClick={() => setSubscribersPage((p) => p - 1)}
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </Button>
                      <span className="text-xs text-muted-foreground min-w-[50px] text-center">
                        {subscribersPage} / {totalSubscribersPages || 1}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        disabled={subscribersPage >= totalSubscribersPages}
                        onClick={() => setSubscribersPage((p) => p + 1)}
                        data-testid="button-next-page"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* ── Payments ─────────────────────────────────────────────────── */}
        <TabsContent value="payments" className="mt-0">
          <Card>
            <CardHeader className="flex flex-row items-center gap-2 py-3 px-4">
              <CardTitle className="text-sm font-semibold">
                {pt ? "Pagamentos Stripe" : "Stripe Payments"}
              </CardTitle>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[230px] text-xs">
                  {pt
                    ? "Cobranças reais processadas pelo Stripe. Apenas pagamentos confirmados (succeeded)."
                    : "Real charges processed by Stripe. Only confirmed (succeeded) payments."}
                </TooltipContent>
              </Tooltip>
            </CardHeader>

            <div className="border-t">
              {paymentsLoading ? (
                <div className="p-4 space-y-2">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
                </div>
              ) : !paymentsData?.payments.length ? (
                <div className="py-10 text-center">
                  <DollarSign className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">
                    {pt ? "Nenhum pagamento encontrado" : "No payments found"}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-medium h-8 px-4">{pt ? "Data" : "Date"}</TableHead>
                      <TableHead className="text-xs font-medium h-8 px-3">{pt ? "Usuário" : "User"}</TableHead>
                      <TableHead className="text-xs font-medium h-8 px-3">{pt ? "Valor" : "Amount"}</TableHead>
                      <TableHead className="text-xs font-medium h-8 px-3">Status</TableHead>
                      <TableHead className="text-xs font-medium h-8 px-3">ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentsData.payments.map((p) => (
                      <TableRow key={p.id} className="hover:bg-muted/30" data-testid={`row-payment-${p.id}`}>
                        <TableCell className="text-xs py-2 px-4 whitespace-nowrap tabular-nums text-muted-foreground">
                          {formatDate(p.date)}
                        </TableCell>
                        <TableCell className="text-xs py-2 px-3 max-w-[180px] truncate">
                          {p.userEmail ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs py-2 px-3 whitespace-nowrap tabular-nums font-medium">
                          {formatCurrency(p.amount)}
                        </TableCell>
                        <TableCell className="py-2 px-3">
                          {p.status === "succeeded" ? (
                            <Badge className="text-[10px] px-1.5 py-0 h-4 border bg-green-500/10 text-green-600 border-green-500/20">
                              {pt ? "Pago" : "Paid"}
                            </Badge>
                          ) : (
                            <Badge className="text-[10px] px-1.5 py-0 h-4 border bg-red-500/10 text-red-500 border-red-500/20">
                              {pt ? "Falhou" : "Failed"}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="py-2 px-3 font-mono text-[10px] text-muted-foreground">
                          …{p.id.slice(-8)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
    </TooltipProvider>
  );
}
