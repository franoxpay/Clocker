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
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { User, Lock, CreditCard, Globe, ExternalLink, Check, Gift, Copy, DollarSign, Users, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from "recharts";

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
  couponUsages: number;
  paidConversions: number;
  paidEarnings: number;
  coupon: {
    id: number;
    code: string;
    discountType: string;
    discountValue: number;
    usageCount: number;
  } | null;
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
      <h1 className="text-3xl font-semibold" data-testid="title-settings">
        {t("settings.title")}
      </h1>

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
            {affiliateLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            ) : affiliateStats ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                          <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">
                            {language === "pt-BR" ? "Total de Indicados" : "Total Referrals"}
                          </p>
                          <p className="text-2xl font-bold">{affiliateStats.totalReferrals}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                          <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">
                            {language === "pt-BR" ? "Total de Indicados" : "Total Referrals"}
                          </p>
                          <p className="text-2xl font-bold">{affiliateStats.totalReferrals}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                          <DollarSign className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">
                            {language === "pt-BR" ? "Comissão Pendente" : "Pending Commission"}
                          </p>
                          <p className="text-2xl font-bold">R$ {(affiliateStats.pendingEarnings / 100).toFixed(2)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                          <DollarSign className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">
                            {language === "pt-BR" ? "Total Pago" : "Total Paid"}
                          </p>
                          <p className="text-2xl font-bold">R$ {(affiliateStats.paidEarnings / 100).toFixed(2)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {affiliateStats.coupon && (
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        {language === "pt-BR" ? "Conversão de Indicações" : "Referral Conversion"}
                      </CardTitle>
                      <CardDescription>
                        {language === "pt-BR"
                          ? "Quantas pessoas usaram seu cupom vs quantas pagaram a assinatura"
                          : "How many people used your coupon vs how many paid for subscription"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={[
                              {
                                name: language === "pt-BR" ? "Usaram Cupom" : "Used Coupon",
                                value: affiliateStats.couponUsages,
                                fill: "hsl(var(--primary))",
                              },
                              {
                                name: language === "pt-BR" ? "Pagaram Assinatura" : "Paid Subscription",
                                value: affiliateStats.paidConversions,
                                fill: "hsl(142, 76%, 36%)",
                              },
                            ]}
                            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis 
                              dataKey="name" 
                              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                            />
                            <YAxis 
                              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                              allowDecimals={false}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "8px",
                              }}
                              labelStyle={{ color: "hsl(var(--foreground))" }}
                            />
                            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                              {[
                                { fill: "hsl(var(--primary))" },
                                { fill: "hsl(142, 76%, 36%)" },
                              ].map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-4 flex justify-center gap-8 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-sm bg-primary"></div>
                          <span className="text-muted-foreground">
                            {language === "pt-BR" ? "Usaram Cupom" : "Used Coupon"}: <span className="font-bold text-foreground">{affiliateStats.couponUsages}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "hsl(142, 76%, 36%)" }}></div>
                          <span className="text-muted-foreground">
                            {language === "pt-BR" ? "Pagaram" : "Paid"}: <span className="font-bold text-foreground">{affiliateStats.paidConversions}</span>
                          </span>
                        </div>
                        {affiliateStats.couponUsages > 0 && (
                          <div className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-green-500" />
                            <span className="text-muted-foreground">
                              {language === "pt-BR" ? "Taxa de Conversão" : "Conversion Rate"}: <span className="font-bold text-green-600">{((affiliateStats.paidConversions / affiliateStats.couponUsages) * 100).toFixed(1)}%</span>
                            </span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle>
                      {language === "pt-BR" ? "Seus Cupons de Indicação" : "Your Referral Coupons"}
                    </CardTitle>
                    <CardDescription>
                      {language === "pt-BR"
                        ? "Compartilhe estes códigos com amigos para ganhar comissões"
                        : "Share these codes with friends to earn commissions"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!affiliateStats.coupon ? (
                      <div className="text-center py-8 text-muted-foreground">
                        {language === "pt-BR"
                          ? "Você ainda não possui cupons de indicação. Entre em contato com o suporte para solicitar."
                          : "You don't have referral coupons yet. Contact support to request one."}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div
                          className="flex items-center justify-between p-4 border rounded-lg"
                        >
                          <div className="flex items-center gap-4">
                            <div className="p-2 bg-primary/10 rounded-lg">
                              <Gift className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-mono text-lg font-bold">{affiliateStats.coupon.code}</p>
                              <p className="text-sm text-muted-foreground">
                                {affiliateStats.coupon.discountType === "percentage"
                                  ? `${affiliateStats.coupon.discountValue}% ${language === "pt-BR" ? "de desconto" : "off"}`
                                  : `R$ ${(affiliateStats.coupon.discountValue / 100).toFixed(2)} ${language === "pt-BR" ? "de desconto" : "off"}`}
                                {" • "}
                                {affiliateStats.coupon.usageCount}{" "}
                                {language === "pt-BR" ? "usos" : "uses"}
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyToClipboard(affiliateStats.coupon!.code)}
                            data-testid={`button-copy-coupon-${affiliateStats.coupon.id}`}
                          >
                            <Copy className="w-4 h-4 mr-2" />
                            {language === "pt-BR" ? "Copiar" : "Copy"}
                          </Button>
                        </div>
                      </div>
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
