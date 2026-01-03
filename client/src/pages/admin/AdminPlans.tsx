import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Plan } from "@shared/schema";
import { Plus, Pencil, Trash2, Star, CreditCard } from "lucide-react";

export default function AdminPlans() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<Plan | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    nameEn: "",
    price: "",
    maxOffers: "",
    maxDomains: "",
    maxClicks: "",
    trialDays: "0",
    isUnlimited: false,
    isActive: true,
    isPopular: false,
    hasTrial: false,
    stripePriceId: "",
  });

  const { data: plans = [], isLoading } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/admin/plans", {
        ...data,
        price: parseFloat(data.price) * 100,
        maxOffers: parseInt(data.maxOffers) || 0,
        maxDomains: parseInt(data.maxDomains) || 0,
        maxClicks: parseInt(data.maxClicks) || 0,
        trialDays: parseInt(data.trialDays) || 0,
        stripePriceId: data.stripePriceId || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
      setIsCreateOpen(false);
      resetForm();
      toast({
        title: t("common.success"),
        description: language === "pt-BR" ? "Plano criado" : "Plan created",
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData & { id: number }) => {
      const res = await apiRequest("PUT", `/api/admin/plans/${data.id}`, {
        ...data,
        price: parseFloat(data.price) * 100,
        maxOffers: parseInt(data.maxOffers) || 0,
        maxDomains: parseInt(data.maxDomains) || 0,
        maxClicks: parseInt(data.maxClicks) || 0,
        trialDays: parseInt(data.trialDays) || 0,
        stripePriceId: data.stripePriceId || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
      setEditingPlan(null);
      resetForm();
      toast({
        title: t("common.success"),
        description: language === "pt-BR" ? "Plano atualizado" : "Plan updated",
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/plans/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
      setDeletingPlan(null);
      toast({
        title: t("common.success"),
        description: language === "pt-BR" ? "Plano excluído" : "Plan deleted",
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      nameEn: "",
      price: "",
      maxOffers: "",
      maxDomains: "",
      maxClicks: "",
      trialDays: "0",
      isUnlimited: false,
      isActive: true,
      isPopular: false,
      hasTrial: false,
      stripePriceId: "",
    });
  };

  const openEditDialog = (plan: Plan) => {
    setFormData({
      name: plan.name,
      nameEn: plan.nameEn,
      price: String(plan.price / 100),
      maxOffers: String(plan.maxOffers),
      maxDomains: String(plan.maxDomains),
      maxClicks: String(plan.maxClicks),
      trialDays: String(plan.trialDays),
      isUnlimited: plan.isUnlimited,
      isActive: plan.isActive,
      isPopular: plan.isPopular,
      hasTrial: plan.hasTrial,
      stripePriceId: plan.stripePriceId || "",
    });
    setEditingPlan(plan);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingPlan) {
      updateMutation.mutate({ ...formData, id: editingPlan.id });
    } else {
      createMutation.mutate(formData);
    }
  };

  const formatClicks = (clicks: number, isUnlimited: boolean) => {
    if (isUnlimited) return t("admin.plans.unlimited");
    if (clicks >= 1000000) return `${(clicks / 1000000).toFixed(0)}M`;
    if (clicks >= 1000) return `${(clicks / 1000).toFixed(0)}k`;
    return clicks.toString();
  };

  const formatPrice = (price: number) => {
    return `R$ ${(price / 100).toFixed(2)}`;
  };

  const PlanForm = () => (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">{t("admin.plans.name")} (PT)</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            data-testid="input-plan-name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nameEn">{t("admin.plans.name")} (EN)</Label>
          <Input
            id="nameEn"
            value={formData.nameEn}
            onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
            required
            data-testid="input-plan-name-en"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="price">{t("admin.plans.price")} (R$)</Label>
        <Input
          id="price"
          type="number"
          step="0.01"
          min="0"
          value={formData.price}
          onChange={(e) => setFormData({ ...formData, price: e.target.value })}
          required
          data-testid="input-plan-price"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="stripePriceId">Stripe Price ID</Label>
        <Input
          id="stripePriceId"
          value={formData.stripePriceId}
          onChange={(e) => setFormData({ ...formData, stripePriceId: e.target.value })}
          placeholder="price_1ABC..."
          data-testid="input-stripe-price-id"
        />
        <p className="text-xs text-muted-foreground">
          {language === "pt-BR" 
            ? "ID do preço no Stripe para processar pagamentos" 
            : "Stripe price ID for payment processing"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center justify-between p-3 border rounded-md">
          <Label htmlFor="isUnlimited">{t("admin.plans.unlimited")}</Label>
          <Switch
            id="isUnlimited"
            checked={formData.isUnlimited}
            onCheckedChange={(checked) => setFormData({ ...formData, isUnlimited: checked })}
            data-testid="switch-plan-unlimited"
          />
        </div>
        <div className="flex items-center justify-between p-3 border rounded-md">
          <Label htmlFor="isPopular">{language === "pt-BR" ? "Mais Popular" : "Most Popular"}</Label>
          <Switch
            id="isPopular"
            checked={formData.isPopular}
            onCheckedChange={(checked) => setFormData({ ...formData, isPopular: checked })}
            data-testid="switch-plan-popular"
          />
        </div>
      </div>

      {!formData.isUnlimited && (
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="maxOffers">{t("admin.plans.maxOffers")}</Label>
            <Input
              id="maxOffers"
              type="number"
              min="0"
              value={formData.maxOffers}
              onChange={(e) => setFormData({ ...formData, maxOffers: e.target.value })}
              required
              data-testid="input-plan-max-offers"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxDomains">{t("admin.plans.maxDomains")}</Label>
            <Input
              id="maxDomains"
              type="number"
              min="0"
              value={formData.maxDomains}
              onChange={(e) => setFormData({ ...formData, maxDomains: e.target.value })}
              required
              data-testid="input-plan-max-domains"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxClicks">{t("admin.plans.maxClicks")}</Label>
            <Input
              id="maxClicks"
              type="number"
              min="0"
              value={formData.maxClicks}
              onChange={(e) => setFormData({ ...formData, maxClicks: e.target.value })}
              required
              data-testid="input-plan-max-clicks"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center justify-between p-3 border rounded-md">
          <Label htmlFor="hasTrial">{language === "pt-BR" ? "Oferecer Trial" : "Offer Trial"}</Label>
          <Switch
            id="hasTrial"
            checked={formData.hasTrial}
            onCheckedChange={(checked) => setFormData({ ...formData, hasTrial: checked, trialDays: checked ? formData.trialDays : "0" })}
            data-testid="switch-plan-has-trial"
          />
        </div>
        {formData.hasTrial && (
          <div className="space-y-2">
            <Label htmlFor="trialDays">{t("admin.plans.trialDays")}</Label>
            <Input
              id="trialDays"
              type="number"
              min="1"
              value={formData.trialDays}
              onChange={(e) => setFormData({ ...formData, trialDays: e.target.value })}
              data-testid="input-plan-trial-days"
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between p-3 border rounded-md">
        <Label htmlFor="isActive">{t("offers.active")}</Label>
        <Switch
          id="isActive"
          checked={formData.isActive}
          onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
          data-testid="switch-plan-active"
        />
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setIsCreateOpen(false);
            setEditingPlan(null);
            resetForm();
          }}
        >
          {t("common.cancel")}
        </Button>
        <Button
          type="submit"
          disabled={createMutation.isPending || updateMutation.isPending}
          data-testid="button-save-plan"
        >
          {createMutation.isPending || updateMutation.isPending
            ? t("common.loading")
            : t("common.save")}
        </Button>
      </div>
    </form>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold" data-testid="title-admin-plans">
          {t("admin.plans.title")}
        </h1>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-plan" onClick={() => resetForm()}>
              <Plus className="w-4 h-4 mr-2" />
              {t("admin.plans.create")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("admin.plans.create")}</DialogTitle>
            </DialogHeader>
            <PlanForm />
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
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin.plans.name")}</TableHead>
                  <TableHead>{t("admin.plans.price")}</TableHead>
                  <TableHead>{t("admin.plans.maxOffers")}</TableHead>
                  <TableHead>{t("admin.plans.maxDomains")}</TableHead>
                  <TableHead>{t("admin.plans.maxClicks")}</TableHead>
                  <TableHead>{t("admin.plans.trial")}</TableHead>
                  <TableHead>Stripe</TableHead>
                  <TableHead>{t("offers.status")}</TableHead>
                  <TableHead className="w-24">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.id} data-testid={`row-plan-${plan.id}`}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {language === "pt-BR" ? plan.name : plan.nameEn}
                        {plan.isPopular && (
                          <Badge variant="default" className="gap-1">
                            <Star className="w-3 h-3" />
                            {language === "pt-BR" ? "Popular" : "Popular"}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{formatPrice(plan.price)}</TableCell>
                    <TableCell>
                      {plan.isUnlimited ? t("admin.plans.unlimited") : plan.maxOffers}
                    </TableCell>
                    <TableCell>
                      {plan.isUnlimited ? t("admin.plans.unlimited") : plan.maxDomains}
                    </TableCell>
                    <TableCell>
                      {formatClicks(plan.maxClicks, plan.isUnlimited)}
                    </TableCell>
                    <TableCell>
                      {plan.hasTrial && plan.trialDays > 0 ? (
                        <Badge variant="secondary">
                          {plan.trialDays} {language === "pt-BR" ? "dias" : "days"}
                        </Badge>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      {plan.stripePriceId ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="gap-1 cursor-help">
                              <CreditCard className="w-3 h-3" />
                              {language === "pt-BR" ? "Configurado" : "Configured"}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-mono text-xs">{plan.stripePriceId}</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Badge variant="secondary">
                          {language === "pt-BR" ? "Não configurado" : "Not configured"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={plan.isActive ? "default" : "secondary"}>
                        {plan.isActive ? t("offers.active") : t("offers.inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(plan)}
                          data-testid={`button-edit-plan-${plan.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingPlan(plan)}
                          data-testid={`button-delete-plan-${plan.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingPlan} onOpenChange={(open) => !open && setEditingPlan(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("admin.plans.edit")}</DialogTitle>
          </DialogHeader>
          <PlanForm />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingPlan} onOpenChange={(open) => !open && setDeletingPlan(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === "pt-BR" ? "Excluir plano?" : "Delete plan?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === "pt-BR" 
                ? `Tem certeza que deseja excluir o plano "${deletingPlan?.name}"? Esta ação não pode ser desfeita.`
                : `Are you sure you want to delete the plan "${deletingPlan?.nameEn}"? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingPlan && deleteMutation.mutate(deletingPlan.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? t("common.loading") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
