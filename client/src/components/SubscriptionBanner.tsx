import { useLocation } from "wouter";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

interface SubscriptionBannerProps {
  subscriptionStatus: string | null | undefined;
  offersDeactivatedBySystem: boolean;
}

export function SubscriptionBanner({ subscriptionStatus, offersDeactivatedBySystem }: SubscriptionBannerProps) {
  const [, navigate] = useLocation();
  const { language } = useLanguage();

  const isActive = ['active', 'trialing'].includes(subscriptionStatus ?? '');
  if (isActive) return null;

  const isFreeUser = subscriptionStatus === null || subscriptionStatus === undefined || subscriptionStatus === '';
  const isCanceled = subscriptionStatus === 'canceled' || subscriptionStatus === 'cancelled';

  let title: string;
  let description: string;
  let buttonLabel: string;

  if (isFreeUser) {
    title = language === "pt-BR"
      ? "Você está no plano gratuito"
      : "You are on the free plan";
    description = language === "pt-BR"
      ? "Assine um plano para criar ofertas, domínios e ativar o cloaking."
      : "Subscribe to a plan to create offers, domains and activate cloaking.";
    buttonLabel = language === "pt-BR" ? "Ver Planos" : "See Plans";
  } else {
    title = language === "pt-BR"
      ? isCanceled ? "Sua assinatura foi cancelada" : "Sua assinatura expirou"
      : isCanceled ? "Your subscription has been canceled" : "Your subscription has expired";
    description = language === "pt-BR"
      ? offersDeactivatedBySystem
        ? "Suas ofertas estão pausadas e o tráfego está bloqueado. Renove para reativar tudo automaticamente."
        : "Você não pode criar novas ofertas ou domínios. Renove seu plano para continuar."
      : offersDeactivatedBySystem
        ? "Your offers are paused and traffic is blocked. Renew to reactivate everything automatically."
        : "You cannot create new offers or domains. Renew your plan to continue.";
    buttonLabel = language === "pt-BR" ? "Renovar Agora" : "Renew Now";
  }

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2 bg-red-600 border-b border-red-700"
      data-testid="banner-subscription-inactive"
    >
      <div className="flex items-center gap-2 text-sm min-w-0">
        <AlertTriangle className="h-4 w-4 text-white shrink-0" />
        <span className="font-semibold text-white shrink-0">{title}:</span>
        <span className="text-white/90 truncate">{description}</span>
      </div>
      <Button
        size="sm"
        className="bg-white hover:bg-white/90 text-red-600 font-semibold shrink-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        onClick={() => navigate("/subscription")}
        data-testid="button-renew-subscription"
      >
        {buttonLabel}
      </Button>
    </div>
  );
}
