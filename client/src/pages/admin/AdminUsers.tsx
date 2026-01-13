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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  Key,
  Trash2,
} from "lucide-react";

interface ClicksBreakdown {
  today: number;
  thisWeek: number;
  thisMonth: number;
  lifetime: number;
}

interface UserWithClicks extends User {
  clicksBreakdown: ClicksBreakdown;
}

interface UsersResponse {
  users: UserWithClicks[];
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
  const [actionType, setActionType] = useState<"changePlan" | "addDays" | "changePassword" | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [daysToAdd, setDaysToAdd] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deleteUser, setDeleteUser] = useState<User | null>(null);

  const usersUrl = `/api/admin/users?page=${page}${search ? `&search=${encodeURIComponent(search)}` : ""}`;
  
  const { data, isLoading } = useQuery<UsersResponse>({
    queryKey: [usersUrl],
  });

  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });

  const suspendMutation = useMutation({
    mutationFn: async ({ userId, suspend }: { userId: string; suspend: boolean }) => {
      await apiRequest("POST", `/api/admin/users/${userId}/suspend`, { suspend });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/admin/users") });
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
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/admin/users") });
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
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/admin/users") });
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
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/admin/users") });
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

  const changePasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      await apiRequest("POST", `/api/admin/users/${userId}/change-password`, { password });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/admin/users") });
      setActionType(null);
      setSelectedUser(null);
      setNewPassword("");
      toast({
        title: t("common.success"),
        description: language === "pt-BR" ? "Senha alterada" : "Password changed",
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/admin/users") });
      setDeleteUser(null);
      toast({
        title: t("common.success"),
        description: language === "pt-BR" ? "Usuário deletado com sucesso" : "User deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: language === "pt-BR" ? "Erro ao deletar usuário" : "Error deleting user",
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
                    <TableHead>{language === "pt-BR" ? "Dias Restantes" : "Days Left"}</TableHead>
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
                        {user.subscriptionEndDate ? (
                          (() => {
                            const endDate = new Date(user.subscriptionEndDate);
                            const now = new Date();
                            const diffTime = endDate.getTime() - now.getTime();
                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            if (diffDays < 0) {
                              return <span className="text-destructive">{language === "pt-BR" ? "Expirado" : "Expired"}</span>;
                            }
                            if (diffDays <= 3) {
                              return <span className="text-amber-500 font-medium">{diffDays} {language === "pt-BR" ? "dias" : "days"}</span>;
                            }
                            return <span>{diffDays} {language === "pt-BR" ? "dias" : "days"}</span>;
                          })()
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.clicksBreakdown ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help tabular-nums">
                                {(user.clicksBreakdown.today || 0).toLocaleString()} {language === "pt-BR" ? "hoje" : "today"} | {(user.clicksBreakdown.thisMonth || 0).toLocaleString()} {language === "pt-BR" ? "mês" : "month"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="space-y-1 text-sm">
                                <div>{language === "pt-BR" ? "Hoje" : "Today"}: {(user.clicksBreakdown.today || 0).toLocaleString()}</div>
                                <div>{language === "pt-BR" ? "Semana" : "Week"}: {(user.clicksBreakdown.thisWeek || 0).toLocaleString()}</div>
                                <div>{language === "pt-BR" ? "Mês" : "Month"}: {(user.clicksBreakdown.thisMonth || 0).toLocaleString()}</div>
                                <div>{language === "pt-BR" ? "Vitalício" : "Lifetime"}: {(user.clicksBreakdown.lifetime || 0).toLocaleString()}</div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
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
                                setDaysToAdd("");
                                setActionType("addDays");
                              }}
                            >
                              <Calendar className="w-4 h-4 mr-2" />
                              {language === "pt-BR" ? "Definir Dias" : "Set Days"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedUser(user);
                                setNewPassword("");
                                setActionType("changePassword");
                              }}
                            >
                              <Key className="w-4 h-4 mr-2" />
                              {language === "pt-BR" ? "Alterar Senha" : "Change Password"}
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
                            <DropdownMenuItem
                              onClick={() => setDeleteUser(user)}
                              className="text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              {language === "pt-BR" ? "Deletar Usuário" : "Delete User"}
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
                      {language === "pt-BR" ? plan.name : plan.nameEn} - R$ {(plan.price / 100).toFixed(2)}
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
            <DialogTitle>{language === "pt-BR" ? "Definir Dias Restantes" : "Set Remaining Days"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {language === "pt-BR" 
                ? `Usuário: ${selectedUser?.email}` 
                : `User: ${selectedUser?.email}`}
            </div>
            {selectedUser?.subscriptionEndDate && (
              <div className="text-sm">
                {language === "pt-BR" ? "Dias restantes atuais: " : "Current remaining days: "}
                <span className="font-medium">
                  {Math.max(0, Math.ceil((new Date(selectedUser.subscriptionEndDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))}
                </span>
              </div>
            )}
            <div className="space-y-2">
              <Label>{language === "pt-BR" ? "Novos dias restantes" : "New remaining days"}</Label>
              <Input
                type="number"
                min="0"
                value={daysToAdd}
                onChange={(e) => setDaysToAdd(e.target.value)}
                placeholder="30"
                data-testid="input-set-days"
              />
              <p className="text-xs text-muted-foreground">
                {language === "pt-BR" 
                  ? "Define quantos dias o usuário terá de acesso. A cobrança automática do Stripe continua no ciclo original." 
                  : "Sets how many days the user will have access. Stripe automatic billing continues on the original cycle."}
              </p>
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
                disabled={daysToAdd === "" || addDaysMutation.isPending}
              >
                {addDaysMutation.isPending ? t("common.loading") : t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={actionType === "changePassword"} onOpenChange={(open) => !open && setActionType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{language === "pt-BR" ? "Alterar Senha" : "Change Password"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {language === "pt-BR" 
                ? `Alterando senha para: ${selectedUser?.email}` 
                : `Changing password for: ${selectedUser?.email}`}
            </div>
            <div className="space-y-2">
              <Label>{language === "pt-BR" ? "Nova Senha" : "New Password"}</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={language === "pt-BR" ? "Mínimo 6 caracteres" : "Minimum 6 characters"}
                data-testid="input-new-password"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setActionType(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() =>
                  selectedUser &&
                  changePasswordMutation.mutate({
                    userId: selectedUser.id,
                    password: newPassword,
                  })
                }
                disabled={newPassword.length < 6 || changePasswordMutation.isPending}
              >
                {changePasswordMutation.isPending ? t("common.loading") : t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === "pt-BR" ? "Deletar Usuário" : "Delete User"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === "pt-BR" 
                ? `Tem certeza que deseja deletar o usuário "${deleteUser?.email}"? Esta ação é irreversível e vai deletar todos os domínios e ofertas associados.`
                : `Are you sure you want to delete the user "${deleteUser?.email}"? This action is irreversible and will delete all associated domains and offers.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteUser && deleteUserMutation.mutate(deleteUser.id)}
              className="bg-destructive text-destructive-foreground"
            >
              {deleteUserMutation.isPending ? t("common.loading") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
