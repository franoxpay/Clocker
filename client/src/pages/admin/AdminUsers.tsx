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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { User, Plan } from "@shared/schema";
import { 
  Search, 
  MoreVertical, 
  UserCog, 
  Ban, 
  CheckCircle, 
  CreditCard, 
  Calendar,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface UsersResponse {
  users: User[];
  total: number;
  page: number;
  limit: number;
}

export default function AdminUsers() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [actionType, setActionType] = useState<"changePlan" | "addDays" | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [daysToAdd, setDaysToAdd] = useState("");

  const { data, isLoading } = useQuery<UsersResponse>({
    queryKey: ["/api/admin/users", page, search],
  });

  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });

  const suspendMutation = useMutation({
    mutationFn: async ({ userId, suspend }: { userId: string; suspend: boolean }) => {
      await apiRequest("POST", `/api/admin/users/${userId}/suspend`, { suspend });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: t("common.success"),
        description: language === "pt-BR" ? "Usuário atualizado" : "User updated",
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        variant: "destructive",
      });
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/impersonate/${userId}`);
      return res.json();
    },
    onSuccess: () => {
      window.location.href = "/";
    },
    onError: () => {
      toast({
        title: t("common.error"),
        variant: "destructive",
      });
    },
  });

  const forcePaymentMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("POST", `/api/admin/users/${userId}/force-payment`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: t("common.success"),
        description: language === "pt-BR" ? "Pagamento registrado" : "Payment registered",
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        variant: "destructive",
      });
    },
  });

  const changePlanMutation = useMutation({
    mutationFn: async ({ userId, planId }: { userId: string; planId: number }) => {
      await apiRequest("POST", `/api/admin/users/${userId}/change-plan`, { planId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setActionType(null);
      setSelectedUser(null);
      toast({
        title: t("common.success"),
        description: language === "pt-BR" ? "Plano alterado" : "Plan changed",
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        variant: "destructive",
      });
    },
  });

  const addDaysMutation = useMutation({
    mutationFn: async ({ userId, days }: { userId: string; days: number }) => {
      await apiRequest("POST", `/api/admin/users/${userId}/add-days`, { days });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setActionType(null);
      setSelectedUser(null);
      setDaysToAdd("");
      toast({
        title: t("common.success"),
        description: language === "pt-BR" ? "Dias adicionados" : "Days added",
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        variant: "destructive",
      });
    },
  });

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  const getPlanName = (planId: number | null) => {
    if (!planId) return "-";
    const plan = plans.find((p) => p.id === planId);
    return plan ? (language === "pt-BR" ? plan.name : plan.nameEn) : "-";
  };

  const getStatusBadge = (user: User) => {
    const isSuspended = user.suspendedAt !== null;
    const isTrialing = user.trialEndsAt !== null && new Date(user.trialEndsAt) > new Date();
    
    if (isSuspended) {
      return <Badge variant="destructive">{language === "pt-BR" ? "Suspenso" : "Suspended"}</Badge>;
    }
    if (isTrialing) {
      return <Badge variant="secondary">Trial</Badge>;
    }
    if (user.subscriptionStatus === "active") {
      return <Badge variant="default" className="bg-green-600">{language === "pt-BR" ? "Ativo" : "Active"}</Badge>;
    }
    return <Badge variant="secondary">{user.subscriptionStatus || "-"}</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold" data-testid="title-admin-users">
          {t("admin.users.title")}
        </h1>
      </div>

      <Card>
        <CardHeader>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("admin.users.search")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
              data-testid="input-search-users"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !data?.users.length ? (
            <div className="p-12 text-center text-muted-foreground">
              {language === "pt-BR" ? "Nenhum usuário encontrado" : "No users found"}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.users.email")}</TableHead>
                    <TableHead>{t("admin.users.plan")}</TableHead>
                    <TableHead>{t("admin.users.clicks")}</TableHead>
                    <TableHead>{t("admin.users.status")}</TableHead>
                    <TableHead className="w-12">{t("admin.users.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.users.map((user) => (
                    <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                      <TableCell>
                        <div className="font-medium">{user.email}</div>
                        {user.isAdmin && (
                          <Badge variant="outline" className="text-xs mt-1">Admin</Badge>
                        )}
                      </TableCell>
                      <TableCell>{getPlanName(user.planId)}</TableCell>
                      <TableCell>
                        {user.clicksUsedThisMonth?.toLocaleString() || 0}
                      </TableCell>
                      <TableCell>{getStatusBadge(user)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => impersonateMutation.mutate(user.id)}
                            >
                              <UserCog className="w-4 h-4 mr-2" />
                              {t("admin.users.impersonate")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedUser(user);
                                setSelectedPlanId(String(user.planId || ""));
                                setActionType("changePlan");
                              }}
                            >
                              <CreditCard className="w-4 h-4 mr-2" />
                              {t("admin.users.changePlan")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedUser(user);
                                setActionType("addDays");
                              }}
                            >
                              <Calendar className="w-4 h-4 mr-2" />
                              {t("admin.users.addDays")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => forcePaymentMutation.mutate(user.id)}
                            >
                              <CheckCircle className="w-4 h-4 mr-2" />
                              {t("admin.users.forcePayment")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                suspendMutation.mutate({
                                  userId: user.id,
                                  suspend: user.suspendedAt === null,
                                })
                              }
                              className={user.suspendedAt !== null ? "" : "text-destructive"}
                            >
                              <Ban className="w-4 h-4 mr-2" />
                              {user.suspendedAt !== null
                                ? t("admin.users.activate")
                                : t("admin.users.suspend")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between p-4 border-t">
                <div className="text-sm text-muted-foreground">
                  {data.total} {language === "pt-BR" ? "usuários" : "users"}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm">
                    {page} / {totalPages || 1}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={actionType === "changePlan"} onOpenChange={(open) => !open && setActionType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.users.changePlan")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("admin.plans.name")}</Label>
              <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((plan) => (
                    <SelectItem key={plan.id} value={String(plan.id)}>
                      {language === "pt-BR" ? plan.name : plan.nameEn} - R${plan.price}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setActionType(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() =>
                  selectedUser &&
                  changePlanMutation.mutate({
                    userId: selectedUser.id,
                    planId: parseInt(selectedPlanId),
                  })
                }
                disabled={!selectedPlanId || changePlanMutation.isPending}
              >
                {changePlanMutation.isPending ? t("common.loading") : t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={actionType === "addDays"} onOpenChange={(open) => !open && setActionType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.users.addDays")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{language === "pt-BR" ? "Dias a adicionar" : "Days to add"}</Label>
              <Input
                type="number"
                min="1"
                value={daysToAdd}
                onChange={(e) => setDaysToAdd(e.target.value)}
                placeholder="7"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setActionType(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() =>
                  selectedUser &&
                  addDaysMutation.mutate({
                    userId: selectedUser.id,
                    days: parseInt(daysToAdd),
                  })
                }
                disabled={!daysToAdd || addDaysMutation.isPending}
              >
                {addDaysMutation.isPending ? t("common.loading") : t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
