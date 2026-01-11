import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Globe, Trash2, Search, History, AlertTriangle, User, Share2, Plus, Loader2, Copy, CheckCircle2, RefreshCw, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface SystemDomain {
  id: number;
  subdomain: string;
  type: 'user' | 'shared';
  ownerId: string | null;
  ownerEmail: string | null;
  ownerName: string | null;
  offersCount: number;
  createdAt: string;
}

interface RemovedDomain {
  id: number;
  subdomain: string;
  domainType: string;
  originalOwnerId: string | null;
  originalOwnerEmail: string | null;
  offersAffectedCount: number;
  removedBy: string;
  removalReason: string;
  createdAt: string;
}

export default function AdminDomains() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [domainToDelete, setDomainToDelete] = useState<SystemDomain | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [removalReason, setRemovalReason] = useState<string>("admin_action");
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const DNS_DESTINATION = "cleryon.com";

  const { data: domains, isLoading } = useQuery<SystemDomain[]>({
    queryKey: ["/api/admin/domains", typeFilter, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (searchTerm) params.set("search", searchTerm);
      const res = await fetch(`/api/admin/domains?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch domains");
      return res.json();
    },
  });

  const { data: historyData, isLoading: historyLoading } = useQuery<{ domains: RemovedDomain[]; total: number }>({
    queryKey: ["/api/admin/domains/history"],
    enabled: historyDialogOpen,
  });

  const createSharedDomainMutation = useMutation({
    mutationFn: async (subdomain: string) => {
      return apiRequest("POST", "/api/admin/shared-domains", { subdomain });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/domains"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shared-domains"] });
      setNewDomain("");
      toast({
        title: language === "pt-BR" ? "Sucesso" : "Success",
        description: language === "pt-BR" ? "Domínio compartilhado criado. Verifique o DNS para ativar." : "Shared domain created. Verify DNS to activate.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: language === "pt-BR" ? "Erro" : "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const verifyDomainMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/admin/shared-domains/${id}/verify`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/domains"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shared-domains"] });
      toast({
        title: language === "pt-BR" ? "Verificação concluída" : "Verification complete",
        description: language === "pt-BR" ? "Status do domínio atualizado" : "Domain status updated",
      });
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/domains"] });
      toast({
        title: language === "pt-BR" ? "Erro na verificação" : "Verification error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, type, reason }: { id: number; type: 'user' | 'shared'; reason: string }) => {
      const res = await apiRequest("DELETE", `/api/admin/domains/${id}?type=${type}&reason=${encodeURIComponent(reason)}`);
      return res.json() as Promise<{ affectedUsersCount: number; affectedOffersCount: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/domains"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/domains/history"] });
      setDeleteDialogOpen(false);
      setDomainToDelete(null);
      setConfirmInput("");
      setRemovalReason("admin_action");
      toast({
        title: language === "pt-BR" ? "Domínio Removido" : "Domain Removed",
        description: language === "pt-BR" 
          ? `${data.affectedOffersCount} ofertas afetadas, ${data.affectedUsersCount} usuários notificados` 
          : `${data.affectedOffersCount} offers affected, ${data.affectedUsersCount} users notified`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: language === "pt-BR" ? "Erro" : "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDeleteClick = (domain: SystemDomain) => {
    setDomainToDelete(domain);
    setConfirmInput("");
    setRemovalReason("admin_action");
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (domainToDelete && confirmInput === domainToDelete.subdomain) {
      deleteMutation.mutate({ id: domainToDelete.id, type: domainToDelete.type, reason: removalReason });
    }
  };

  const handleCreateSharedDomain = () => {
    if (!newDomain.trim()) return;
    createSharedDomainMutation.mutate(newDomain.trim().toLowerCase());
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), "dd/MM/yyyy HH:mm", { 
      locale: language === "pt-BR" ? ptBR : enUS 
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold" data-testid="text-page-title">
          {language === "pt-BR" ? "Gerenciamento de Domínios" : "Domain Management"}
        </h1>
        <Button 
          variant="outline" 
          onClick={() => setHistoryDialogOpen(true)}
          data-testid="button-view-history"
        >
          <History className="w-4 h-4 mr-2" />
          {language === "pt-BR" ? "Histórico" : "History"}
        </Button>
      </div>

      <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30">
        <Input
          placeholder={language === "pt-BR" ? "Adicionar domínio compartilhado (ex: app.seudominio.com)" : "Add shared domain (e.g., app.yourdomain.com)"}
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreateSharedDomain()}
          className="flex-1"
          data-testid="input-new-shared-domain"
        />
        <Button
          onClick={handleCreateSharedDomain}
          disabled={createSharedDomainMutation.isPending || !newDomain.trim()}
          data-testid="button-add-shared-domain"
        >
          {createSharedDomainMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Plus className="h-4 w-4 mr-2" />
          )}
          {language === "pt-BR" ? "Adicionar" : "Add"}
        </Button>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => handleCopy(DNS_DESTINATION, 'dns-tip')} data-testid="button-dns-info">
                {copiedField === 'dns-tip' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <Info className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p className="text-xs">
                {language === "pt-BR" 
                  ? `Configure CNAME apontando para ${DNS_DESTINATION}. O domínio ficará ativo após validação do SSL.`
                  : `Configure CNAME pointing to ${DNS_DESTINATION}. Domain will be active after SSL validation.`}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {language === "pt-BR" ? "Todos os Domínios do Sistema" : "All System Domains"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={language === "pt-BR" ? "Buscar por domínio..." : "Search by domain..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                data-testid="input-search-domain"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-type-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {language === "pt-BR" ? "Todos os Tipos" : "All Types"}
                </SelectItem>
                <SelectItem value="user">
                  {language === "pt-BR" ? "Domínios de Usuários" : "User Domains"}
                </SelectItem>
                <SelectItem value="shared">
                  {language === "pt-BR" ? "Domínios Compartilhados" : "Shared Domains"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : domains && domains.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === "pt-BR" ? "Domínio" : "Domain"}</TableHead>
                    <TableHead>{language === "pt-BR" ? "Tipo" : "Type"}</TableHead>
                    <TableHead>{language === "pt-BR" ? "Proprietário" : "Owner"}</TableHead>
                    <TableHead className="text-center">{language === "pt-BR" ? "Ofertas" : "Offers"}</TableHead>
                    <TableHead>{language === "pt-BR" ? "Criado em" : "Created"}</TableHead>
                    <TableHead className="text-right">{language === "pt-BR" ? "Ações" : "Actions"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {domains.map((domain) => (
                    <TableRow key={`${domain.type}-${domain.id}`} data-testid={`row-domain-${domain.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{domain.subdomain}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={domain.type === 'shared' ? 'secondary' : 'outline'}>
                          {domain.type === 'shared' ? (
                            <>
                              <Share2 className="w-3 h-3 mr-1" />
                              {language === "pt-BR" ? "Compartilhado" : "Shared"}
                            </>
                          ) : (
                            <>
                              <User className="w-3 h-3 mr-1" />
                              {language === "pt-BR" ? "Usuário" : "User"}
                            </>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {domain.type === 'shared' ? (
                          <span className="text-muted-foreground">-</span>
                        ) : (
                          <div className="text-sm">
                            <div>{domain.ownerName || "-"}</div>
                            <div className="text-muted-foreground text-xs">{domain.ownerEmail}</div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={domain.offersCount > 0 ? "default" : "secondary"}>
                          {domain.offersCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(domain.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {domain.type === 'shared' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => verifyDomainMutation.mutate(domain.id)}
                              disabled={verifyDomainMutation.isPending}
                              data-testid={`button-verify-domain-${domain.id}`}
                            >
                              {verifyDomainMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <RefreshCw className="w-4 h-4" />
                              )}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteClick(domain)}
                            className="text-destructive hover:text-destructive"
                            data-testid={`button-delete-domain-${domain.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Globe className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{language === "pt-BR" ? "Nenhum domínio encontrado" : "No domains found"}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              {language === "pt-BR" ? "Remover Domínio" : "Remove Domain"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                {language === "pt-BR" 
                  ? `Você está prestes a remover permanentemente o domínio "${domainToDelete?.subdomain}".` 
                  : `You are about to permanently remove the domain "${domainToDelete?.subdomain}".`}
              </p>
              {domainToDelete && domainToDelete.offersCount > 0 && (
                <div className="p-3 bg-destructive/10 rounded-md">
                  <p className="text-destructive font-medium">
                    {language === "pt-BR" 
                      ? `${domainToDelete.offersCount} oferta(s) serão afetadas e pararão de funcionar.` 
                      : `${domainToDelete.offersCount} offer(s) will be affected and will stop working.`}
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {language === "pt-BR" ? "Motivo da remoção:" : "Removal reason:"}
                </p>
                <Select value={removalReason} onValueChange={setRemovalReason}>
                  <SelectTrigger data-testid="select-removal-reason">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin_action">
                      {language === "pt-BR" ? "Ação administrativa" : "Admin action"}
                    </SelectItem>
                    <SelectItem value="phishing">
                      {language === "pt-BR" ? "Denúncia de phishing" : "Phishing complaint"}
                    </SelectItem>
                    <SelectItem value="abuse">
                      {language === "pt-BR" ? "Uso abusivo" : "Abuse"}
                    </SelectItem>
                    <SelectItem value="user_request">
                      {language === "pt-BR" ? "Solicitação do usuário" : "User request"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm">
                {language === "pt-BR" 
                  ? "Digite o nome do domínio para confirmar:" 
                  : "Type the domain name to confirm:"}
              </p>
              <Input
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder={domainToDelete?.subdomain}
                data-testid="input-confirm-domain"
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmInput("")} data-testid="button-cancel-delete">
              {language === "pt-BR" ? "Cancelar" : "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={confirmInput !== domainToDelete?.subdomain || deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending 
                ? (language === "pt-BR" ? "Removendo..." : "Removing...") 
                : (language === "pt-BR" ? "Remover" : "Remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {language === "pt-BR" ? "Histórico de Domínios Removidos" : "Removed Domains History"}
            </DialogTitle>
            <DialogDescription>
              {language === "pt-BR" 
                ? "Lista de todos os domínios que foram removidos do sistema" 
                : "List of all domains that were removed from the system"}
            </DialogDescription>
          </DialogHeader>
          
          {historyLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : historyData && historyData.domains.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === "pt-BR" ? "Domínio" : "Domain"}</TableHead>
                  <TableHead>{language === "pt-BR" ? "Tipo" : "Type"}</TableHead>
                  <TableHead>{language === "pt-BR" ? "Proprietário Original" : "Original Owner"}</TableHead>
                  <TableHead className="text-center">{language === "pt-BR" ? "Ofertas Afetadas" : "Offers Affected"}</TableHead>
                  <TableHead>{language === "pt-BR" ? "Removido em" : "Removed"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyData.domains.map((domain) => (
                  <TableRow key={domain.id}>
                    <TableCell className="font-medium">{domain.subdomain}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {domain.domainType === 'shared' 
                          ? (language === "pt-BR" ? "Compartilhado" : "Shared")
                          : (language === "pt-BR" ? "Usuário" : "User")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {domain.originalOwnerEmail || "-"}
                    </TableCell>
                    <TableCell className="text-center">{domain.offersAffectedCount}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(domain.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{language === "pt-BR" ? "Nenhum domínio foi removido ainda" : "No domains have been removed yet"}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
