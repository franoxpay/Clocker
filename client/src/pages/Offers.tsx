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
import { countries, getCountryName } from "@/lib/countries";
import type { Offer, Domain } from "@shared/schema";
import { 
  Plus, 
  MoreVertical, 
  Pencil, 
  Trash2, 
  Copy, 
  Check,
  ExternalLink,
} from "lucide-react";

interface OfferWithDomain extends Offer {
  domain?: Domain;
}

const devices = [
  { id: "smartphone", labelKey: "device.smartphone" },
  { id: "desktop", labelKey: "device.desktop" },
  { id: "tablet", labelKey: "device.tablet" },
];

export default function Offers() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<OfferWithDomain | null>(null);
  const [deleteOffer, setDeleteOffer] = useState<OfferWithDomain | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

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

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/offers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/offers"] });
      setIsCreateOpen(false);
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
  };

  const openEditDialog = (offer: OfferWithDomain) => {
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
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingOffer) {
      updateMutation.mutate({ ...formData, id: editingOffer.id, domainId: formData.domainId });
    } else {
      createMutation.mutate(formData);
    }
  };

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

  const platformDomain = window.location.host;
  const availableDomains = domains.filter(d => d.isActive);
  
  const platformDomainOption = {
    id: 0,
    subdomain: platformDomain,
    isVerified: true,
    isPlatform: true,
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold" data-testid="title-offers">
          {t("offers.title")}
        </h1>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-offer" onClick={() => resetForm()}>
              <Plus className="w-4 h-4 mr-2" />
              {t("offers.create")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("offers.create")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t("offers.name")}</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
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
                  <SelectTrigger data-testid="select-offer-domain">
                    <SelectValue placeholder={language === "pt-BR" ? "Selecione um domínio" : "Select a domain"} />
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

              <div className="space-y-2">
                <Label htmlFor="blackPageUrl">{t("offers.blackPage")}</Label>
                <Input
                  id="blackPageUrl"
                  type="url"
                  value={formData.blackPageUrl}
                  onChange={(e) => setFormData(prev => ({ ...prev, blackPageUrl: e.target.value }))}
                  placeholder="https://..."
                  required
                  data-testid="input-offer-black-url"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="whitePageUrl">{t("offers.whitePage")}</Label>
                <Input
                  id="whitePageUrl"
                  type="url"
                  value={formData.whitePageUrl}
                  onChange={(e) => setFormData(prev => ({ ...prev, whitePageUrl: e.target.value }))}
                  placeholder="https://..."
                  required
                  data-testid="input-offer-white-url"
                />
              </div>

              <div className="space-y-2">
                <Label>{t("offers.devices")}</Label>
                <div className="flex flex-wrap gap-3">
                  {devices.map((device) => (
                    <label key={device.id} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={formData.allowedDevices.includes(device.id)}
                        onCheckedChange={() => toggleDevice(device.id)}
                        data-testid={`checkbox-device-${device.id}`}
                      />
                      <span className="text-sm">{t(device.labelKey)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t("offers.countries")}</Label>
                <div className="max-h-48 overflow-y-auto border rounded-md p-3 space-y-2">
                  {countries.map((country) => (
                    <label key={country.code} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={formData.allowedCountries.includes(country.code)}
                        onCheckedChange={() => toggleCountry(country.code)}
                        data-testid={`checkbox-country-${country.code}`}
                      />
                      <span className="text-sm">
                        {language === "pt-BR" ? country.namePt : country.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsCreateOpen(false);
                    resetForm();
                  }}
                  data-testid="button-cancel-offer"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  data-testid="button-save-offer"
                >
                  {createMutation.isPending ? t("common.loading") : t("common.save")}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : offers.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              {t("offers.noOffers")}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("offers.name")}</TableHead>
                  <TableHead>{t("offers.platform")}</TableHead>
                  <TableHead>{t("offers.domain")}</TableHead>
                  <TableHead>{t("offers.xcode")}</TableHead>
                  <TableHead>{t("offers.clicks")}</TableHead>
                  <TableHead>{t("offers.status")}</TableHead>
                  <TableHead className="w-12">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {offers.map((offer) => (
                  <TableRow key={offer.id} data-testid={`row-offer-${offer.id}`}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{offer.name}</div>
                        <div className="text-sm text-muted-foreground">/{offer.slug}</div>
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
                      <div className="text-sm">
                        <span className="font-medium">{offer.totalClicks}</span>
                        <span className="text-muted-foreground ml-1">
                          ({offer.blackClicks}B / {offer.whiteClicks}W)
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={offer.isActive ? "default" : "secondary"}>
                        {offer.isActive ? t("offers.active") : t("offers.inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell>
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
                            {copiedId === offer.id ? t("common.copied") : t("common.copy")} URL
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => window.open(offer.blackPageUrl, "_blank")}
                            data-testid={`menu-view-black-${offer.id}`}
                          >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            {language === "pt-BR" ? "Ver Black" : "View Black"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => openEditDialog(offer)}
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

      <Dialog open={!!editingOffer} onOpenChange={(open) => !open && setEditingOffer(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("offers.edit")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">{t("offers.name")}</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                required
                data-testid="input-edit-offer-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-slug">{t("offers.slug")}</Label>
              <Input
                id="edit-slug"
                value={formData.slug}
                onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
                placeholder="minha-oferta"
                required
                data-testid="input-edit-offer-slug"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-platform">{t("offers.platform")}</Label>
              <Select
                value={formData.platform}
                onValueChange={(value) => setFormData(prev => ({ ...prev, platform: value }))}
              >
                <SelectTrigger data-testid="select-edit-offer-platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-domain">{t("offers.domain")}</Label>
              <Select
                value={formData.domainId}
                onValueChange={(value) => setFormData(prev => ({ ...prev, domainId: value }))}
              >
                <SelectTrigger data-testid="select-edit-offer-domain">
                  <SelectValue placeholder={language === "pt-BR" ? "Selecione um domínio" : "Select a domain"} />
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

            <div className="space-y-2">
              <Label htmlFor="edit-blackPageUrl">{t("offers.blackPage")}</Label>
              <Input
                id="edit-blackPageUrl"
                type="url"
                value={formData.blackPageUrl}
                onChange={(e) => setFormData(prev => ({ ...prev, blackPageUrl: e.target.value }))}
                placeholder="https://..."
                required
                data-testid="input-edit-offer-black-url"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-whitePageUrl">{t("offers.whitePage")}</Label>
              <Input
                id="edit-whitePageUrl"
                type="url"
                value={formData.whitePageUrl}
                onChange={(e) => setFormData(prev => ({ ...prev, whitePageUrl: e.target.value }))}
                placeholder="https://..."
                required
                data-testid="input-edit-offer-white-url"
              />
            </div>

            <div className="space-y-2">
              <Label>{t("offers.devices")}</Label>
              <div className="flex flex-wrap gap-3">
                {devices.map((device) => (
                  <label key={device.id} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={formData.allowedDevices.includes(device.id)}
                      onCheckedChange={() => toggleDevice(device.id)}
                      data-testid={`checkbox-edit-device-${device.id}`}
                    />
                    <span className="text-sm">{t(device.labelKey)}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("offers.countries")}</Label>
              <div className="max-h-48 overflow-y-auto border rounded-md p-3 space-y-2">
                {countries.map((country) => (
                  <label key={country.code} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={formData.allowedCountries.includes(country.code)}
                      onCheckedChange={() => toggleCountry(country.code)}
                      data-testid={`checkbox-edit-country-${country.code}`}
                    />
                    <span className="text-sm">
                      {language === "pt-BR" ? country.namePt : country.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {editingOffer && (
              <div className="p-3 bg-muted rounded-md">
                <Label className="text-xs text-muted-foreground">{t("offers.xcode")}</Label>
                <code className="block mt-1 text-sm font-mono">{editingOffer.xcode}</code>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditingOffer(null);
                  resetForm();
                }}
                data-testid="button-cancel-edit-offer"
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                data-testid="button-save-edit-offer"
              >
                {updateMutation.isPending ? t("common.loading") : t("common.save")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
