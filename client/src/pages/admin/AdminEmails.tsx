import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Mail, CheckCircle, XCircle, Clock, ChevronLeft, ChevronRight, Send,
  FileText, Edit, Loader2, Users, Search, Plus, AlertCircle, TrendingDown,
  RotateCcw, Eye, Filter, SortDesc, SortAsc, X, Code2,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { EmailLog, EmailTemplate } from "@shared/schema";

interface EmailStats {
  totalSent: number;
  totalFailed: number;
  byType: Array<{ type: string; count: number }>;
  last24Hours: number;
}

const EMAIL_TYPE_GROUPS = [
  {
    label: "Conta",
    types: ["welcome", "password_reset", "account_suspended", "notification"],
  },
  {
    label: "Assinatura",
    types: [
      "subscription", "subscription_cancelled", "subscription_renewed",
      "payment_failed", "subscription_expiring_3days", "subscription_expired_today",
      "subscription_expired_2days", "subscription_expired_7days",
    ],
  },
  {
    label: "Domínios",
    types: [
      "domain_inactive", "shared_domain_inactive", "domain_removed",
      "domain_removed_policy", "domain_removed_inactive", "domain_removed_admin",
    ],
  },
  {
    label: "Plano",
    types: ["plan_limit"],
  },
];

const EMAIL_TYPES = EMAIL_TYPE_GROUPS.flatMap((g) => g.types);

const TYPE_LABELS: Record<string, string> = {
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
  subscription_expired_2days: "Conta pausada há 2 dias",
  subscription_expired_7days: "1 semana sem assinatura",
  domain_inactive: "Domínio Inativo",
  shared_domain_inactive: "Domínio Compartilhado Inativo",
  domain_removed: "Domínio Removido",
  domain_removed_policy: "Domínio Removido (Política)",
  domain_removed_inactive: "Domínio Removido (Inativo)",
  domain_removed_admin: "Domínio Removido (Admin)",
  plan_limit: "Limite do Plano",
};

const TYPE_BADGE_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  welcome: "default",
  password_reset: "outline",
  account_suspended: "destructive",
  notification: "secondary",
  subscription: "default",
  subscription_cancelled: "destructive",
  subscription_renewed: "default",
  payment_failed: "destructive",
  subscription_expiring_3days: "outline",
  subscription_expired_today: "destructive",
  subscription_expired_2days: "destructive",
  subscription_expired_7days: "destructive",
  domain_inactive: "destructive",
  shared_domain_inactive: "destructive",
  domain_removed: "destructive",
  domain_removed_policy: "destructive",
  domain_removed_inactive: "destructive",
  domain_removed_admin: "destructive",
  plan_limit: "outline",
};

const TEMPLATE_VARIABLES: Record<string, string[]> = {
  welcome: ["{{firstName}}", "{{email}}"],
  password_reset: ["{{firstName}}", "{{email}}"],
  account_suspended: ["{{firstName}}", "{{email}}", "{{reason}}"],
  notification: ["{{firstName}}", "{{email}}"],
  subscription: ["{{firstName}}", "{{email}}", "{{planName}}"],
  subscription_cancelled: ["{{firstName}}", "{{email}}", "{{planName}}", "{{endDate}}"],
  subscription_renewed: ["{{firstName}}", "{{email}}", "{{planName}}", "{{nextRenewalDate}}"],
  payment_failed: ["{{firstName}}", "{{email}}", "{{planName}}"],
  subscription_expiring_3days: ["{{firstName}}", "{{email}}", "{{planName}}", "{{endDate}}"],
  subscription_expired_today: ["{{firstName}}", "{{email}}", "{{planName}}"],
  subscription_expired_2days: ["{{firstName}}", "{{email}}", "{{planName}}"],
  subscription_expired_7days: ["{{firstName}}", "{{email}}", "{{planName}}"],
  domain_inactive: ["{{firstName}}", "{{email}}", "{{domain}}"],
  shared_domain_inactive: ["{{firstName}}", "{{email}}", "{{domain}}"],
  domain_removed: ["{{firstName}}", "{{email}}", "{{domain}}"],
  domain_removed_policy: ["{{firstName}}", "{{email}}", "{{domain}}"],
  domain_removed_inactive: ["{{firstName}}", "{{email}}", "{{domain}}"],
  domain_removed_admin: ["{{firstName}}", "{{email}}", "{{domain}}"],
  plan_limit: ["{{firstName}}", "{{email}}", "{{planName}}", "{{limitType}}", "{{currentUsage}}", "{{limit}}"],
};

const PREVIEW_VARS: Record<string, string> = {
  firstName: "João",
  name: "João Silva",
  email: "joao@exemplo.com",
  planName: "Plano Escala",
  domain: "meu.dominio.com",
  limitType: "cliques",
  currentUsage: "15.240",
  limit: "10.000",
  endDate: "15/06/2026",
  nextRenewalDate: "01/07/2026",
  reason: "período de carência expirado",
  subscriptionStatus: "ativo",
  date: new Date().toLocaleDateString("pt-BR"),
  currentUsagePct: "152%",
};

function applyPreviewVars(html: string): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => PREVIEW_VARS[key] ?? `{{${key}}}`);
}

export default function AdminEmails() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const isPt = language === "pt-BR";

  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [orderDir, setOrderDir] = useState("newest");
  const [activeTab, setActiveTab] = useState("history");

  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [templateEditorLang, setTemplateEditorLang] = useState<"pt" | "en">("pt");
  const [templateTab, setTemplateTab] = useState<"edit" | "preview">("edit");

  const [showTestDialog, setShowTestDialog] = useState(false);
  const [selectedTemplateType, setSelectedTemplateType] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [testLocale, setTestLocale] = useState<"pt" | "en">("pt");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [userSearch, setUserSearch] = useState("");
  const [retryingId, setRetryingId] = useState<number | null>(null);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const limit = 20;

  const getTypeLabel = (type: string) => TYPE_LABELS[type] || type;
  const getTypeBadgeVariant = (type: string) => TYPE_BADGE_VARIANTS[type] || "default";

  const handleSearchChange = useCallback((val: string) => {
    setSearchQuery(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 400);
  }, []);

  const filtersActive =
    filterType !== "all" || filterStatus !== "all" ||
    startDate !== "" || endDate !== "" || debouncedSearch !== "";

  const clearFilters = () => {
    setFilterType("all");
    setFilterStatus("all");
    setStartDate("");
    setEndDate("");
    setSearchQuery("");
    setDebouncedSearch("");
    setPage(1);
  };

  const { data: stats, isLoading: statsLoading } = useQuery<EmailStats>({
    queryKey: ["/api/admin/emails/stats"],
  });

  const { data: emailsData, isLoading: emailsLoading } = useQuery<{ logs: EmailLog[]; total: number }>({
    queryKey: ["/api/admin/emails", page, filterType, filterStatus, startDate, endDate, debouncedSearch, orderDir],
    queryFn: async () => {
      const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
      if (filterType !== "all") params.append("type", filterType);
      if (filterStatus !== "all") params.append("status", filterStatus);
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      if (debouncedSearch) params.append("search", debouncedSearch);
      params.append("order", orderDir);
      const response = await fetch(`/api/admin/emails?${params}`);
      if (!response.ok) throw new Error("Failed to fetch emails");
      return response.json();
    },
  });

  const { data: templates, isLoading: templatesLoading } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/admin/emails/templates"],
  });

  const { data: users } = useQuery<Array<{ id: string; email: string; firstName: string | null }>>({
    queryKey: ["/api/admin/users"],
    select: (data: any) =>
      (data.users || data).map((u: any) => ({ id: u.id, email: u.email, firstName: u.firstName })),
  });

  const filteredUsers =
    users?.filter(
      (u) =>
        u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.firstName?.toLowerCase() || "").includes(userSearch.toLowerCase())
    ) || [];

  const seedTemplatesMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/emails/templates/seed", {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/emails/templates"] });
      toast({ title: isPt ? "Templates Criados" : "Templates Created", description: `${data.seeded?.length || 0} templates criados` });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (template: Partial<EmailTemplate>) =>
      apiRequest("POST", "/api/admin/emails/templates", template),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/emails/templates"] });
      setShowTemplateDialog(false);
      setEditingTemplate(null);
      toast({ title: isPt ? "Template salvo" : "Template saved" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const sendTestMutation = useMutation({
    mutationFn: async ({ templateType, targetEmail, locale, targetUserId }: {
      templateType: string; targetEmail: string; locale: "pt" | "en"; targetUserId?: string;
    }) => apiRequest("POST", "/api/admin/emails/send-test", { templateType, targetEmail, locale, targetUserId }),
    onSuccess: () => {
      setShowTestDialog(false);
      setTestEmail(""); setSelectedTemplateType(""); setTestLocale("pt"); setSelectedUserId(""); setUserSearch("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/emails"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/emails/stats"] });
      toast({ title: isPt ? "E-mail de teste enviado" : "Test email sent" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (emailId: number) => {
      setRetryingId(emailId);
      return apiRequest("POST", `/api/admin/emails/${emailId}/retry`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/emails"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/emails/stats"] });
      toast({ title: isPt ? "E-mail reenviado" : "Email resent" });
      setRetryingId(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setRetryingId(null);
    },
  });

  const totalPages = emailsData ? Math.ceil(emailsData.total / limit) : 1;
  const failureRate = stats && stats.totalSent + stats.totalFailed > 0
    ? Math.round((stats.totalFailed / (stats.totalSent + stats.totalFailed)) * 100)
    : 0;

  const formatDate = (date: string | Date) =>
    format(new Date(date), "dd/MM/yyyy HH:mm", { locale: isPt ? ptBR : enUS });

  const handleEditTemplate = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setTemplateEditorLang("pt");
    setTemplateTab("edit");
    setShowTemplateDialog(true);
  };

  const handleNewTemplate = (type: string) => {
    setEditingTemplate({ id: 0, type, subjectPt: "", subjectEn: "", htmlPt: "", htmlEn: "", description: null, updatedAt: new Date() });
    setTemplateEditorLang("pt");
    setTemplateTab("edit");
    setShowTemplateDialog(true);
  };

  const handleSaveTemplate = () => {
    if (!editingTemplate) return;
    saveTemplateMutation.mutate({
      type: editingTemplate.type,
      subjectPt: editingTemplate.subjectPt,
      subjectEn: editingTemplate.subjectEn,
      htmlPt: editingTemplate.htmlPt,
      htmlEn: editingTemplate.htmlEn,
      description: editingTemplate.description,
    });
  };

  const handleSendTest = () => {
    if (!selectedTemplateType || !testEmail) return;
    sendTestMutation.mutate({ templateType: selectedTemplateType, targetEmail: testEmail, locale: testLocale, targetUserId: selectedUserId || undefined });
  };

  const existingTemplateTypes = templates?.map((t) => t.type) || [];

  const currentHtml = editingTemplate ? (templateEditorLang === "pt" ? editingTemplate.htmlPt : editingTemplate.htmlEn) : "";
  const previewHtml = applyPreviewVars(currentHtml);

  const getRetryCount = (email: EmailLog) => {
    const meta = email.metadata as Record<string, any> | null;
    return meta?.retryCount ?? 0;
  };

  const isRetry = (email: EmailLog) => {
    const meta = email.metadata as Record<string, any> | null;
    return !!meta?.isRetry;
  };

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold" data-testid="text-page-title">
              {isPt ? "E-mails" : "Emails"}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isPt ? "Histórico de envios e gerenciamento de templates" : "Send history and template management"}
            </p>
          </div>
          <Button onClick={() => setShowTestDialog(true)} data-testid="button-send-test-email">
            <Send className="w-4 h-4 mr-2" />
            {isPt ? "Enviar Teste" : "Send Test"}
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <Send className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{isPt ? "Total Enviados" : "Total Sent"}</p>
                  {statsLoading ? <Skeleton className="h-7 w-16" /> : (
                    <p className="text-2xl font-bold" data-testid="text-total-sent">{stats?.totalSent ?? 0}</p>
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
                  <p className="text-sm text-muted-foreground">{isPt ? "Com Falha" : "Failed"}</p>
                  {statsLoading ? <Skeleton className="h-7 w-16" /> : (
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400" data-testid="text-total-failed">{stats?.totalFailed ?? 0}</p>
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
                  <p className="text-sm text-muted-foreground">{isPt ? "Últimas 24h" : "Last 24h"}</p>
                  {statsLoading ? <Skeleton className="h-7 w-16" /> : (
                    <p className="text-2xl font-bold" data-testid="text-last-24h">{stats?.last24Hours ?? 0}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${failureRate >= 30 ? "bg-red-100 dark:bg-red-900/30" : failureRate >= 10 ? "bg-yellow-100 dark:bg-yellow-900/30" : "bg-green-100 dark:bg-green-900/30"}`}>
                  <TrendingDown className={`w-5 h-5 ${failureRate >= 30 ? "text-red-600 dark:text-red-400" : failureRate >= 10 ? "text-yellow-600 dark:text-yellow-400" : "text-green-600 dark:text-green-400"}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{isPt ? "Taxa de Falha" : "Failure Rate"}</p>
                  {statsLoading ? <Skeleton className="h-7 w-16" /> : (
                    <p className={`text-2xl font-bold ${failureRate >= 30 ? "text-red-600 dark:text-red-400" : failureRate >= 10 ? "text-yellow-600 dark:text-yellow-400" : ""}`} data-testid="text-failure-rate">
                      {failureRate}%
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="history" data-testid="tab-history">
              <Mail className="w-4 h-4 mr-2" />
              {isPt ? "Histórico" : "History"}
            </TabsTrigger>
            <TabsTrigger value="templates" data-testid="tab-templates">
              <FileText className="w-4 h-4 mr-2" />
              Templates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="history" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <CardTitle className="text-base">{isPt ? "Histórico de Envios" : "Send History"}</CardTitle>
                  <div className="flex items-center gap-2">
                    {filtersActive && (
                      <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
                        <X className="w-3.5 h-3.5 mr-1" />
                        {isPt ? "Limpar" : "Clear"}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setOrderDir(orderDir === "newest" ? "oldest" : "newest")}
                      data-testid="button-toggle-order"
                    >
                      {orderDir === "newest"
                        ? <><SortDesc className="w-3.5 h-3.5 mr-1" />{isPt ? "Mais recentes" : "Newest"}</>
                        : <><SortAsc className="w-3.5 h-3.5 mr-1" />{isPt ? "Mais antigos" : "Oldest"}</>
                      }
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      placeholder={isPt ? "Buscar por email ou assunto…" : "Search by email or subject…"}
                      className="pl-8 h-8 text-sm"
                      data-testid="input-email-search"
                    />
                  </div>

                  <Select value={filterType} onValueChange={(v) => { setFilterType(v); setPage(1); }}>
                    <SelectTrigger className="w-44 h-8 text-sm" data-testid="select-email-type-filter">
                      <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                      <SelectValue placeholder={isPt ? "Tipo" : "Type"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{isPt ? "Todos os tipos" : "All types"}</SelectItem>
                      {EMAIL_TYPE_GROUPS.map((group) => (
                        <SelectGroup key={group.label}>
                          <SelectLabel>{group.label}</SelectLabel>
                          {group.types.map((type) => (
                            <SelectItem key={type} value={type}>{getTypeLabel(type)}</SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1); }}>
                    <SelectTrigger className="w-32 h-8 text-sm" data-testid="select-email-status-filter">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{isPt ? "Todos" : "All"}</SelectItem>
                      <SelectItem value="sent">{isPt ? "Enviados" : "Sent"}</SelectItem>
                      <SelectItem value="failed">{isPt ? "Falhas" : "Failed"}</SelectItem>
                    </SelectContent>
                  </Select>

                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                    className="w-36 h-8 text-sm"
                    title={isPt ? "Data inicial" : "Start date"}
                    data-testid="input-start-date"
                  />
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                    className="w-36 h-8 text-sm"
                    title={isPt ? "Data final" : "End date"}
                    data-testid="input-end-date"
                  />
                </div>
              </CardHeader>

              <CardContent>
                {emailsLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : emailsData?.logs?.length === 0 ? (
                  <div className="text-center py-14 text-muted-foreground">
                    <Mail className="w-10 h-10 mx-auto mb-3 opacity-25" />
                    <p className="text-sm font-medium mb-1">
                      {filtersActive
                        ? (isPt ? "Nenhum e-mail encontrado para estes filtros" : "No emails found for these filters")
                        : (isPt ? "Nenhum e-mail enviado ainda" : "No emails sent yet")}
                    </p>
                    {filtersActive && (
                      <Button variant="link" size="sm" onClick={clearFilters} className="text-xs mt-1">
                        {isPt ? "Limpar filtros" : "Clear filters"}
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{isPt ? "Destinatário" : "Recipient"}</TableHead>
                          <TableHead>{isPt ? "Assunto" : "Subject"}</TableHead>
                          <TableHead>{isPt ? "Tipo" : "Type"}</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>{isPt ? "Data" : "Date"}</TableHead>
                          <TableHead className="w-[90px]">{isPt ? "Ações" : "Actions"}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {emailsData?.logs?.map((email) => (
                          <TableRow key={email.id} data-testid={`row-email-${email.id}`}>
                            <TableCell className="font-medium text-sm">
                              <div className="flex items-center gap-1">
                                {email.toEmail}
                                {isRetry(email) && (
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <RotateCcw className="w-3 h-3 text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">
                                      {isPt ? `Reenvio #${getRetryCount(email)}` : `Retry #${getRetryCount(email)}`}
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                              {email.subject}
                            </TableCell>
                            <TableCell>
                              <Badge variant={getTypeBadgeVariant(email.type)} className="text-xs whitespace-nowrap">
                                {getTypeLabel(email.type)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {email.status === "sent" ? (
                                <Badge variant="outline" className="text-green-600 border-green-600 text-xs gap-1">
                                  <CheckCircle className="w-3 h-3" />
                                  {isPt ? "Enviado" : "Sent"}
                                </Badge>
                              ) : (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="destructive" className="text-xs gap-1 cursor-help">
                                      <XCircle className="w-3 h-3" />
                                      {isPt ? "Falha" : "Failed"}
                                      {(email as any).errorMessage && <AlertCircle className="w-3 h-3 ml-0.5" />}
                                    </Badge>
                                  </TooltipTrigger>
                                  {(email as any).errorMessage && (
                                    <TooltipContent side="top" className="max-w-xs text-xs">
                                      <p className="font-medium mb-1">{isPt ? "Motivo da falha:" : "Failure reason:"}</p>
                                      <p>{(email as any).errorMessage}</p>
                                    </TooltipContent>
                                  )}
                                </Tooltip>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {formatDate(email.createdAt)}
                            </TableCell>
                            <TableCell>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => retryMutation.mutate(email.id)}
                                    disabled={retryingId === email.id}
                                    data-testid={`button-retry-email-${email.id}`}
                                  >
                                    {retryingId === email.id
                                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      : <RotateCcw className="w-3.5 h-3.5" />
                                    }
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="text-xs">
                                  {isPt ? "Reenviar" : "Resend"}
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4 pt-4 border-t">
                        <p className="text-sm text-muted-foreground">
                          {isPt ? "Página" : "Page"} {page} {isPt ? "de" : "of"} {totalPages}
                          <span className="ml-2 text-xs">({emailsData?.total ?? 0} {isPt ? "no total" : "total"})</span>
                        </p>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} data-testid="button-prev-page">
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} data-testid="button-next-page">
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
                <div>
                  <CardTitle className="text-base">{isPt ? "Templates de E-mail" : "Email Templates"}</CardTitle>
                  <CardDescription className="mt-1 text-xs">
                    {isPt ? "Templates editados aqui afetam os e-mails automáticos reais." : "Templates edited here affect real automatic emails."}
                  </CardDescription>
                </div>
                {templates && templates.length < EMAIL_TYPES.length && (
                  <Button variant="outline" size="sm" onClick={() => seedTemplatesMutation.mutate()} disabled={seedTemplatesMutation.isPending} data-testid="button-seed-templates">
                    {seedTemplatesMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                    {isPt ? "Criar Templates Padrão" : "Create Default Templates"}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {templatesLoading ? (
                  <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : templates && templates.length === 0 ? (
                  <div className="text-center py-14 text-muted-foreground">
                    <FileText className="w-10 h-10 mx-auto mb-3 opacity-25" />
                    <p className="text-sm font-medium mb-1">{isPt ? "Nenhum template criado ainda" : "No templates created yet"}</p>
                    <p className="text-xs mb-4">{isPt ? "Clique em \"Criar Templates Padrão\" para começar" : "Click \"Create Default Templates\" to get started"}</p>
                    <Button size="sm" onClick={() => seedTemplatesMutation.mutate()} disabled={seedTemplatesMutation.isPending}>
                      <Plus className="w-4 h-4 mr-2" />
                      {isPt ? "Criar Templates Padrão" : "Create Default Templates"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {EMAIL_TYPE_GROUPS.map((group) => (
                      <div key={group.label}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{group.label}</p>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[200px]">{isPt ? "Tipo" : "Type"}</TableHead>
                              <TableHead>{isPt ? "Assunto (PT)" : "Subject (PT)"}</TableHead>
                              <TableHead>{isPt ? "Descrição" : "Description"}</TableHead>
                              <TableHead className="w-[140px]">{isPt ? "Última atualização" : "Last Updated"}</TableHead>
                              <TableHead className="w-[120px]">{isPt ? "Ações" : "Actions"}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.types.map((type) => {
                              const template = templates?.find((t) => t.type === type);
                              return (
                                <TableRow key={type} data-testid={`row-template-${type}`}>
                                  <TableCell>
                                    <Badge variant={getTypeBadgeVariant(type)} className="text-xs">{getTypeLabel(type)}</Badge>
                                  </TableCell>
                                  <TableCell className="max-w-[220px] truncate text-sm">
                                    {template?.subjectPt || <span className="text-muted-foreground italic text-xs">{isPt ? "sem template" : "no template"}</span>}
                                  </TableCell>
                                  <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                                    {template?.description || "—"}
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                    {template?.updatedAt ? formatDate(template.updatedAt) : "—"}
                                  </TableCell>
                                  <TableCell>
                                    {template ? (
                                      <Button variant="outline" size="sm" onClick={() => handleEditTemplate(template)} data-testid={`button-edit-template-${type}`}>
                                        <Edit className="w-3.5 h-3.5 mr-1" />
                                        {isPt ? "Editar" : "Edit"}
                                      </Button>
                                    ) : (
                                      <Button variant="outline" size="sm" onClick={() => handleNewTemplate(type)} data-testid={`button-create-template-${type}`}>
                                        <Plus className="w-3.5 h-3.5 mr-1" />
                                        {isPt ? "Criar" : "Create"}
                                      </Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ── Dialog: Editar / Criar Template ───────────────────────────── */}
        <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
          <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate?.id
                  ? (isPt ? "Editar Template" : "Edit Template")
                  : (isPt ? "Criar Template" : "Create Template")
                } — {getTypeLabel(editingTemplate?.type || "")}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {isPt ? "Templates editados aqui afetam os e-mails automáticos enviados aos usuários." : "Templates edited here affect real automated emails sent to users."}
              </DialogDescription>
            </DialogHeader>

            {editingTemplate && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{isPt ? "Assunto (PT)" : "Subject (PT)"}</Label>
                    <Input value={editingTemplate.subjectPt} onChange={(e) => setEditingTemplate({ ...editingTemplate, subjectPt: e.target.value })} data-testid="input-subject-pt" />
                  </div>
                  <div className="space-y-2">
                    <Label>{isPt ? "Assunto (EN)" : "Subject (EN)"}</Label>
                    <Input value={editingTemplate.subjectEn} onChange={(e) => setEditingTemplate({ ...editingTemplate, subjectEn: e.target.value })} data-testid="input-subject-en" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{isPt ? "Descrição interna" : "Internal description"}</Label>
                  <Input
                    value={editingTemplate.description || ""}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, description: e.target.value })}
                    placeholder={isPt ? "Para que serve este template..." : "What this template is for..."}
                    data-testid="input-description"
                  />
                </div>

                {/* Available variables */}
                {TEMPLATE_VARIABLES[editingTemplate.type] && (
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Code2 className="w-3.5 h-3.5 text-muted-foreground" />
                      <p className="text-xs font-medium text-muted-foreground">{isPt ? "Variáveis disponíveis para este tipo:" : "Available variables for this type:"}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {TEMPLATE_VARIABLES[editingTemplate.type].map((v) => (
                        <code key={v} className="text-xs bg-background border rounded px-1.5 py-0.5 text-primary font-mono">{v}</code>
                      ))}
                    </div>
                  </div>
                )}

                {/* Language + edit/preview tabs */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <Button
                        variant={templateEditorLang === "pt" ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setTemplateEditorLang("pt")}
                        data-testid="button-lang-pt"
                      >
                        PT
                      </Button>
                      <Button
                        variant={templateEditorLang === "en" ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setTemplateEditorLang("en")}
                        data-testid="button-lang-en"
                      >
                        EN
                      </Button>
                    </div>
                    <div className="flex gap-1 ml-auto">
                      <Button
                        variant={templateTab === "edit" ? "secondary" : "ghost"}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setTemplateTab("edit")}
                        data-testid="button-tab-edit"
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        {isPt ? "Editar" : "Edit"}
                      </Button>
                      <Button
                        variant={templateTab === "preview" ? "secondary" : "ghost"}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setTemplateTab("preview")}
                        data-testid="button-tab-preview"
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        Preview
                      </Button>
                    </div>
                  </div>

                  {templateTab === "edit" ? (
                    <Textarea
                      value={templateEditorLang === "pt" ? editingTemplate.htmlPt : editingTemplate.htmlEn}
                      onChange={(e) =>
                        setEditingTemplate(
                          templateEditorLang === "pt"
                            ? { ...editingTemplate, htmlPt: e.target.value }
                            : { ...editingTemplate, htmlEn: e.target.value }
                        )
                      }
                      rows={16}
                      className="font-mono text-xs"
                      data-testid={`textarea-html-${templateEditorLang}`}
                    />
                  ) : (
                    <div className="border rounded-md overflow-hidden" style={{ height: 420 }}>
                      {currentHtml ? (
                        <iframe
                          sandbox="allow-same-origin"
                          srcDoc={previewHtml}
                          className="w-full h-full bg-white"
                          title="Email preview"
                          data-testid="iframe-email-preview"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                          <div className="text-center">
                            <Eye className="w-8 h-8 mx-auto mb-2 opacity-25" />
                            <p>{isPt ? "Adicione HTML para ver o preview" : "Add HTML to see the preview"}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {templateTab === "preview"
                      ? (isPt ? "Preview com dados fictícios. As variáveis {{...}} são substituídas automaticamente." : "Preview with sample data. Variables {{...}} are replaced automatically.")
                      : (isPt ? "HTML completo do e-mail. Use as variáveis acima para personalizar." : "Full email HTML. Use the variables above to personalize.")}
                  </p>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>
                {isPt ? "Cancelar" : "Cancel"}
              </Button>
              <Button onClick={handleSaveTemplate} disabled={saveTemplateMutation.isPending} data-testid="button-save-template">
                {saveTemplateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isPt ? "Salvar Template" : "Save Template"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Dialog: Enviar Teste ──────────────────────────────────────── */}
        <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isPt ? "Enviar E-mail de Teste" : "Send Test Email"}</DialogTitle>
              <DialogDescription>
                {isPt ? "O e-mail de teste aparece no histórico (email_logs)" : "Test emails appear in the send history (email_logs)"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{isPt ? "Template" : "Template"}</Label>
                <Select value={selectedTemplateType} onValueChange={setSelectedTemplateType}>
                  <SelectTrigger data-testid="select-test-template">
                    <SelectValue placeholder={isPt ? "Selecionar template..." : "Select template..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {EMAIL_TYPE_GROUPS.map((group) => {
                      const groupTypes = group.types.filter((t) => existingTemplateTypes.includes(t));
                      if (groupTypes.length === 0) return null;
                      return (
                        <SelectGroup key={group.label}>
                          <SelectLabel>{group.label}</SelectLabel>
                          {groupTypes.map((type) => (
                            <SelectItem key={type} value={type}>{getTypeLabel(type)}</SelectItem>
                          ))}
                        </SelectGroup>
                      );
                    })}
                  </SelectContent>
                </Select>
                {existingTemplateTypes.length === 0 && (
                  <p className="text-xs text-muted-foreground">{isPt ? "Crie um template primeiro na aba Templates" : "Create a template first in the Templates tab"}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  {isPt ? "Buscar usuário" : "Search user"}
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder={isPt ? "Email ou nome..." : "Email or name..."}
                    className="pl-9"
                    data-testid="input-user-search"
                  />
                </div>
                {userSearch && filteredUsers.length > 0 && (
                  <div className="border rounded-md max-h-32 overflow-y-auto">
                    {filteredUsers.slice(0, 5).map((user) => (
                      <div
                        key={user.id}
                        className="px-3 py-2 hover:bg-accent cursor-pointer text-sm border-b last:border-b-0"
                        onClick={() => { setSelectedUserId(user.id); setTestEmail(user.email); setUserSearch(""); }}
                        data-testid={`button-select-user-${user.id}`}
                      >
                        <div className="font-medium">{user.email}</div>
                        {user.firstName && <div className="text-muted-foreground text-xs">{user.firstName}</div>}
                      </div>
                    ))}
                  </div>
                )}
                {userSearch && filteredUsers.length === 0 && (
                  <p className="text-xs text-muted-foreground">{isPt ? "Nenhum usuário encontrado" : "No users found"}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>{isPt ? "E-mail destino" : "Destination email"}</Label>
                <Input
                  type="email"
                  value={testEmail}
                  onChange={(e) => { setTestEmail(e.target.value); setSelectedUserId(""); }}
                  placeholder="email@example.com"
                  data-testid="input-test-email"
                />
                <p className="text-xs text-muted-foreground">
                  {selectedUserId
                    ? (isPt ? `Usuário selecionado: ${testEmail}` : `Selected user: ${testEmail}`)
                    : (isPt ? "Selecione um usuário acima ou digite manualmente" : "Select a user above or type manually")}
                </p>
              </div>

              <div className="space-y-2">
                <Label>{isPt ? "Idioma do template" : "Template language"}</Label>
                <Select value={testLocale} onValueChange={(v) => setTestLocale(v as "pt" | "en")}>
                  <SelectTrigger data-testid="select-test-locale">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pt">Português</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowTestDialog(false)}>
                {isPt ? "Cancelar" : "Cancel"}
              </Button>
              <Button
                onClick={handleSendTest}
                disabled={sendTestMutation.isPending || !selectedTemplateType || !testEmail}
                data-testid="button-confirm-send-test"
              >
                {sendTestMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Send className="w-4 h-4 mr-2" />
                {isPt ? "Enviar" : "Send"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
