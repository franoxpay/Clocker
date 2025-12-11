import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Domain } from "@shared/schema";
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
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";

export default function Domains() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteDomain, setDeleteDomain] = useState<Domain | null>(null);
  const [subdomain, setSubdomain] = useState("");
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [showDnsInstructions, setShowDnsInstructions] = useState<string | null>(null);
  
  const platformDomain = window.location.hostname;

  const { data: domains = [], isLoading } = useQuery<Domain[]>({
    queryKey: ["/api/domains"],
  });

  const createMutation = useMutation({
    mutationFn: async (subdomain: string) => {
      const res = await apiRequest("POST", "/api/domains", { subdomain });
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
    onError: () => {
      toast({
        title: t("common.error"),
        description: language === "pt-BR" ? "Erro ao adicionar domínio" : "Error adding domain",
        variant: "destructive",
      });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (id: number) => {
      setVerifyingId(id);
      const res = await apiRequest("POST", `/api/domains/${id}/verify`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/domains"] });
      setVerifyingId(null);
      toast({
        title: t("common.success"),
        description: language === "pt-BR" ? "Verificação concluída" : "Verification completed",
      });
    },
    onError: () => {
      setVerifyingId(null);
      toast({
        title: t("common.error"),
        description: language === "pt-BR" ? "Erro na verificação" : "Verification error",
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
