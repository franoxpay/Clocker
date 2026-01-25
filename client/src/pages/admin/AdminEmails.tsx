import { useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { Mail, CheckCircle, XCircle, Clock, ChevronLeft, ChevronRight, Send, FileText, Edit, Eye, Loader2 } from "lucide-react";
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

const EMAIL_TYPES = [
  "welcome",
  "subscription",
  "domain_inactive",
  "shared_domain_inactive",
  "plan_limit",
  "notification",
  "password_reset",
];

export default function AdminEmails() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState("all");
  const [activeTab, setActiveTab] = useState("history");
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [selectedTemplateType, setSelectedTemplateType] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [testLocale, setTestLocale] = useState<"pt" | "en">("pt");
  const limit = 20;

  const t = (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      "admin.emails": { "pt-BR": "E-mails", en: "Emails" },
      "admin.emailHistory": { "pt-BR": "Histórico de E-mails", en: "Email History" },
      "admin.templates": { "pt-BR": "Templates", en: "Templates" },
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
      "admin.editTemplate": { "pt-BR": "Editar Template", en: "Edit Template" },
      "admin.createTemplate": { "pt-BR": "Criar Template", en: "Create Template" },
      "admin.subjectPt": { "pt-BR": "Assunto (PT)", en: "Subject (PT)" },
      "admin.subjectEn": { "pt-BR": "Assunto (EN)", en: "Subject (EN)" },
      "admin.htmlPt": { "pt-BR": "HTML (PT)", en: "HTML (PT)" },
      "admin.htmlEn": { "pt-BR": "HTML (EN)", en: "HTML (EN)" },
      "admin.description": { "pt-BR": "Descrição", en: "Description" },
      "admin.save": { "pt-BR": "Salvar", en: "Save" },
      "admin.cancel": { "pt-BR": "Cancelar", en: "Cancel" },
      "admin.sendTest": { "pt-BR": "Enviar Teste", en: "Send Test" },
      "admin.testEmail": { "pt-BR": "E-mail de Teste", en: "Test Email" },
      "admin.selectTemplate": { "pt-BR": "Selecionar Template", en: "Select Template" },
      "admin.noTemplates": { "pt-BR": "Nenhum template encontrado", en: "No templates found" },
      "admin.templateSaved": { "pt-BR": "Template salvo com sucesso", en: "Template saved successfully" },
      "admin.testSent": { "pt-BR": "E-mail de teste enviado", en: "Test email sent" },
      "admin.actions": { "pt-BR": "Ações", en: "Actions" },
      "admin.lastUpdated": { "pt-BR": "Última atualização", en: "Last Updated" },
      "admin.placeholders": { "pt-BR": "Variáveis disponíveis: {{name}}, {{firstName}}, {{email}}, {{planName}}, {{domain}}, {{limitType}}, {{currentUsage}}, {{limit}}", en: "Available variables: {{name}}, {{firstName}}, {{email}}, {{planName}}, {{domain}}, {{limitType}}, {{currentUsage}}, {{limit}}" },
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

  const { data: templates, isLoading: templatesLoading } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/admin/emails/templates"],
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (template: Partial<EmailTemplate>) => {
      return apiRequest("POST", "/api/admin/emails/templates", template);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/emails/templates"] });
      setShowTemplateDialog(false);
      setEditingTemplate(null);
      toast({ title: t("admin.templateSaved") });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const sendTestMutation = useMutation({
    mutationFn: async ({ templateType, targetEmail, locale }: { templateType: string; targetEmail: string; locale: "pt" | "en" }) => {
      return apiRequest("POST", "/api/admin/emails/send-test", { templateType, targetEmail, locale });
    },
    onSuccess: () => {
      setShowTestDialog(false);
      setTestEmail("");
      setSelectedTemplateType("");
      setTestLocale("pt");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/emails"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/emails/stats"] });
      toast({ title: t("admin.testSent") });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const totalPages = emailsData ? Math.ceil(emailsData.total / limit) : 1;

  const formatDate = (date: string | Date) => {
    const d = new Date(date);
    return format(d, "dd/MM/yyyy HH:mm", { locale: language === "pt-BR" ? ptBR : enUS });
  };

  const handleEditTemplate = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setShowTemplateDialog(true);
  };

  const handleNewTemplate = (type: string) => {
    setEditingTemplate({
      id: 0,
      type,
      subjectPt: "",
      subjectEn: "",
      htmlPt: "",
      htmlEn: "",
      description: null,
      updatedAt: new Date(),
    });
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
    sendTestMutation.mutate({ templateType: selectedTemplateType, targetEmail: testEmail, locale: testLocale });
  };

  const existingTemplateTypes = templates?.map(t => t.type) || [];

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
        <Button onClick={() => setShowTestDialog(true)} data-testid="button-send-test-email">
          <Send className="w-4 h-4 mr-2" />
          {t("admin.sendTest")}
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="history" data-testid="tab-history">
            <Mail className="w-4 h-4 mr-2" />
            {t("admin.emailHistory")}
          </TabsTrigger>
          <TabsTrigger value="templates" data-testid="tab-templates">
            <FileText className="w-4 h-4 mr-2" />
            {t("admin.templates")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-4">
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
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("admin.templates")}</CardTitle>
              <CardDescription>{t("admin.placeholders")}</CardDescription>
            </CardHeader>
            <CardContent>
              {templatesLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("admin.type")}</TableHead>
                      <TableHead>{t("admin.subject")}</TableHead>
                      <TableHead>{t("admin.description")}</TableHead>
                      <TableHead>{t("admin.lastUpdated")}</TableHead>
                      <TableHead>{t("admin.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {EMAIL_TYPES.map((type) => {
                      const template = templates?.find(t => t.type === type);
                      return (
                        <TableRow key={type} data-testid={`row-template-${type}`}>
                          <TableCell>
                            <Badge variant={getTypeBadgeVariant(type)}>
                              {getTypeLabel(type)}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {template?.subjectPt || "-"}
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-muted-foreground">
                            {template?.description || "-"}
                          </TableCell>
                          <TableCell>
                            {template?.updatedAt ? formatDate(template.updatedAt) : "-"}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {template ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditTemplate(template)}
                                  data-testid={`button-edit-template-${type}`}
                                >
                                  <Edit className="w-4 h-4 mr-1" />
                                  {t("admin.editTemplate")}
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleNewTemplate(type)}
                                  data-testid={`button-create-template-${type}`}
                                >
                                  <FileText className="w-4 h-4 mr-1" />
                                  {t("admin.createTemplate")}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate?.id ? t("admin.editTemplate") : t("admin.createTemplate")} - {getTypeLabel(editingTemplate?.type || "")}
            </DialogTitle>
            <DialogDescription>{t("admin.placeholders")}</DialogDescription>
          </DialogHeader>
          {editingTemplate && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("admin.subjectPt")}</Label>
                  <Input
                    value={editingTemplate.subjectPt}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, subjectPt: e.target.value })}
                    data-testid="input-subject-pt"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("admin.subjectEn")}</Label>
                  <Input
                    value={editingTemplate.subjectEn}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, subjectEn: e.target.value })}
                    data-testid="input-subject-en"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("admin.description")}</Label>
                <Input
                  value={editingTemplate.description || ""}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, description: e.target.value })}
                  data-testid="input-description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("admin.htmlPt")}</Label>
                  <Textarea
                    value={editingTemplate.htmlPt}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, htmlPt: e.target.value })}
                    rows={12}
                    className="font-mono text-sm"
                    data-testid="textarea-html-pt"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("admin.htmlEn")}</Label>
                  <Textarea
                    value={editingTemplate.htmlEn}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, htmlEn: e.target.value })}
                    rows={12}
                    className="font-mono text-sm"
                    data-testid="textarea-html-en"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>
              {t("admin.cancel")}
            </Button>
            <Button onClick={handleSaveTemplate} disabled={saveTemplateMutation.isPending} data-testid="button-save-template">
              {saveTemplateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("admin.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.sendTest")}</DialogTitle>
            <DialogDescription>
              {language === "pt-BR" 
                ? "Envie um e-mail de teste para verificar o template" 
                : "Send a test email to verify the template"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("admin.selectTemplate")}</Label>
              <Select value={selectedTemplateType} onValueChange={setSelectedTemplateType}>
                <SelectTrigger data-testid="select-test-template">
                  <SelectValue placeholder={t("admin.selectTemplate")} />
                </SelectTrigger>
                <SelectContent>
                  {existingTemplateTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {getTypeLabel(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {existingTemplateTypes.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {language === "pt-BR" 
                    ? "Crie um template primeiro na aba Templates" 
                    : "Create a template first in the Templates tab"}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t("admin.testEmail")}</Label>
              <Input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="email@example.com"
                data-testid="input-test-email"
              />
            </div>
            <div className="space-y-2">
              <Label>{language === "pt-BR" ? "Idioma do Template" : "Template Language"}</Label>
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
              {t("admin.cancel")}
            </Button>
            <Button
              onClick={handleSendTest}
              disabled={sendTestMutation.isPending || !selectedTemplateType || !testEmail}
              data-testid="button-confirm-send-test"
            >
              {sendTestMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Send className="w-4 h-4 mr-2" />
              {t("admin.sendTest")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
