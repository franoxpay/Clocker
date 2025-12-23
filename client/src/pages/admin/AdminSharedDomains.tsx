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
import { Globe, Plus, Trash2, RefreshCw, CheckCircle2, XCircle, Loader2 } from "lucide-react";
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

interface SharedDomain {
  id: number;
  subdomain: string;
  isActive: boolean;
  isVerified: boolean;
  sslStatus: string;
  lastCheckedAt: string | null;
  lastVerificationError: string | null;
  createdAt: string;
}

export default function AdminSharedDomains() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const [newDomain, setNewDomain] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [domainToDelete, setDomainToDelete] = useState<SharedDomain | null>(null);

  const { data: domains, isLoading } = useQuery<SharedDomain[]>({
    queryKey: ["/api/admin/shared-domains"],
  });

  const createMutation = useMutation({
    mutationFn: async (subdomain: string) => {
      return apiRequest("POST", "/api/admin/shared-domains", { subdomain });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shared-domains"] });
      setNewDomain("");
      toast({
        title: language === "pt-BR" ? "Sucesso" : "Success",
        description: language === "pt-BR" ? "Domínio compartilhado criado" : "Shared domain created",
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

  const verifyMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/admin/shared-domains/${id}/verify`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shared-domains"] });
      toast({
        title: language === "pt-BR" ? "Sucesso" : "Success",
        description: language === "pt-BR" ? "Domínio verificado" : "Domain verified",
      });
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shared-domains"] });
      toast({
        title: language === "pt-BR" ? "Erro na verificação" : "Verification error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/admin/shared-domains/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shared-domains"] });
      setDeleteDialogOpen(false);
      setDomainToDelete(null);
      toast({
        title: language === "pt-BR" ? "Sucesso" : "Success",
        description: language === "pt-BR" ? "Domínio removido" : "Domain removed",
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

  const handleCreate = () => {
    if (!newDomain.trim()) return;
    createMutation.mutate(newDomain.trim().toLowerCase());
  };

  const handleDelete = (domain: SharedDomain) => {
    setDomainToDelete(domain);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (domainToDelete) {
      deleteMutation.mutate(domainToDelete.id);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">
          {language === "pt-BR" ? "Domínios Compartilhados" : "Shared Domains"}
        </h1>
        <p className="text-muted-foreground">
          {language === "pt-BR" 
            ? "Gerencie domínios disponíveis para todos os usuários"
            : "Manage domains available to all users"}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            {language === "pt-BR" ? "Adicionar Domínio" : "Add Domain"}
          </CardTitle>
          <CardDescription>
            {language === "pt-BR"
              ? "Configure o CNAME do domínio apontando para o servidor antes de adicionar"
              : "Configure the domain CNAME pointing to the server before adding"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="example.yourdomain.com"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              data-testid="input-new-shared-domain"
            />
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !newDomain.trim()}
              data-testid="button-add-shared-domain"
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            {language === "pt-BR" ? "Domínios Ativos" : "Active Domains"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : domains?.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              {language === "pt-BR" 
                ? "Nenhum domínio compartilhado cadastrado"
                : "No shared domains registered"}
            </p>
          ) : (
            <div className="space-y-3">
              {domains?.map((domain) => (
                <div
                  key={domain.id}
                  className="flex items-center justify-between p-4 border rounded-md"
                  data-testid={`card-shared-domain-${domain.id}`}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium" data-testid={`text-domain-${domain.id}`}>
                        {domain.subdomain}
                      </span>
                      {domain.isVerified ? (
                        <Badge variant="default" className="bg-green-600">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          {language === "pt-BR" ? "Verificado" : "Verified"}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <XCircle className="h-3 w-3 mr-1" />
                          {language === "pt-BR" ? "Não verificado" : "Not verified"}
                        </Badge>
                      )}
                      <Badge variant="outline">
                        SSL: {domain.sslStatus}
                      </Badge>
                    </div>
                    {domain.lastVerificationError && (
                      <p className="text-sm text-destructive">
                        {domain.lastVerificationError}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => verifyMutation.mutate(domain.id)}
                      disabled={verifyMutation.isPending}
                      data-testid={`button-verify-domain-${domain.id}`}
                    >
                      {verifyMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(domain)}
                      data-testid={`button-delete-domain-${domain.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === "pt-BR" ? "Confirmar exclusão" : "Confirm deletion"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === "pt-BR"
                ? `Tem certeza que deseja excluir o domínio "${domainToDelete?.subdomain}"? Esta ação não pode ser desfeita.`
                : `Are you sure you want to delete the domain "${domainToDelete?.subdomain}"? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              {language === "pt-BR" ? "Cancelar" : "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                language === "pt-BR" ? "Excluir" : "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
