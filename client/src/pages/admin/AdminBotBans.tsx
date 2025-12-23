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
import { Shield, Plus, Trash2, Bot, Globe, Wifi, Loader2, Zap } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface BotBan {
  id: number;
  type: "user_agent" | "ip" | "ip_range";
  value: string;
  description: string | null;
  platform: string | null;
  isActive: boolean;
  hitCount: number;
  lastHitAt: string | null;
  createdAt: string;
}

export default function AdminBotBans() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const [newBan, setNewBan] = useState({
    type: "user_agent" as "user_agent" | "ip" | "ip_range",
    value: "",
    description: "",
    platform: "all",
    isActive: true,
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [banToDelete, setBanToDelete] = useState<BotBan | null>(null);

  const { data: bans, isLoading } = useQuery<BotBan[]>({
    queryKey: ["/api/admin/bot-bans"],
  });

  const createMutation = useMutation({
    mutationFn: async (ban: typeof newBan) => {
      return apiRequest("POST", "/api/admin/bot-bans", {
        ...ban,
        platform: ban.platform === "all" ? null : ban.platform,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bot-bans"] });
      setNewBan({ type: "user_agent", value: "", description: "", platform: "all", isActive: true });
      toast({
        title: language === "pt-BR" ? "Sucesso" : "Success",
        description: language === "pt-BR" ? "Banimento criado" : "Ban created",
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

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      return apiRequest("PUT", `/api/admin/bot-bans/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bot-bans"] });
    },
    onError: (error: Error) => {
      toast({
        title: language === "pt-BR" ? "Erro" : "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/admin/bot-bans/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bot-bans"] });
      setDeleteDialogOpen(false);
      setBanToDelete(null);
      toast({
        title: language === "pt-BR" ? "Sucesso" : "Success",
        description: language === "pt-BR" ? "Banimento removido" : "Ban removed",
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

  const presetMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/bot-bans/add-presets");
    },
    onSuccess: (data: { message: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bot-bans"] });
      toast({
        title: language === "pt-BR" ? "Sucesso" : "Success",
        description: data.message,
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
    if (!newBan.value.trim()) return;
    createMutation.mutate(newBan);
  };

  const handleDelete = (ban: BotBan) => {
    setBanToDelete(ban);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (banToDelete) {
      deleteMutation.mutate(banToDelete.id);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "user_agent":
        return <Bot className="h-4 w-4" />;
      case "ip":
        return <Globe className="h-4 w-4" />;
      case "ip_range":
        return <Wifi className="h-4 w-4" />;
      default:
        return <Shield className="h-4 w-4" />;
    }
  };

  const getTypeBadge = (type: string) => {
    const labels: Record<string, { pt: string; en: string }> = {
      user_agent: { pt: "User-Agent", en: "User-Agent" },
      ip: { pt: "IP", en: "IP" },
      ip_range: { pt: "Range IP", en: "IP Range" },
    };
    return labels[type]?.[language === "pt-BR" ? "pt" : "en"] || type;
  };

  const getPlatformBadge = (platform: string | null) => {
    if (!platform) return language === "pt-BR" ? "Todos" : "All";
    return platform.charAt(0).toUpperCase() + platform.slice(1);
  };

  return (
    <div className="space-y-6" data-testid="admin-bot-bans-page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            {language === "pt-BR" ? "Banimento de Bots" : "Bot Bans"}
          </h1>
          <p className="text-muted-foreground">
            {language === "pt-BR"
              ? "Gerencie banimentos de bots por IP, Range ou User-Agent"
              : "Manage bot bans by IP, Range, or User-Agent"}
          </p>
        </div>
        <Button
          onClick={() => presetMutation.mutate()}
          disabled={presetMutation.isPending}
          variant="outline"
          data-testid="button-add-presets"
        >
          {presetMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Zap className="h-4 w-4 mr-2" />
          )}
          {language === "pt-BR" ? "Adicionar Presets" : "Add Presets"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            {language === "pt-BR" ? "Novo Banimento" : "New Ban"}
          </CardTitle>
          <CardDescription>
            {language === "pt-BR"
              ? "Adicione um novo banimento de bot"
              : "Add a new bot ban"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>{language === "pt-BR" ? "Tipo" : "Type"}</Label>
              <Select
                value={newBan.type}
                onValueChange={(value) =>
                  setNewBan({ ...newBan, type: value as typeof newBan.type })
                }
              >
                <SelectTrigger data-testid="select-ban-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user_agent">User-Agent</SelectItem>
                  <SelectItem value="ip">IP</SelectItem>
                  <SelectItem value="ip_range">
                    {language === "pt-BR" ? "Range IP (CIDR)" : "IP Range (CIDR)"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{language === "pt-BR" ? "Plataforma" : "Platform"}</Label>
              <Select
                value={newBan.platform}
                onValueChange={(value) => setNewBan({ ...newBan, platform: value })}
              >
                <SelectTrigger data-testid="select-ban-platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === "pt-BR" ? "Todas" : "All"}</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>
                {newBan.type === "user_agent"
                  ? "User-Agent"
                  : newBan.type === "ip"
                  ? "IP"
                  : language === "pt-BR"
                  ? "Range CIDR (ex: 69.63.0.0/16)"
                  : "CIDR Range (e.g., 69.63.0.0/16)"}
              </Label>
              <Input
                placeholder={
                  newBan.type === "user_agent"
                    ? "facebookexternalhit"
                    : newBan.type === "ip"
                    ? "192.168.1.1"
                    : "69.63.0.0/16"
                }
                value={newBan.value}
                onChange={(e) => setNewBan({ ...newBan, value: e.target.value })}
                data-testid="input-ban-value"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>{language === "pt-BR" ? "Descrição (opcional)" : "Description (optional)"}</Label>
              <Textarea
                placeholder={
                  language === "pt-BR"
                    ? "Descrição do banimento..."
                    : "Ban description..."
                }
                value={newBan.description}
                onChange={(e) => setNewBan({ ...newBan, description: e.target.value })}
                className="resize-none"
                rows={2}
                data-testid="input-ban-description"
              />
            </div>

            <div className="flex items-center gap-2 md:col-span-2">
              <Switch
                id="ban-active"
                checked={newBan.isActive}
                onCheckedChange={(checked) => setNewBan({ ...newBan, isActive: checked })}
                data-testid="switch-ban-active"
              />
              <Label htmlFor="ban-active">
                {language === "pt-BR" ? "Ativo" : "Active"}
              </Label>
            </div>
          </div>

          <Button
            onClick={handleCreate}
            disabled={!newBan.value.trim() || createMutation.isPending}
            className="mt-4"
            data-testid="button-create-ban"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            {language === "pt-BR" ? "Criar Banimento" : "Create Ban"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {language === "pt-BR" ? "Banimentos Ativos" : "Active Bans"}
          </CardTitle>
          <CardDescription>
            {language === "pt-BR"
              ? `${bans?.length || 0} banimentos configurados`
              : `${bans?.length || 0} bans configured`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : bans && bans.length > 0 ? (
            <div className="space-y-3">
              {bans.map((ban) => (
                <div
                  key={ban.id}
                  className="flex items-center justify-between gap-4 p-4 border rounded-lg flex-wrap"
                  data-testid={`ban-item-${ban.id}`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="p-2 bg-muted rounded-md">
                      {getTypeIcon(ban.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">
                          {getTypeBadge(ban.type)}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {getPlatformBadge(ban.platform)}
                        </Badge>
                        {ban.hitCount > 0 && (
                          <Badge className="text-xs">
                            {ban.hitCount} hits
                          </Badge>
                        )}
                      </div>
                      <p className="font-mono text-sm mt-1 truncate" title={ban.value}>
                        {ban.value}
                      </p>
                      {ban.description && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {ban.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Switch
                      checked={ban.isActive}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({ id: ban.id, isActive: checked })
                      }
                      data-testid={`switch-ban-toggle-${ban.id}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(ban)}
                      data-testid={`button-delete-ban-${ban.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>
                {language === "pt-BR"
                  ? "Nenhum banimento configurado"
                  : "No bans configured"}
              </p>
              <p className="text-sm mt-1">
                {language === "pt-BR"
                  ? "Clique em 'Adicionar Presets' para adicionar banimentos comuns"
                  : "Click 'Add Presets' to add common bot bans"}
              </p>
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
                ? `Tem certeza que deseja remover o banimento "${banToDelete?.value}"?`
                : `Are you sure you want to remove the ban "${banToDelete?.value}"?`}
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
