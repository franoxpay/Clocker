import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Coupon, Commission, Plan, User } from "@shared/schema";
import { Plus, Pencil, Trash2, Tag, DollarSign, Users, TrendingUp, Check, X, RotateCcw } from "lucide-react";
import { format } from "date-fns";

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

export default function AdminReferrals() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("coupons");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [deletingCoupon, setDeletingCoupon] = useState<Coupon | null>(null);
  const [formData, setFormData] = useState<CouponFormData>(defaultFormData);
  const [payingCommission, setPayingCommission] = useState<Commission | null>(null);
  const [reversingCommission, setReversingCommission] = useState<Commission | null>(null);
  const [reverseReason, setReverseReason] = useState("");

  const t = (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      "admin.referrals": { "pt-BR": "Indicações", en: "Referrals" },
      "admin.coupons": { "pt-BR": "Cupons", en: "Coupons" },
      "admin.commissions": { "pt-BR": "Comissões", en: "Commissions" },
      "admin.reports": { "pt-BR": "Relatórios", en: "Reports" },
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
      "admin.referredUser": { "pt-BR": "Usuário Indicado", en: "Referred User" },
      "admin.actions": { "pt-BR": "Ações", en: "Actions" },
      "admin.markAsPaid": { "pt-BR": "Marcar como Pago", en: "Mark as Paid" },
      "admin.reverse": { "pt-BR": "Estornar", en: "Reverse" },
      "admin.reverseReason": { "pt-BR": "Motivo do Estorno", en: "Reverse Reason" },
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
    return translations[key]?.[language] || key;
  };

  const { data: coupons = [], isLoading: couponsLoading } = useQuery<Coupon[]>({
    queryKey: ["/api/admin/coupons"],
  });

  const { data: commissionsData, isLoading: commissionsLoading } = useQuery<{ commissions: Commission[]; total: number }>({
    queryKey: ["/api/admin/commissions"],
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

  const calculateExpirationDate = (period: string): string | null => {
    if (!period) return null;
    const months = parseInt(period);
    if (isNaN(months)) return null;
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    return date.toISOString();
  };

  const createMutation = useMutation({
    mutationFn: async (data: CouponFormData) => {
      const commissionDuration = data.commissionDurationMonths ? parseInt(data.commissionDurationMonths) : 1;
      const res = await apiRequest("POST", "/api/admin/coupons", {
        code: data.code,
        discountType: data.discountType,
        discountValue: parseFloat(data.discountValue) || 0,
        discountDurationMonths: data.discountDurationMonths ? parseInt(data.discountDurationMonths) : null,
        affiliateUserId: data.affiliateUserId || null,
        commissionType: data.commissionType || null,
        commissionValue: data.commissionValue ? parseFloat(data.commissionValue) : null,
        commissionDurationMonths: commissionDuration,
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
      toast({
        title: language === "pt-BR" ? "Sucesso" : "Success",
        description: language === "pt-BR" ? "Cupom criado" : "Coupon created",
      });
    },
    onError: () => {
      toast({
        title: language === "pt-BR" ? "Erro" : "Error",
        description: language === "pt-BR" ? "Erro ao criar cupom" : "Error creating coupon",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: CouponFormData }) => {
      const commissionDuration = data.commissionDurationMonths ? parseInt(data.commissionDurationMonths) : 1;
      const res = await apiRequest("PATCH", `/api/admin/coupons/${id}`, {
        code: data.code,
        discountType: data.discountType,
        discountValue: parseFloat(data.discountValue) || 0,
        discountDurationMonths: data.discountDurationMonths ? parseInt(data.discountDurationMonths) : null,
        affiliateUserId: data.affiliateUserId || null,
        commissionType: data.commissionType || null,
        commissionValue: data.commissionValue ? parseFloat(data.commissionValue) : null,
        commissionDurationMonths: commissionDuration,
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
      toast({
        title: language === "pt-BR" ? "Sucesso" : "Success",
        description: language === "pt-BR" ? "Cupom atualizado" : "Coupon updated",
      });
    },
    onError: () => {
      toast({
        title: language === "pt-BR" ? "Erro" : "Error",
        description: language === "pt-BR" ? "Erro ao atualizar cupom" : "Error updating coupon",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/coupons/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/coupons"] });
      setDeletingCoupon(null);
      toast({
        title: language === "pt-BR" ? "Sucesso" : "Success",
        description: language === "pt-BR" ? "Cupom excluído" : "Coupon deleted",
      });
    },
    onError: () => {
      toast({
        title: language === "pt-BR" ? "Erro" : "Error",
        description: language === "pt-BR" ? "Erro ao excluir cupom" : "Error deleting coupon",
        variant: "destructive",
      });
    },
  });

  const payCommissionMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/commissions/${id}/pay`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/commissions"] });
      setPayingCommission(null);
      toast({
        title: language === "pt-BR" ? "Sucesso" : "Success",
        description: language === "pt-BR" ? "Comissão marcada como paga" : "Commission marked as paid",
      });
    },
    onError: () => {
      toast({
        title: language === "pt-BR" ? "Erro" : "Error",
        description: language === "pt-BR" ? "Erro ao pagar comissão" : "Error paying commission",
        variant: "destructive",
      });
    },
  });

  const reverseCommissionMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const res = await apiRequest("POST", `/api/admin/commissions/${id}/reverse`, { reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/commissions"] });
      setReversingCommission(null);
      setReverseReason("");
      toast({
        title: language === "pt-BR" ? "Sucesso" : "Success",
        description: language === "pt-BR" ? "Comissão estornada" : "Commission reversed",
      });
    },
    onError: () => {
      toast({
        title: language === "pt-BR" ? "Erro" : "Error",
        description: language === "pt-BR" ? "Erro ao estornar comissão" : "Error reversing commission",
        variant: "destructive",
      });
    },
  });

  const calculateExpirationPeriodFromDate = (expiresAt: Date | string | null): string => {
    if (!expiresAt) return "";
    const expDate = new Date(expiresAt);
    const now = new Date();
    const diffMonths = Math.round((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30));
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(language === "pt-BR" ? "pt-BR" : "en-US", {
      style: "currency",
      currency: "BRL",
    }).format(amount / 100);
  };

  const renderCouponForm = (onSubmit: () => void, isEdit: boolean) => (
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
          <Select
            value={formData.discountType}
            onValueChange={(value) => setFormData({ ...formData, discountType: value })}
          >
            <SelectTrigger data-testid="select-discount-type">
              <SelectValue />
            </SelectTrigger>
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
          onValueChange={(value) => setFormData({ ...formData, affiliateUserId: value === "none" ? "" : value })}
        >
          <SelectTrigger data-testid="select-affiliate">
            <SelectValue placeholder={t("admin.selectAffiliate")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("admin.noAffiliate")}</SelectItem>
            {usersData?.users.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.email} {user.firstName ? `(${user.firstName})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {formData.affiliateUserId && formData.affiliateUserId !== "none" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t("admin.commissionType")}</Label>
            <Select
              value={formData.commissionType}
              onValueChange={(value) => setFormData({ ...formData, commissionType: value })}
            >
              <SelectTrigger data-testid="select-commission-type">
                <SelectValue placeholder={t("admin.selectAffiliate")} />
              </SelectTrigger>
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
            onValueChange={(value) => setFormData({ ...formData, commissionDurationMonths: value })}
          >
            <SelectTrigger data-testid="select-commission-duration">
              <SelectValue />
            </SelectTrigger>
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
              onClick={() => {
                if (formData.validPlanIds.includes(plan.id)) {
                  setFormData({
                    ...formData,
                    validPlanIds: formData.validPlanIds.filter((id) => id !== plan.id),
                  });
                } else {
                  setFormData({
                    ...formData,
                    validPlanIds: [...formData.validPlanIds, plan.id],
                  });
                }
              }}
              data-testid={`badge-plan-${plan.id}`}
            >
              {language === "pt-BR" ? plan.name : plan.nameEn || plan.name}
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
          onValueChange={(value) => setFormData({ ...formData, expirationPeriod: value === "none" ? "" : value })}
        >
          <SelectTrigger data-testid="select-expiration-period">
            <SelectValue />
          </SelectTrigger>
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
          onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
          data-testid="switch-is-active"
        />
        <Label>{t("admin.active")}</Label>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button
          variant="outline"
          onClick={() => {
            setIsCreateOpen(false);
            setEditingCoupon(null);
            setFormData(defaultFormData);
          }}
          data-testid="button-cancel"
        >
          {t("admin.cancel")}
        </Button>
        <Button onClick={onSubmit} data-testid="button-save">
          {t("admin.save")}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("admin.referrals")}</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="coupons" data-testid="tab-coupons">
            <Tag className="w-4 h-4 mr-2" />
            {t("admin.coupons")}
          </TabsTrigger>
          <TabsTrigger value="commissions" data-testid="tab-commissions">
            <DollarSign className="w-4 h-4 mr-2" />
            {t("admin.commissions")}
          </TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-reports">
            <TrendingUp className="w-4 h-4 mr-2" />
            {t("admin.reports")}
          </TabsTrigger>
        </TabsList>

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
                <DialogHeader>
                  <DialogTitle>{t("admin.createCoupon")}</DialogTitle>
                </DialogHeader>
                {renderCouponForm(() => createMutation.mutate(formData), false)}
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              {couponsLoading ? (
                <div className="p-4 space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("admin.code")}</TableHead>
                      <TableHead>{t("admin.discountType")}</TableHead>
                      <TableHead>{t("admin.discountValue")}</TableHead>
                      <TableHead>{t("admin.affiliate")}</TableHead>
                      <TableHead>{t("admin.usages")}</TableHead>
                      <TableHead>{t("admin.status")}</TableHead>
                      <TableHead>{t("admin.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {coupons.map((coupon) => (
                      <TableRow key={coupon.id} data-testid={`row-coupon-${coupon.id}`}>
                        <TableCell className="font-mono font-bold">{coupon.code}</TableCell>
                        <TableCell>
                          {coupon.discountType === "percentage" ? t("admin.percentage") : t("admin.fixed")}
                        </TableCell>
                        <TableCell>
                          {coupon.discountType === "percentage"
                            ? `${coupon.discountValue}%`
                            : formatCurrency(coupon.discountValue)}
                        </TableCell>
                        <TableCell>
                          {coupon.affiliateUserId ? (
                            <Badge variant="outline">
                              {usersData?.users.find((u) => u.id === coupon.affiliateUserId)?.email || coupon.affiliateUserId}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>{coupon.usageCount}</TableCell>
                        <TableCell>
                          <Badge variant={coupon.isActive ? "default" : "secondary"}>
                            {coupon.isActive ? t("admin.active") : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleEditCoupon(coupon)}
                              data-testid={`button-edit-coupon-${coupon.id}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setDeletingCoupon(coupon)}
                              data-testid={`button-delete-coupon-${coupon.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
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

        <TabsContent value="commissions" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              {commissionsLoading ? (
                <div className="p-4 space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("admin.affiliate")}</TableHead>
                      <TableHead>{t("admin.referredUser")}</TableHead>
                      <TableHead>{t("admin.amount")}</TableHead>
                      <TableHead>{t("admin.status")}</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>{t("admin.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commissionsData?.commissions.map((commission) => (
                      <TableRow key={commission.id} data-testid={`row-commission-${commission.id}`}>
                        <TableCell>
                          {usersData?.users.find((u) => u.id === commission.affiliateUserId)?.email || commission.affiliateUserId}
                        </TableCell>
                        <TableCell>
                          {usersData?.users.find((u) => u.id === commission.referredUserId)?.email || commission.referredUserId}
                        </TableCell>
                        <TableCell className="font-mono">{formatCurrency(commission.amount)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              commission.status === "paid"
                                ? "default"
                                : commission.status === "reversed"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {commission.status === "pending"
                              ? t("admin.pending")
                              : commission.status === "paid"
                              ? t("admin.paid")
                              : t("admin.reversed")}
                          </Badge>
                        </TableCell>
                        <TableCell>{format(new Date(commission.createdAt), "dd/MM/yyyy")}</TableCell>
                        <TableCell>
                          {commission.status === "pending" && (
                            <div className="flex gap-2">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setPayingCommission(commission)}
                                data-testid={`button-pay-commission-${commission.id}`}
                              >
                                <Check className="w-4 h-4 text-green-600" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setReversingCommission(commission)}
                                data-testid={`button-reverse-commission-${commission.id}`}
                              >
                                <RotateCcw className="w-4 h-4 text-red-600" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          {reportsLoading ? (
            <div className="grid grid-cols-3 gap-4">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                    <CardTitle className="text-sm font-medium">{t("admin.totalCoupons")}</CardTitle>
                    <Tag className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{reports?.totalCoupons || 0}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                    <CardTitle className="text-sm font-medium">{t("admin.activeCoupons")}</CardTitle>
                    <Check className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{reports?.activeCoupons || 0}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
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
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Referrals</TableHead>
                        <TableHead>{t("admin.earnings")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reports?.topAffiliates.map((affiliate) => (
                        <TableRow key={affiliate.affiliateId}>
                          <TableCell>{affiliate.email}</TableCell>
                          <TableCell>{affiliate.referrals}</TableCell>
                          <TableCell className="font-mono">{formatCurrency(affiliate.earnings)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!editingCoupon} onOpenChange={() => setEditingCoupon(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("admin.editCoupon")}</DialogTitle>
          </DialogHeader>
          {editingCoupon && renderCouponForm(() => updateMutation.mutate({ id: editingCoupon.id, data: formData }), true)}
        </DialogContent>
      </Dialog>

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

      <AlertDialog open={!!payingCommission} onOpenChange={() => setPayingCommission(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.markAsPaid")}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === "pt-BR"
                ? `Confirma o pagamento de ${payingCommission ? formatCurrency(payingCommission.amount) : ""} para o afiliado?`
                : `Confirm payment of ${payingCommission ? formatCurrency(payingCommission.amount) : ""} to the affiliate?`}
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

      <Dialog open={!!reversingCommission} onOpenChange={() => setReversingCommission(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.reverse")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("admin.reverseReason")}</Label>
              <Input
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                placeholder={language === "pt-BR" ? "Motivo do estorno..." : "Reason for reversal..."}
                data-testid="input-reverse-reason"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReversingCommission(null)}>
                {t("admin.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={() =>
                  reversingCommission && reverseCommissionMutation.mutate({ id: reversingCommission.id, reason: reverseReason })
                }
                disabled={!reverseReason}
                data-testid="button-confirm-reverse"
              >
                {t("admin.reverse")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
