import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { countries } from "@/lib/countries";
import type { Offer, Domain } from "@shared/schema";
import { 
  Plus, 
  MoreVertical, 
  Pencil, 
  Trash2, 
  Copy, 
  Check,
  ExternalLink,
  ArrowLeft,
  Search,
} from "lucide-react";

interface OfferWithDomain extends Offer {
  domain?: Domain;
}

const devices = [
  { id: "smartphone", labelKey: "device.smartphone" },
  { id: "desktop", labelKey: "device.desktop" },
  { id: "tablet", labelKey: "device.tablet" },
];

type ViewMode = "list" | "create" | "edit";

export default function Offers() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [editingOffer, setEditingOffer] = useState<OfferWithDomain | null>(null);
  const [deleteOffer, setDeleteOffer] = useState<OfferWithDomain | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [countrySearch, setCountrySearch] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    platform: "tiktok",
    domainId: "platform",
    blackPageUrl: "",
    whitePageUrl: "",
    allowedCountries: ["BR"],
    allowedDevices: ["smartphone"],
    isActive: true,
  });

  const { data: offers = [], isLoading } = useQuery<OfferWithDomain[]>({
    queryKey: ["/api/offers"],
  });

  const { data: domains = [] } = useQuery<Domain[]>({
    queryKey: ["/api/domains"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/offers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/offers"] });
      setViewMode("list");
      resetForm();
      toast({
        title: t("common.success"),
        description: language === "pt-BR" ? "Oferta criada com sucesso" : "Offer created successfully",
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: language === "pt-BR" ? "Erro ao criar oferta" : "Error creating offer",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData & { id: number }) => {
      const res = await apiRequest("PUT", `/api/offers/${data.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/offers"] });
      setViewMode("list");
      setEditingOffer(null);
      resetForm();
      toast({
        title: t("common.success"),
        description: language === "pt-BR" ? "Oferta atualizada com sucesso" : "Offer updated successfully",
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: language === "pt-BR" ? "Erro ao atualizar oferta" : "Error updating offer",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/offers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/offers"] });
      setDeleteOffer(null);
      toast({
        title: t("common.success"),
        description: language === "pt-BR" ? "Oferta excluída" : "Offer deleted",
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: language === "pt-BR" ? "Erro ao excluir oferta" : "Error deleting offer",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      slug: "",
      platform: "tiktok",
      domainId: "platform",
      blackPageUrl: "",
      whitePageUrl: "",
      allowedCountries: ["BR"],
      allowedDevices: ["smartphone"],
      isActive: true,
    });
    setCountrySearch("");
  };

  const openCreateMode = () => {
    resetForm();
    setViewMode("create");
  };

  const openEditMode = (offer: OfferWithDomain) => {
    setFormData({
      name: offer.name,
      slug: offer.slug,
      platform: offer.platform,
      domainId: offer.domainId === 0 ? "platform" : String(offer.domainId),
      blackPageUrl: offer.blackPageUrl,
      whitePageUrl: offer.whitePageUrl,
      allowedCountries: offer.allowedCountries,
      allowedDevices: offer.allowedDevices,
      isActive: offer.isActive,
    });
    setEditingOffer(offer);
    setCountrySearch("");
    setViewMode("edit");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (viewMode === "edit" && editingOffer) {
      updateMutation.mutate({ ...formData, id: editingOffer.id, domainId: formData.domainId });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleBack = () => {
    setViewMode("list");
    setEditingOffer(null);
    resetForm();
  };

  const platformDomain = window.location.host;
  const availableDomains = domains.filter(d => d.isActive);

  const getGeneratedUrl = (offer: OfferWithDomain) => {
    let domain: string;
    
    if (offer.domainId === 0 || String(offer.domainId) === "platform") {
      domain = platformDomain;
    } else {
      domain = offer.domain?.subdomain || domains.find(d => d.id === offer.domainId)?.subdomain || "";
    }
    
    if (!domain) return "";

    const params = offer.platform === "tiktok"
      ? `?ttclid=CLICKID&cname=CAMPAIGN_NAME&xcode=${offer.xcode}`
      : `?fbcl={{campaign.name}}|{{campaign.id}}&xcode=${offer.xcode}`;

    return `https://${domain}/${offer.slug}${params}`;
  };

  const copyToClipboard = async (text: string, offerId: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(offerId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleCountry = (code: string) => {
    setFormData(prev => ({
      ...prev,
      allowedCountries: prev.allowedCountries.includes(code)
        ? prev.allowedCountries.filter(c => c !== code)
        : [...prev.allowedCountries, code],
    }));
  };

  const toggleDevice = (device: string) => {
    setFormData(prev => ({
      ...prev,
      allowedDevices: prev.allowedDevices.includes(device)
        ? prev.allowedDevices.filter(d => d !== device)
        : [...prev.allowedDevices, device],
    }));
  };

  const displayedCountries = useMemo(() => {
    const selected = countries.filter(c => formData.allowedCountries.includes(c.code));
    const unselected = countries.filter(c => !formData.allowedCountries.includes(c.code));
    
    if (countrySearch.trim()) {
      const searchLower = countrySearch.toLowerCase();
      const filtered = unselected.filter(c => 
        c.name.toLowerCase().includes(searchLower) || 
        c.namePt.toLowerCase().includes(searchLower) ||
        c.code.toLowerCase().includes(searchLower)
      );
      return [...selected, ...filtered];
    }
    
    return [...selected, ...unselected.slice(0, 5)];
  }, [formData.allowedCountries, countrySearch]);

  const hasMoreCountries = countries.length > displayedCountries.length && !countrySearch.trim();

  if (viewMode === "create" || viewMode === "edit") {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack} data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-3xl font-semibold">
            {viewMode === "create" 
              ? (language === "pt-BR" ? "Nova Oferta" : "New Offer")
              : (language === "pt-BR" ? "Editar Oferta" : "Edit Offer")}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {language === "pt-BR" ? "Informações Básicas" : "Basic Information"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t("offers.name")}</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder={language === "pt-BR" ? "Ex: Campanha Black Friday" : "Ex: Black Friday Campaign"}
                    required
                    data-testid="input-offer-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="slug">{t("offers.slug")}</Label>
                  <Input
                    id="slug"
                    value={formData.slug}
                    onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
                    placeholder="minha-oferta"
                    required
                    data-testid="input-offer-slug"
                  />
                  <p className="text-xs text-muted-foreground">
                    {language === "pt-BR" 
                      ? "Será usado na URL: /minha-oferta" 
                      : "Will be used in URL: /my-offer"}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="platform">{t("offers.platform")}</Label>
                  <Select
                    value={formData.platform}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, platform: value }))}
                  >
                    <SelectTrigger data-testid="select-offer-platform">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tiktok">TikTok Ads</SelectItem>
                      <SelectItem value="facebook">Facebook Ads</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="domain">{t("offers.domain")}</Label>
                  <Select
                    value={formData.domainId}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, domainId: value }))}
                  >
                    <SelectTrigger data-testid="select-offer-domain">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="platform">
                        {platformDomain} ({language === "pt-BR" ? "Domínio da Plataforma" : "Platform Domain"})
                      </SelectItem>
                      {availableDomains.map((domain) => (
                        <SelectItem key={domain.id} value={String(domain.id)}>
                          {domain.subdomain} {!domain.isVerified && `(${language === "pt-BR" ? "pendente" : "pending"})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {language === "pt-BR" ? "Páginas de Destino" : "Landing Pages"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="blackPageUrl">
                    {t("offers.blackPage")}
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({language === "pt-BR" ? "Página real" : "Real page"})
                    </span>
                  </Label>
                  <Input
                    id="blackPageUrl"
                    type="url"
                    value={formData.blackPageUrl}
                    onChange={(e) => setFormData(prev => ({ ...prev, blackPageUrl: e.target.value }))}
                    placeholder="https://sua-pagina-real.com"
                    required
                    data-testid="input-offer-black-url"
                  />
                  <p className="text-xs text-muted-foreground">
                    {language === "pt-BR" 
                      ? "Página exibida para tráfego válido" 
                      : "Page shown for valid traffic"}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="whitePageUrl">
                    {t("offers.whitePage")}
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({language === "pt-BR" ? "Página segura" : "Safe page"})
                    </span>
                  </Label>
                  <Input
                    id="whitePageUrl"
                    type="url"
                    value={formData.whitePageUrl}
                    onChange={(e) => setFormData(prev => ({ ...prev, whitePageUrl: e.target.value }))}
                    placeholder="https://sua-pagina-segura.com"
                    required
                    data-testid="input-offer-white-url"
                  />
                  <p className="text-xs text-muted-foreground">
                    {language === "pt-BR" 
                      ? "Página exibida para revisores e bots" 
                      : "Page shown for reviewers and bots"}
                  </p>
                </div>

                {viewMode === "edit" && editingOffer && (
                  <div className="p-3 bg-muted rounded-md">
                    <Label className="text-xs text-muted-foreground">{t("offers.xcode")}</Label>
                    <code className="block mt-1 text-sm font-mono">{editingOffer.xcode}</code>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {language === "pt-BR" ? "Dispositivos Permitidos" : "Allowed Devices"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  {devices.map((device) => (
                    <label key={device.id} className="flex items-center gap-2 cursor-pointer p-3 border rounded-md hover-elevate">
                      <Checkbox
                        checked={formData.allowedDevices.includes(device.id)}
                        onCheckedChange={() => toggleDevice(device.id)}
                        data-testid={`checkbox-device-${device.id}`}
                      />
                      <span className="text-sm font-medium">{t(device.labelKey)}</span>
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {language === "pt-BR" ? "Países Permitidos" : "Allowed Countries"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder={language === "pt-BR" ? "Buscar país..." : "Search country..."}
                    value={countrySearch}
                    onChange={(e) => setCountrySearch(e.target.value)}
                    className="pl-9"
                    data-testid="input-country-search"
                  />
                </div>

                {formData.allowedCountries.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formData.allowedCountries.map((code) => {
                      const country = countries.find(c => c.code === code);
                      return (
                        <Badge 
                          key={code} 
                          variant="default" 
                          className="cursor-pointer"
                          onClick={() => toggleCountry(code)}
                        >
                          {language === "pt-BR" ? country?.namePt : country?.name}
                          <span className="ml-1">×</span>
                        </Badge>
                      );
                    })}
                  </div>
                )}

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {displayedCountries.map((country) => {
                    const isSelected = formData.allowedCountries.includes(country.code);
                    return (
                      <label 
                        key={country.code} 
                        className={`flex items-center gap-3 cursor-pointer p-2 rounded-md ${isSelected ? 'bg-primary/10' : 'hover-elevate'}`}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleCountry(country.code)}
                          data-testid={`checkbox-country-${country.code}`}
                        />
                        <span className="text-sm">
                          {language === "pt-BR" ? country.namePt : country.name}
                        </span>
                        <span className="text-xs text-muted-foreground">({country.code})</span>
                      </label>
                    );
                  })}
                </div>

                {hasMoreCountries && (
                  <p className="text-xs text-muted-foreground text-center">
                    {language === "pt-BR" 
                      ? `+ ${countries.length - displayedCountries.length} países. Use a busca para encontrar mais.`
                      : `+ ${countries.length - displayedCountries.length} countries. Use search to find more.`}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              data-testid="button-cancel"
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-offer"
            >
              {(createMutation.isPending || updateMutation.isPending) 
                ? t("common.loading") 
                : (viewMode === "create" 
                    ? (language === "pt-BR" ? "Criar Oferta" : "Create Offer")
                    : t("common.save"))}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold" data-testid="title-offers">
          {t("offers.title")}
        </h1>
        <Button onClick={openCreateMode} data-testid="button-create-offer">
          <Plus className="w-4 h-4 mr-2" />
          {t("offers.create")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{language === "pt-BR" ? "Suas Ofertas" : "Your Offers"}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : offers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>{language === "pt-BR" ? "Nenhuma oferta criada ainda" : "No offers created yet"}</p>
              <Button 
                variant="outline" 
                className="mt-4" 
                onClick={openCreateMode}
                data-testid="button-create-first-offer"
              >
                <Plus className="w-4 h-4 mr-2" />
                {language === "pt-BR" ? "Criar primeira oferta" : "Create first offer"}
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("offers.name")}</TableHead>
                  <TableHead>{t("offers.platform")}</TableHead>
                  <TableHead>{t("offers.domain")}</TableHead>
                  <TableHead>{t("offers.xcode")}</TableHead>
                  <TableHead>{t("offers.status")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {offers.map((offer) => (
                  <TableRow key={offer.id}>
                    <TableCell className="font-medium">
                      <div>
                        <span data-testid={`text-offer-name-${offer.id}`}>{offer.name}</span>
                        <p className="text-xs text-muted-foreground">/{offer.slug}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {offer.platform === "tiktok" ? "TikTok" : "Facebook"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {offer.domainId === 0 
                        ? `${platformDomain} (${language === "pt-BR" ? "Plataforma" : "Platform"})` 
                        : (offer.domain?.subdomain || "-")}
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                        {offer.xcode}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge variant={offer.isActive ? "default" : "secondary"}>
                        {offer.isActive ? t("offers.active") : t("offers.inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-offer-menu-${offer.id}`}>
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => copyToClipboard(getGeneratedUrl(offer), offer.id)}
                            data-testid={`menu-copy-url-${offer.id}`}
                          >
                            {copiedId === offer.id ? (
                              <Check className="w-4 h-4 mr-2" />
                            ) : (
                              <Copy className="w-4 h-4 mr-2" />
                            )}
                            {language === "pt-BR" ? "Copiar URL" : "Copy URL"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => window.open(offer.blackPageUrl, "_blank")}
                            data-testid={`menu-view-black-${offer.id}`}
                          >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            {language === "pt-BR" ? "Ver Black" : "View Black"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => openEditMode(offer)}
                            data-testid={`menu-edit-offer-${offer.id}`}
                          >
                            <Pencil className="w-4 h-4 mr-2" />
                            {t("common.edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteOffer(offer)}
                            className="text-destructive"
                            data-testid={`menu-delete-offer-${offer.id}`}
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

      <AlertDialog open={!!deleteOffer} onOpenChange={(open) => !open && setDeleteOffer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("offers.delete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("offers.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteOffer && deleteMutation.mutate(deleteOffer.id)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
