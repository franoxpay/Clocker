import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { User, Lock, CreditCard, Globe, ExternalLink, Check, Gift, Copy, DollarSign, Users, TrendingUp, RefreshCw, Activity, RotateCcw, Banknote } from "lucide-react";
import { format } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";

interface Invoice {
  id: string;
  amount: number;
  status: string;
  date: string | null;
  pdfUrl?: string;
}

interface Plan {
  id: number;
  name: string;
  nameEn: string;
  price: number;
  maxOffers: number;
  maxDomains: number;
  maxClicks: number;
  isUnlimited: boolean;
}

interface AffiliateStats {
  totalReferrals: number;
  totalEarnings: number;
  pendingEarnings: number;
  paidEarnings: number;
  reversedEarnings: number;
  activeReferrals: number;
  couponUsages: number;
  paidConversions: number;
  coupon: {
    id: number;
    code: string;
    discountType: string;
    discountValue: number;
    usageCount: number;
    commissionDurationMonths: number | null;
  } | null;
}

interface AffiliateWithdrawal {
  id: number;
  amount: number;
  status: string;
  paymentMethod: string | null;
  paymentReference: string | null;
  notes: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
}

interface CommissionDetail {
  id: number;
  referredUserId: string;
  referredUserEmail: string | null;
  couponId: number;
  couponCode: string | null;
  commissionDurationMonths: number | null;
  stripeInvoiceId: string | null;
  stripeSubscriptionId: string | null;
  amount: number;
  type: string;
  status: string;
  createdAt: string;
  paidAt: string | null;
  reversedAt: string | null;
  reversedReason: string | null;
}

export default function Settings() {
  const { t, language, setLanguage } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/billing/invoices"],
  });

  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });

  const { data: affiliateStats, isLoading: affiliateLoading } = useQuery<AffiliateStats>({
    queryKey: ["/api/affiliate/stats"],
  });

  const { data: commissionsDetail = [], isLoading: commissionsDetailLoading } = useQuery<CommissionDetail[]>({
    queryKey: ["/api/affiliate/commissions-detail"],
  });

  const { data: affiliateWithdrawals = [] } = useQuery<AffiliateWithdrawal[]>({
    queryKey: ["/api/affiliate/withdrawals"],
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: typeof passwordForm) => {
      await apiRequest("POST", "/api/auth/change-password", data);
    },
    onSuccess: () => {
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast({
        title: t("common.success"),
        description: language === "pt-BR" ? "Senha alterada com sucesso" : "Password changed successfully",
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: language === "pt-BR" ? "Erro ao alterar senha" : "Error changing password",
        variant: "destructive",
      });
    },
  });

  const managePaymentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/billing/portal");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.open(data.url, "_blank");
      }
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: language === "pt-BR" ? "Erro ao abrir portal de pagamento" : "Error opening payment portal",
        variant: "destructive",
      });
    },
  });

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({
        title: t("common.error"),
        description: t("error.passwordMismatch"),
        variant: "destructive",
      });
      return;
    }
    changePasswordMutation.mutate(passwordForm);
  };

  const currentPlan = plans.find((p) => p.id === user?.planId);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: t("common.success"),
      description: language === "pt-BR" ? "Código copiado!" : "Code copied!",
    });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return format(new Date(dateStr), "dd/MM/yyyy", {
      locale: language === "pt-BR" ? ptBR : enUS,
    });
  };

  return (
    <div className="p-6 space-y-6">
      <Tabs defaultValue="account" className="space-y-6">
        <TabsList>
          <TabsTrigger value="account" data-testid="tab-account">
            <User className="w-4 h-4 mr-2" />
            {t("settings.account")}
          </TabsTrigger>
          <TabsTrigger value="billing" data-testid="tab-billing">
            <CreditCard className="w-4 h-4 mr-2" />
            {t("settings.billing")}
          </TabsTrigger>
          <TabsTrigger value="security" data-testid="tab-security">
            <Lock className="w-4 h-4 mr-2" />
            {t("settings.security")}
          </TabsTrigger>
          <TabsTrigger value="language" data-testid="tab-language">
            <Globe className="w-4 h-4 mr-2" />
            {t("settings.language")}
          </TabsTrigger>
          <TabsTrigger value="referrals" data-testid="tab-referrals">
            <Gift className="w-4 h-4 mr-2" />
            {language === "pt-BR" ? "Indicações" : "Referrals"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="account">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.account")}</CardTitle>
              <CardDescription>
                {language === "pt-BR"
                  ? "Informações da sua conta"
                  : "Your account information"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("auth.email")}</Label>
                <Input value={user?.email || ""} disabled data-testid="input-email" />
              </div>
              {currentPlan && (
                <div className="space-y-2">
                  <Label>{t("settings.plan")}</Label>
                  <div className="flex items-center gap-2">
                    <Badge variant="default">
                      {language === "pt-BR" ? currentPlan.name : currentPlan.nameEn}
                    </Badge>
                    {currentPlan.isUnlimited ? (
                      <span className="text-sm text-muted-foreground">
                        {language === "pt-BR" ? "Ilimitado" : "Unlimited"}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {currentPlan.maxOffers} {t("plan.offers")} · {currentPlan.maxDomains}{" "}
                        {t("plan.domains")} · {(currentPlan.maxClicks / 1000).toFixed(0)}k{" "}
                        {t("plan.clicks")}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t("settings.managePayment")}</CardTitle>
                <CardDescription>
                  {language === "pt-BR"
                    ? "Gerencie seus métodos de pagamento e assinatura"
                    : "Manage your payment methods and subscription"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => managePaymentMutation.mutate()}
                  disabled={managePaymentMutation.isPending}
                  data-testid="button-manage-payment"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  {managePaymentMutation.isPending
                    ? t("common.loading")
                    : t("settings.managePayment")}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("settings.invoices")}</CardTitle>
              </CardHeader>
              <CardContent>
                {invoicesLoading ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : invoices.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    {language === "pt-BR" ? "Nenhuma fatura encontrada" : "No invoices found"}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("logs.date")}</TableHead>
                        <TableHead>
                          {language === "pt-BR" ? "Valor" : "Amount"}
                        </TableHead>
                        <TableHead>{t("offers.status")}</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((invoice) => (
                        <TableRow key={invoice.id}>
                          <TableCell>{formatDate(invoice.date)}</TableCell>
                          <TableCell>R$ {invoice.amount.toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge
                              variant={invoice.status === "paid" ? "default" : "secondary"}
                            >
                              {invoice.status === "paid" ? (
                                <>
                                  <Check className="w-3 h-3 mr-1" />
                                  {language === "pt-BR" ? "Pago" : "Paid"}
                                </>
                              ) : (
                                invoice.status
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {invoice.pdfUrl && (
                              <Button variant="ghost" size="sm" asChild>
                                <a
                                  href={invoice.pdfUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.changePassword")}</CardTitle>
              <CardDescription>
                {language === "pt-BR"
                  ? "Altere sua senha de acesso"
                  : "Change your access password"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">{t("settings.currentPassword")}</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(e) =>
                      setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
                    }
                    required
                    data-testid="input-current-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">{t("settings.newPassword")}</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) =>
                      setPasswordForm({ ...passwordForm, newPassword: e.target.value })
                    }
                    required
                    data-testid="input-new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">{t("settings.confirmPassword")}</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) =>
                      setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                    }
                    required
                    data-testid="input-confirm-password"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={changePasswordMutation.isPending}
                  data-testid="button-change-password"
                >
                  {changePasswordMutation.isPending ? t("common.loading") : t("common.save")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="language">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.language")}</CardTitle>
              <CardDescription>
                {language === "pt-BR"
                  ? "Escolha o idioma da interface"
                  : "Choose the interface language"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={language}
                onValueChange={(value) => setLanguage(value as "pt-BR" | "en")}
              >
                <SelectTrigger className="w-64" data-testid="select-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt-BR">
                    <span className="flex items-center gap-2">
                      <span>🇧🇷</span>
                      Português (Brasil)
                    </span>
                  </SelectItem>
                  <SelectItem value="en">
                    <span className="flex items-center gap-2">
                      <span>🇺🇸</span>
                      English
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="referrals">
          <div className="space-y-6">
            {(affiliateLoading || commissionsDetailLoading) ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-24" />)}
                </div>
                <Skeleton className="h-64 w-full" />
              </div>
            ) : affiliateStats ? (
              <>
                {/* ── Row 1: earnings metrics ─────────────────────────────── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg shrink-0">
                          <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground truncate">
                            {language === "pt-BR" ? "Total Ganho" : "Total Earned"}
                          </p>
                          <p className="text-xl font-bold">R$ {(affiliateStats.totalEarnings / 100).toFixed(2)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg shrink-0">
                          <DollarSign className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground truncate">
                            {language === "pt-BR" ? "Pendente" : "Pending"}
                          </p>
                          <p className="text-xl font-bold">R$ {(affiliateStats.pendingEarnings / 100).toFixed(2)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg shrink-0">
                          <Check className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground truncate">
                            {language === "pt-BR" ? "Pago" : "Paid"}
                          </p>
                          <p className="text-xl font-bold">R$ {(affiliateStats.paidEarnings / 100).toFixed(2)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg shrink-0">
                          <RotateCcw className="w-4 h-4 text-red-600 dark:text-red-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground truncate">
                            {language === "pt-BR" ? "Estornado" : "Reversed"}
                          </p>
                          <p className="text-xl font-bold">R$ {((affiliateStats.reversedEarnings ?? 0) / 100).toFixed(2)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* ── Row 2: activity metrics ──────────────────────────────── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg shrink-0">
                          <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground truncate">
                            {language === "pt-BR" ? "Total Indicados" : "Total Referred"}
                          </p>
                          <p className="text-xl font-bold">{affiliateStats.totalReferrals}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-teal-100 dark:bg-teal-900/30 rounded-lg shrink-0">
                          <Activity className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground truncate">
                            {language === "pt-BR" ? "Clientes Ativos" : "Active Clients"}
                          </p>
                          <p className="text-xl font-bold">{affiliateStats.activeReferrals ?? affiliateStats.paidConversions}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg shrink-0">
                          <TrendingUp className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground truncate">
                            {language === "pt-BR" ? "Conversão" : "Conversion"}
                          </p>
                          <p className="text-xl font-bold">
                            {affiliateStats.couponUsages > 0
                              ? `${((affiliateStats.paidConversions / affiliateStats.couponUsages) * 100).toFixed(0)}%`
                              : "—"}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg shrink-0">
                          <RefreshCw className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground truncate">
                            {language === "pt-BR" ? "Recorrentes" : "Recurring"}
                          </p>
                          <p className="text-xl font-bold">
                            {commissionsDetail.filter(c => c.type === "recurring" && c.status !== "reversed").length}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* ── Coupon card ───────────────────────────────────────────── */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Gift className="w-4 h-4" />
                      {language === "pt-BR" ? "Seu Cupom de Indicação" : "Your Referral Coupon"}
                    </CardTitle>
                    <CardDescription>
                      {language === "pt-BR"
                        ? "Compartilhe este código para ganhar comissões"
                        : "Share this code to earn commissions"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!affiliateStats.coupon ? (
                      <p className="text-center py-6 text-muted-foreground text-sm">
                        {language === "pt-BR"
                          ? "Você ainda não possui cupom de indicação. Entre em contato com o suporte."
                          : "You don't have a referral coupon yet. Contact support to request one."}
                      </p>
                    ) : (
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border rounded-lg bg-muted/30">
                        <div className="flex items-center gap-4">
                          <div className="p-2 bg-primary/10 rounded-lg">
                            <Gift className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-mono text-2xl font-bold tracking-widest">{affiliateStats.coupon.code}</p>
                            <div className="flex flex-wrap gap-2 mt-1">
                              <Badge variant="secondary" className="text-xs">
                                {affiliateStats.coupon.discountType === "percentage"
                                  ? `${affiliateStats.coupon.discountValue}% ${language === "pt-BR" ? "off" : "off"}`
                                  : `R$ ${(affiliateStats.coupon.discountValue / 100).toFixed(2)} off`}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {affiliateStats.coupon.usageCount} {language === "pt-BR" ? "usos" : "uses"}
                              </Badge>
                              {affiliateStats.coupon.commissionDurationMonths && (
                                <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">
                                  {affiliateStats.coupon.commissionDurationMonths} {language === "pt-BR" ? "meses de comissão" : "months commission"}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(affiliateStats.coupon!.code)}
                          data-testid={`button-copy-coupon-${affiliateStats.coupon.id}`}
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          {language === "pt-BR" ? "Copiar Código" : "Copy Code"}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* ── Commission history table ──────────────────────────────── */}
                <Card>
                  <CardHeader>
                    <CardTitle>{language === "pt-BR" ? "Histórico de Comissões" : "Commission History"}</CardTitle>
                    <CardDescription>
                      {language === "pt-BR"
                        ? "Todas as comissões geradas pelas suas indicações"
                        : "All commissions generated by your referrals"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    {commissionsDetail.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="font-medium">{language === "pt-BR" ? "Nenhuma comissão ainda" : "No commissions yet"}</p>
                        <p className="text-sm mt-1">
                          {language === "pt-BR"
                            ? "As comissões aparecerão aqui quando seus indicados assinarem"
                            : "Commissions will appear here when your referrals subscribe"}
                        </p>
                      </div>
                    ) : (() => {
                      // Compute monthsCompleted per referredUserId for this affiliate
                      const completedMap: Record<string, number> = {};
                      [...commissionsDetail]
                        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                        .forEach(c => {
                          if (c.status !== "reversed") {
                            completedMap[c.referredUserId] = (completedMap[c.referredUserId] || 0) + 1;
                          }
                        });

                      return (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{language === "pt-BR" ? "Indicado" : "Referred"}</TableHead>
                              <TableHead>{language === "pt-BR" ? "Tipo" : "Type"}</TableHead>
                              <TableHead>{language === "pt-BR" ? "Status" : "Status"}</TableHead>
                              <TableHead>{language === "pt-BR" ? "Valor" : "Amount"}</TableHead>
                              <TableHead>{language === "pt-BR" ? "Data" : "Date"}</TableHead>
                              <TableHead>Invoice</TableHead>
                              <TableHead>{language === "pt-BR" ? "Meses" : "Months"}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {commissionsDetail.map((commission) => {
                              const maxMonths = commission.commissionDurationMonths ?? 1;
                              const completed = completedMap[commission.referredUserId] ?? 0;
                              const remaining = Math.max(0, maxMonths - completed);
                              return (
                                <TableRow key={commission.id} data-testid={`row-commission-${commission.id}`}>
                                  <TableCell className="max-w-[160px] truncate text-sm">
                                    <TooltipProvider>
                                      <UITooltip>
                                        <TooltipTrigger asChild>
                                          <span className="cursor-default">
                                            {commission.referredUserEmail
                                              ? commission.referredUserEmail.split("@")[0] + "@…"
                                              : commission.referredUserId.slice(0, 8) + "…"}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>{commission.referredUserEmail || commission.referredUserId}</p>
                                        </TooltipContent>
                                      </UITooltip>
                                    </TooltipProvider>
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant="outline"
                                      className={commission.type === "recurring"
                                        ? "text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950/30"
                                        : "text-gray-600 border-gray-300"}
                                    >
                                      {commission.type === "recurring"
                                        ? (language === "pt-BR" ? "Recorrente" : "Recurring")
                                        : (language === "pt-BR" ? "Única" : "One-time")}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      className={
                                        commission.status === "paid"
                                          ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-0"
                                          : commission.status === "reversed"
                                          ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-0"
                                          : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-0"
                                      }
                                    >
                                      {commission.status === "paid"
                                        ? (language === "pt-BR" ? "Pago" : "Paid")
                                        : commission.status === "reversed"
                                        ? (language === "pt-BR" ? "Estornado" : "Reversed")
                                        : (language === "pt-BR" ? "Pendente" : "Pending")}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="font-mono text-sm font-medium">
                                    R$ {(commission.amount / 100).toFixed(2)}
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    {format(new Date(commission.createdAt), "dd/MM/yyyy", {
                                      locale: language === "pt-BR" ? ptBR : enUS,
                                    })}
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground font-mono">
                                    {commission.stripeInvoiceId ? (
                                      <TooltipProvider>
                                        <UITooltip>
                                          <TooltipTrigger asChild>
                                            <span className="cursor-default">
                                              {commission.stripeInvoiceId.slice(0, 12)}…
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>{commission.stripeInvoiceId}</p>
                                          </TooltipContent>
                                        </UITooltip>
                                      </TooltipProvider>
                                    ) : "—"}
                                  </TableCell>
                                  <TableCell>
                                    {commission.status !== "reversed" ? (
                                      <div className="text-xs">
                                        <span className="font-medium">{completed}</span>
                                        <span className="text-muted-foreground">/{maxMonths}</span>
                                        {remaining > 0 && (
                                          <span className="ml-1 text-blue-600">
                                            ({remaining} {language === "pt-BR" ? "rest." : "left"})
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      );
                    })()}
                  </CardContent>
                </Card>

                {/* ── Withdrawal history ──────────────────────────────── */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Banknote className="w-4 h-4" />
                      {language === "pt-BR" ? "Histórico de Retiradas" : "Withdrawal History"}
                    </CardTitle>
                    <CardDescription>
                      {language === "pt-BR"
                        ? "Pagamentos recebidos pelo programa de afiliados"
                        : "Payments received from the affiliate program"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    {affiliateWithdrawals.length === 0 ? (
                      <div className="text-center py-10 text-muted-foreground">
                        <Banknote className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">
                          {language === "pt-BR" ? "Nenhuma retirada registrada ainda" : "No withdrawals registered yet"}
                        </p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{language === "pt-BR" ? "Data" : "Date"}</TableHead>
                            <TableHead>{language === "pt-BR" ? "Valor" : "Amount"}</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>{language === "pt-BR" ? "Método" : "Method"}</TableHead>
                            <TableHead>{language === "pt-BR" ? "Referência" : "Reference"}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {affiliateWithdrawals.map((w) => (
                            <TableRow key={w.id} data-testid={`row-withdrawal-${w.id}`}>
                              <TableCell className="text-sm text-muted-foreground">
                                {format(new Date(w.createdAt), "dd/MM/yyyy", {
                                  locale: language === "pt-BR" ? ptBR : enUS,
                                })}
                              </TableCell>
                              <TableCell className="font-mono font-medium">
                                R$ {(w.amount / 100).toFixed(2)}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  className={
                                    w.status === "paid"
                                      ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-0"
                                      : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-0"
                                  }
                                >
                                  {w.status === "paid"
                                    ? (language === "pt-BR" ? "Pago" : "Paid")
                                    : (language === "pt-BR" ? "Cancelado" : "Cancelled")}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm capitalize">
                                {w.paymentMethod === "pix" ? "PIX"
                                  : w.paymentMethod === "bank_transfer" ? (language === "pt-BR" ? "Transf. Bancária" : "Bank Transfer")
                                  : w.paymentMethod || "—"}
                              </TableCell>
                              <TableCell className="text-sm font-mono text-muted-foreground max-w-[200px] truncate">
                                {w.paymentReference || "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  {language === "pt-BR"
                    ? "Não foi possível carregar as informações de indicações."
                    : "Could not load referral information."}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
