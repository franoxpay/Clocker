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
import { Globe, Trash2, Search, History, AlertTriangle, User, Share2, Plus, Loader2, Copy, CheckCircle2, RefreshCw, Info, CheckSquare } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
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
  isActive: boolean;
  isVerified: boolean;
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
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteStep, setBulkDeleteStep] = useState<0 | 1 | 2>(0);
  const [bulkReason, setBulkReason] = useState<string>("admin_action");
  const [bulkConfirmInput, setBulkConfirmInput] = useState<string>("");

  const DNS_DESTINATION = "clerion.app";

  const domainKey = (d: SystemDomain) => `${d.type}-${d.id}`;

  const { data: domains, isLoading } = useQuery<SystemDomain[]>({
    queryKey: ["/api/admin/domains", typeFilter, searchTerm, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (searchTerm) params.set("search", searchTerm);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/admin/domains?${params.toString()}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch domains");
      return res.json();
    },
  });

  const { data: historyData, isLoading: historyLoading } = useQuery<{ domains: RemovedDomain[]; total: number }>({
    queryKey: ["/api/admin/domains/history"],
    enabled: historyDialogOpen,
  });

  interface InactiveSharedDomain {
    id: number;
    subdomain: string;
    lastCheckedAt: string | null;
    lastVerificationError: string | null;
    updatedAt: string;
  }

  const { data: inactiveSharedDomains } = useQuery<InactiveSharedDomain[]>({
    queryKey: ["/api/admin/shared-domains/inactive"],
  });

  const createSharedDomainMutation = useMutation({
    mutationFn: async (subdomain: string) => {
      return apiRequest("POST", "/api/admin/shared-domains", { subdomain });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/domains"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shared-domains"] });
      setNewDomain("");
      setAddDialogOpen(false);
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
    mutationFn: async ({ id, type }: { id: number; type: 'user' | 'shared' }) => {
      const endpoint = type === 'shared' 
        ? `/api/admin/shared-domains/${id}/verify`
        : `/api/admin/domains/${id}/verify`;
      const res = await apiRequest("POST", endpoint);
      return res.json() as Promise<{ verified: boolean; error: string | null; domain: any }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/domains"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shared-domains"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shared-domains/inactive"] });
      if (data.verified) {
        toast({
          title: language === "pt-BR" ? "Domínio ativo" : "Domain active",
          description: language === "pt-BR" ? "DNS verificado com sucesso — domínio está ativo" : "DNS verified successfully — domain is active",
        });
      } else {
        toast({
          title: language === "pt-BR" ? "Domínio marcado como inativo" : "Domain marked as inactive",
          description: data.error 
            ? (language === "pt-BR" ? `DNS inválido: ${data.error}` : `Invalid DNS: ${data.error}`)
            : (language === "pt-BR" ? "Nenhum CNAME apontando para clerion.app foi encontrado" : "No CNAME pointing to clerion.app was found"),
          variant: "destructive",
        });
      }
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

  const bulkDeleteMutation = useMutation({
    mutationFn: async ({ domains, reason }: { domains: Array<{ id: number; type: 'user' | 'shared' }>; reason: string }) => {
      const res = await apiRequest("DELETE", "/api/admin/domains/bulk", { domains, reason });
      return res.json() as Promise<{ deletedCount: number; affectedUsersCount: number; affectedOffersCount: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/domains"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/domains/history"] });
      setSelectedIds(new Set());
      setBulkDeleteStep(0);
      setBulkReason("admin_action");
      setBulkConfirmInput("");
      toast({
        title: language === "pt-BR" ? "Domínios Removidos" : "Domains Removed",
        description: language === "pt-BR"
          ? `${data.deletedCount} domínio(s) removidos. ${data.affectedOffersCount} oferta(s) afetadas, ${data.affectedUsersCount} usuário(s) notificado(s).`
          : `${data.deletedCount} domain(s) removed. ${data.affectedOffersCount} offer(s) affected, ${data.affectedUsersCount} user(s) notified.`,
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

  const selectedDomains = domains?.filter(d => selectedIds.has(domainKey(d))) ?? [];
  const totalSelectedOffers = selectedDomains.reduce((sum, d) => sum + d.offersCount, 0);
  const allVisibleSelected = domains && domains.length > 0 && domains.every(d => selectedIds.has(domainKey(d)));
  const someSelected = selectedIds.size > 0;

  const toggleSelect = (d: SystemDomain) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(domainKey(d))) next.delete(domainKey(d));
      else next.add(domainKey(d));
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(domains?.map(domainKey) ?? []));
    }
  };

  const handleBulkDeleteConfirm = () => {
    bulkDeleteMutation.mutate({
      domains: selectedDomains.map(d => ({ id: d.id, type: d.type })),
      reason: bulkReason,
    });
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

      {inactiveSharedDomains && inactiveSharedDomains.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 text-amber-600 dark:text-amber-500">
              <AlertTriangle className="w-5 h-5" />
              {language === "pt-BR" 
                ? `${inactiveSharedDomains.length} Domínio${inactiveSharedDomains.length > 1 ? 's' : ''} Compartilhado${inactiveSharedDomains.length > 1 ? 's' : ''} Inativo${inactiveSharedDomains.length > 1 ? 's' : ''}`
                : `${inactiveSharedDomains.length} Inactive Shared Domain${inactiveSharedDomains.length > 1 ? 's' : ''}`}
            </CardTitle>
            <CardDescription>
              {language === "pt-BR" 
                ? "Estes domínios foram detectados como inativos durante as verificações automáticas"
                : "These domains were detected as inactive during automatic checks"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {inactiveSharedDomains.map((domain) => (
                <div 
                  key={domain.id} 
                  className="flex items-center justify-between p-3 rounded-md bg-background border"
                  data-testid={`inactive-shared-domain-${domain.id}`}
                >
                  <div className="flex items-center gap-3">
                    <Globe className="w-4 h-4 text-amber-500" />
                    <div>
                      <span className="font-medium">{domain.subdomain}</span>
                      {domain.lastVerificationError && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {domain.lastVerificationError}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {domain.lastCheckedAt && (
                      <span className="text-xs text-muted-foreground">
                        {language === "pt-BR" ? "Verificado: " : "Checked: "}
                        {formatDate(domain.lastCheckedAt)}
                      </span>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => verifyDomainMutation.mutate({ id: domain.id, type: 'shared' })}
                      disabled={verifyDomainMutation.isPending && verifyDomainMutation.variables?.id === domain.id}
                      data-testid={`button-verify-inactive-${domain.id}`}
                    >
                      {verifyDomainMutation.isPending && verifyDomainMutation.variables?.id === domain.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                      <span className="ml-1">
                        {language === "pt-BR" ? "Verificar" : "Verify"}
                      </span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {language === "pt-BR" ? "Todos os Domínios do Sistema" : "All System Domains"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 flex-wrap items-center">
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
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {language === "pt-BR" ? "Todos Status" : "All Status"}
                </SelectItem>
                <SelectItem value="active">
                  {language === "pt-BR" ? "Ativos" : "Active"}
                </SelectItem>
                <SelectItem value="inactive">
                  {language === "pt-BR" ? "Inativos" : "Inactive"}
                </SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setAddDialogOpen(true)} data-testid="button-open-add-domain">
              <Plus className="w-4 h-4 mr-2" />
              {language === "pt-BR" ? "Adicionar Domínio" : "Add Domain"}
            </Button>
          </div>

          {someSelected && (
            <div className="flex items-center justify-between px-3 py-2 bg-destructive/10 border border-destructive/30 rounded-md">
              <span className="text-sm font-medium text-destructive">
                {language === "pt-BR"
                  ? `${selectedIds.size} domínio(s) selecionado(s)`
                  : `${selectedIds.size} domain(s) selected`}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIds(new Set())}
                  data-testid="button-clear-selection"
                >
                  {language === "pt-BR" ? "Limpar seleção" : "Clear selection"}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => { setBulkDeleteStep(1); setBulkReason("admin_action"); setBulkConfirmInput(""); }}
                  data-testid="button-bulk-delete"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {language === "pt-BR" ? "Deletar selecionados" : "Delete selected"}
                </Button>
              </div>
            </div>
          )}

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
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={toggleSelectAll}
                        data-testid="checkbox-select-all"
                        aria-label={language === "pt-BR" ? "Selecionar todos" : "Select all"}
                      />
                    </TableHead>
                    <TableHead>{language === "pt-BR" ? "Domínio" : "Domain"}</TableHead>
                    <TableHead>{language === "pt-BR" ? "Tipo" : "Type"}</TableHead>
                    <TableHead>{language === "pt-BR" ? "Status" : "Status"}</TableHead>
                    <TableHead>{language === "pt-BR" ? "Proprietário" : "Owner"}</TableHead>
                    <TableHead className="text-center">{language === "pt-BR" ? "Ofertas" : "Offers"}</TableHead>
                    <TableHead>{language === "pt-BR" ? "Criado em" : "Created"}</TableHead>
                    <TableHead className="text-right">{language === "pt-BR" ? "Ações" : "Actions"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {domains.map((domain) => (
                    <TableRow
                      key={`${domain.type}-${domain.id}`}
                      data-testid={`row-domain-${domain.id}`}
                      className={selectedIds.has(domainKey(domain)) ? "bg-destructive/5" : ""}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(domainKey(domain))}
                          onCheckedChange={() => toggleSelect(domain)}
                          data-testid={`checkbox-domain-${domain.id}`}
                          aria-label={`Select ${domain.subdomain}`}
                        />
                      </TableCell>
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
                        <Badge variant={domain.isActive ? 'default' : 'secondary'}>
                          {domain.isActive 
                            ? (language === "pt-BR" ? "Ativo" : "Active")
                            : (language === "pt-BR" ? "Inativo" : "Inactive")
                          }
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
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => verifyDomainMutation.mutate({ id: domain.id, type: domain.type })}
                                  disabled={verifyDomainMutation.isPending && verifyDomainMutation.variables?.id === domain.id}
                                  data-testid={`button-verify-domain-${domain.id}`}
                                >
                                  {verifyDomainMutation.isPending && verifyDomainMutation.variables?.id === domain.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="w-4 h-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {language === "pt-BR" ? "Verificar conexão" : "Verify connection"}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
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
                    <SelectItem value="inactive">
                      {language === "pt-BR" ? "Inatividade do domínio" : "Domain inactivity"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {domainToDelete && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Info className="w-4 h-4" />
                    {language === "pt-BR" ? "Prévia da notificação:" : "Notification preview:"}
                  </div>
                  {domainToDelete.offersCount > 0 ? (
                    <div className="p-3 bg-muted/50 rounded-md text-sm border">
                      {removalReason === 'phishing' && (
                        language === "pt-BR" 
                          ? `Olá [Nome], identificamos que o domínio ${domainToDelete.subdomain} configurado em sua conta foi alvo de uma denúncia externa por atividade associada a phishing. Por esse motivo, o domínio foi removido para evitar incidentes futuros. As ofertas afetadas: [lista de ofertas]. Acesse sua conta para configurar um novo domínio.`
                          : `Hello [Name], we identified that the domain ${domainToDelete.subdomain} configured in your account was the target of an external complaint for phishing activity. For this reason, the domain was removed to prevent future incidents. Affected offers: [offer list]. Please access your account to configure a new domain.`
                      )}
                      {removalReason === 'inactive' && (
                        language === "pt-BR" 
                          ? `Olá [Nome], o domínio ${domainToDelete.subdomain} configurado em sua conta foi identificado como inativo durante as verificações automáticas do sistema, verifique suas ofertas a fim de evitar erros de redirecionamento, loops ou tráfego inválido.`
                          : `Hello [Name], the domain ${domainToDelete.subdomain} configured in your account was identified as inactive during automatic system checks. Please check your offers to avoid redirection errors, loops, or invalid traffic.`
                      )}
                      {removalReason === 'admin_action' && (
                        language === "pt-BR" 
                          ? `Olá [Nome], o domínio ${domainToDelete.subdomain} foi removido da plataforma por decisão administrativa. As ofertas afetadas: [lista de ofertas]. Acesse sua conta para configurar um novo domínio.`
                          : `Hello [Name], the domain ${domainToDelete.subdomain} was removed from the platform by administrative decision. Affected offers: [offer list]. Please access your account to configure a new domain.`
                      )}
                    </div>
                  ) : (
                    <div className="p-3 bg-muted/30 rounded-md text-sm border text-muted-foreground italic">
                      {language === "pt-BR" 
                        ? "Nenhuma oferta vinculada a este domínio. Nenhuma notificação será enviada."
                        : "No offers linked to this domain. No notification will be sent."}
                    </div>
                  )}
                </div>
              )}
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

      <Dialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open); if (!open) setNewDomain(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {language === "pt-BR" ? "Adicionar Domínio Compartilhado" : "Add Shared Domain"}
            </DialogTitle>
            <DialogDescription>
              {language === "pt-BR" 
                ? "Configure o apontamento DNS antes de adicionar o domínio" 
                : "Configure DNS pointing before adding the domain"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                {language === "pt-BR" ? "Domínio" : "Domain"}
              </label>
              <Input
                placeholder="app.yourdomain.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateSharedDomain()}
                data-testid="input-new-shared-domain"
              />
            </div>
            
            <div className="p-4 bg-muted/50 rounded-lg space-y-3">
              <h4 className="font-medium text-sm">
                {language === "pt-BR" ? "Configuração de DNS" : "DNS Configuration"}
              </h4>
              <div className="rounded-md border bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">{language === "pt-BR" ? "Tipo" : "Type"}</TableHead>
                      <TableHead>{language === "pt-BR" ? "Nome / Host" : "Name / Host"}</TableHead>
                      <TableHead>{language === "pt-BR" ? "Apontamento" : "Points To"}</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>
                        <Badge variant="secondary">CNAME</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {newDomain.trim().split('.')[0] || 'subdomain'}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {DNS_DESTINATION}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopy(DNS_DESTINATION, 'dns-destination')}
                          data-testid="button-copy-dns"
                        >
                          {copiedField === 'dns-destination' ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                {language === "pt-BR"
                  ? "O domínio ficará ativo após a verificação do DNS e validação do SSL."
                  : "Domain will be active after DNS verification and SSL validation."}
              </p>
            </div>
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAddDialogOpen(false)} data-testid="button-cancel-add-domain">
                {language === "pt-BR" ? "Cancelar" : "Cancel"}
              </Button>
              <Button 
                onClick={handleCreateSharedDomain} 
                disabled={createSharedDomainMutation.isPending || !newDomain.trim()}
                data-testid="button-confirm-add-domain"
              >
                {createSharedDomainMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                {language === "pt-BR" ? "Adicionar" : "Add"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Dialog — Step 1: Review & Reason */}
      <AlertDialog open={bulkDeleteStep === 1} onOpenChange={(open) => { if (!open) setBulkDeleteStep(0); }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              {language === "pt-BR" ? "Deletar Domínios Selecionados" : "Delete Selected Domains"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p className="text-sm">
                  {language === "pt-BR"
                    ? `Você selecionou ${selectedIds.size} domínio(s) para remoção.`
                    : `You selected ${selectedIds.size} domain(s) for removal.`}
                </p>

                {totalSelectedOffers > 0 && (
                  <div className="p-3 bg-destructive/10 rounded-md">
                    <p className="text-destructive font-medium text-sm">
                      {language === "pt-BR"
                        ? `${totalSelectedOffers} oferta(s) serão afetadas e pararão de funcionar.`
                        : `${totalSelectedOffers} offer(s) will be affected and will stop working.`}
                    </p>
                  </div>
                )}

                <div className="max-h-40 overflow-y-auto rounded-md border divide-y text-sm">
                  {selectedDomains.map(d => (
                    <div key={domainKey(d)} className="flex items-center justify-between px-3 py-2">
                      <span className="font-mono text-xs font-medium">{d.subdomain}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant={d.type === 'shared' ? 'secondary' : 'outline'} className="text-xs">
                          {d.type === 'shared' ? (language === "pt-BR" ? "Compartilhado" : "Shared") : (language === "pt-BR" ? "Usuário" : "User")}
                        </Badge>
                        {d.offersCount > 0 && (
                          <Badge variant="destructive" className="text-xs">{d.offersCount} {language === "pt-BR" ? "oferta(s)" : "offer(s)"}</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    {language === "pt-BR" ? "Motivo da remoção:" : "Removal reason:"}
                  </p>
                  <Select value={bulkReason} onValueChange={setBulkReason}>
                    <SelectTrigger data-testid="select-bulk-reason">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin_action">
                        {language === "pt-BR" ? "Ação administrativa" : "Admin action"}
                      </SelectItem>
                      <SelectItem value="phishing">
                        {language === "pt-BR" ? "Denúncia de phishing" : "Phishing complaint"}
                      </SelectItem>
                      <SelectItem value="inactive">
                        {language === "pt-BR" ? "Inatividade do domínio" : "Domain inactivity"}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteStep(0)} data-testid="button-bulk-step1-cancel">
              {language === "pt-BR" ? "Cancelar" : "Cancel"}
            </Button>
            <Button
              onClick={() => setBulkDeleteStep(2)}
              className="bg-destructive hover:bg-destructive/90 text-white"
              data-testid="button-bulk-step1-next"
            >
              {language === "pt-BR" ? "Continuar" : "Continue"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Dialog — Step 2: Final Confirmation */}
      <AlertDialog open={bulkDeleteStep === 2} onOpenChange={(open) => { if (!open) setBulkDeleteStep(0); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              {language === "pt-BR" ? "Confirmação Final" : "Final Confirmation"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="text-sm">
                  {language === "pt-BR"
                    ? `Esta ação é irreversível. Para confirmar, digite "DELETAR" abaixo:`
                    : `This action is irreversible. To confirm, type "DELETE" below:`}
                </p>
                <Input
                  value={bulkConfirmInput}
                  onChange={(e) => setBulkConfirmInput(e.target.value)}
                  placeholder={language === "pt-BR" ? "DELETAR" : "DELETE"}
                  data-testid="input-bulk-confirm"
                  className="font-mono"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteStep(1)} data-testid="button-bulk-step2-back">
              {language === "pt-BR" ? "Voltar" : "Back"}
            </Button>
            <Button
              onClick={handleBulkDeleteConfirm}
              disabled={
                (language === "pt-BR" ? bulkConfirmInput !== "DELETAR" : bulkConfirmInput !== "DELETE")
                || bulkDeleteMutation.isPending
              }
              className="bg-destructive hover:bg-destructive/90 text-white"
              data-testid="button-bulk-step2-confirm"
            >
              {bulkDeleteMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" />{language === "pt-BR" ? "Deletando..." : "Deleting..."}</>
              ) : (
                language === "pt-BR" ? "Deletar permanentemente" : "Delete permanently"
              )}
            </Button>
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
