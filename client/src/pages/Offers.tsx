import { useState, useMemo, Fragment } from "react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { countries } from "@/lib/countries";
import type { Offer, Domain, SharedDomain } from "@shared/schema";
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Copy, 
  Check,
  ArrowLeft,
  Search,
  ChevronDown,
  ChevronUp,
  Link,
  Link2,
  Settings2,
  Eye,
} from "lucide-react";

interface OfferWithDomain extends Offer {
  domain?: Domain;
  sharedDomain?: SharedDomain;
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
  const [expandedOfferId, setExpandedOfferId] = useState<number | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [countrySearch, setCountrySearch] = useState("");
  const [mergeParamsOffer, setMergeParamsOffer] = useState<OfferWithDomain | null>(null);
  const [additionalParams, setAdditionalParams] = useState("");
  const [previewOffer, setPreviewOffer] = useState<OfferWithDomain | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    platform: "tiktok",
    domainId: "",
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

  const { data: sharedDomains = [] } = useQuery<SharedDomain[]>({
    queryKey: ["/api/shared-domains"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/offers", data);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Error creating offer");
      }
      return res.json();
    },
    onSuccess: (newOffer: OfferWithDomain) => {
      queryClient.invalidateQueries({ queryKey: ["/api/offers"] });
      resetForm();
      setViewMode("list");
      setExpandedOfferId(newOffer.id);
      toast({
        title: t("common.success"),
        description: language === "pt-BR" ? "Oferta criada com sucesso" : "Offer created successfully",
      });
    },
    onError: (error: Error) => {
      let errorMessage = language === "pt-BR" ? "Erro ao criar oferta" : "Error creating offer";
      
      if (error.message.includes("Slug already exists")) {
        errorMessage = language === "pt-BR" 
          ? "Este slug já existe neste domínio. Escolha outro slug." 
          : "This slug already exists on this domain. Choose a different slug.";
      }
      
      toast({
        title: t("common.error"),
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData & { id: number }) => {
      const res = await apiRequest("PUT", `/api/offers/${data.id}`, data);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Error updating offer");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/offers"] });
      setViewMode("list");
      resetForm();
      toast({
        title: t("common.success"),
        description: language === "pt-BR" ? "Oferta atualizada com sucesso" : "Offer updated successfully",
      });
    },
    onError: (error: Error) => {
      let errorMessage = language === "pt-BR" ? "Erro ao atualizar oferta" : "Error updating offer";
      
      if (error.message.includes("Slug already exists")) {
        errorMessage = language === "pt-BR" 
          ? "Este slug já existe neste domínio. Escolha outro slug." 
          : "This slug already exists on this domain. Choose a different slug.";
      }
      
      toast({
        title: t("common.error"),
        description: errorMessage,
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
        description: language === "pt-BR" ? "Oferta excluída com sucesso" : "Offer deleted successfully",
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
      domainId: "",
      blackPageUrl: "",
      whitePageUrl: "",
      allowedCountries: ["BR"],
      allowedDevices: ["smartphone"],
      isActive: true,
    });
    setEditingOffer(null);
    setCountrySearch("");
  };

  const handleBack = () => {
    setViewMode("list");
    resetForm();
  };

  const openCreateMode = () => {
    resetForm();
    setViewMode("create");
  };

  const openEditMode = (offer: OfferWithDomain) => {
    setEditingOffer(offer);
    let domainIdValue = "";
    if (offer.sharedDomainId) {
      domainIdValue = `shared_${offer.sharedDomainId}`;
    } else if (offer.domainId) {
      domainIdValue = String(offer.domainId);
    }
    setFormData({
      name: offer.name,
      slug: offer.slug,
      platform: offer.platform,
      domainId: domainIdValue,
      blackPageUrl: offer.blackPageUrl,
      whitePageUrl: offer.whitePageUrl,
      allowedCountries: offer.allowedCountries,
      allowedDevices: offer.allowedDevices,
      isActive: offer.isActive,
    });
    setViewMode("edit");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.domainId) {
      toast({
        title: t("common.error"),
        description: language === "pt-BR" ? "Selecione um domínio" : "Please select a domain",
        variant: "destructive",
      });
      return;
    }
    
    const submitData = {
      ...formData,
      domainId: formData.domainId,
    };

    if (viewMode === "edit" && editingOffer) {
      updateMutation.mutate({ ...submitData, id: editingOffer.id } as any);
    } else {
      createMutation.mutate(submitData as any);
    }
  };

  const getOfferDomain = (offer: OfferWithDomain) => {
    if (offer.sharedDomainId) {
      return offer.sharedDomain?.subdomain || sharedDomains.find(d => d.id === offer.sharedDomainId)?.subdomain || "";
    }
    if (offer.domainId) {
      return offer.domain?.subdomain || domains.find(d => d.id === offer.domainId)?.subdomain || "";
    }
    return "";
  };

  const getOfferUrl = (offer: OfferWithDomain) => {
    const domain = getOfferDomain(offer);
    if (!domain) return "";
    return `https://${domain}/${offer.slug}`;
  };

  const getOfferParams = (offer: OfferWithDomain) => {
    if (offer.platform === "tiktok") {
      return `?ttclid=__CLICKID__&adid=__CID__&adname=__AID_NAME__&adset=__AID__&cname=__CAMPAIGN_NAME__&domain=__DOMAIN__&placement=__PLACEMENT__&xcode=${offer.xcode}`;
    }
    return `?fbcl={{campaign.name}}|{{campaign.id}}&xcode=${offer.xcode}`;
  };

  const getMergedParams = () => {
    if (!mergeParamsOffer) return "";
    const baseParams = getOfferParams(mergeParamsOffer);
    if (!additionalParams.trim()) return baseParams;
    const cleanAdditional = additionalParams.trim().replace(/^[?&]/, "");
    if (!cleanAdditional) return baseParams;
    return `${baseParams}&${cleanAdditional}`;
  };

  const openMergeModal = (offer: OfferWithDomain) => {
    setMergeParamsOffer(offer);
    setAdditionalParams("");
  };

  const closeMergeModal = () => {
    setMergeParamsOffer(null);
    setAdditionalParams("");
  };

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast({
      title: language === "pt-BR" ? "Copiado!" : "Copied!",
      description: language === "pt-BR" ? "Copiado para a área de transferência" : "Copied to clipboard",
    });
  };

  const toggleExpand = (offerId: number) => {
    setExpandedOfferId(expandedOfferId === offerId ? null : offerId);
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
                    <SelectTrigger id="platform" data-testid="select-platform">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tiktok">TikTok</SelectItem>
                      <SelectItem value="facebook">Facebook</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="domain">{t("offers.domain")}</Label>
                  <Select
                    value={formData.domainId}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, domainId: value }))}
                  >
                    <SelectTrigger id="domain" data-testid="select-domain">
                      <SelectValue placeholder={language === "pt-BR" ? "Selecione um domínio" : "Select a domain"} />
                    </SelectTrigger>
                    <SelectContent>
                      {sharedDomains.length > 0 && (
                        <>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                            {language === "pt-BR" ? "Domínios Compartilhados" : "Shared Domains"}
                          </div>
                          {sharedDomains.map((domain) => (
                            <SelectItem key={`shared_${domain.id}`} value={`shared_${domain.id}`}>
                              {domain.subdomain}
                            </SelectItem>
                          ))}
                        </>
                      )}
                      {domains.filter(d => d.isVerified).length > 0 && (
                        <>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                            {language === "pt-BR" ? "Meus Domínios" : "My Domains"}
                          </div>
                          {domains.filter(d => d.isVerified).map((domain) => (
                            <SelectItem key={domain.id} value={String(domain.id)}>
                              {domain.subdomain}
                            </SelectItem>
                          ))}
                        </>
                      )}
                      {sharedDomains.length === 0 && domains.filter(d => d.isVerified).length === 0 && (
                        <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                          {language === "pt-BR" 
                            ? "Nenhum domínio disponível. Adicione um domínio próprio ou aguarde a aprovação de domínios compartilhados." 
                            : "No domains available. Add your own domain or wait for shared domains approval."}
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: !!checked }))}
                    data-testid="checkbox-is-active"
                  />
                  <Label htmlFor="isActive">{t("offers.active")}</Label>
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
                  <Label htmlFor="blackPage">{t("offers.blackPage")}</Label>
                  <Input
                    id="blackPage"
                    type="url"
                    value={formData.blackPageUrl}
                    onChange={(e) => setFormData(prev => ({ ...prev, blackPageUrl: e.target.value }))}
                    placeholder="https://exemplo.com/pagina-vendas"
                    required
                    data-testid="input-black-page"
                  />
                  <p className="text-xs text-muted-foreground">
                    {language === "pt-BR" 
                      ? "Página real que será exibida para tráfego válido" 
                      : "Real page shown to valid traffic"}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="whitePage">{t("offers.whitePage")}</Label>
                  <Input
                    id="whitePage"
                    type="url"
                    value={formData.whitePageUrl}
                    onChange={(e) => setFormData(prev => ({ ...prev, whitePageUrl: e.target.value }))}
                    placeholder="https://exemplo.com/pagina-segura"
                    required
                    data-testid="input-white-page"
                  />
                  <p className="text-xs text-muted-foreground">
                    {language === "pt-BR" 
                      ? "Página segura para bots e tráfego inválido" 
                      : "Safe page for bots and invalid traffic"}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {language === "pt-BR" ? "Dispositivos Permitidos" : "Allowed Devices"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {devices.map((device) => (
                    <div key={device.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={device.id}
                        checked={formData.allowedDevices.includes(device.id)}
                        onCheckedChange={() => toggleDevice(device.id)}
                        data-testid={`checkbox-device-${device.id}`}
                      />
                      <Label htmlFor={device.id} className="cursor-pointer">
                        {t(device.labelKey)}
                      </Label>
                    </div>
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
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder={language === "pt-BR" ? "Buscar país..." : "Search country..."}
                    value={countrySearch}
                    onChange={(e) => setCountrySearch(e.target.value)}
                    className="pl-10"
                    data-testid="input-country-search"
                  />
                </div>
                
                {formData.allowedCountries.length > 0 && (
                  <div className="flex flex-wrap gap-1 pb-2 border-b">
                    {formData.allowedCountries.map(code => {
                      return (
                        <Badge 
                          key={code} 
                          variant="secondary" 
                          className="cursor-pointer"
                          onClick={() => toggleCountry(code)}
                        >
                          {code}
                        </Badge>
                      );
                    })}
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {displayedCountries.map((country) => (
                    <div key={country.code} className="flex items-center space-x-2">
                      <Checkbox
                        id={country.code}
                        checked={formData.allowedCountries.includes(country.code)}
                        onCheckedChange={() => toggleCountry(country.code)}
                        data-testid={`checkbox-country-${country.code}`}
                      />
                      <Label htmlFor={country.code} className="cursor-pointer text-sm truncate">
                        {language === "pt-BR" ? country.namePt : country.name}
                      </Label>
                    </div>
                  ))}
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
                  <TableHead className="w-8"></TableHead>
                  <TableHead>{t("offers.name")}</TableHead>
                  <TableHead>{t("offers.platform")}</TableHead>
                  <TableHead>{t("offers.domain")}</TableHead>
                  <TableHead>{t("offers.status")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {offers.map((offer) => (
                  <Fragment key={offer.id}>
                    <TableRow 
                      className="cursor-pointer"
                      onClick={() => toggleExpand(offer.id)}
                    >
                      <TableCell>
                        {expandedOfferId === offer.id ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </TableCell>
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
                        {offer.sharedDomainId
                          ? (offer.sharedDomain?.subdomain || sharedDomains.find(d => d.id === offer.sharedDomainId)?.subdomain || "-")
                          : offer.domainId
                            ? (offer.domain?.subdomain || "-")
                            : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={offer.isActive ? "default" : "secondary"}>
                          {offer.isActive ? t("offers.active") : t("offers.inactive")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setPreviewOffer(offer)}
                            title={language === "pt-BR" ? "Visualizar páginas" : "Preview pages"}
                            data-testid={`button-preview-offer-${offer.id}`}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditMode(offer)}
                            data-testid={`button-edit-offer-${offer.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteOffer(offer)}
                            className="text-destructive"
                            data-testid={`button-delete-offer-${offer.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedOfferId === offer.id && (
                      <TableRow key={`${offer.id}-expanded`} className="bg-muted/50">
                        <TableCell colSpan={6} className="p-4">
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label className="text-sm font-medium flex items-center gap-2">
                                <Link className="w-4 h-4" />
                                {language === "pt-BR" ? "URL da Campanha:" : "Campaign URL:"}
                              </Label>
                              <div className="flex items-center gap-2 bg-background border rounded-md">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="shrink-0"
                                  onClick={() => copyToClipboard(getOfferUrl(offer), `url-${offer.id}`)}
                                  data-testid={`button-copy-url-${offer.id}`}
                                >
                                  {copiedField === `url-${offer.id}` ? (
                                    <Check className="w-4 h-4 text-green-500" />
                                  ) : (
                                    <Copy className="w-4 h-4" />
                                  )}
                                </Button>
                                <div className="flex items-center flex-1 overflow-hidden">
                                  <span className="text-muted-foreground text-sm px-2 py-2 bg-muted rounded-l shrink-0">
                                    https://{getOfferDomain(offer)}/
                                  </span>
                                  <span className="text-sm font-medium px-2 py-2">
                                    {offer.slug}
                                  </span>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {language === "pt-BR" 
                                  ? "O domínio não pode ser alterado após a criação da campanha" 
                                  : "The domain cannot be changed after campaign creation"}
                              </p>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-sm font-medium flex items-center gap-2">
                                <Settings2 className="w-4 h-4" />
                                {language === "pt-BR" ? "Parâmetros:" : "Parameters:"}
                              </Label>
                              <div className="flex items-center gap-2 bg-background border rounded-md">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="shrink-0"
                                  onClick={() => copyToClipboard(getOfferParams(offer), `params-${offer.id}`)}
                                  data-testid={`button-copy-params-${offer.id}`}
                                >
                                  {copiedField === `params-${offer.id}` ? (
                                    <Check className="w-4 h-4 text-green-500" />
                                  ) : (
                                    <Copy className="w-4 h-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="shrink-0"
                                  onClick={() => copyToClipboard(getOfferUrl(offer) + getOfferParams(offer), `full-${offer.id}`)}
                                  data-testid={`button-copy-full-${offer.id}`}
                                  title={language === "pt-BR" ? "Copiar URL completa" : "Copy full URL"}
                                >
                                  <Link className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="shrink-0"
                                  onClick={() => openMergeModal(offer)}
                                  data-testid={`button-merge-params-${offer.id}`}
                                  title={language === "pt-BR" ? "Mesclar Parâmetros" : "Merge Parameters"}
                                >
                                  <Link2 className="w-4 h-4" />
                                </Button>
                                <div className="flex-1 overflow-x-auto py-2 px-2">
                                  <code className="text-xs font-mono whitespace-nowrap text-muted-foreground">
                                    {getOfferParams(offer)}
                                  </code>
                                </div>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
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

      <Dialog open={!!mergeParamsOffer} onOpenChange={(open) => !open && closeMergeModal()}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              {language === "pt-BR" ? "Mesclar Parâmetros" : "Merge Parameters"}
            </DialogTitle>
            <DialogDescription>
              {language === "pt-BR" 
                ? "Adicione parâmetros extras" 
                : "Add extra parameters"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {language === "pt-BR" ? "Parâmetros atuais do Cloaker" : "Current Cloaker Parameters"}
              </Label>
              <div className="p-3 bg-muted rounded-md border border-primary/30">
                <code className="text-xs font-mono text-muted-foreground break-all">
                  {mergeParamsOffer ? getOfferParams(mergeParamsOffer) : ""}
                </code>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {language === "pt-BR" ? "Parâmetros adicionais para mesclar" : "Additional parameters to merge"}
              </Label>
              <Textarea
                value={additionalParams}
                onChange={(e) => setAdditionalParams(e.target.value)}
                placeholder={language === "pt-BR" 
                  ? "Cole aqui os parâmetros adicionais (sem o ? inicial)" 
                  : "Paste additional parameters here (without the initial ?)"}
                className="min-h-[80px] font-mono text-sm"
                data-testid="textarea-additional-params"
              />
              <p className="text-xs text-muted-foreground">
                {language === "pt-BR" 
                  ? "Cole aqui os parâmetros adicionais (sem o ? inicial)" 
                  : "Paste additional parameters here (without the initial ?)"}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium">
                  {language === "pt-BR" ? "Parâmetros mesclados" : "Merged Parameters"}
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(getMergedParams(), "merged-params")}
                  data-testid="button-copy-merged"
                >
                  {copiedField === "merged-params" ? (
                    <Check className="w-4 h-4 mr-2 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4 mr-2" />
                  )}
                  {language === "pt-BR" ? "Copiar" : "Copy"}
                </Button>
              </div>
              <div className="p-3 bg-muted rounded-md border border-primary/30">
                <code className="text-xs font-mono text-primary break-all">
                  {getMergedParams()}
                </code>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeMergeModal} data-testid="button-close-merge">
              {language === "pt-BR" ? "Fechar" : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewOffer} onOpenChange={(open) => !open && setPreviewOffer(null)}>
        <DialogContent className="sm:max-w-[95vw] max-h-[95vh] w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              {language === "pt-BR" ? "Visualizar Páginas" : "Preview Pages"} - {previewOffer?.name}
            </DialogTitle>
            <DialogDescription>
              {language === "pt-BR" 
                ? "Visualize as páginas Black (oferta real) e White (página segura) da sua campanha" 
                : "Preview the Black (real offer) and White (safe page) pages of your campaign"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-foreground" />
                  {language === "pt-BR" ? "Página Black (Oferta Real)" : "Black Page (Real Offer)"}
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => previewOffer?.blackPageUrl && window.open(previewOffer.blackPageUrl, "_blank")}
                  data-testid="button-open-black-page"
                >
                  {language === "pt-BR" ? "Abrir" : "Open"}
                </Button>
              </div>
              <div className="border rounded-md overflow-hidden bg-muted" style={{ height: "60vh" }}>
                {previewOffer?.blackPageUrl ? (
                  <iframe
                    src={previewOffer.blackPageUrl}
                    className="w-full h-full border-0"
                    title="Black Page Preview"
                    sandbox="allow-scripts allow-same-origin"
                    data-testid="iframe-black-page"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    {language === "pt-BR" ? "URL não configurada" : "URL not configured"}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {previewOffer?.blackPageUrl || "-"}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-muted-foreground border" />
                  {language === "pt-BR" ? "Página White (Página Segura)" : "White Page (Safe Page)"}
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => previewOffer?.whitePageUrl && window.open(previewOffer.whitePageUrl, "_blank")}
                  data-testid="button-open-white-page"
                >
                  {language === "pt-BR" ? "Abrir" : "Open"}
                </Button>
              </div>
              <div className="border rounded-md overflow-hidden bg-muted" style={{ height: "60vh" }}>
                {previewOffer?.whitePageUrl ? (
                  <iframe
                    src={previewOffer.whitePageUrl}
                    className="w-full h-full border-0"
                    title="White Page Preview"
                    sandbox="allow-scripts allow-same-origin"
                    data-testid="iframe-white-page"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    {language === "pt-BR" ? "URL não configurada" : "URL not configured"}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {previewOffer?.whitePageUrl || "-"}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOffer(null)} data-testid="button-close-preview">
              {language === "pt-BR" ? "Fechar" : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
