import { useState, Fragment } from "react";
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
import { Plus, Eye, Trash2, ShieldBan, Copy, Check, ChevronDown, ChevronUp, Link, Settings2 } from "lucide-react";
import type { Offer, SharedDomain, Domain } from "@shared/schema";

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
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    platform: "facebook",
    blackPageUrl: "",
    whitePageUrl: "",
    domainType: "platform" as "platform" | "shared" | "user",
    domainId: "",
  });

  const platformDomain = typeof window !== "undefined" ? window.location.host : "";

  const { data: honeypots, isLoading } = useQuery<Offer[]>({
    queryKey: ["/api/admin/honeypots"],
  });

  const { data: sharedDomains = [] } = useQuery<SharedDomain[]>({
    queryKey: ["/api/admin/shared-domains"],
  });

  const { data: userDomains = [] } = useQuery<Domain[]>({
    queryKey: ["/api/admin/all-domains"],
  });

  const { data: stats, isLoading: statsLoading } = useQuery<PatternStats>({
    queryKey: ["/api/admin/honeypots", selectedHoneypot?.id, "stats"],
    enabled: !!selectedHoneypot,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const submitData = {
        name: data.name,
        slug: data.slug || undefined,
        platform: data.platform,
        blackPageUrl: data.blackPageUrl,
        whitePageUrl: data.whitePageUrl,
        sharedDomainId: data.domainType === "shared" && data.domainId ? parseInt(data.domainId) : null,
        domainId: data.domainType === "user" && data.domainId ? parseInt(data.domainId) : null,
      };
      return apiRequest("POST", "/api/admin/honeypots", submitData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/honeypots"] });
      setCreateOpen(false);
      setFormData({ name: "", slug: "", platform: "facebook", blackPageUrl: "", whitePageUrl: "", domainType: "platform", domainId: "" });
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

  const getHoneypotDomain = (hp: Offer) => {
    if (hp.domainId) {
      const userDomain = userDomains.find(d => d.id === hp.domainId);
      if (userDomain) return userDomain.subdomain;
    }
    if (hp.sharedDomainId) {
      const sharedDomain = sharedDomains.find(d => d.id === hp.sharedDomainId);
      if (sharedDomain) return sharedDomain.subdomain;
    }
    return platformDomain;
  };

  const getHoneypotUrl = (hp: Offer) => {
    return `https://${getHoneypotDomain(hp)}/${hp.slug}`;
  };

  const getHoneypotParams = (hp: Offer) => {
    if (hp.platform === "tiktok") {
      return `?ttclid=__CLICKID__&adid=__CID__&adname=__AID_NAME__&adset=__AID__&cname=__CAMPAIGN_NAME__&domain=__DOMAIN__&placement=__PLACEMENT__&xcode=${hp.xcode}`;
    }
    return `?fbcl={{campaign.name}}|{{campaign.id}}&xcode=${hp.xcode}`;
  };

  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
    toast({ title: "Copiado!" });
  };

  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id);
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
                <Label>Slug (URL personalizada)</Label>
                <Input
                  data-testid="input-honeypot-slug"
                  value={formData.slug}
                  onChange={e => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                  placeholder="meu-slug (deixe vazio para auto-gerar)"
                />
                <p className="text-xs text-muted-foreground">Deixe vazio para gerar automaticamente</p>
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
                <Label>Tipo de Domínio</Label>
                <Select value={formData.domainType} onValueChange={(v: "platform" | "shared" | "user") => setFormData({ ...formData, domainType: v, domainId: "" })}>
                  <SelectTrigger data-testid="select-honeypot-domain-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="platform">Domínio da Plataforma</SelectItem>
                    <SelectItem value="shared">Domínio Compartilhado</SelectItem>
                    <SelectItem value="user">Domínio de Usuário</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.domainType === "shared" && (
                <div className="space-y-2">
                  <Label>Domínio Compartilhado</Label>
                  <Select value={formData.domainId} onValueChange={v => setFormData({ ...formData, domainId: v })}>
                    <SelectTrigger data-testid="select-honeypot-shared-domain">
                      <SelectValue placeholder="Selecione um domínio" />
                    </SelectTrigger>
                    <SelectContent>
                      {sharedDomains.filter(d => d.isActive).map(domain => (
                        <SelectItem key={domain.id} value={String(domain.id)}>
                          {domain.subdomain}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {formData.domainType === "user" && (
                <div className="space-y-2">
                  <Label>Domínio de Usuário</Label>
                  <Select value={formData.domainId} onValueChange={v => setFormData({ ...formData, domainId: v })}>
                    <SelectTrigger data-testid="select-honeypot-user-domain">
                      <SelectValue placeholder="Selecione um domínio" />
                    </SelectTrigger>
                    <SelectContent>
                      {userDomains.filter(d => d.isActive).map(domain => (
                        <SelectItem key={domain.id} value={String(domain.id)}>
                          {domain.subdomain} ({domain.userId.slice(0, 8)}...)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
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
            Use essas ofertas em campanhas de teste para capturar padrões de bots. Clique para expandir e ver parâmetros.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {honeypots && honeypots.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
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
                  <Fragment key={hp.id}>
                    <TableRow 
                      className="cursor-pointer"
                      onClick={() => toggleExpand(hp.id)}
                      data-testid={`row-honeypot-${hp.id}`}
                    >
                      <TableCell>
                        {expandedId === hp.id ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{hp.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{hp.platform}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{hp.slug}</TableCell>
                      <TableCell>{hp.totalClicks}</TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <Switch
                          checked={hp.isActive}
                          onCheckedChange={checked => toggleMutation.mutate({ id: hp.id, isActive: checked })}
                          data-testid={`switch-honeypot-${hp.id}`}
                        />
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
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
                    {expandedId === hp.id && (
                      <TableRow key={`${hp.id}-expanded`} className="bg-muted/50">
                        <TableCell colSpan={7} className="p-4">
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label className="text-sm font-medium flex items-center gap-2">
                                <Link className="w-4 h-4" />
                                URL da Campanha:
                              </Label>
                              <div className="flex items-center gap-2 bg-background border rounded-md">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="shrink-0"
                                  onClick={() => copyToClipboard(getHoneypotUrl(hp), `url-${hp.id}`)}
                                  data-testid={`button-copy-url-${hp.id}`}
                                >
                                  {copiedField === `url-${hp.id}` ? (
                                    <Check className="w-4 h-4 text-green-500" />
                                  ) : (
                                    <Copy className="w-4 h-4" />
                                  )}
                                </Button>
                                <div className="flex items-center flex-1 overflow-hidden">
                                  <span className="text-muted-foreground text-sm px-2 py-2 bg-muted rounded-l shrink-0">
                                    https://{getHoneypotDomain(hp)}/
                                  </span>
                                  <span className="text-sm font-medium px-2 py-2">
                                    {hp.slug}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-sm font-medium flex items-center gap-2">
                                <Settings2 className="w-4 h-4" />
                                Parâmetros ({hp.platform === "tiktok" ? "TikTok" : "Facebook"}):
                              </Label>
                              <div className="flex items-center gap-2 bg-background border rounded-md">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="shrink-0"
                                  onClick={() => copyToClipboard(getHoneypotParams(hp), `params-${hp.id}`)}
                                  data-testid={`button-copy-params-${hp.id}`}
                                >
                                  {copiedField === `params-${hp.id}` ? (
                                    <Check className="w-4 h-4 text-green-500" />
                                  ) : (
                                    <Copy className="w-4 h-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="shrink-0"
                                  onClick={() => copyToClipboard(getHoneypotUrl(hp) + getHoneypotParams(hp), `full-${hp.id}`)}
                                  data-testid={`button-copy-full-${hp.id}`}
                                  title="Copiar URL completa com parâmetros"
                                >
                                  {copiedField === `full-${hp.id}` ? (
                                    <Check className="w-4 h-4 text-green-500" />
                                  ) : (
                                    <Link className="w-4 h-4" />
                                  )}
                                </Button>
                                <div className="flex-1 overflow-x-auto py-2 px-2">
                                  <code className="text-xs font-mono whitespace-nowrap text-muted-foreground">
                                    {getHoneypotParams(hp)}
                                  </code>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                xcode: <span className="font-mono">{hp.xcode}</span>
                              </p>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
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
