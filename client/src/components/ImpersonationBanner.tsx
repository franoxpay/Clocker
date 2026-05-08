import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { LogOut, UserCog } from "lucide-react";

interface ImpersonationData {
  isImpersonating: boolean;
  targetUser?: {
    id: string;
    email: string;
  };
  adminUser?: {
    id: string;
    email: string;
  };
  expiresAt?: string;
}

export function ImpersonationBanner() {
  const { t, language } = useLanguage();

  const { data: impersonation } = useQuery<ImpersonationData>({
    queryKey: ["/api/admin/impersonation/status"],
    retry: false,
    refetchInterval: 60_000,
  });

  const exitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/impersonation/exit");
      return res.json();
    },
    onSuccess: () => {
      queryClient.clear();
      window.location.href = "/confg-admin/users";
    },
  });

  if (!impersonation?.isImpersonating) {
    return null;
  }

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 h-12 bg-destructive/90 backdrop-blur-sm flex items-center justify-between px-4 gap-2"
      data-testid="banner-impersonation"
    >
      <div className="flex items-center gap-2 text-destructive-foreground text-sm font-medium min-w-0">
        <UserCog className="w-4 h-4 shrink-0" />
        <span className="truncate">
          {language === "pt-BR" ? "Você está acessando como" : "You are accessing as"}:&nbsp;
          <strong>{impersonation.targetUser?.email}</strong>
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => exitMutation.mutate()}
        disabled={exitMutation.isPending}
        className="shrink-0 bg-background/20 border-destructive-foreground/30 text-destructive-foreground hover:bg-background/30"
        data-testid="button-exit-impersonation"
      >
        <LogOut className="w-4 h-4 mr-2" />
        {language === "pt-BR" ? "Sair da impersonação" : "Exit impersonation"}
      </Button>
    </div>
  );
}
