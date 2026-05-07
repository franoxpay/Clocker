import { useLocation } from "wouter";
import { AlertTriangle, Clock, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

interface SubscriptionBannerProps {
  subscriptionStatus: string | null | undefined;
  offersDeactivatedBySystem: boolean;
  isSuspended?: boolean;
  gracePeriodEndsAt?: string | Date | null;
  computedStatus?: "active" | "grace_period" | "suspended" | "canceled" | string;
}

function formatTimeRemaining(endsAt: string | Date | null | undefined, language: string): string {
  if (!endsAt) return "";
  const end = new Date(endsAt);
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();
  if (diffMs <= 0) return "";
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) {
    const days = Math.ceil(hours / 24);
    return language === "pt-BR" ? `${days} dias restantes` : `${days} days remaining`;
  }
  if (hours > 0) {
    return language === "pt-BR" ? `${hours}h ${minutes}m restantes` : `${hours}h ${minutes}m remaining`;
  }
  return language === "pt-BR" ? `${minutes}m restantes` : `${minutes}m remaining`;
}

export function SubscriptionBanner({
  subscriptionStatus,
  offersDeactivatedBySystem,
  isSuspended,
  gracePeriodEndsAt,
  computedStatus,
}: SubscriptionBannerProps) {
  const [, navigate] = useLocation();
  const { language } = useLanguage();

  const isActive = ['active', 'trialing'].includes(subscriptionStatus ?? '');

  // Determine effective status
  const effectiveStatus =
    computedStatus ??
    (isSuspended ? "suspended"
      : gracePeriodEndsAt && new Date(gracePeriodEndsAt) > new Date() ? "grace_period"
      : isActive ? "active"
      : "canceled");

  if (effectiveStatus === "active") return null;

  // ── SUSPENDED ──────────────────────────────────────────────────────────────
  if (effectiveStatus === "suspended") {
    return (
      <div
        className="flex items-center justify-between gap-3 px-4 py-2 bg-red-700 border-b border-red-800"
        data-testid="banner-account-suspended"
      >
        <div className="flex items-center gap-2 text-sm min-w-0">
          <Ban className="h-4 w-4 text-white shrink-0" />
          <span className="font-semibold text-white shrink-0">
            {language === "pt-BR" ? "Conta suspensa:" : "Account suspended:"}
          </span>
          <span className="text-white/90 truncate">
            {language === "pt-BR"
              ? "Seus redirects estão bloqueados. Regularize sua assinatura para reativar o acesso."
              : "Your redirects are blocked. Please settle your subscription to restore access."}
          </span>
        </div>
        <Button
          size="sm"
          className="bg-white hover:bg-white/90 text-red-700 font-semibold shrink-0 focus-visible:ring-0"
          onClick={() => navigate("/subscription")}
          data-testid="button-reactivate-subscription"
        >
          {language === "pt-BR" ? "Regularizar" : "Settle Now"}
        </Button>
      </div>
    );
  }

  // ── GRACE PERIOD ────────────────────────────────────────────────────────────
  if (effectiveStatus === "grace_period") {
    const timeRemaining = formatTimeRemaining(gracePeriodEndsAt, language);
    return (
      <div
        className="flex items-center justify-between gap-3 px-4 py-2 bg-orange-500 border-b border-orange-600"
        data-testid="banner-grace-period"
      >
        <div className="flex items-center gap-2 text-sm min-w-0">
          <Clock className="h-4 w-4 text-white shrink-0" />
          <span className="font-semibold text-white shrink-0">
            {language === "pt-BR" ? "Período de carência:" : "Grace period:"}
          </span>
          <span className="text-white/90 truncate">
            {language === "pt-BR"
              ? `Seu limite de clicks foi ultrapassado. Seus redirects continuam ativos${timeRemaining ? ` por mais ${timeRemaining}` : ""}. Faça upgrade para evitar a suspensão.`
              : `Your click limit was exceeded. Your redirects remain active${timeRemaining ? ` for ${timeRemaining}` : ""}. Upgrade to avoid suspension.`}
          </span>
        </div>
        <Button
          size="sm"
          className="bg-white hover:bg-white/90 text-orange-600 font-semibold shrink-0 focus-visible:ring-0"
          onClick={() => navigate("/subscription")}
          data-testid="button-upgrade-subscription"
        >
          {language === "pt-BR" ? "Fazer Upgrade" : "Upgrade Now"}
        </Button>
      </div>
    );
  }

  // ── INACTIVE / CANCELED / FREE ──────────────────────────────────────────────
  const isFreeUser =
    subscriptionStatus === null ||
    subscriptionStatus === undefined ||
    subscriptionStatus === "" ||
    subscriptionStatus === "inactive";
  const isCanceled =
    subscriptionStatus === "canceled" || subscriptionStatus === "cancelled";

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
