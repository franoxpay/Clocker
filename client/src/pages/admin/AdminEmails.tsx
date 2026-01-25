import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
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
import { Mail, CheckCircle, XCircle, Clock, ChevronLeft, ChevronRight, Send } from "lucide-react";
import { format } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";
import type { EmailLog } from "@shared/schema";

interface EmailStats {
  totalSent: number;
  totalFailed: number;
  byType: Array<{ type: string; count: number }>;
  last24Hours: number;
}

export default function AdminEmails() {
  const { language } = useLanguage();
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState("all");
  const limit = 20;

  const t = (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      "admin.emails": { "pt-BR": "E-mails", en: "Emails" },
      "admin.emailHistory": { "pt-BR": "Histórico de E-mails", en: "Email History" },
      "admin.totalSent": { "pt-BR": "Total Enviados", en: "Total Sent" },
      "admin.totalFailed": { "pt-BR": "Total com Falha", en: "Total Failed" },
      "admin.last24Hours": { "pt-BR": "Últimas 24h", en: "Last 24 Hours" },
      "admin.byType": { "pt-BR": "Por Tipo", en: "By Type" },
      "admin.recipient": { "pt-BR": "Destinatário", en: "Recipient" },
      "admin.subject": { "pt-BR": "Assunto", en: "Subject" },
      "admin.type": { "pt-BR": "Tipo", en: "Type" },
      "admin.status": { "pt-BR": "Status", en: "Status" },
      "admin.date": { "pt-BR": "Data", en: "Date" },
      "admin.allTypes": { "pt-BR": "Todos os tipos", en: "All types" },
      "admin.welcome": { "pt-BR": "Boas-vindas", en: "Welcome" },
      "admin.subscription": { "pt-BR": "Assinatura", en: "Subscription" },
      "admin.domain_inactive": { "pt-BR": "Domínio Inativo", en: "Domain Inactive" },
      "admin.shared_domain_inactive": { "pt-BR": "Domínio Compartilhado Inativo", en: "Shared Domain Inactive" },
      "admin.plan_limit": { "pt-BR": "Limite do Plano", en: "Plan Limit" },
      "admin.notification": { "pt-BR": "Notificação", en: "Notification" },
      "admin.password_reset": { "pt-BR": "Redefinição de Senha", en: "Password Reset" },
      "admin.sent": { "pt-BR": "Enviado", en: "Sent" },
      "admin.failed": { "pt-BR": "Falha", en: "Failed" },
      "admin.noEmails": { "pt-BR": "Nenhum e-mail encontrado", en: "No emails found" },
      "admin.page": { "pt-BR": "Página", en: "Page" },
      "admin.of": { "pt-BR": "de", en: "of" },
    };
    return translations[key]?.[language] || translations[key]?.en || key;
  };

  const getTypeLabel = (type: string) => {
    const typeLabels: Record<string, string> = {
      welcome: t("admin.welcome"),
      subscription: t("admin.subscription"),
      domain_inactive: t("admin.domain_inactive"),
      shared_domain_inactive: t("admin.shared_domain_inactive"),
      plan_limit: t("admin.plan_limit"),
      notification: t("admin.notification"),
      password_reset: t("admin.password_reset"),
    };
    return typeLabels[type] || type;
  };

  const getTypeBadgeVariant = (type: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      welcome: "default",
      subscription: "secondary",
      domain_inactive: "destructive",
      shared_domain_inactive: "destructive",
      plan_limit: "outline",
      notification: "secondary",
      password_reset: "outline",
    };
    return variants[type] || "default";
  };

  const { data: stats, isLoading: statsLoading } = useQuery<EmailStats>({
    queryKey: ["/api/admin/emails/stats"],
  });

  const { data: emailsData, isLoading: emailsLoading } = useQuery<{ logs: EmailLog[]; total: number }>({
    queryKey: ["/api/admin/emails", page, filterType],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      if (filterType !== "all") {
        params.append("type", filterType);
      }
      const response = await fetch(`/api/admin/emails?${params}`);
      if (!response.ok) throw new Error("Failed to fetch emails");
      return response.json();
    },
  });

  const totalPages = emailsData ? Math.ceil(emailsData.total / limit) : 1;

  const formatDate = (date: string | Date) => {
    const d = new Date(date);
    return format(d, "dd/MM/yyyy HH:mm", { locale: language === "pt-BR" ? ptBR : enUS });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-admin-emails-title">
            {t("admin.emails")}
          </h1>
          <p className="text-muted-foreground">
            {t("admin.emailHistory")}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Send className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("admin.totalSent")}</p>
                {statsLoading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  <p className="text-2xl font-bold" data-testid="text-total-sent">
                    {stats?.totalSent || 0}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("admin.totalFailed")}</p>
                {statsLoading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  <p className="text-2xl font-bold" data-testid="text-total-failed">
                    {stats?.totalFailed || 0}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("admin.last24Hours")}</p>
                {statsLoading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  <p className="text-2xl font-bold" data-testid="text-last-24h">
                    {stats?.last24Hours || 0}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Mail className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("admin.byType")}</p>
                {statsLoading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  <p className="text-2xl font-bold" data-testid="text-types-count">
                    {stats?.byType?.length || 0}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>{t("admin.emailHistory")}</CardTitle>
          <Select value={filterType} onValueChange={(value) => { setFilterType(value); setPage(1); }}>
            <SelectTrigger className="w-48" data-testid="select-email-type-filter">
              <SelectValue placeholder={t("admin.allTypes")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("admin.allTypes")}</SelectItem>
              <SelectItem value="welcome">{t("admin.welcome")}</SelectItem>
              <SelectItem value="subscription">{t("admin.subscription")}</SelectItem>
              <SelectItem value="domain_inactive">{t("admin.domain_inactive")}</SelectItem>
              <SelectItem value="shared_domain_inactive">{t("admin.shared_domain_inactive")}</SelectItem>
              <SelectItem value="plan_limit">{t("admin.plan_limit")}</SelectItem>
              <SelectItem value="notification">{t("admin.notification")}</SelectItem>
              <SelectItem value="password_reset">{t("admin.password_reset")}</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {emailsLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : emailsData?.logs?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t("admin.noEmails")}</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.recipient")}</TableHead>
                    <TableHead>{t("admin.subject")}</TableHead>
                    <TableHead>{t("admin.type")}</TableHead>
                    <TableHead>{t("admin.status")}</TableHead>
                    <TableHead>{t("admin.date")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emailsData?.logs?.map((email) => (
                    <TableRow key={email.id} data-testid={`row-email-${email.id}`}>
                      <TableCell className="font-medium">{email.toEmail}</TableCell>
                      <TableCell className="max-w-xs truncate">{email.subject}</TableCell>
                      <TableCell>
                        <Badge variant={getTypeBadgeVariant(email.type)}>
                          {getTypeLabel(email.type)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {email.status === "sent" ? (
                          <Badge variant="outline" className="text-green-600 border-green-600">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            {t("admin.sent")}
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <XCircle className="w-3 h-3 mr-1" />
                            {t("admin.failed")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{formatDate(email.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    {t("admin.page")} {page} {t("admin.of")} {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      data-testid="button-next-page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
