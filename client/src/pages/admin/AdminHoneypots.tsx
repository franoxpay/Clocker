import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Eye, Trash2, ShieldBan, Copy, ExternalLink } from "lucide-react";
import type { Offer } from "@shared/schema";

interface PatternStats {
  topUserAgents: Array<{ userAgent: string; count: number }>;
  topIps: Array<{ ip: string; count: number }>;
  topCountries: Array<{ country: string; count: number }>;
}

export default function AdminHoneypots() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [selectedHoneypot, setSelectedHoneypot] = useState<Offer | null>(null);
  const [selectedPatterns, setSelectedPatterns] = useState<Array<{ type: string; value: string; platform: string }>>([]);
  
  const [formData, setFormData] = useState({
    name: "",
    platform: "facebook",
    blackPageUrl: "",
    whitePageUrl: "",
  });

  const { data: honeypots, isLoading } = useQuery<Offer[]>({
    queryKey: ["/api/admin/honeypots"],
  });

  const { data: stats, isLoading: statsLoading } = useQuery<PatternStats>({
    queryKey: ["/api/admin/honeypots", selectedHoneypot?.id, "stats"],
    enabled: !!selectedHoneypot,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/admin/honeypots", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/honeypots"] });
      setCreateOpen(false);
      setFormData({ name: "", platform: "facebook", blackPageUrl: "", whitePageUrl: "" });
      toast({ title: "Honeypot criado com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao criar honeypot", variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/admin/honeypots/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/honeypots"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/admin/honeypots/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/honeypots"] });
      toast({ title: "Honeypot removido" });
    },
  });

  const promoteMutation = useMutation({
    mutationFn: async (patterns: typeof selectedPatterns) => {
      const res = await apiRequest("POST", `/api/admin/honeypots/${selectedHoneypot?.id}/promote-bans`, { patterns });
      return res.json();
    },
    onSuccess: (data: { message: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bot-bans"] });
      setSelectedPatterns([]);
      toast({ title: data.message || "Bans criados com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao promover padrões", variant: "destructive" });
    },
  });

  const handleCreate = () => {
    if (!formData.name || !formData.blackPageUrl || !formData.whitePageUrl) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    createMutation.mutate(formData);
  };

  const togglePattern = (type: string, value: string) => {
    const platform = selectedHoneypot?.platform || "all";
    const exists = selectedPatterns.find(p => p.type === type && p.value === value);
    if (exists) {
      setSelectedPatterns(selectedPatterns.filter(p => !(p.type === type && p.value === value)));
    } else {
      setSelectedPatterns([...selectedPatterns, { type, value, platform }]);
    }
  };

  const isPatternSelected = (type: string, value: string) => {
    return selectedPatterns.some(p => p.type === type && p.value === value);
  };

  const copyUrl = (honeypot: Offer) => {
    const url = `${window.location.origin}/r/${honeypot.slug}?xcode=${honeypot.xcode}`;
    navigator.clipboard.writeText(url);
    toast({ title: "URL copiada!" });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Ofertas Honeypot</h1>
          <p className="text-muted-foreground">Armadilhas para identificar e banir bots automaticamente</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-honeypot">
              <Plus className="w-4 h-4 mr-2" />
              Criar Honeypot
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Oferta Honeypot</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  data-testid="input-honeypot-name"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Armadilha Facebook Ads"
                />
              </div>
              <div className="space-y-2">
                <Label>Plataforma</Label>
                <Select value={formData.platform} onValueChange={v => setFormData({ ...formData, platform: v })}>
                  <SelectTrigger data-testid="select-honeypot-platform">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>URL da Página Preta (armadilha)</Label>
                <Input
                  data-testid="input-honeypot-black"
                  value={formData.blackPageUrl}
                  onChange={e => setFormData({ ...formData, blackPageUrl: e.target.value })}
                  placeholder="https://exemplo.com/pagina-armadilha"
                />
              </div>
              <div className="space-y-2">
                <Label>URL da Página Branca (fallback)</Label>
                <Input
                  data-testid="input-honeypot-white"
                  value={formData.whitePageUrl}
                  onChange={e => setFormData({ ...formData, whitePageUrl: e.target.value })}
                  placeholder="https://exemplo.com/pagina-segura"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending} data-testid="button-submit-honeypot">
                {createMutation.isPending ? "Criando..." : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Honeypots Ativos</CardTitle>
          <CardDescription>
            Use essas ofertas em campanhas de teste para capturar padrões de bots
          </CardDescription>
        </CardHeader>
        <CardContent>
          {honeypots && honeypots.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Plataforma</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Cliques</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {honeypots.map(hp => (
                  <TableRow key={hp.id} data-testid={`row-honeypot-${hp.id}`}>
                    <TableCell className="font-medium">{hp.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{hp.platform}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{hp.slug}</TableCell>
                    <TableCell>{hp.totalClicks}</TableCell>
                    <TableCell>
                      <Switch
                        checked={hp.isActive}
                        onCheckedChange={checked => toggleMutation.mutate({ id: hp.id, isActive: checked })}
                        data-testid={`switch-honeypot-${hp.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => copyUrl(hp)}
                          data-testid={`button-copy-url-${hp.id}`}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setSelectedHoneypot(hp);
                            setSelectedPatterns([]);
                            setStatsOpen(true);
                          }}
                          data-testid={`button-view-stats-${hp.id}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(hp.id)}
                          data-testid={`button-delete-honeypot-${hp.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum honeypot criado ainda. Crie um para começar a capturar padrões de bots.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={statsOpen} onOpenChange={setStatsOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Padrões Detectados - {selectedHoneypot?.name}</DialogTitle>
          </DialogHeader>
          
          {statsLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : stats ? (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  User-Agents mais frequentes
                  <Badge variant="secondary">{stats.topUserAgents.length}</Badge>
                </h3>
                {stats.topUserAgents.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {stats.topUserAgents.map((ua, i) => (
                      <div key={i} className="flex items-center gap-3 p-2 rounded border">
                        <Checkbox
                          checked={isPatternSelected("user_agent", ua.userAgent)}
                          onCheckedChange={() => togglePattern("user_agent", ua.userAgent)}
                          data-testid={`checkbox-ua-${i}`}
                        />
                        <span className="flex-1 text-sm font-mono truncate">{ua.userAgent}</span>
                        <Badge>{ua.count} hits</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">Nenhum dado ainda</p>
                )}
              </div>

              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  IPs mais frequentes
                  <Badge variant="secondary">{stats.topIps.length}</Badge>
                </h3>
                {stats.topIps.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {stats.topIps.map((ip, i) => (
                      <div key={i} className="flex items-center gap-3 p-2 rounded border">
                        <Checkbox
                          checked={isPatternSelected("ip", ip.ip)}
                          onCheckedChange={() => togglePattern("ip", ip.ip)}
                          data-testid={`checkbox-ip-${i}`}
                        />
                        <span className="flex-1 text-sm font-mono">{ip.ip}</span>
                        <Badge>{ip.count} hits</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">Nenhum dado ainda</p>
                )}
              </div>

              <div>
                <h3 className="font-semibold mb-3">Países</h3>
                {stats.topCountries.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {stats.topCountries.map((c, i) => (
                      <Badge key={i} variant="outline">
                        {c.country}: {c.count}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">Nenhum dado ainda</p>
                )}
              </div>

              {selectedPatterns.length > 0 && (
                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">
                      {selectedPatterns.length} padrão(ões) selecionado(s)
                    </span>
                    <Button
                      onClick={() => promoteMutation.mutate(selectedPatterns)}
                      disabled={promoteMutation.isPending}
                      data-testid="button-promote-bans"
                    >
                      <ShieldBan className="w-4 h-4 mr-2" />
                      {promoteMutation.isPending ? "Criando..." : "Criar Bans"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
