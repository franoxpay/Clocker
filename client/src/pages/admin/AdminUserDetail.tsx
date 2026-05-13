import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartTooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft, UserCog, Copy, CheckCircle2, XCircle, Clock, Globe, Zap,
  AlertTriangle, Ban, Shield, Gift, TrendingUp, Mail, RotateCcw, Loader2, RefreshCw, CreditCard,
} from "lucide-react";
import {
  Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import type { EmailLog } from "@shared/schema";

interface PlanOption {
  id: number;
  name: string;
  nameEn: string | null;
  price: number;
  isActive: boolean;
  isFree: boolean;
}

interface UserDetailData {
  profile: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    language: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    planId: number | null;
    pendingPlanId: number | null;
    pendingPlanChangeAt: string | null;
    pendingPlanChangeType: string | null;
    subscriptionStatus: string | null;
    trialEndsAt: string | null;
    subscriptionStartDate: string | null;
    subscriptionEndDate: string | null;
    clicksUsedThisMonth: number;
    clicksResetDate: string | null;
    suspendedAt: string | null;
    suspensionReason: string | null;
    gracePeriodEndsAt: string | null;
    hasUsedCoupon: boolean;
    usedCouponId: number | null;
    offersDeactivatedBySystem: boolean;
    billingLockUntil: string | null;
    createdAt: string;
    updatedAt: string;
    isAdminUser: boolean;
    isSubscriptionActive: boolean;
    isTrialing: boolean;
    isSuspended: boolean;
  };
  plan: {
    id: number;
    name: string;
    maxOffers: number | null;
    maxDomains: number | null;
    maxMonthlyClicks: number | null;
    price: number;
    isFree: boolean;
  } | null;
  pendingPlan: {
    id: number;
    name: string;
    price: number;
  } | null;
  clickStats: {
    thisMonth: number;
    lifetime: number;
    lifetimeBlack: number;
    lifetimeWhite: number;
  };
  clickHistory: Array<{ date: string; clicks: number; blackClicks: number; whiteClicks: number }>;
  domains: Array<{
    id: number;
    subdomain: string;
    isActive: boolean;
    isVerified: boolean;
    sslStatus: string | null;
    lastVerificationError: string | null;
    createdAt: string;
  }>;
  sharedDomains: Array<{
    id: number;
    isActive: boolean;
    createdAt: string;
    sharedDomain: { subdomain: string; isActive: boolean; sslStatus: string | null };
  }>;
  offers: Array<{
    id: number;
    name: string;
    slug: string;
    platform: string;
    isActive: boolean;
    totalClicks: number;
    blackClicks: number;
    whiteClicks: number;
    createdAt: string;
  }>;
  suspensionHistory: Array<{
    id: number;
    event: string;
    reason: string | null;
    details: string | null;
    actorType: string;
    clicksAtEvent: number | null;
    createdAt: string;
  }>;
  couponUsed: {
    usage: { id: number; couponId: number; appliedAt: string; status: string; remainingMonths: number; discountAmountApplied: number | null };
    coupon: { id: number; code: string; discountType: string; discountValue: number; affiliateUserId: string | null } | null;
  } | null;
  commissionsEarned: Array<{ id: number; referredUserId: string; amount: number; type: string; status: string; createdAt: string }>;
  commissionsReferred: Array<{ id: number; affiliateUserId: string; amount: number; type: string; status: string; createdAt: string }>;
  affiliateCoupons: Array<{
    id: number; code: string; discountType: string; discountValue: number;
    commissionType: string | null; commissionValue: number | null;
    usageCount: number; isActive: boolean; createdAt: string;
  }>;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

function CopyButton({ value }: { value: string }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-5 w-5 ml-1 shrink-0"
      onClick={() => copyToClipboard(value)}
      title="Copy"
    >
      <Copy className="h-3 w-3" />
    </Button>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-border/50 last:border-0 gap-4">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className={`text-sm text-right break-all ${mono ? "font-mono text-xs" : ""}`}>{value ?? <span className="text-muted-foreground">—</span>}</span>
    </div>
  );
}

function StatusBadge({ status, isSuspended, isTrialing }: { status: string | null; isSuspended: boolean; isTrialing: boolean }) {
  if (isSuspended) return <Badge variant="destructive">Suspenso</Badge>;
  if (status === "active") return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Ativo</Badge>;
  if (isTrialing || status === "trialing") return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Trial</Badge>;
  if (status === "past_due") return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Atrasado</Badge>;
  if (status === "canceled") return <Badge variant="outline" className="text-muted-foreground">Cancelado</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">{status ?? "Inativo"}</Badge>;
}

function fmtDate(d: string | null | undefined, lang: string) {
  if (!d) return null;
  try {
    return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: lang === "pt-BR" ? ptBR : undefined });
  } catch {
    return d;
  }
}

function fmtAmount(cents: number) {
  return `R$ ${(cents / 100).toFixed(2)}`;
}

function OverviewTab({ data, lang, onChangePlan }: { data: UserDetailData; lang: string; onChangePlan: () => void }) {
  const p = data.profile;
  const plan = data.plan;
  const fullName = [p.firstName, p.lastName].filter(Boolean).join(" ") || null;

  const clickLimit = plan?.maxMonthlyClicks ?? null;
  const clickPct = clickLimit ? Math.min(100, Math.round((data.clickStats.thisMonth / clickLimit) * 100)) : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4" />Perfil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          <InfoRow label="ID" value={<span className="flex items-center gap-1 font-mono text-xs">{p.id.slice(0, 16)}…<CopyButton value={p.id} /></span>} />
          <InfoRow label="Email" value={<span className="flex items-center gap-1">{p.email}<CopyButton value={p.email} /></span>} />
          <InfoRow label={lang === "pt-BR" ? "Nome" : "Name"} value={fullName} />
          <InfoRow label={lang === "pt-BR" ? "Idioma" : "Language"} value={p.language} />
          <InfoRow label={lang === "pt-BR" ? "Cadastrado em" : "Created at"} value={fmtDate(p.createdAt, lang)} />
          <InfoRow label={lang === "pt-BR" ? "Atualizado em" : "Updated at"} value={fmtDate(p.updatedAt, lang)} />
          {p.isAdminUser && <InfoRow label="Papel" value={<Badge variant="outline">Admin</Badge>} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4" />Assinatura</CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={onChangePlan}
            data-testid="button-change-plan-overview"
          >
            <CreditCard className="h-3 w-3 mr-1" />
            {lang === "pt-BR" ? "Alterar Plano" : "Change Plan"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-0">
          <InfoRow label="Plano" value={plan ? plan.name : <span className="text-muted-foreground">—</span>} />
          <InfoRow label="Status" value={<StatusBadge status={p.subscriptionStatus} isSuspended={p.isSuspended} isTrialing={p.isTrialing} />} />
          <InfoRow label={lang === "pt-BR" ? "Início" : "Started"} value={fmtDate(p.subscriptionStartDate, lang)} />
          <InfoRow label={lang === "pt-BR" ? "Vencimento" : "Expires"} value={fmtDate(p.subscriptionEndDate, lang)} />
          {p.trialEndsAt && <InfoRow label="Trial até" value={fmtDate(p.trialEndsAt, lang)} />}
          {p.gracePeriodEndsAt && (
            <InfoRow label="Grace até" value={<span className="text-amber-400">{fmtDate(p.gracePeriodEndsAt, lang)}</span>} />
          )}
          {p.isSuspended && (
            <InfoRow label={lang === "pt-BR" ? "Suspenso em" : "Suspended at"} value={<span className="text-destructive">{fmtDate(p.suspendedAt, lang)}</span>} />
          )}
          {p.pendingPlanId && p.pendingPlanChangeAt && (
            <InfoRow
              label={lang === "pt-BR" ? "Downgrade pendente" : "Pending downgrade"}
              value={
                <span className="text-amber-400">
                  {data.pendingPlan ? data.pendingPlan.name : `Plan #${p.pendingPlanId}`}
                  {" — "}{fmtDate(p.pendingPlanChangeAt, lang)}
                </span>
              }
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4" />Clicks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-2xl font-bold tabular-nums">{data.clickStats.thisMonth.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{lang === "pt-BR" ? "este mês" : "this month"}{clickLimit ? ` / ${clickLimit.toLocaleString()}` : " (ilimitado)"}</p>
            </div>
            {clickPct !== null && (
              <span className={`text-sm font-medium ${clickPct >= 90 ? "text-destructive" : clickPct >= 70 ? "text-amber-400" : "text-emerald-400"}`}>
                {clickPct}%
              </span>
            )}
          </div>
          {clickLimit && (
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${clickPct! >= 90 ? "bg-destructive" : clickPct! >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                style={{ width: `${clickPct}%` }}
              />
            </div>
          )}
          <Separator />
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div><p className="font-semibold tabular-nums">{data.clickStats.lifetime.toLocaleString()}</p><p className="text-xs text-muted-foreground">Total</p></div>
            <div><p className="font-semibold tabular-nums text-emerald-400">{data.clickStats.lifetimeBlack.toLocaleString()}</p><p className="text-xs text-muted-foreground">Black</p></div>
            <div><p className="font-semibold tabular-nums text-blue-400">{data.clickStats.lifetimeWhite.toLocaleString()}</p><p className="text-xs text-muted-foreground">White</p></div>
          </div>
          <InfoRow label={lang === "pt-BR" ? "Reset em" : "Resets at"} value={fmtDate(p.clicksResetDate, lang)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{lang === "pt-BR" ? "Estado da Conta" : "Account Flags"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          <InfoRow
            label={lang === "pt-BR" ? "Offers desativadas pelo sistema" : "Offers deactivated by system"}
            value={p.offersDeactivatedBySystem
              ? <Badge variant="destructive" className="text-xs">Sim</Badge>
              : <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30">Não</Badge>}
          />
          <InfoRow
            label={lang === "pt-BR" ? "Usou cupom" : "Used coupon"}
            value={p.hasUsedCoupon
              ? <Badge variant="outline" className="text-xs">Sim</Badge>
              : <Badge variant="outline" className="text-xs text-muted-foreground">Não</Badge>}
          />
          <InfoRow
            label={lang === "pt-BR" ? "Offers" : "Offers"}
            value={`${data.offers.length}${plan?.maxOffers ? ` / ${plan.maxOffers}` : ""}`}
          />
          <InfoRow
            label={lang === "pt-BR" ? "Domínios" : "Domains"}
            value={`${data.domains.length + data.sharedDomains.length}${plan?.maxDomains ? ` / ${plan.maxDomains}` : ""}`}
          />
          {p.billingLockUntil && (
            <InfoRow label="Billing lock" value={fmtDate(p.billingLockUntil, lang)} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BillingTab({ data, lang, onChangePlan }: { data: UserDetailData; lang: string; onChangePlan: () => void }) {
  const p = data.profile;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Stripe</CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={onChangePlan}
            data-testid="button-change-plan-billing"
          >
            <CreditCard className="h-3 w-3 mr-1" />
            {lang === "pt-BR" ? "Alterar Plano" : "Change Plan"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-0">
          <InfoRow
            label="Customer ID"
            value={p.stripeCustomerId
              ? <span className="flex items-center gap-1 font-mono text-xs">{p.stripeCustomerId}<CopyButton value={p.stripeCustomerId} /></span>
              : null}
          />
          <InfoRow
            label="Subscription ID"
            value={p.stripeSubscriptionId
              ? <span className="flex items-center gap-1 font-mono text-xs">{p.stripeSubscriptionId}<CopyButton value={p.stripeSubscriptionId} /></span>
              : null}
          />
          <InfoRow label="Status" value={<StatusBadge status={p.subscriptionStatus} isSuspended={p.isSuspended} isTrialing={p.isTrialing} />} />
          <InfoRow label={lang === "pt-BR" ? "Início" : "Start"} value={fmtDate(p.subscriptionStartDate, lang)} />
          <InfoRow label={lang === "pt-BR" ? "Vencimento" : "End"} value={fmtDate(p.subscriptionEndDate, lang)} />
          <InfoRow label="Trial até" value={fmtDate(p.trialEndsAt, lang)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Gift className="h-4 w-4" />{lang === "pt-BR" ? "Cupom Utilizado" : "Coupon Used"}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.couponUsed ? (
            <div className="space-y-0">
              <InfoRow label="Código" value={<span className="font-mono font-bold">{data.couponUsed.coupon?.code ?? "—"}</span>} />
              <InfoRow
                label="Desconto"
                value={data.couponUsed.coupon
                  ? data.couponUsed.coupon.discountType === "percentage"
                    ? `${data.couponUsed.coupon.discountValue}%`
                    : fmtAmount(data.couponUsed.coupon.discountValue)
                  : null}
              />
              <InfoRow label="Status" value={<Badge variant="outline" className="text-xs">{data.couponUsed.usage.status}</Badge>} />
              <InfoRow label={lang === "pt-BR" ? "Meses restantes" : "Months left"} value={String(data.couponUsed.usage.remainingMonths)} />
              <InfoRow label={lang === "pt-BR" ? "Aplicado em" : "Applied at"} value={fmtDate(data.couponUsed.usage.appliedAt, lang)} />
              {data.couponUsed.usage.discountAmountApplied && (
                <InfoRow label={lang === "pt-BR" ? "Valor do desconto" : "Discount amount"} value={fmtAmount(data.couponUsed.usage.discountAmountApplied)} />
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">{lang === "pt-BR" ? "Nenhum cupom utilizado" : "No coupon used"}</p>
          )}
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" />{lang === "pt-BR" ? "Histórico de Suspensões" : "Suspension History"}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.suspensionHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{lang === "pt-BR" ? "Nenhum evento registrado" : "No events recorded"}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{lang === "pt-BR" ? "Evento" : "Event"}</TableHead>
                  <TableHead>{lang === "pt-BR" ? "Motivo" : "Reason"}</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Clicks</TableHead>
                  <TableHead>{lang === "pt-BR" ? "Data" : "Date"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.suspensionHistory.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>
                      <Badge variant={h.event === "suspended" ? "destructive" : h.event === "unsuspended" ? "outline" : "secondary"} className="text-xs">
                        {h.event}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{h.reason ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{h.actorType}</Badge></TableCell>
                    <TableCell className="tabular-nums text-sm">{h.clicksAtEvent?.toLocaleString() ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(h.createdAt, lang)}</TableCell>
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

function DomainsTab({ data, lang }: { data: UserDetailData; lang: string }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" />
            {lang === "pt-BR" ? "Domínios Próprios" : "Custom Domains"}
            <Badge variant="outline" className="ml-auto">{data.domains.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.domains.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{lang === "pt-BR" ? "Nenhum domínio" : "No domains"}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subdomínio</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SSL</TableHead>
                  <TableHead>DNS</TableHead>
                  <TableHead>{lang === "pt-BR" ? "Criado em" : "Created"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.domains.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-sm">{d.subdomain}</TableCell>
                    <TableCell>
                      {d.isActive
                        ? <span className="flex items-center gap-1 text-emerald-400 text-xs"><CheckCircle2 className="h-3 w-3" />Ativo</span>
                        : <span className="flex items-center gap-1 text-destructive text-xs"><XCircle className="h-3 w-3" />Inativo</span>}
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{d.sslStatus ?? "—"}</Badge></TableCell>
                    <TableCell>
                      {d.isVerified
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        : <XCircle className="h-4 w-4 text-muted-foreground" />}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(d.createdAt, lang)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" />
            {lang === "pt-BR" ? "Domínios Compartilhados" : "Shared Domains"}
            <Badge variant="outline" className="ml-auto">{data.sharedDomains.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.sharedDomains.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{lang === "pt-BR" ? "Nenhum domínio compartilhado" : "No shared domains"}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subdomínio</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SSL</TableHead>
                  <TableHead>{lang === "pt-BR" ? "Ativado em" : "Activated"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.sharedDomains.map((sd) => (
                  <TableRow key={sd.id}>
                    <TableCell className="font-mono text-sm">{sd.sharedDomain.subdomain}</TableCell>
                    <TableCell>
                      {sd.isActive && sd.sharedDomain.isActive
                        ? <span className="flex items-center gap-1 text-emerald-400 text-xs"><CheckCircle2 className="h-3 w-3" />Ativo</span>
                        : <span className="flex items-center gap-1 text-muted-foreground text-xs"><XCircle className="h-3 w-3" />Inativo</span>}
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{sd.sharedDomain.sslStatus ?? "—"}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(sd.createdAt, lang)}</TableCell>
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

function OffersTab({ data, lang }: { data: UserDetailData; lang: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4" />
          Offers
          <Badge variant="outline" className="ml-auto">{data.offers.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {data.offers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">{lang === "pt-BR" ? "Nenhuma offer criada" : "No offers created"}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{lang === "pt-BR" ? "Nome" : "Name"}</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Plataforma</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Black</TableHead>
                <TableHead className="text-right">White</TableHead>
                <TableHead>{lang === "pt-BR" ? "Criado em" : "Created"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.offers.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{o.slug}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs capitalize">{o.platform}</Badge></TableCell>
                  <TableCell>
                    {o.isActive
                      ? <span className="flex items-center gap-1 text-emerald-400 text-xs"><CheckCircle2 className="h-3 w-3" />Ativo</span>
                      : <span className="flex items-center gap-1 text-muted-foreground text-xs"><XCircle className="h-3 w-3" />Inativo</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{o.totalClicks.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-emerald-400">{o.blackClicks.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-blue-400">{o.whiteClicks.toLocaleString()}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(o.createdAt, lang)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityTab({ data, lang }: { data: UserDetailData; lang: string }) {
  const chartData = data.clickHistory.map((d) => ({
    date: d.date.slice(5),
    clicks: d.clicks,
    black: d.blackClicks,
    white: d.whiteClicks,
  }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            {lang === "pt-BR" ? "Clicks — Últimos 30 dias" : "Clicks — Last 30 days"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{lang === "pt-BR" ? "Sem dados" : "No data"}</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <RechartTooltip
                  contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 6 }}
                  labelStyle={{ color: "hsl(var(--foreground))", fontSize: 12 }}
                  itemStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="clicks" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} name="Total" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            {lang === "pt-BR" ? "Histórico de Eventos" : "Event History"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.suspensionHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{lang === "pt-BR" ? "Nenhum evento" : "No events"}</p>
          ) : (
            <div className="px-4 py-2 space-y-3">
              {data.suspensionHistory.map((h) => (
                <div key={h.id} className="flex gap-3 text-sm">
                  <div className="flex flex-col items-center gap-1 pt-0.5">
                    {h.event === "suspended" ? <Ban className="h-4 w-4 text-destructive shrink-0" /> :
                     h.event === "unsuspended" ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" /> :
                     <Clock className="h-4 w-4 text-muted-foreground shrink-0" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={h.event === "suspended" ? "destructive" : "secondary"} className="text-xs">{h.event}</Badge>
                      {h.reason && <span className="text-muted-foreground text-xs">{h.reason}</span>}
                      <span className="text-muted-foreground text-xs ml-auto">{fmtDate(h.createdAt, lang)}</span>
                    </div>
                    {h.details && <p className="text-xs text-muted-foreground mt-0.5 truncate">{h.details}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AffiliateTab({ data, lang }: { data: UserDetailData; lang: string }) {
  const totalEarned = data.commissionsEarned.filter(c => c.status !== "reversed").reduce((s, c) => s + c.amount, 0);
  const pendingEarned = data.commissionsEarned.filter(c => c.status === "pending").reduce((s, c) => s + c.amount, 0);

  return (
    <div className="space-y-4">
      {data.affiliateCoupons.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Gift className="h-4 w-4" />
              {lang === "pt-BR" ? "Cupons de Afiliado" : "Affiliate Coupons"}
            </CardTitle>
            <CardDescription>{lang === "pt-BR" ? "Cupons onde este usuário é o afiliado" : "Coupons where this user is the affiliate"}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Desconto</TableHead>
                  <TableHead>Comissão</TableHead>
                  <TableHead>Usos</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.affiliateCoupons.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono font-bold">{c.code}</TableCell>
                    <TableCell>
                      {c.discountType === "percentage" ? `${c.discountValue}%` : fmtAmount(c.discountValue)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.commissionValue && c.commissionType
                        ? c.commissionType === "percentage" ? `${c.commissionValue}%` : fmtAmount(c.commissionValue)
                        : "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">{c.usageCount}</TableCell>
                    <TableCell>
                      {c.isActive
                        ? <Badge className="text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Ativo</Badge>
                        : <Badge variant="outline" className="text-xs">Inativo</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{lang === "pt-BR" ? "Total ganho" : "Total earned"}</p>
            <p className="text-2xl font-bold text-emerald-400">{fmtAmount(totalEarned)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{lang === "pt-BR" ? "Pendente" : "Pending"}</p>
            <p className="text-2xl font-bold text-amber-400">{fmtAmount(pendingEarned)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{lang === "pt-BR" ? "Comissões Recebidas" : "Commissions Earned"}</CardTitle>
          <CardDescription>{lang === "pt-BR" ? "Comissões geradas por indicações" : "Commissions from referrals"}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {data.commissionsEarned.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{lang === "pt-BR" ? "Nenhuma comissão" : "No commissions"}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>{lang === "pt-BR" ? "Valor" : "Amount"}</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>{lang === "pt-BR" ? "Data" : "Date"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.commissionsEarned.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell><Badge variant="outline" className="text-xs">{c.type}</Badge></TableCell>
                    <TableCell className="tabular-nums font-medium">{fmtAmount(c.amount)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={c.status === "paid" ? "outline" : c.status === "reversed" ? "destructive" : "secondary"}
                        className={`text-xs ${c.status === "paid" ? "text-emerald-400 border-emerald-500/30" : ""}`}
                      >
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(c.createdAt, lang)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {data.commissionsReferred.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{lang === "pt-BR" ? "Indicado por Afiliado" : "Referred by Affiliate"}</CardTitle>
            <CardDescription>{lang === "pt-BR" ? "Comissões geradas quando este usuário foi indicado" : "Commissions generated when this user was referred"}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>{lang === "pt-BR" ? "Valor" : "Amount"}</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>{lang === "pt-BR" ? "Data" : "Date"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.commissionsReferred.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell><Badge variant="outline" className="text-xs">{c.type}</Badge></TableCell>
                    <TableCell className="tabular-nums">{fmtAmount(c.amount)}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === "reversed" ? "destructive" : "secondary"} className="text-xs">{c.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(c.createdAt, lang)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {data.affiliateCoupons.length === 0 && data.commissionsEarned.length === 0 && data.commissionsReferred.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Gift className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">{lang === "pt-BR" ? "Nenhuma atividade de afiliado" : "No affiliate activity"}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const EMAIL_TYPE_LABELS: Record<string, string> = {
  welcome: "Boas-vindas",
  password_reset: "Redefinição de Senha",
  account_suspended: "Conta Suspensa",
  notification: "Notificação",
  subscription: "Assinatura Confirmada",
  subscription_cancelled: "Assinatura Cancelada",
  subscription_renewed: "Assinatura Renovada",
  payment_failed: "Pagamento Falhou",
  subscription_expiring_3days: "Assinatura vence em 3 dias",
  subscription_expired_today: "Assinatura expirou hoje",
  subscription_expired_2days: "Conta pausada (2 dias)",
  subscription_expired_7days: "1 semana sem assinatura",
  domain_inactive: "Domínio Inativo",
  shared_domain_inactive: "Dom. Compartilhado Inativo",
  domain_removed: "Domínio Removido",
  domain_removed_policy: "Domínio Removido (Política)",
  domain_removed_inactive: "Domínio Removido (Inativo)",
  domain_removed_admin: "Domínio Removido (Admin)",
  plan_limit: "Limite do Plano",
};

function EmailsTab({ userId, lang }: { userId: string; lang: string }) {
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const { toast } = useToast();

  const { data: emails, isLoading } = useQuery<EmailLog[]>({
    queryKey: [`/api/admin/users/${userId}/emails`],
  });

  const retryMutation = useMutation({
    mutationFn: async (emailId: number) => {
      setRetryingId(emailId);
      return apiRequest("POST", `/api/admin/emails/${emailId}/retry`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${userId}/emails`] });
      toast({ title: lang === "pt-BR" ? "E-mail reenviado" : "Email resent" });
      setRetryingId(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message, variant: "destructive" });
      setRetryingId(null);
    },
  });

  const fmt = (d: string | Date) =>
    new Date(d).toLocaleString(lang === "pt-BR" ? "pt-BR" : "en-US", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });

  if (isLoading) return (
    <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
  );

  if (!emails || emails.length === 0) return (
    <Card>
      <CardContent className="py-12 text-center">
        <Mail className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground text-sm">
          {lang === "pt-BR" ? "Nenhum e-mail enviado para este usuário" : "No emails sent to this user"}
        </p>
      </CardContent>
    </Card>
  );

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" />
            {lang === "pt-BR" ? "Histórico de E-mails" : "Email History"}
          </CardTitle>
          <CardDescription>
            {lang === "pt-BR" ? `${emails.length} e-mails enviados` : `${emails.length} emails sent`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{lang === "pt-BR" ? "Tipo" : "Type"}</TableHead>
                <TableHead>{lang === "pt-BR" ? "Assunto" : "Subject"}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>{lang === "pt-BR" ? "Data" : "Date"}</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emails.map((email) => {
                const meta = email.metadata as Record<string, any> | null;
                const isRetryEmail = !!meta?.isRetry;
                return (
                  <TableRow key={email.id} data-testid={`row-user-email-${email.id}`}>
                    <TableCell>
                      <Badge variant="outline" className="text-xs whitespace-nowrap">
                        {EMAIL_TYPE_LABELS[email.type] || email.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm max-w-[180px] truncate">
                      <span title={email.subject}>{email.subject}</span>
                    </TableCell>
                    <TableCell>
                      {email.status === "sent" ? (
                        <Badge variant="outline" className="text-green-600 border-green-600 text-xs gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {lang === "pt-BR" ? "Enviado" : "Sent"}
                          {isRetryEmail && <span className="text-muted-foreground ml-0.5">(retry)</span>}
                        </Badge>
                      ) : (
                        <UITooltip>
                          <TooltipTrigger>
                            <Badge variant="destructive" className="text-xs gap-1 cursor-help">
                              <XCircle className="w-3 h-3" />
                              {lang === "pt-BR" ? "Falha" : "Failed"}
                            </Badge>
                          </TooltipTrigger>
                          {(email as any).errorMessage && (
                            <TooltipContent side="top" className="max-w-xs text-xs">
                              <p>{(email as any).errorMessage}</p>
                            </TooltipContent>
                          )}
                        </UITooltip>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {fmt(email.createdAt)}
                    </TableCell>
                    <TableCell>
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => retryMutation.mutate(email.id)}
                            disabled={retryingId === email.id}
                            data-testid={`button-retry-user-email-${email.id}`}
                          >
                            {retryingId === email.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <RotateCcw className="w-3.5 h-3.5" />
                            }
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="text-xs">
                          {lang === "pt-BR" ? "Reenviar" : "Resend"}
                        </TooltipContent>
                      </UITooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

function DetailSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-20" />
      </div>
      <div className="flex gap-2">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-9 w-24" />)}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-48" />)}
      </div>
    </div>
  );
}

export default function AdminUserDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { language } = useLanguage();
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<UserDetailData>({
    queryKey: [`/api/admin/users/${id}/details`],
    retry: 1,
  });

  const impersonateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/impersonate/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.clear();
      window.location.href = "/";
    },
    onError: (err: any) => {
      toast({
        title: language === "pt-BR" ? "Erro" : "Error",
        description: err?.message || (language === "pt-BR" ? "Não foi possível entrar como usuário" : "Could not impersonate user"),
        variant: "destructive",
      });
    },
  });

  const syncStripeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/users/${id}/sync-stripe`);
      return res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${id}/details`] });
      const planInfo = result.planName ? ` — ${result.planName}` : "";
      toast({
        title: language === "pt-BR" ? "Sincronizado com Stripe" : "Synced with Stripe",
        description: `${result.action}: ${result.status}${planInfo}`,
      });
    },
    onError: (err: any) => {
      toast({
        title: language === "pt-BR" ? "Erro ao sincronizar" : "Sync failed",
        description: err?.message || (language === "pt-BR" ? "Não foi possível sincronizar com o Stripe" : "Could not sync with Stripe"),
        variant: "destructive",
      });
    },
  });

  // ── Change Plan ──────────────────────────────────────────────────────────
  const [showChangePlan, setShowChangePlan] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");

  const { data: availablePlans = [] } = useQuery<PlanOption[]>({
    queryKey: ["/api/plans"],
  });

  const activePlans = availablePlans.filter((pl) => pl.isActive || pl.isFree);

  const changePlanMutation = useMutation({
    mutationFn: async (planId: number) => {
      const res = await apiRequest("POST", `/api/admin/users/${id}/change-plan`, { planId });
      return res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${id}/details`] });
      setShowChangePlan(false);
      setSelectedPlanId("");
      toast({
        title: language === "pt-BR" ? "Plano alterado" : "Plan changed",
        description: language === "pt-BR"
          ? `Plano atualizado para ${result.planName ?? "—"}`
          : `Plan updated to ${result.planName ?? "—"}`,
      });
      if (result?.stripeWarning) {
        setTimeout(() => {
          toast({
            title: language === "pt-BR" ? "Aviso Stripe" : "Stripe Warning",
            description: result.stripeWarning,
            variant: "destructive",
          });
        }, 700);
      }
    },
    onError: (err: any) => {
      const raw = err?.message ?? "";
      const clean = raw.replace(/^\d{3}:\s*/, "").trim();
      let msg = clean;
      try { msg = JSON.parse(clean)?.message ?? clean; } catch {}
      toast({
        title: language === "pt-BR" ? "Erro ao alterar plano" : "Failed to change plan",
        description: msg || (language === "pt-BR" ? "Tente novamente" : "Please try again"),
        variant: "destructive",
      });
    },
  });

  if (isLoading) return <DetailSkeleton />;

  if (error || !data) {
    return (
      <div className="p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/confg-admin/users")} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {language === "pt-BR" ? "Voltar" : "Back"}
        </Button>
        <div className="text-center py-12">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-3" />
          <p className="text-muted-foreground">{language === "pt-BR" ? "Usuário não encontrado ou erro ao carregar" : "User not found or error loading"}</p>
        </div>
      </div>
    );
  }

  const p = data.profile;
  const fullName = [p.firstName, p.lastName].filter(Boolean).join(" ");

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/confg-admin/users")}
            data-testid="button-back-to-users"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {language === "pt-BR" ? "Usuários" : "Users"}
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div>
            <h1 className="text-xl font-semibold">{fullName || p.email}</h1>
            {fullName && <p className="text-sm text-muted-foreground">{p.email}</p>}
          </div>
          <StatusBadge status={p.subscriptionStatus} isSuspended={p.isSuspended} isTrialing={p.isTrialing} />
          {p.isAdminUser && <Badge variant="outline" className="border-primary/30 text-primary">Admin</Badge>}
        </div>

        <div className="flex items-center gap-2">
          {(p.stripeCustomerId || p.stripeSubscriptionId) && (
            <Button
              onClick={() => syncStripeMutation.mutate()}
              disabled={syncStripeMutation.isPending}
              size="sm"
              variant="outline"
              data-testid="button-sync-stripe"
            >
              {syncStripeMutation.isPending
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <RefreshCw className="h-4 w-4 mr-2" />}
              {language === "pt-BR" ? "Sync Stripe" : "Sync Stripe"}
            </Button>
          )}
          <Button
            onClick={() => impersonateMutation.mutate()}
            disabled={impersonateMutation.isPending || p.isAdminUser}
            size="sm"
            variant="secondary"
            data-testid="button-impersonate-user"
          >
            <UserCog className="h-4 w-4 mr-2" />
            {language === "pt-BR" ? "Entrar como usuário" : "Impersonate"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="billing" data-testid="tab-billing">Billing</TabsTrigger>
          <TabsTrigger value="domains" data-testid="tab-domains">
            {language === "pt-BR" ? "Domínios" : "Domains"}
            {(data.domains.length + data.sharedDomains.length) > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs py-0 h-4">{data.domains.length + data.sharedDomains.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="offers" data-testid="tab-offers">
            Offers
            {data.offers.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs py-0 h-4">{data.offers.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity">{language === "pt-BR" ? "Atividade" : "Activity"}</TabsTrigger>
          <TabsTrigger value="affiliate" data-testid="tab-affiliate">{language === "pt-BR" ? "Afiliado" : "Affiliate"}</TabsTrigger>
          <TabsTrigger value="emails" data-testid="tab-emails">
            <Mail className="h-3.5 w-3.5 mr-1.5" />
            {language === "pt-BR" ? "E-mails" : "Emails"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab data={data} lang={language} onChangePlan={() => { setSelectedPlanId(String(data.profile.planId ?? "")); setShowChangePlan(true); }} />
        </TabsContent>
        <TabsContent value="billing" className="mt-4">
          <BillingTab data={data} lang={language} onChangePlan={() => { setSelectedPlanId(String(data.profile.planId ?? "")); setShowChangePlan(true); }} />
        </TabsContent>
        <TabsContent value="domains" className="mt-4">
          <DomainsTab data={data} lang={language} />
        </TabsContent>
        <TabsContent value="offers" className="mt-4">
          <OffersTab data={data} lang={language} />
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <ActivityTab data={data} lang={language} />
        </TabsContent>
        <TabsContent value="affiliate" className="mt-4">
          <AffiliateTab data={data} lang={language} />
        </TabsContent>
        <TabsContent value="emails" className="mt-4">
          <EmailsTab userId={p.id} lang={language} />
        </TabsContent>
      </Tabs>

      {/* ── Change Plan Dialog ─────────────────────────────────────────── */}
      <Dialog open={showChangePlan} onOpenChange={(open) => { if (!open) { setShowChangePlan(false); setSelectedPlanId(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              {language === "pt-BR" ? "Alterar Plano" : "Change Plan"}
            </DialogTitle>
            <DialogDescription>
              {language === "pt-BR"
                ? `Usuário: ${p.email}`
                : `User: ${p.email}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Current plan */}
            <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">{language === "pt-BR" ? "Plano atual: " : "Current plan: "}</span>
              <span className="font-medium">{data.plan?.name ?? (language === "pt-BR" ? "Nenhum" : "None")}</span>
            </div>

            {/* Plan selector */}
            <div className="space-y-1.5">
              <Label>{language === "pt-BR" ? "Novo plano" : "New plan"}</Label>
              <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                <SelectTrigger data-testid="select-plan">
                  <SelectValue placeholder={language === "pt-BR" ? "Selecionar plano…" : "Select plan…"} />
                </SelectTrigger>
                <SelectContent>
                  {activePlans.map((pl) => (
                    <SelectItem key={pl.id} value={String(pl.id)} data-testid={`select-plan-option-${pl.id}`}>
                      <span className="flex items-center gap-2">
                        {language === "pt-BR" ? pl.name : (pl.nameEn ?? pl.name)}
                        {pl.isFree
                          ? <Badge variant="outline" className="text-xs py-0 h-4">Free</Badge>
                          : <span className="text-muted-foreground text-xs">— R$ {(pl.price / 100).toFixed(2)}</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Warning notice */}
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-400 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {language === "pt-BR" ? "Atribuição manual pelo admin" : "Manual admin assignment"}
              </p>
              <p className="text-amber-400/80 leading-relaxed">
                {language === "pt-BR"
                  ? "O banco será atualizado imediatamente. O Stripe será sincronizado apenas se o usuário já tiver uma assinatura Stripe vinculada. Nenhuma cobrança é gerada."
                  : "The database will be updated immediately. Stripe is synced only if the user already has a linked Stripe subscription. No charge is generated."}
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setShowChangePlan(false); setSelectedPlanId(""); }}
              disabled={changePlanMutation.isPending}
            >
              {language === "pt-BR" ? "Cancelar" : "Cancel"}
            </Button>
            <Button
              onClick={() => selectedPlanId && changePlanMutation.mutate(parseInt(selectedPlanId))}
              disabled={
                !selectedPlanId ||
                changePlanMutation.isPending ||
                selectedPlanId === String(data.profile.planId)
              }
              data-testid="button-confirm-change-plan"
            >
              {changePlanMutation.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{language === "pt-BR" ? "Salvando…" : "Saving…"}</>
                : language === "pt-BR" ? "Confirmar" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
