import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
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
import { 
  Star, 
  Check, 
  CreditCard, 
  ExternalLink,
  Zap,
  LinkIcon,
  Globe,
  BarChart3,
  CheckCircle,
  XCircle,
  Plus,
  Trash2,
  Loader2,
  Headphones
} from "lucide-react";
import { format } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";

import facebookLogo from "@assets/facebook-logo-facebook-icon-transparent-free-png_1768998868063.webp";
import instagramLogo from "@assets/Instagram_icon_1768998868062.png";
import tiktokLogo from "@assets/tiktok-logo-tikok-icon-transparent-tikok-app-logo-free-png_1768998868062.png";

const trafficSourceLogos: Record<string, string> = {
  facebook: facebookLogo,
  instagram: instagramLogo,
  tiktok: tiktokLogo,
};

interface PlanMetadata {
  trafficSources: string[];
  supportType: "normal" | "vip";
}

const planMetadataByName: Record<string, PlanMetadata> = {
  "Plano Básico": { trafficSources: ["facebook", "instagram"], supportType: "normal" },
  "Basic Plan": { trafficSources: ["facebook", "instagram"], supportType: "normal" },
  "Plano Avançado": { trafficSources: ["facebook", "instagram", "tiktok"], supportType: "normal" },
  "Advanced Plan": { trafficSources: ["facebook", "instagram", "tiktok"], supportType: "normal" },
  "Plano Pré-Escala": { trafficSources: ["facebook", "instagram", "tiktok"], supportType: "vip" },
  "Pre-Scale Plan": { trafficSources: ["facebook", "instagram", "tiktok"], supportType: "vip" },
  "Plano Escala": { trafficSources: ["facebook", "instagram", "tiktok"], supportType: "vip" },
  "Scale Plan": { trafficSources: ["facebook", "instagram", "tiktok"], supportType: "vip" },
  "Plano Ilimitado": { trafficSources: ["facebook", "instagram", "tiktok"], supportType: "vip" },
  "Unlimited Plan": { trafficSources: ["facebook", "instagram", "tiktok"], supportType: "vip" },
  "Starter": { trafficSources: ["facebook", "instagram"], supportType: "normal" },
  "Professional": { trafficSources: ["facebook", "instagram", "tiktok"], supportType: "normal" },
  "Enterprise": { trafficSources: ["facebook", "instagram", "tiktok"], supportType: "vip" },
};

const getTrafficSourcesForPlan = (plan: { name: string; nameEn: string; price: number }): string[] => {
  const metadata = planMetadataByName[plan.name] || planMetadataByName[plan.nameEn];
  if (metadata) return metadata.trafficSources;
  if (plan.price <= 19700) return ["facebook", "instagram"];
  return ["facebook", "instagram", "tiktok"];
};

const getSupportTypeForPlan = (plan: { name: string; nameEn: string; price: number }): "normal" | "vip" => {
  const metadata = planMetadataByName[plan.name] || planMetadataByName[plan.nameEn];
  if (metadata) return metadata.supportType;
  if (plan.price <= 49700) return "normal";
  return "vip";
};

interface Plan {
  id: number;
  name: string;
  nameEn: string;
  price: number;
  maxOffers: number;
  maxDomains: number;
  maxClicks: number;
  isUnlimited: boolean;
  isActive: boolean;
  isPopular: boolean;
  hasTrial: boolean;
  trialDays: number;
  stripePriceId: string | null;
}

interface UserUsage {
  offersCount: number;
  domainsCount: number;
  clicksThisMonth: number;
}

interface Payment {
  id: string;
  amount: number;
  status: string;
  date: string | null;
  pdfUrl?: string;
}

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

interface PaymentMethodsResponse {
  paymentMethods: PaymentMethod[];
  defaultPaymentMethodId: string | null;
}

export default function Subscription() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const locale = language === "pt-BR" ? ptBR : enUS;
  const searchString = useSearch();
  
  const searchParams = new URLSearchParams(searchString);
  const checkoutStatus = searchParams.get("checkout");
  const [checkoutError, setCheckoutError] = useState<{ message: string; showAddCard: boolean } | null>(null);
  const [cardSelectorOpen, setCardSelectorOpen] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<Plan | null>(null);

  useEffect(() => {
    if (checkoutStatus === "success") {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/usage"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/payment-methods"] });
      
      toast({
        title: language === "pt-BR" ? "Assinatura ativada!" : "Subscription activated!",
        description: language === "pt-BR" 
          ? "Seu pagamento foi processado com sucesso." 
          : "Your payment was processed successfully.",
      });
      
      setTimeout(() => {
        window.history.replaceState({}, '', '/subscription');
      }, 3000);
    } else if (checkoutStatus === "setup_success") {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/payment-methods"] });
      
      toast({
        title: language === "pt-BR" ? "Cartão adicionado!" : "Card added!",
        description: language === "pt-BR" 
          ? "Seu cartão foi adicionado e definido como padrão." 
          : "Your card was added and set as default.",
      });
      
      setTimeout(() => {
        window.history.replaceState({}, '', '/subscription');
      }, 3000);
    } else if (checkoutStatus === "canceled") {
      toast({
        title: language === "pt-BR" ? "Checkout cancelado" : "Checkout canceled",
        description: language === "pt-BR" 
          ? "Você cancelou o processo de assinatura." 
          : "You canceled the subscription process.",
        variant: "destructive",
      });
      
      setTimeout(() => {
        window.history.replaceState({}, '', '/subscription');
      }, 3000);
    }
  }, [checkoutStatus, toast, language]);

  const { data: plans = [], isLoading: plansLoading } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });

  const { data: usage, isLoading: usageLoading } = useQuery<UserUsage>({
    queryKey: ["/api/user/usage"],
  });

  const { data: payments = [], isLoading: paymentsLoading } = useQuery<Payment[]>({
    queryKey: ["/api/billing/invoices"],
  });

  const { data: paymentMethodsData, isLoading: paymentMethodsLoading } = useQuery<PaymentMethodsResponse>({
    queryKey: ["/api/billing/payment-methods"],
  });

  const currentPlan = plans.find(p => p.id === user?.planId);
  const activePlans = plans.filter(p => p.isActive);

  const checkoutMutation = useMutation({
    mutationFn: async (payload: { priceId?: string; planId?: number; paymentMethodId?: string }) => {
      const res = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw { status: res.status, message: data.message || "Unknown error" };
      }
      
      return data;
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      } else if (data.requiresAction && data.clientSecret) {
        toast({
          title: language === "pt-BR" ? "Confirmação necessária" : "Confirmation required",
          description: language === "pt-BR" 
            ? "Por favor, complete a verificação no seu banco para finalizar o pagamento."
            : "Please complete the verification with your bank to finalize payment.",
        });
        window.location.href = `/subscription?checkout=pending&secret=${data.clientSecret}`;
      } else if (data.success) {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        queryClient.invalidateQueries({ queryKey: ["/api/user/usage"] });
        queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
        queryClient.invalidateQueries({ queryKey: ["/api/billing/payment-methods"] });
        toast({
          title: language === "pt-BR" ? "Assinatura ativada!" : "Subscription activated!",
          description: language === "pt-BR" 
            ? "Seu plano foi ativado com sucesso." 
            : "Your plan has been successfully activated.",
        });
      }
    },
    onError: (error: any) => {
      let errorMessage: string;
      
      if (error?.message?.includes("Payment failed") || error?.message?.includes("payment")) {
        errorMessage = language === "pt-BR" 
          ? "O pagamento falhou. Por favor, tente novamente ou use um cartão diferente."
          : "Payment failed. Please try again or use a different card.";
      } else if (error?.message?.includes("card") || error?.message?.includes("cartão")) {
        errorMessage = language === "pt-BR"
          ? "Problema com o cartão. Verifique os dados e tente novamente."
          : "Card issue. Please verify your card details and try again.";
      } else {
        errorMessage = language === "pt-BR" 
          ? "Ocorreu um erro ao processar sua assinatura. Por favor, tente novamente."
          : "An error occurred while processing your subscription. Please try again.";
      }
      
      setCheckoutError({ message: errorMessage, showAddCard: true });
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/subscription/portal");
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
        variant: "destructive",
      });
    },
  });

  const setDefaultPaymentMethodMutation = useMutation({
    mutationFn: async (paymentMethodId: string) => {
      const res = await apiRequest("POST", `/api/billing/payment-methods/${paymentMethodId}/default`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/payment-methods"] });
      toast({
        title: language === "pt-BR" ? "Cartão padrão atualizado" : "Default card updated",
        description: language === "pt-BR" 
          ? "O cartão foi definido como padrão para pagamentos futuros."
          : "The card has been set as default for future payments.",
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        variant: "destructive",
      });
    },
  });

  const deletePaymentMethodMutation = useMutation({
    mutationFn: async (paymentMethodId: string) => {
      const res = await apiRequest("DELETE", `/api/billing/payment-methods/${paymentMethodId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/payment-methods"] });
      toast({
        title: language === "pt-BR" ? "Cartão removido" : "Card removed",
        description: language === "pt-BR" 
          ? "O cartão foi removido com sucesso."
          : "The card has been successfully removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error?.message || (language === "pt-BR" 
          ? "Não é possível remover o cartão padrão" 
          : "Cannot remove the default card"),
        variant: "destructive",
      });
    },
  });

  const getCardBrandDisplay = (brand: string) => {
    const brandLower = brand?.toLowerCase() || '';
    switch (brandLower) {
      case 'visa':
        return 'Visa';
      case 'mastercard':
        return 'Mastercard';
      case 'amex':
        return 'American Express';
      case 'elo':
        return 'Elo';
      case 'discover':
        return 'Discover';
      case 'diners':
        return 'Diners';
      case 'jcb':
        return 'JCB';
      default:
        return brand?.charAt(0).toUpperCase() + brand?.slice(1) || 'Card';
    }
  };

  const formatPrice = (price: number) => {
    return `R$ ${(price / 100).toFixed(2).replace(".", ",")}`;
  };

  const formatAmount = (amount: number) => {
    return `R$ ${amount.toFixed(2).replace(".", ",")}`;
  };

  const formatClicks = (clicks: number) => {
    if (clicks >= 1000000) return `${(clicks / 1000000).toFixed(0)}M`;
    if (clicks >= 1000) return `${(clicks / 1000).toFixed(0)}k`;
    return clicks.toString();
  };

  const getUsagePercent = (used: number, max: number, isUnlimited: boolean) => {
    if (isUnlimited) return 0;
    if (max === 0) return 100;
    return Math.min((used / max) * 100, 100);
  };

  const getSubscriptionStatusBadge = () => {
    if (!user?.subscriptionStatus) {
      return <Badge variant="secondary">{t("subscription.status.inactive")}</Badge>;
    }
    switch (user.subscriptionStatus) {
      case "active":
        return <Badge variant="default">{t("subscription.status.active")}</Badge>;
      case "trialing":
        return <Badge variant="outline">{t("subscription.status.trial")}</Badge>;
      case "canceled":
        return <Badge variant="destructive">{t("subscription.status.canceled")}</Badge>;
      case "past_due":
        return <Badge variant="destructive">{t("subscription.status.pastDue")}</Badge>;
      default:
        return <Badge variant="secondary">{t("subscription.status.inactive")}</Badge>;
    }
  };

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge variant="default">{t("subscription.paymentSuccess")}</Badge>;
      case "open":
      case "pending":
        return <Badge variant="outline">{t("subscription.paymentPending")}</Badge>;
      default:
        return <Badge variant="destructive">{t("subscription.paymentFailed")}</Badge>;
    }
  };

  const handleSelectPlan = (plan: Plan) => {
    const paymentMethods = paymentMethodsData?.paymentMethods || [];
    
    if (paymentMethods.length > 1) {
      setPendingPlan(plan);
      const defaultCard = paymentMethods.find(pm => pm.isDefault) || paymentMethods[0];
      setSelectedCardId(defaultCard?.id || null);
      setCardSelectorOpen(true);
    } else if (paymentMethods.length === 1) {
      const payload: { priceId?: string; planId?: number; paymentMethodId?: string } = {
        paymentMethodId: paymentMethods[0].id,
      };
      if (plan.stripePriceId) {
        payload.priceId = plan.stripePriceId;
      } else {
        payload.planId = plan.id;
      }
      checkoutMutation.mutate(payload);
    } else {
      if (plan.stripePriceId) {
        checkoutMutation.mutate({ priceId: plan.stripePriceId });
      } else {
        checkoutMutation.mutate({ planId: plan.id });
      }
    }
  };

  const handleConfirmSubscription = () => {
    if (!pendingPlan || !selectedCardId) return;
    
    const payload: { priceId?: string; planId?: number; paymentMethodId?: string } = {
      paymentMethodId: selectedCardId,
    };
    if (pendingPlan.stripePriceId) {
      payload.priceId = pendingPlan.stripePriceId;
    } else {
      payload.planId = pendingPlan.id;
    }
    
    setCardSelectorOpen(false);
    setPendingPlan(null);
    checkoutMutation.mutate(payload);
  };

  const isCurrentPlan = (planId: number) => user?.planId === planId;

  return (
    <div className="p-6 space-y-6">
      {checkoutStatus === "success" && (
        <Alert className="border-green-500 bg-green-500/10">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <AlertTitle className="text-green-600 dark:text-green-400">
            {language === "pt-BR" ? "Pagamento confirmado!" : "Payment confirmed!"}
          </AlertTitle>
          <AlertDescription>
            {language === "pt-BR" 
              ? "Sua assinatura foi ativada com sucesso. Aproveite todos os recursos do seu plano!"
              : "Your subscription has been successfully activated. Enjoy all the features of your plan!"}
          </AlertDescription>
        </Alert>
      )}

      {checkoutStatus === "canceled" && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>
            {language === "pt-BR" ? "Checkout cancelado" : "Checkout canceled"}
          </AlertTitle>
          <AlertDescription>
            {language === "pt-BR" 
              ? "O processo de assinatura foi cancelado. Você pode tentar novamente quando quiser."
              : "The subscription process was canceled. You can try again whenever you want."}
          </AlertDescription>
        </Alert>
      )}

      {checkoutError && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>
            {language === "pt-BR" ? "Erro no pagamento" : "Payment error"}
          </AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{checkoutError.message}</p>
            {checkoutError.showAddCard && (
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setCheckoutError(null);
                    checkoutMutation.mutate({});
                  }}
                  data-testid="button-add-card-error"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {language === "pt-BR" ? "Adicionar Cartão" : "Add Card"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCheckoutError(null)}
                  data-testid="button-dismiss-error"
                >
                  {language === "pt-BR" ? "Fechar" : "Dismiss"}
                </Button>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold" data-testid="title-subscription">
          {t("subscription.title")}
        </h1>
        {user?.stripeCustomerId && (
          <Button 
            variant="outline" 
            onClick={() => portalMutation.mutate()}
            disabled={portalMutation.isPending}
            data-testid="button-manage-payment"
          >
            <CreditCard className="w-4 h-4 mr-2" />
            {t("subscription.managePayment")}
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5" />
                {t("subscription.currentPlan")}
              </CardTitle>
              {getSubscriptionStatusBadge()}
            </div>
            <CardDescription>
              {currentPlan 
                ? (language === "pt-BR" ? currentPlan.name : currentPlan.nameEn)
                : (language === "pt-BR" ? "Sem plano ativo" : "No active plan")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {user?.subscriptionEndDate && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {user.subscriptionStatus === "canceled" 
                    ? `${t("subscription.endsAt")}: `
                    : `${t("subscription.renewsAt")}: `}
                  {format(new Date(user.subscriptionEndDate), "PP", { locale })}
                </span>
              </div>
            )}
            {currentPlan && (
              <div className="text-2xl font-bold">
                {formatPrice(currentPlan.price)}
                <span className="text-sm font-normal text-muted-foreground">
                  {t("subscription.month")}
                </span>
              </div>
            )}
            
            <div className="border-t pt-4 space-y-3">
              {usageLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <LinkIcon className="w-4 h-4" />
                        {t("subscription.offersUsed")}
                      </span>
                      <span className="font-medium">
                        {usage?.offersCount || 0} {t("subscription.of")} {currentPlan?.isUnlimited ? t("subscription.unlimited") : (currentPlan?.maxOffers || 0)}
                      </span>
                    </div>
                    {!currentPlan?.isUnlimited && currentPlan && (
                      <Progress 
                        value={getUsagePercent(usage?.offersCount || 0, currentPlan.maxOffers, currentPlan.isUnlimited)} 
                        className="h-2" 
                      />
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <Globe className="w-4 h-4" />
                        {t("subscription.domainsUsed")}
                      </span>
                      <span className="font-medium">
                        {usage?.domainsCount || 0} {t("subscription.of")} {currentPlan?.isUnlimited ? t("subscription.unlimited") : (currentPlan?.maxDomains || 0)}
                      </span>
                    </div>
                    {!currentPlan?.isUnlimited && currentPlan && (
                      <Progress 
                        value={getUsagePercent(usage?.domainsCount || 0, currentPlan.maxDomains, currentPlan.isUnlimited)} 
                        className="h-2" 
                      />
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4" />
                        {t("subscription.clicksUsed")}
                      </span>
                      <span className="font-medium">
                        {formatClicks(usage?.clicksThisMonth || 0)} {t("subscription.of")} {currentPlan?.isUnlimited ? t("subscription.unlimited") : formatClicks(currentPlan?.maxClicks || 0)}
                      </span>
                    </div>
                    {!currentPlan?.isUnlimited && currentPlan && (
                      <Progress 
                        value={getUsagePercent(usage?.clicksThisMonth || 0, currentPlan.maxClicks, currentPlan.isUnlimited)} 
                        className="h-2" 
                      />
                    )}
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                {language === "pt-BR" ? "Cartões Salvos" : "Saved Cards"}
              </CardTitle>
              <CardDescription>
                {language === "pt-BR" 
                  ? "Métodos de pagamento para assinaturas" 
                  : "Payment methods for subscriptions"}
              </CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => checkoutMutation.mutate({})}
              disabled={checkoutMutation.isPending || !user?.stripeCustomerId}
              data-testid="button-add-card"
            >
              {checkoutMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              {language === "pt-BR" ? "Adicionar Cartão" : "Add Card"}
            </Button>
          </CardHeader>
          <CardContent>
            {paymentMethodsLoading ? (
              <div className="space-y-2">
                {[...Array(2)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : !paymentMethodsData?.paymentMethods?.length ? (
              <div className="text-center py-8">
                <CreditCard className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {language === "pt-BR" 
                    ? "Nenhum cartão salvo ainda."
                    : "No saved cards yet."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {paymentMethodsData.paymentMethods.map((pm) => (
                  <div 
                    key={pm.id} 
                    className="flex items-center justify-between p-3 border rounded-lg"
                    data-testid={`card-payment-method-${pm.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <CreditCard className="w-6 h-6 text-muted-foreground" />
                      <div>
                        <div className="font-medium flex items-center gap-2 text-sm">
                          <span data-testid={`text-card-brand-${pm.id}`}>{getCardBrandDisplay(pm.brand)}</span>
                          <span className="text-muted-foreground">**** {pm.last4}</span>
                          {pm.isDefault && (
                            <Badge variant="secondary" className="text-xs" data-testid={`badge-default-card-${pm.id}`}>
                              {language === "pt-BR" ? "Padrão" : "Default"}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground" data-testid={`text-card-expiry-${pm.id}`}>
                          {language === "pt-BR" ? "Expira" : "Expires"} {pm.expMonth.toString().padStart(2, '0')}/{pm.expYear}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!pm.isDefault && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDefaultPaymentMethodMutation.mutate(pm.id)}
                            disabled={setDefaultPaymentMethodMutation.isPending}
                            data-testid={`button-set-default-${pm.id}`}
                          >
                            {setDefaultPaymentMethodMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              language === "pt-BR" ? "Definir padrão" : "Set as default"
                            )}
                          </Button>
                          {paymentMethodsData.paymentMethods.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deletePaymentMethodMutation.mutate(pm.id)}
                              disabled={deletePaymentMethodMutation.isPending}
                              data-testid={`button-delete-card-${pm.id}`}
                            >
                              {deletePaymentMethodMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4 text-destructive" />
                              )}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {plansLoading ? (
          [...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-96" />
          ))
        ) : (
          activePlans.map((plan) => (
            <Card 
              key={plan.id} 
              className={`relative ${plan.isPopular ? "border-primary shadow-lg" : ""}`}
              data-testid={`card-plan-${plan.id}`}
            >
              {plan.isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="gap-1">
                    <Star className="w-3 h-3" />
                    {t("subscription.mostPopular")}
                  </Badge>
                </div>
              )}
              <CardHeader className="text-center pt-6">
                <CardTitle className="text-xl">
                  {language === "pt-BR" ? plan.name : plan.nameEn}
                </CardTitle>
                <div className="mt-4">
                  <span className="text-4xl font-bold">{formatPrice(plan.price)}</span>
                  <span className="text-muted-foreground">{t("subscription.month")}</span>
                </div>
                {plan.hasTrial && plan.trialDays > 0 && (
                  <Badge variant="outline" className="mt-2">
                    {plan.trialDays} {t("subscription.freeTrial")}
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    {plan.isUnlimited 
                      ? t("subscription.unlimited") 
                      : `${plan.maxOffers} ${t("plan.offers")}`}
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    {plan.isUnlimited 
                      ? t("subscription.unlimited") 
                      : `${plan.maxDomains} ${t("plan.domains")}`}
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    {plan.isUnlimited 
                      ? t("subscription.unlimited") 
                      : `${formatClicks(plan.maxClicks)} ${t("plan.clicks")}`}
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Headphones className="w-4 h-4 text-primary flex-shrink-0" />
                    {language === "pt-BR" 
                      ? (getSupportTypeForPlan(plan) === "vip" ? "Suporte VIP" : "Suporte Normal")
                      : (getSupportTypeForPlan(plan) === "vip" ? "VIP Support" : "Normal Support")}
                  </li>
                </ul>

                <div className="pt-3 border-t">
                  <p className="text-xs text-muted-foreground mb-2 text-center">
                    {language === "pt-BR" ? "FONTES DE TRÁFEGO" : "TRAFFIC SOURCES"}
                  </p>
                  <div className="flex justify-center gap-2">
                    {getTrafficSourcesForPlan(plan).map((source) => (
                      <div 
                        key={source} 
                        className="w-8 h-8 rounded-lg overflow-hidden bg-muted flex items-center justify-center"
                      >
                        <img 
                          src={trafficSourceLogos[source]} 
                          alt={source} 
                          className="w-6 h-6 object-contain"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  className="w-full"
                  variant={isCurrentPlan(plan.id) ? "secondary" : (plan.isPopular ? "default" : "outline")}
                  disabled={isCurrentPlan(plan.id) || checkoutMutation.isPending}
                  onClick={() => handleSelectPlan(plan)}
                  data-testid={`button-select-plan-${plan.id}`}
                >
                  {isCurrentPlan(plan.id) 
                    ? t("plan.current") 
                    : (checkoutMutation.isPending 
                        ? t("subscription.processing") 
                        : (plan.hasTrial && plan.trialDays > 0 
                            ? t("subscription.startTrial") 
                            : t("subscription.subscribe")))}
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("subscription.paymentHistory")}</CardTitle>
        </CardHeader>
        <CardContent>
          {paymentsLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : payments.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {t("subscription.noPayments")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === "pt-BR" ? "Data" : "Date"}</TableHead>
                  <TableHead>{language === "pt-BR" ? "Valor" : "Amount"}</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id} data-testid={`row-payment-${payment.id}`}>
                    <TableCell>
                      {payment.date ? format(new Date(payment.date), "PP", { locale }) : "-"}
                    </TableCell>
                    <TableCell>{formatAmount(payment.amount)}</TableCell>
                    <TableCell>{getPaymentStatusBadge(payment.status)}</TableCell>
                    <TableCell>
                      {payment.pdfUrl && (
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                        >
                          <a href={payment.pdfUrl} target="_blank" rel="noopener noreferrer">
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

      <Dialog open={cardSelectorOpen} onOpenChange={setCardSelectorOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {language === "pt-BR" ? "Selecionar Cartão" : "Select Card"}
            </DialogTitle>
            <DialogDescription>
              {language === "pt-BR" 
                ? "Escolha qual cartão usar para esta assinatura."
                : "Choose which card to use for this subscription."}
            </DialogDescription>
          </DialogHeader>
          
          <RadioGroup
            value={selectedCardId || ""}
            onValueChange={(value) => setSelectedCardId(value)}
            className="space-y-3"
          >
            {(paymentMethodsData?.paymentMethods || []).map((pm) => (
              <div 
                key={pm.id} 
                className="flex items-center space-x-3 p-3 border rounded-lg hover-elevate cursor-pointer"
                onClick={() => setSelectedCardId(pm.id)}
                data-testid={`radio-card-${pm.id}`}
              >
                <RadioGroupItem value={pm.id} id={pm.id} />
                <Label htmlFor={pm.id} className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    <span className="font-medium capitalize">{pm.brand}</span>
                    <span className="text-muted-foreground">**** {pm.last4}</span>
                    <span className="text-muted-foreground text-sm">
                      {pm.expMonth.toString().padStart(2, '0')}/{pm.expYear.toString().slice(-2)}
                    </span>
                    {pm.isDefault && (
                      <Badge variant="secondary" className="text-xs">
                        {language === "pt-BR" ? "Padrão" : "Default"}
                      </Badge>
                    )}
                  </div>
                </Label>
              </div>
            ))}
          </RadioGroup>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setCardSelectorOpen(false);
                setPendingPlan(null);
              }}
              data-testid="button-cancel-card-selection"
            >
              {language === "pt-BR" ? "Cancelar" : "Cancel"}
            </Button>
            <Button
              onClick={handleConfirmSubscription}
              disabled={!selectedCardId || checkoutMutation.isPending}
              data-testid="button-confirm-card-selection"
            >
              {checkoutMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {language === "pt-BR" ? "Confirmar Assinatura" : "Confirm Subscription"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
