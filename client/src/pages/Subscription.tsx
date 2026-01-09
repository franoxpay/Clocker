import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  XCircle
} from "lucide-react";
import { format } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";

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
  created: number;
  hostedInvoiceUrl?: string;
}

export default function Subscription() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const locale = language === "pt-BR" ? ptBR : enUS;
  const searchString = useSearch();
  
  const searchParams = new URLSearchParams(searchString);
  const checkoutStatus = searchParams.get("checkout");

  useEffect(() => {
    if (checkoutStatus === "success") {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/usage"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      
      toast({
        title: language === "pt-BR" ? "Assinatura ativada!" : "Subscription activated!",
        description: language === "pt-BR" 
          ? "Seu pagamento foi processado com sucesso." 
          : "Your payment was processed successfully.",
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

  const currentPlan = plans.find(p => p.id === user?.planId);
  const activePlans = plans.filter(p => p.isActive);

  const checkoutMutation = useMutation({
    mutationFn: async (payload: { priceId?: string; planId?: number }) => {
      const res = await apiRequest("POST", "/api/subscription/checkout", payload);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: () => {
      toast({
        title: t("common.error"),
        variant: "destructive",
      });
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

  const formatPrice = (price: number) => {
    return `R$ ${(price / 100).toFixed(2).replace(".", ",")}`;
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
    if (plan.stripePriceId) {
      checkoutMutation.mutate({ priceId: plan.stripePriceId });
    } else {
      checkoutMutation.mutate({ planId: plan.id });
    }
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
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              {t("subscription.currentPlan")}
            </CardTitle>
            <CardDescription>
              {currentPlan 
                ? (language === "pt-BR" ? currentPlan.name : currentPlan.nameEn)
                : (language === "pt-BR" ? "Sem plano ativo" : "No active plan")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              {getSubscriptionStatusBadge()}
              {user?.subscriptionEndDate && (
                <span className="text-sm text-muted-foreground">
                  {user.subscriptionStatus === "canceled" 
                    ? `${t("subscription.endsAt")}: `
                    : `${t("subscription.renewsAt")}: `}
                  {format(new Date(user.subscriptionEndDate), "PP", { locale })}
                </span>
              )}
            </div>
            {currentPlan && (
              <div className="text-2xl font-bold">
                {formatPrice(currentPlan.price)}
                <span className="text-sm font-normal text-muted-foreground">
                  {t("subscription.month")}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              {t("subscription.yourUsage")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {plansLoading ? (
          [...Array(3)].map((_, i) => (
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
                <ul className="space-y-3">
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary" />
                    {plan.isUnlimited 
                      ? t("subscription.unlimited") 
                      : `${plan.maxOffers} ${t("plan.offers")}`}
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary" />
                    {plan.isUnlimited 
                      ? t("subscription.unlimited") 
                      : `${plan.maxDomains} ${t("plan.domains")}`}
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary" />
                    {plan.isUnlimited 
                      ? t("subscription.unlimited") 
                      : `${formatClicks(plan.maxClicks)} ${t("plan.clicks")}`}
                  </li>
                </ul>

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
                      {format(new Date(payment.created * 1000), "PP", { locale })}
                    </TableCell>
                    <TableCell>{formatPrice(payment.amount)}</TableCell>
                    <TableCell>{getPaymentStatusBadge(payment.status)}</TableCell>
                    <TableCell>
                      {payment.hostedInvoiceUrl && (
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                        >
                          <a href={payment.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer">
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
  );
}
