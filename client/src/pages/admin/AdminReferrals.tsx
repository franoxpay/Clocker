import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Coupon, Plan, User } from "@shared/schema";
import {
  Plus, Pencil, Trash2, Tag, DollarSign, Users, TrendingUp, Check,
  RotateCcw, Download, ChevronLeft, ChevronRight, Activity, RefreshCw,
  ExternalLink, AlertCircle,
} from "lucide-react";
import { format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

type CouponFormData = {
  code: string;
  discountType: string;
  discountValue: string;
  discountDurationMonths: string;
  affiliateUserId: string;
  commissionType: string;
  commissionValue: string;
  commissionDurationMonths: string;
  validPlanIds: number[];
  expirationPeriod: string;
  isActive: boolean;
};

interface EnrichedCommission {
  id: number;
  affiliateUserId: string;
  affiliateEmail: string | null;
  referredUserId: string;
  referredUserEmail: string | null;
  couponId: number;
  couponCode: string | null;
  couponUsageId: number | null;
  stripeSubscriptionId: string | null;
  stripeInvoiceId: string | null;
  amount: number;
  type: string;
  status: string;
  createdAt: string;
  paidAt: string | null;
  paidByAdminId: string | null;
  reversedAt: string | null;
  reversedReason: string | null;
  commissionDurationMonths: number | null;
}

interface AdminDashboard {
  pendingCount: number;
  pendingAmount: number;
  paidCount: number;
  paidAmount: number;
  reversedCount: number;
  reversedAmount: number;
  recurringThisMonth: number;
  recurringAmountThisMonth: number;
  totalAffiliatesWithPending: number;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const defaultFormData: CouponFormData = {
  code: "",
  discountType: "percentage",
  discountValue: "",
  discountDurationMonths: "",
  affiliateUserId: "",
  commissionType: "",
  commissionValue: "",
  commissionDurationMonths: "1",
  validPlanIds: [],
  expirationPeriod: "",
  isActive: true,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminReferrals() {
  const { language } = useLanguage();
  const { toast } = useToast();

  // tabs
  const [activeTab, setActiveTab] = useState("dashboard");

  // coupon state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [deletingCoupon, setDeletingCoupon] = useState<Coupon | null>(null);
  const [formData, setFormData] = useState<CouponFormData>(defaultFormData);

  // commission state
  const [payingCommission, setPayingCommission] = useState<EnrichedCommission | null>(null);
  const [reversingCommission, setReversingCommission] = useState<EnrichedCommission | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [detailCommission, setDetailCommission] = useState<EnrichedCommission | null>(null);

  // filters
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterAffiliate, setFilterAffiliate] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [page, setPage] = useState(1);
  const LIMIT = 25;

  // ─── Translation helper ──────────────────────────────────────────────────
  const t = (key: string): string => {
    const tr: Record<string, Record<string, string>> = {
      "admin.coupons": { "pt-BR": "Cupons", en: "Coupons" },
      "admin.commissions": { "pt-BR": "Comissões", en: "Commissions" },
      "admin.reports": { "pt-BR": "Relatórios", en: "Reports" },
      "admin.dashboard": { "pt-BR": "Dashboard", en: "Dashboard" },
      "admin.createCoupon": { "pt-BR": "Criar Cupom", en: "Create Coupon" },
      "admin.editCoupon": { "pt-BR": "Editar Cupom", en: "Edit Coupon" },
      "admin.code": { "pt-BR": "Código", en: "Code" },
      "admin.discountType": { "pt-BR": "Tipo de Desconto", en: "Discount Type" },
      "admin.percentage": { "pt-BR": "Porcentagem", en: "Percentage" },
      "admin.fixed": { "pt-BR": "Valor Fixo", en: "Fixed Value" },
      "admin.discountValue": { "pt-BR": "Valor do Desconto", en: "Discount Value" },
      "admin.duration": { "pt-BR": "Duração (meses)", en: "Duration (months)" },
      "admin.affiliate": { "pt-BR": "Afiliado", en: "Affiliate" },
      "admin.commissionType": { "pt-BR": "Tipo de Comissão", en: "Commission Type" },
      "admin.commissionValue": { "pt-BR": "Valor da Comissão", en: "Commission Value" },
      "admin.commissionPeriod": { "pt-BR": "Período de Comissão", en: "Commission Period" },
      "admin.firstMonth": { "pt-BR": "Primeiro mês", en: "First month" },
      "admin.first3Months": { "pt-BR": "3 primeiros meses", en: "First 3 months" },
      "admin.first6Months": { "pt-BR": "6 primeiros meses", en: "First 6 months" },
      "admin.first12Months": { "pt-BR": "1 ano", en: "1 year" },
      "admin.expirationPeriod": { "pt-BR": "Período de Expiração", en: "Expiration Period" },
      "admin.noExpiration": { "pt-BR": "Sem expiração", en: "No expiration" },
      "admin.expires1Month": { "pt-BR": "1 mês", en: "1 month" },
      "admin.expires3Months": { "pt-BR": "3 meses", en: "3 months" },
      "admin.expires6Months": { "pt-BR": "6 meses", en: "6 months" },
      "admin.expires1Year": { "pt-BR": "1 ano", en: "1 year" },
      "admin.active": { "pt-BR": "Ativo", en: "Active" },
      "admin.usages": { "pt-BR": "Usos", en: "Usages" },
      "admin.status": { "pt-BR": "Status", en: "Status" },
      "admin.pending": { "pt-BR": "Pendente", en: "Pending" },
      "admin.paid": { "pt-BR": "Pago", en: "Paid" },
      "admin.reversed": { "pt-BR": "Estornado", en: "Reversed" },
      "admin.amount": { "pt-BR": "Valor", en: "Amount" },
      "admin.referredUser": { "pt-BR": "Indicado", en: "Referred" },
      "admin.actions": { "pt-BR": "Ações", en: "Actions" },
      "admin.markAsPaid": { "pt-BR": "Marcar como Pago", en: "Mark as Paid" },
      "admin.reverse": { "pt-BR": "Estornar", en: "Reverse" },
      "admin.reverseReason": { "pt-BR": "Motivo do Estorno", en: "Reason" },
      "admin.save": { "pt-BR": "Salvar", en: "Save" },
      "admin.cancel": { "pt-BR": "Cancelar", en: "Cancel" },
      "admin.delete": { "pt-BR": "Excluir", en: "Delete" },
      "admin.confirmDelete": { "pt-BR": "Tem certeza que deseja excluir este cupom?", en: "Are you sure you want to delete this coupon?" },
      "admin.totalCoupons": { "pt-BR": "Total de Cupons", en: "Total Coupons" },
      "admin.activeCoupons": { "pt-BR": "Cupons Ativos", en: "Active Coupons" },
      "admin.totalUsages": { "pt-BR": "Total de Usos", en: "Total Usages" },
      "admin.topAffiliates": { "pt-BR": "Top Afiliados", en: "Top Affiliates" },
      "admin.earnings": { "pt-BR": "Ganhos", en: "Earnings" },
      "admin.validPlans": { "pt-BR": "Planos Válidos", en: "Valid Plans" },
      "admin.allPlans": { "pt-BR": "Todos os Planos", en: "All Plans" },
      "admin.noAffiliate": { "pt-BR": "Sem afiliado", en: "No affiliate" },
      "admin.selectAffiliate": { "pt-BR": "Selecionar afiliado", en: "Select affiliate" },
      "admin.optional": { "pt-BR": "(opcional)", en: "(optional)" },
    };
    return tr[key]?.[language] || key;
  };

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: dashboard, isLoading: dashboardLoading } = useQuery<AdminDashboard>({
    queryKey: ["/api/admin/commissions/dashboard"],
  });

  const { data: coupons = [], isLoading: couponsLoading } = useQuery<Coupon[]>({
    queryKey: ["/api/admin/coupons"],
  });

  const buildCommissionsKey = () => {
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (filterStatus && filterStatus !== "all") params.set("status", filterStatus);
    if (filterType && filterType !== "all") params.set("type", filterType);
    if (filterAffiliate && filterAffiliate !== "all") params.set("affiliateId", filterAffiliate);
    if (filterDateFrom) params.set("dateFrom", filterDateFrom);
    if (filterDateTo) params.set("dateTo", filterDateTo);
    return `/api/admin/commissions?${params.toString()}`;
  };

  const { data: commissionsData, isLoading: commissionsLoading } = useQuery<{
    commissions: EnrichedCommission[];
    total: number;
  }>({
    queryKey: [buildCommissionsKey()],
  });

  const { data: reports, isLoading: reportsLoading } = useQuery<{
    totalCoupons: number;
    activeCoupons: number;
    totalUsages: number;
    topCoupons: Array<{ couponId: number; code: string; usageCount: number }>;
    topAffiliates: Array<{ affiliateId: string; email: string; referrals: number; earnings: number }>;
  }>({
    queryKey: ["/api/admin/coupons/reports/summary"],
  });

  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });

  const { data: usersData } = useQuery<{ users: User[]; total: number }>({
    queryKey: ["/api/admin/users?page=1&limit=100"],
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat(language === "pt-BR" ? "pt-BR" : "en-US", {
      style: "currency",
      currency: "BRL",
    }).format(amount / 100);

  const calculateExpirationDate = (period: string): string | null => {
    if (!period) return null;
    const months = parseInt(period);
    if (isNaN(months)) return null;
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    return date.toISOString();
  };

  const calculateExpirationPeriodFromDate = (expiresAt: Date | string | null): string => {
    if (!expiresAt) return "";
    const expDate = new Date(expiresAt);
    const diffMonths = Math.round((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30));
    if (diffMonths <= 1) return "1";
    if (diffMonths <= 3) return "3";
    if (diffMonths <= 6) return "6";
    return "12";
  };

  const handleEditCoupon = (coupon: Coupon) => {
    setFormData({
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue.toString(),
      discountDurationMonths: coupon.durationMonths?.toString() || "",
      affiliateUserId: coupon.affiliateUserId || "",
      commissionType: coupon.commissionType || "",
      commissionValue: coupon.commissionValue?.toString() || "",
      commissionDurationMonths: coupon.commissionDurationMonths?.toString() || "1",
      validPlanIds: coupon.validPlanIds || [],
      expirationPeriod: calculateExpirationPeriodFromDate(coupon.expiresAt),
      isActive: coupon.isActive,
    });
    setEditingCoupon(coupon);
  };

  const resetFilters = () => {
    setFilterStatus("all");
    setFilterType("all");
    setFilterAffiliate("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setPage(1);
  };

  const buildExportUrl = () => {
    const params = new URLSearchParams();
    if (filterStatus && filterStatus !== "all") params.set("status", filterStatus);
    if (filterType && filterType !== "all") params.set("type", filterType);
    if (filterAffiliate && filterAffiliate !== "all") params.set("affiliateId", filterAffiliate);
    if (filterDateFrom) params.set("dateFrom", filterDateFrom);
    if (filterDateTo) params.set("dateTo", filterDateTo);
    return `/api/admin/commissions/export?${params.toString()}`;
  };

  const totalPages = Math.max(1, Math.ceil((commissionsData?.total || 0) / LIMIT));

  const affiliateOptions = usersData?.users.filter(u =>
    coupons.some(c => c.affiliateUserId === u.id)
  ) || [];

  // ─── Mutations ────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (data: CouponFormData) => {
      const res = await apiRequest("POST", "/api/admin/coupons", {
        code: data.code,
        discountType: data.discountType,
        discountValue: parseFloat(data.discountValue) || 0,
        discountDurationMonths: data.discountDurationMonths ? parseInt(data.discountDurationMonths) : null,
        affiliateUserId: data.affiliateUserId || null,
        commissionType: data.commissionType || null,
        commissionValue: data.commissionValue ? parseFloat(data.commissionValue) : null,
        commissionDurationMonths: data.commissionDurationMonths ? parseInt(data.commissionDurationMonths) : 1,
        validPlanIds: data.validPlanIds.length > 0 ? data.validPlanIds : null,
        expiresAt: calculateExpirationDate(data.expirationPeriod),
        isActive: data.isActive,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/coupons"] });
      setIsCreateOpen(false);
      setFormData(defaultFormData);
      toast({ title: language === "pt-BR" ? "Cupom criado" : "Coupon created" });
    },
    onError: () => toast({ title: language === "pt-BR" ? "Erro ao criar cupom" : "Error creating coupon", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: CouponFormData }) => {
      const res = await apiRequest("PATCH", `/api/admin/coupons/${id}`, {
        code: data.code,
        discountType: data.discountType,
        discountValue: parseFloat(data.discountValue) || 0,
        discountDurationMonths: data.discountDurationMonths ? parseInt(data.discountDurationMonths) : null,
        affiliateUserId: data.affiliateUserId || null,
        commissionType: data.commissionType || null,
        commissionValue: data.commissionValue ? parseFloat(data.commissionValue) : null,
        commissionDurationMonths: data.commissionDurationMonths ? parseInt(data.commissionDurationMonths) : 1,
        validPlanIds: data.validPlanIds.length > 0 ? data.validPlanIds : null,
        expiresAt: calculateExpirationDate(data.expirationPeriod),
        isActive: data.isActive,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/coupons"] });
      setEditingCoupon(null);
      setFormData(defaultFormData);
      toast({ title: language === "pt-BR" ? "Cupom atualizado" : "Coupon updated" });
    },
    onError: () => toast({ title: language === "pt-BR" ? "Erro ao atualizar" : "Error updating", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/admin/coupons/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/coupons"] });
      setDeletingCoupon(null);
      toast({ title: language === "pt-BR" ? "Cupom excluído" : "Coupon deleted" });
    },
    onError: () => toast({ title: language === "pt-BR" ? "Erro ao excluir" : "Error deleting", variant: "destructive" }),
  });

  const payCommissionMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/commissions/${id}/pay`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [buildCommissionsKey()] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/commissions/dashboard"] });
      setPayingCommission(null);
      toast({ title: language === "pt-BR" ? "Comissão paga" : "Commission paid" });
    },
    onError: () => toast({ title: language === "pt-BR" ? "Erro ao pagar" : "Error paying", variant: "destructive" }),
  });

  const reverseCommissionMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const res = await apiRequest("POST", `/api/admin/commissions/${id}/reverse`, { reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [buildCommissionsKey()] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/commissions/dashboard"] });
      setReversingCommission(null);
      setReverseReason("");
      toast({ title: language === "pt-BR" ? "Comissão estornada" : "Commission reversed" });
    },
    onError: () => toast({ title: language === "pt-BR" ? "Erro ao estornar" : "Error reversing", variant: "destructive" }),
  });

  // ─── Sub-components ───────────────────────────────────────────────────────

  const StatusBadge = ({ status }: { status: string }) => {
    if (status === "paid") return (
      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-0">
        <Check className="w-3 h-3 mr-1" />{t("admin.paid")}
      </Badge>
    );
    if (status === "reversed") return (
      <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-0">
        <RotateCcw className="w-3 h-3 mr-1" />{t("admin.reversed")}
      </Badge>
    );
    return (
      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-0">
        {t("admin.pending")}
      </Badge>
    );
  };

  const TypeBadge = ({ type }: { type: string }) => {
    if (type === "recurring") return (
      <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950/30 text-xs">
        <RefreshCw className="w-3 h-3 mr-1" />
        {language === "pt-BR" ? "Recorrente" : "Recurring"}
      </Badge>
    );
    return (
      <Badge variant="outline" className="text-gray-500 border-gray-300 text-xs">
        {language === "pt-BR" ? "Única" : "One-time"}
      </Badge>
    );
  };

  const EmailCell = ({ email, id }: { email: string | null; id: string }) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default text-sm truncate max-w-[120px] block">
            {email ? email.split("@")[0] + "@…" : id.slice(0, 8) + "…"}
          </span>
        </TooltipTrigger>
        <TooltipContent><p>{email || id}</p></TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  const DashboardMetricCard = ({
    icon: Icon,
    label,
    value,
    color,
  }: {
    icon: any;
    label: string;
    value: string;
    color: string;
  }) => (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className="text-xl font-bold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // ─── Coupon form ──────────────────────────────────────────────────────────

  const renderCouponForm = (onSubmit: () => void) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t("admin.code")}</Label>
          <Input
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
            placeholder="CUPOM10"
            data-testid="input-coupon-code"
          />
        </div>
        <div className="space-y-2">
          <Label>{t("admin.discountType")}</Label>
          <Select value={formData.discountType} onValueChange={(v) => setFormData({ ...formData, discountType: v })}>
            <SelectTrigger data-testid="select-discount-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="percentage">{t("admin.percentage")}</SelectItem>
              <SelectItem value="fixed">{t("admin.fixed")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t("admin.discountValue")} {formData.discountType === "percentage" ? "(%)" : "(R$)"}</Label>
          <Input
            type="number"
            value={formData.discountValue}
            onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
            placeholder={formData.discountType === "percentage" ? "10" : "5000"}
            data-testid="input-discount-value"
          />
        </div>
        <div className="space-y-2">
          <Label>{t("admin.duration")} {t("admin.optional")}</Label>
          <Input
            type="number"
            value={formData.discountDurationMonths}
            onChange={(e) => setFormData({ ...formData, discountDurationMonths: e.target.value })}
            placeholder="3"
            data-testid="input-discount-duration"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t("admin.affiliate")} {t("admin.optional")}</Label>
        <Select
          value={formData.affiliateUserId || "none"}
          onValueChange={(v) => setFormData({ ...formData, affiliateUserId: v === "none" ? "" : v })}
        >
          <SelectTrigger data-testid="select-affiliate"><SelectValue placeholder={t("admin.selectAffiliate")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("admin.noAffiliate")}</SelectItem>
            {usersData?.users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.email} {u.firstName ? `(${u.firstName})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {formData.affiliateUserId && formData.affiliateUserId !== "none" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t("admin.commissionType")}</Label>
            <Select value={formData.commissionType} onValueChange={(v) => setFormData({ ...formData, commissionType: v })}>
              <SelectTrigger data-testid="select-commission-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">{t("admin.percentage")}</SelectItem>
                <SelectItem value="fixed">{t("admin.fixed")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("admin.commissionValue")} {formData.commissionType === "percentage" ? "(%)" : "(R$)"}</Label>
            <Input
              type="number"
              value={formData.commissionValue}
              onChange={(e) => setFormData({ ...formData, commissionValue: e.target.value })}
              placeholder={formData.commissionType === "percentage" ? "10" : "5000"}
              data-testid="input-commission-value"
            />
          </div>
        </div>
      )}

      {formData.affiliateUserId && (
        <div className="space-y-2">
          <Label>{t("admin.commissionPeriod")}</Label>
          <Select
            value={formData.commissionDurationMonths}
            onValueChange={(v) => setFormData({ ...formData, commissionDurationMonths: v })}
          >
            <SelectTrigger data-testid="select-commission-duration"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">{t("admin.firstMonth")}</SelectItem>
              <SelectItem value="3">{t("admin.first3Months")}</SelectItem>
              <SelectItem value="6">{t("admin.first6Months")}</SelectItem>
              <SelectItem value="12">{t("admin.first12Months")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label>{t("admin.validPlans")} {t("admin.optional")}</Label>
        <div className="flex flex-wrap gap-2">
          {plans.map((plan) => (
            <Badge
              key={plan.id}
              variant={formData.validPlanIds.includes(plan.id) ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setFormData({
                ...formData,
                validPlanIds: formData.validPlanIds.includes(plan.id)
                  ? formData.validPlanIds.filter((id) => id !== plan.id)
                  : [...formData.validPlanIds, plan.id],
              })}
              data-testid={`badge-plan-${plan.id}`}
            >
              {language === "pt-BR" ? plan.name : (plan as any).nameEn || plan.name}
            </Badge>
          ))}
        </div>
        {formData.validPlanIds.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("admin.allPlans")}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>{t("admin.expirationPeriod")} {t("admin.optional")}</Label>
        <Select
          value={formData.expirationPeriod || "none"}
          onValueChange={(v) => setFormData({ ...formData, expirationPeriod: v === "none" ? "" : v })}
        >
          <SelectTrigger data-testid="select-expiration-period"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("admin.noExpiration")}</SelectItem>
            <SelectItem value="1">{t("admin.expires1Month")}</SelectItem>
            <SelectItem value="3">{t("admin.expires3Months")}</SelectItem>
            <SelectItem value="6">{t("admin.expires6Months")}</SelectItem>
            <SelectItem value="12">{t("admin.expires1Year")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          checked={formData.isActive}
          onCheckedChange={(v) => setFormData({ ...formData, isActive: v })}
          data-testid="switch-is-active"
        />
        <Label>{t("admin.active")}</Label>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button
          variant="outline"
          onClick={() => { setIsCreateOpen(false); setEditingCoupon(null); setFormData(defaultFormData); }}
          data-testid="button-cancel"
        >
          {t("admin.cancel")}
        </Button>
        <Button onClick={onSubmit} data-testid="button-save">{t("admin.save")}</Button>
      </div>
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="dashboard" data-testid="tab-dashboard">
            <Activity className="w-4 h-4 mr-2" />
            {t("admin.dashboard")}
          </TabsTrigger>
          <TabsTrigger value="commissions" data-testid="tab-commissions">
            <DollarSign className="w-4 h-4 mr-2" />
            {t("admin.commissions")}
          </TabsTrigger>
          <TabsTrigger value="coupons" data-testid="tab-coupons">
            <Tag className="w-4 h-4 mr-2" />
            {t("admin.coupons")}
          </TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-reports">
            <TrendingUp className="w-4 h-4 mr-2" />
            {t("admin.reports")}
          </TabsTrigger>
        </TabsList>

        {/* ── DASHBOARD TAB ──────────────────────────────────────────────── */}
        <TabsContent value="dashboard" className="space-y-4">
          {dashboardLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[...Array(9)].map((_, i) => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <DashboardMetricCard
                  icon={DollarSign}
                  label={language === "pt-BR" ? "Pendente a Pagar" : "Pending Payout"}
                  value={formatCurrency(dashboard?.pendingAmount ?? 0)}
                  color="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                />
                <DashboardMetricCard
                  icon={Check}
                  label={language === "pt-BR" ? "Total Pago" : "Total Paid Out"}
                  value={formatCurrency(dashboard?.paidAmount ?? 0)}
                  color="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                />
                <DashboardMetricCard
                  icon={RotateCcw}
                  label={language === "pt-BR" ? "Total Estornado" : "Total Reversed"}
                  value={formatCurrency(dashboard?.reversedAmount ?? 0)}
                  color="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                />
                <DashboardMetricCard
                  icon={RefreshCw}
                  label={language === "pt-BR" ? "Recorrentes este Mês" : "Recurring This Month"}
                  value={String(dashboard?.recurringThisMonth ?? 0)}
                  color="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                />
                <DashboardMetricCard
                  icon={DollarSign}
                  label={language === "pt-BR" ? "MRR Afiliado" : "Affiliate MRR"}
                  value={formatCurrency(dashboard?.recurringAmountThisMonth ?? 0)}
                  color="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
                />
                <DashboardMetricCard
                  icon={Users}
                  label={language === "pt-BR" ? "Afiliados c/ Pendente" : "Affiliates w/ Pending"}
                  value={String(dashboard?.totalAffiliatesWithPending ?? 0)}
                  color="bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
                />
                <DashboardMetricCard
                  icon={Activity}
                  label={language === "pt-BR" ? "Comissões Pendentes" : "Pending Commissions"}
                  value={String(dashboard?.pendingCount ?? 0)}
                  color="bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
                />
                <DashboardMetricCard
                  icon={Check}
                  label={language === "pt-BR" ? "Comissões Pagas" : "Paid Commissions"}
                  value={String(dashboard?.paidCount ?? 0)}
                  color="bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400"
                />
                <DashboardMetricCard
                  icon={AlertCircle}
                  label={language === "pt-BR" ? "Comissões Estornadas" : "Reversed Commissions"}
                  value={String(dashboard?.reversedCount ?? 0)}
                  color="bg-gray-100 dark:bg-gray-900/30 text-gray-600 dark:text-gray-400"
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                {language === "pt-BR" ? "Atualizado em tempo real com base nos pagamentos Stripe" : "Updated in real-time based on Stripe payments"}
              </p>
            </>
          )}
        </TabsContent>

        {/* ── COMMISSIONS TAB ───────────────────────────────────────────── */}
        <TabsContent value="commissions" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1 min-w-[120px]">
                  <Label className="text-xs">{t("admin.status")}</Label>
                  <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1); }}>
                    <SelectTrigger className="h-8 text-xs" data-testid="select-filter-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{language === "pt-BR" ? "Todos" : "All"}</SelectItem>
                      <SelectItem value="pending">{t("admin.pending")}</SelectItem>
                      <SelectItem value="paid">{t("admin.paid")}</SelectItem>
                      <SelectItem value="reversed">{t("admin.reversed")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 min-w-[120px]">
                  <Label className="text-xs">{language === "pt-BR" ? "Tipo" : "Type"}</Label>
                  <Select value={filterType} onValueChange={(v) => { setFilterType(v); setPage(1); }}>
                    <SelectTrigger className="h-8 text-xs" data-testid="select-filter-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{language === "pt-BR" ? "Todos" : "All"}</SelectItem>
                      <SelectItem value="one_time">{language === "pt-BR" ? "Única" : "One-time"}</SelectItem>
                      <SelectItem value="recurring">{language === "pt-BR" ? "Recorrente" : "Recurring"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {affiliateOptions.length > 0 && (
                  <div className="space-y-1 min-w-[160px]">
                    <Label className="text-xs">{t("admin.affiliate")}</Label>
                    <Select value={filterAffiliate} onValueChange={(v) => { setFilterAffiliate(v); setPage(1); }}>
                      <SelectTrigger className="h-8 text-xs" data-testid="select-filter-affiliate">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{language === "pt-BR" ? "Todos" : "All"}</SelectItem>
                        {affiliateOptions.map((u) => (
                          <SelectItem key={u.id} value={u.id}>{u.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">{language === "pt-BR" ? "De" : "From"}</Label>
                  <Input
                    type="date"
                    className="h-8 text-xs w-[130px]"
                    value={filterDateFrom}
                    onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }}
                    data-testid="input-filter-date-from"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{language === "pt-BR" ? "Até" : "To"}</Label>
                  <Input
                    type="date"
                    className="h-8 text-xs w-[130px]"
                    value={filterDateTo}
                    onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }}
                    data-testid="input-filter-date-to"
                  />
                </div>
                <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 text-xs">
                  {language === "pt-BR" ? "Limpar" : "Clear"}
                </Button>
                <div className="ml-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    asChild
                    data-testid="button-export-csv"
                  >
                    <a href={buildExportUrl()} download>
                      <Download className="w-3 h-3" />
                      CSV
                    </a>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {commissionsLoading ? (
                <div className="p-4 space-y-2">
                  {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : !commissionsData?.commissions.length ? (
                <div className="text-center py-12 text-muted-foreground">
                  <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>{language === "pt-BR" ? "Nenhuma comissão encontrada" : "No commissions found"}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("admin.affiliate")}</TableHead>
                      <TableHead>{t("admin.referredUser")}</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>{language === "pt-BR" ? "Tipo" : "Type"}</TableHead>
                      <TableHead>{t("admin.status")}</TableHead>
                      <TableHead>{t("admin.amount")}</TableHead>
                      <TableHead>{language === "pt-BR" ? "Meses" : "Months"}</TableHead>
                      <TableHead>{language === "pt-BR" ? "Data" : "Date"}</TableHead>
                      <TableHead>{t("admin.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commissionsData.commissions.map((c) => (
                      <TableRow key={c.id} data-testid={`row-commission-${c.id}`}>
                        <TableCell>
                          <EmailCell email={c.affiliateEmail} id={c.affiliateUserId} />
                        </TableCell>
                        <TableCell>
                          <EmailCell email={c.referredUserEmail} id={c.referredUserId} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {c.stripeInvoiceId ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-default">
                                    {c.stripeInvoiceId.slice(0, 10)}…
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent><p>{c.stripeInvoiceId}</p></TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : "—"}
                        </TableCell>
                        <TableCell><TypeBadge type={c.type || ""} /></TableCell>
                        <TableCell><StatusBadge status={c.status} /></TableCell>
                        <TableCell className="font-mono text-sm font-medium">
                          {formatCurrency(c.amount)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {c.commissionDurationMonths ? `—/${c.commissionDurationMonths}` : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {c.createdAt ? format(new Date(c.createdAt), "dd/MM/yy") : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => setDetailCommission(c)}
                              data-testid={`button-detail-commission-${c.id}`}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                            {c.status === "pending" && (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => setPayingCommission(c)}
                                  data-testid={`button-pay-commission-${c.id}`}
                                >
                                  <Check className="w-3.5 h-3.5 text-green-600" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => setReversingCommission(c)}
                                  data-testid={`button-reverse-commission-${c.id}`}
                                >
                                  <RotateCcw className="w-3.5 h-3.5 text-red-600" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {language === "pt-BR"
                  ? `${commissionsData?.total ?? 0} comissões`
                  : `${commissionsData?.total ?? 0} commissions`}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span>{page} / {totalPages}</span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  data-testid="button-next-page"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── COUPONS TAB ───────────────────────────────────────────────── */}
        <TabsContent value="coupons" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-coupon">
                  <Plus className="w-4 h-4 mr-2" />
                  {t("admin.createCoupon")}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>{t("admin.createCoupon")}</DialogTitle></DialogHeader>
                {renderCouponForm(() => createMutation.mutate(formData))}
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              {couponsLoading ? (
                <div className="p-4 space-y-2">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("admin.code")}</TableHead>
                      <TableHead>{t("admin.discountType")}</TableHead>
                      <TableHead>{t("admin.discountValue")}</TableHead>
                      <TableHead>{t("admin.affiliate")}</TableHead>
                      <TableHead>{language === "pt-BR" ? "Comissão" : "Commission"}</TableHead>
                      <TableHead>{t("admin.usages")}</TableHead>
                      <TableHead>{t("admin.status")}</TableHead>
                      <TableHead>{t("admin.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {coupons.map((coupon) => (
                      <TableRow key={coupon.id} data-testid={`row-coupon-${coupon.id}`}>
                        <TableCell className="font-mono font-bold">{coupon.code}</TableCell>
                        <TableCell className="text-sm">
                          {coupon.discountType === "percentage" ? t("admin.percentage") : t("admin.fixed")}
                        </TableCell>
                        <TableCell className="text-sm">
                          {coupon.discountType === "percentage"
                            ? `${coupon.discountValue}%`
                            : formatCurrency(coupon.discountValue)}
                        </TableCell>
                        <TableCell>
                          {coupon.affiliateUserId ? (
                            <Badge variant="outline" className="text-xs">
                              {usersData?.users.find((u) => u.id === coupon.affiliateUserId)?.email?.split("@")[0] || coupon.affiliateUserId.slice(0, 8)}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {coupon.commissionType && coupon.commissionValue != null ? (
                            <span>
                              {coupon.commissionType === "percentage"
                                ? `${coupon.commissionValue}%`
                                : formatCurrency(coupon.commissionValue)}
                              {" · "}
                              {coupon.commissionDurationMonths}mo
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>{coupon.usageCount}</TableCell>
                        <TableCell>
                          <Badge variant={coupon.isActive ? "default" : "secondary"} className="text-xs">
                            {coupon.isActive ? t("admin.active") : language === "pt-BR" ? "Inativo" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => handleEditCoupon(coupon)}
                              data-testid={`button-edit-coupon-${coupon.id}`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => setDeletingCoupon(coupon)}
                              data-testid={`button-delete-coupon-${coupon.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── REPORTS TAB ───────────────────────────────────────────────── */}
        <TabsContent value="reports" className="space-y-4">
          {reportsLoading ? (
            <div className="grid grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2">
                    <CardTitle className="text-sm font-medium">{t("admin.totalCoupons")}</CardTitle>
                    <Tag className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{reports?.totalCoupons || 0}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2">
                    <CardTitle className="text-sm font-medium">{t("admin.activeCoupons")}</CardTitle>
                    <Check className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{reports?.activeCoupons || 0}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2">
                    <CardTitle className="text-sm font-medium">{t("admin.totalUsages")}</CardTitle>
                    <Users className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{reports?.totalUsages || 0}</div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>{t("admin.topAffiliates")}</CardTitle>
                  <CardDescription>
                    {language === "pt-BR" ? "Por ganhos totais (pendente + pago)" : "By total earnings (pending + paid)"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!reports?.topAffiliates.length ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {language === "pt-BR" ? "Nenhum afiliado ainda" : "No affiliates yet"}
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Email</TableHead>
                          <TableHead>{language === "pt-BR" ? "Referrals" : "Referrals"}</TableHead>
                          <TableHead>{t("admin.earnings")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reports.topAffiliates.map((a) => (
                          <TableRow key={a.affiliateId}>
                            <TableCell className="text-sm">{a.email}</TableCell>
                            <TableCell>{a.referrals}</TableCell>
                            <TableCell className="font-mono">{formatCurrency(a.earnings)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ── DIALOGS ──────────────────────────────────────────────────────── */}

      {/* Edit coupon */}
      <Dialog open={!!editingCoupon} onOpenChange={() => setEditingCoupon(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{t("admin.editCoupon")}</DialogTitle></DialogHeader>
          {editingCoupon && renderCouponForm(() => updateMutation.mutate({ id: editingCoupon.id, data: formData }))}
        </DialogContent>
      </Dialog>

      {/* Delete coupon */}
      <AlertDialog open={!!deletingCoupon} onOpenChange={() => setDeletingCoupon(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.delete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("admin.confirmDelete")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("admin.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingCoupon && deleteMutation.mutate(deletingCoupon.id)}>
              {t("admin.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pay commission */}
      <AlertDialog open={!!payingCommission} onOpenChange={() => setPayingCommission(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.markAsPaid")}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === "pt-BR"
                ? `Confirma o pagamento de ${payingCommission ? formatCurrency(payingCommission.amount) : ""} ao afiliado ${payingCommission?.affiliateEmail || ""}?`
                : `Confirm payment of ${payingCommission ? formatCurrency(payingCommission.amount) : ""} to ${payingCommission?.affiliateEmail || ""}?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("admin.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => payingCommission && payCommissionMutation.mutate(payingCommission.id)}>
              {t("admin.markAsPaid")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reverse commission */}
      <Dialog open={!!reversingCommission} onOpenChange={() => setReversingCommission(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("admin.reverse")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("admin.reverseReason")}</Label>
              <Select value={reverseReason} onValueChange={setReverseReason}>
                <SelectTrigger data-testid="select-reverse-reason"><SelectValue placeholder={language === "pt-BR" ? "Selecione o motivo" : "Select reason"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="subscription_canceled_early">{language === "pt-BR" ? "Cancelamento antecipado" : "Early cancellation"}</SelectItem>
                  <SelectItem value="refund">{language === "pt-BR" ? "Reembolso" : "Refund"}</SelectItem>
                  <SelectItem value="fraud">{language === "pt-BR" ? "Fraude" : "Fraud"}</SelectItem>
                  <SelectItem value="manual_admin">{language === "pt-BR" ? "Ajuste manual" : "Manual adjustment"}</SelectItem>
                  <SelectItem value="other">{language === "pt-BR" ? "Outro" : "Other"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReversingCommission(null)}>{t("admin.cancel")}</Button>
              <Button
                variant="destructive"
                onClick={() => reversingCommission && reverseCommissionMutation.mutate({ id: reversingCommission.id, reason: reverseReason })}
                disabled={!reverseReason}
                data-testid="button-confirm-reverse"
              >
                {t("admin.reverse")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Commission detail */}
      <Dialog open={!!detailCommission} onOpenChange={() => setDetailCommission(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{language === "pt-BR" ? "Detalhes da Comissão" : "Commission Details"}</DialogTitle>
          </DialogHeader>
          {detailCommission && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">{t("admin.affiliate")}</p>
                  <p className="font-medium break-all">{detailCommission.affiliateEmail || detailCommission.affiliateUserId}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("admin.referredUser")}</p>
                  <p className="font-medium break-all">{detailCommission.referredUserEmail || detailCommission.referredUserId}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("admin.status")}</p>
                  <StatusBadge status={detailCommission.status} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{language === "pt-BR" ? "Tipo" : "Type"}</p>
                  <TypeBadge type={detailCommission.type || ""} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("admin.amount")}</p>
                  <p className="font-mono font-bold">{formatCurrency(detailCommission.amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cupom</p>
                  <p className="font-mono">{detailCommission.couponCode || detailCommission.couponId}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Invoice Stripe</p>
                  <p className="font-mono text-xs break-all">{detailCommission.stripeInvoiceId || "—"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Subscription Stripe</p>
                  <p className="font-mono text-xs break-all">{detailCommission.stripeSubscriptionId || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{language === "pt-BR" ? "Criado em" : "Created at"}</p>
                  <p>{detailCommission.createdAt ? format(new Date(detailCommission.createdAt), "dd/MM/yyyy HH:mm") : "—"}</p>
                </div>
                {detailCommission.paidAt && (
                  <div>
                    <p className="text-xs text-muted-foreground">{language === "pt-BR" ? "Pago em" : "Paid at"}</p>
                    <p>{format(new Date(detailCommission.paidAt), "dd/MM/yyyy HH:mm")}</p>
                  </div>
                )}
                {detailCommission.reversedAt && (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground">{language === "pt-BR" ? "Estornado em" : "Reversed at"}</p>
                      <p>{format(new Date(detailCommission.reversedAt), "dd/MM/yyyy HH:mm")}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{language === "pt-BR" ? "Motivo" : "Reason"}</p>
                      <p className="break-all">{detailCommission.reversedReason || "—"}</p>
                    </div>
                  </>
                )}
                {detailCommission.commissionDurationMonths && (
                  <div>
                    <p className="text-xs text-muted-foreground">{language === "pt-BR" ? "Meses de comissão" : "Commission months"}</p>
                    <p>{detailCommission.commissionDurationMonths}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
