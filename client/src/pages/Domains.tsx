import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Domain, SharedDomain } from "@shared/schema";
import { 
  Plus, 
  MoreVertical, 
  Trash2, 
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Shield,
  Info,
  Share2,
  Power,
  PowerOff,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";

interface UserSharedDomainActivation {
  id: number;
  sharedDomainId: number;
  isActive: boolean;
  createdAt: string;
  sharedDomain: SharedDomain;
}

export default function Domains() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteDomain, setDeleteDomain] = useState<Domain | null>(null);
  const [subdomain, setSubdomain] = useState("");
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [showDnsInstructions, setShowDnsInstructions] = useState<string | null>(null);
  const [activatingSharedId, setActivatingSharedId] = useState<number | null>(null);
  const [deactivatingSharedId, setDeactivatingSharedId] = useState<number | null>(null);
  
  const platformDomain = window.location.hostname;

  const { data: domains = [], isLoading } = useQuery<Domain[]>({
    queryKey: ["/api/domains"],
  });

  // Shared domains queries
  const { data: availableSharedDomains = [], isLoading: isLoadingShared } = useQuery<SharedDomain[]>({
    queryKey: ["/api/shared-domains"],
  });

  const { data: userActivatedSharedDomains = [], isLoading: isLoadingActivated } = useQuery<UserSharedDomainActivation[]>({
    queryKey: ["/api/user/shared-domains"],
  });

  // Get list of activated shared domain IDs
  const activatedSharedDomainIds = new Set(userActivatedSharedDomains.map(a => a.sharedDomainId));

  const createMutation = useMutation({
    mutationFn: async (subdomain: string) => {
      const res = await apiRequest("POST", "/api/domains", { subdomain });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Error adding domain");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/domains"] });
      setIsCreateOpen(false);
      setShowDnsInstructions(subdomain);
      setSubdomain("");
      toast({
        title: t("common.success"),
        description: language === "pt-BR" ? "Domínio adicionado" : "Domain added",
      });
    },
    onError: (error: Error) => {
      let errorMessage = language === "pt-BR" ? "Erro ao adicionar domínio" : "Error adding domain";
      let errorTitle = t("common.error");
      
      if (error.message.includes("already exists")) {
        errorMessage = language === "pt-BR" 
          ? "Este domínio já está cadastrado." 
          : "This domain already exists.";
      } else if (error.message.includes("suspended") || error.message.includes("USER_SUSPENDED")) {
        errorTitle = language === "pt-BR" ? "Conta Suspensa" : "Account Suspended";
        errorMessage = language === "pt-BR" 
          ? "Sua conta está suspensa. Atualize seu plano para continuar." 
          : "Your account is suspended. Please upgrade your plan to continue.";
      } else if (error.message.includes("active plan") || error.message.includes("NO_ACTIVE_PLAN")) {
        errorTitle = language === "pt-BR" ? "Plano Necessário" : "Plan Required";
        errorMessage = language === "pt-BR" 
          ? "Você precisa de um plano ativo para adicionar domínios." 
          : "You need an active plan to add domains.";
      } else if (error.message.includes("maximum number of domains") || error.message.includes("DOMAIN_LIMIT_REACHED")) {
        errorTitle = language === "pt-BR" ? "Limite de Domínios Atingido" : "Domain Limit Reached";
        errorMessage = language === "pt-BR" 
          ? "Você atingiu o limite máximo de domínios do seu plano. Atualize seu plano para adicionar mais domínios." 
          : "You have reached the maximum domain limit for your plan. Upgrade your plan to add more domains.";
      }
      
      toast({
        title: errorTitle,
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (id: number) => {
      setVerifyingId(id);
      const res = await apiRequest("POST", `/api/domains/${id}/verify`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Verification failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/domains"] });
      setVerifyingId(null);
      toast({
        title: t("common.success"),
        description: language === "pt-BR" 
          ? "DNS verificado com sucesso! Domínio ativo." 
          : "DNS verified successfully! Domain active.",
      });
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/domains"] });
      setVerifyingId(null);
      
      const errorMessages: Record<string, { pt: string; en: string }> = {
        "No CNAME record configured for this domain": {
          pt: "Registro CNAME não encontrado. Configure o DNS no seu provedor.",
          en: "CNAME record not found. Configure DNS at your provider."
        },
        "Domain not found - DNS not configured": {
          pt: "Domínio não encontrado. Verifique se o DNS foi configurado corretamente.",
          en: "Domain not found. Check if DNS was configured correctly."
        },
        "DNS server error - try again later": {
          pt: "Erro no servidor DNS. Tente novamente mais tarde.",
          en: "DNS server error. Try again later."
        },
        "No CNAME record found": {
          pt: "Registro CNAME não encontrado. Configure o apontamento DNS.",
          en: "CNAME record not found. Configure DNS pointing."
        }
      };
      
      const translated = errorMessages[error.message];
      const description = translated 
        ? (language === "pt-BR" ? translated.pt : translated.en)
        : (language === "pt-BR" 
            ? `Verificação falhou: ${error.message}` 
            : `Verification failed: ${error.message}`);
      
      toast({
        title: language === "pt-BR" ? "DNS não verificado" : "DNS not verified",
        description,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/domains/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/domains"] });
      setDeleteDomain(null);
      toast({
        title: t("common.success"),
        description: language === "pt-BR" ? "Domínio excluído" : "Domain deleted",
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: language === "pt-BR" ? "Erro ao excluir domínio" : "Error deleting domain",
        variant: "destructive",
      });
    },
  });

  // Activate shared domain mutation
  const activateSharedMutation = useMutation({
    mutationFn: async (sharedDomainId: number) => {
      setActivatingSharedId(sharedDomainId);
      const res = await apiRequest("POST", `/api/user/shared-domains/${sharedDomainId}/activate`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || errorData.code || "Error activating shared domain");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/shared-domains"] });
      queryClient.invalidateQueries({ queryKey: ["/api/domains"] });
      setActivatingSharedId(null);
      toast({
        title: t("common.success"),
        description: language === "pt-BR" ? "Domínio compartilhado ativado" : "Shared domain activated",
      });
    },
    onError: (error: Error) => {
      setActivatingSharedId(null);
      let errorMessage = language === "pt-BR" ? "Erro ao ativar domínio" : "Error activating domain";
      
      if (error.message.includes("DOMAIN_LIMIT_REACHED") || error.message.includes("Maximum number of domains")) {
        errorMessage = language === "pt-BR"
          ? "Limite de domínios atingido. Atualize seu plano para adicionar mais."
          : "Domain limit reached. Upgrade your plan to add more.";
      } else if (error.message.includes("USER_SUSPENDED") || error.message.includes("suspended")) {
        errorMessage = language === "pt-BR"
          ? "Conta suspensa. Atualize seu plano para continuar."
          : "Account suspended. Update your plan to continue.";
      } else if (error.message.includes("NO_ACTIVE_PLAN") || error.message.includes("active plan")) {
        errorMessage = language === "pt-BR"
          ? "Você precisa de um plano ativo para ativar domínios."
          : "You need an active plan to activate domains.";
      }
      
      toast({
        title: t("common.error"),
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Deactivate shared domain mutation
  const deactivateSharedMutation = useMutation({
    mutationFn: async (sharedDomainId: number) => {
      setDeactivatingSharedId(sharedDomainId);
      const res = await apiRequest("DELETE", `/api/user/shared-domains/${sharedDomainId}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Error deactivating shared domain");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/shared-domains"] });
      queryClient.invalidateQueries({ queryKey: ["/api/domains"] });
      setDeactivatingSharedId(null);
      toast({
        title: t("common.success"),
        description: language === "pt-BR" ? "Domínio compartilhado desativado" : "Shared domain deactivated",
      });
    },
    onError: () => {
      setDeactivatingSharedId(null);
      toast({
        title: t("common.error"),
        description: language === "pt-BR" ? "Erro ao desativar domínio" : "Error deactivating domain",
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (domain: Domain) => {
    if (!domain.isActive) {
      return (
        <Badge variant="secondary">
          <XCircle className="w-3 h-3 mr-1" />
          {t("offers.inactive")}
        </Badge>
      );
    }
    if (domain.isVerified) {
      return (
        <Badge variant="default" className="bg-green-600">
          <CheckCircle className="w-3 h-3 mr-1" />
          {t("domains.verified")}
        </Badge>
      );
    }
    if (domain.lastVerificationError) {
      return (
        <Badge variant="destructive">
          <AlertTriangle className="w-3 h-3 mr-1" />
          {t("domains.error")}
        </Badge>
      );
    }
    return (
      <Badge variant="secondary">
        <Clock className="w-3 h-3 mr-1" />
        {t("domains.pending")}
      </Badge>
    );
  };

  const getSslBadge = (domain: Domain) => {
    if (domain.sslStatus === "active") {
      return (
        <Badge variant="default" className="bg-green-600">
          <Shield className="w-3 h-3 mr-1" />
          SSL
        </Badge>
      );
    }
    if (domain.sslStatus === "pending") {
      return (
        <Badge variant="secondary">
          <Clock className="w-3 h-3 mr-1" />
          SSL {t("domains.pending")}
        </Badge>
      );
    }
    return (
      <Badge variant="destructive">
        <XCircle className="w-3 h-3 mr-1" />
        SSL {t("domains.error")}
      </Badge>
    );
  };

  const domainsWithErrors = domains.filter(d => d.lastVerificationError && d.isActive);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold" data-testid="title-domains">
          {t("domains.title")}
        </h1>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-domain">
              <Plus className="w-4 h-4 mr-2" />
              {t("domains.add")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("domains.add")}</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate(subdomain);
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="subdomain">{t("domains.subdomain")}</Label>
                <Input
                  id="subdomain"
                  value={subdomain}
                  onChange={(e) => setSubdomain(e.target.value.toLowerCase())}
                  placeholder="teste.seudominio.com"
                  required
                  data-testid="input-subdomain"
                />
                <p className="text-xs text-muted-foreground">
                  {language === "pt-BR"
                    ? "Ex: teste.seudominio.com - Aponte o subdomínio para este servidor"
                    : "Ex: test.yourdomain.com - Point the subdomain to this server"}
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                  data-testid="button-cancel-domain"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  data-testid="button-save-domain"
                >
                  {createMutation.isPending ? t("common.loading") : t("common.save")}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {domainsWithErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {language === "pt-BR"
              ? `${domainsWithErrors.length} domínio(s) com problemas de verificação`
              : `${domainsWithErrors.length} domain(s) with verification issues`}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : domains.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              {t("domains.noDomains")}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("domains.subdomain")}</TableHead>
                  <TableHead>{t("domains.status")}</TableHead>
                  <TableHead>{t("domains.ssl")}</TableHead>
                  <TableHead>{t("domains.lastCheck")}</TableHead>
                  <TableHead className="w-12">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {domains.map((domain) => (
                  <TableRow key={domain.id} data-testid={`row-domain-${domain.id}`}>
                    <TableCell>
                      <div className="font-medium font-mono">{domain.subdomain}</div>
                      {domain.lastVerificationError && (
                        <div className="text-xs text-destructive mt-1">
                          {domain.lastVerificationError}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(domain)}</TableCell>
                    <TableCell>{getSslBadge(domain)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {domain.lastCheckedAt
                        ? formatDistanceToNow(new Date(domain.lastCheckedAt), {
                            addSuffix: true,
                            locale: language === "pt-BR" ? ptBR : enUS,
                          })
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            data-testid={`button-domain-menu-${domain.id}`}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => setShowDnsInstructions(domain.subdomain)}
                            data-testid={`menu-dns-domain-${domain.id}`}
                          >
                            <Info className="w-4 h-4 mr-2" />
                            {language === "pt-BR" ? "Ver Apontamento DNS" : "View DNS Pointing"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => verifyMutation.mutate(domain.id)}
                            disabled={verifyingId === domain.id}
                            data-testid={`menu-verify-domain-${domain.id}`}
                          >
                            <RefreshCw
                              className={`w-4 h-4 mr-2 ${
                                verifyingId === domain.id ? "animate-spin" : ""
                              }`}
                            />
                            {verifyingId === domain.id
                              ? t("domains.verifying")
                              : t("domains.checkNow")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteDomain(domain)}
                            className="text-destructive"
                            data-testid={`menu-delete-domain-${domain.id}`}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {t("common.delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Shared Domains Section */}
      {availableSharedDomains.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Share2 className="w-5 h-5" />
            <CardTitle className="text-lg flex items-center gap-2">
              {language === "pt-BR" ? "Domínios Compartilhados" : "Shared Domains"}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-4 h-4 text-muted-foreground cursor-help" data-testid="icon-shared-domains-info" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="text-sm">
                    {language === "pt-BR"
                      ? "Domínios compartilhados são domínios disponibilizados pela plataforma que você pode ativar e usar nas suas ofertas sem precisar configurar seu próprio domínio. Eles contam no limite de domínios do seu plano."
                      : "Shared domains are domains provided by the platform that you can activate and use in your offers without needing to set up your own domain. They count towards your plan's domain limit."}
                  </p>
                </TooltipContent>
              </Tooltip>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoadingShared || isLoadingActivated ? (
              <div className="p-6 space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === "pt-BR" ? "Domínio" : "Domain"}</TableHead>
                    <TableHead>{t("domains.status")}</TableHead>
                    <TableHead className="w-32 text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {availableSharedDomains.map((sharedDomain) => {
                    const isActivated = activatedSharedDomainIds.has(sharedDomain.id);
                    const isActivating = activatingSharedId === sharedDomain.id;
                    const isDeactivating = deactivatingSharedId === sharedDomain.id;
                    
                    return (
                      <TableRow key={sharedDomain.id} data-testid={`row-shared-domain-${sharedDomain.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Share2 className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium font-mono">{sharedDomain.subdomain}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {isActivated ? (
                            <Badge variant="default" className="bg-green-600">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              {language === "pt-BR" ? "Ativo" : "Active"}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <XCircle className="w-3 h-3 mr-1" />
                              {language === "pt-BR" ? "Não Ativo" : "Not Active"}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {isActivated ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deactivateSharedMutation.mutate(sharedDomain.id)}
                              disabled={isDeactivating}
                              data-testid={`button-deactivate-shared-${sharedDomain.id}`}
                            >
                              {isDeactivating ? (
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              ) : (
                                <PowerOff className="w-4 h-4 mr-1" />
                              )}
                              {language === "pt-BR" ? "Desativar" : "Deactivate"}
                            </Button>
                          ) : (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => activateSharedMutation.mutate(sharedDomain.id)}
                              disabled={isActivating}
                              data-testid={`button-activate-shared-${sharedDomain.id}`}
                            >
                              {isActivating ? (
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              ) : (
                                <Power className="w-4 h-4 mr-1" />
                              )}
                              {language === "pt-BR" ? "Ativar" : "Activate"}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!showDnsInstructions} onOpenChange={(open) => !open && setShowDnsInstructions(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {language === "pt-BR" ? "Configurar Apontamento DNS" : "Configure DNS Pointing"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {language === "pt-BR"
                  ? "Para que seu domínio funcione, você precisa configurar o apontamento DNS no seu provedor de domínio."
                  : "For your domain to work, you need to configure DNS pointing at your domain provider."}
              </AlertDescription>
            </Alert>
            
            <div className="space-y-3">
              <div>
                <Label className="text-sm font-medium">
                  {language === "pt-BR" ? "Seu Subdomínio:" : "Your Subdomain:"}
                </Label>
                <div className="mt-1 p-2 bg-muted rounded-md font-mono text-sm">
                  {showDnsInstructions}
                </div>
              </div>
              
              <div>
                <Label className="text-sm font-medium">
                  {language === "pt-BR" ? "Tipo de Registro:" : "Record Type:"}
                </Label>
                <div className="mt-1 p-2 bg-muted rounded-md font-mono text-sm">
                  CNAME
                </div>
              </div>
              
              <div>
                <Label className="text-sm font-medium">
                  {language === "pt-BR" ? "Apontar Para (Destino):" : "Point To (Target):"}
                </Label>
                <div className="mt-1 p-2 bg-muted rounded-md font-mono text-sm break-all">
                  {platformDomain}
                </div>
              </div>
            </div>
            
            <div className="text-sm text-muted-foreground space-y-2">
              <p className="font-medium">
                {language === "pt-BR" ? "Instruções:" : "Instructions:"}
              </p>
              <ol className="list-decimal list-inside space-y-1">
                <li>
                  {language === "pt-BR"
                    ? "Acesse o painel de controle do seu provedor de domínio"
                    : "Access your domain provider's control panel"}
                </li>
                <li>
                  {language === "pt-BR"
                    ? "Vá para a seção de gerenciamento DNS"
                    : "Go to DNS management section"}
                </li>
                <li>
                  {language === "pt-BR"
                    ? "Adicione um registro CNAME com os valores acima"
                    : "Add a CNAME record with the values above"}
                </li>
                <li>
                  {language === "pt-BR"
                    ? "Aguarde a propagação DNS (pode levar até 48h)"
                    : "Wait for DNS propagation (can take up to 48h)"}
                </li>
                <li>
                  {language === "pt-BR"
                    ? "Clique em 'Verificar Agora' na tabela de domínios"
                    : "Click 'Check Now' on the domains table"}
                </li>
              </ol>
            </div>
            
            <div className="flex justify-end">
              <Button onClick={() => setShowDnsInstructions(null)} data-testid="button-close-dns-instructions">
                {language === "pt-BR" ? "Entendi" : "Got it"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteDomain} onOpenChange={(open) => !open && setDeleteDomain(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === "pt-BR" ? "Excluir domínio" : "Delete domain"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === "pt-BR"
                ? "Tem certeza que deseja excluir este domínio? Todas as ofertas associadas serão afetadas."
                : "Are you sure you want to delete this domain? All associated offers will be affected."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDomain && deleteMutation.mutate(deleteDomain.id)}
              className="bg-destructive text-destructive-foreground"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
