import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { LogOut } from "lucide-react";

interface ImpersonationData {
  isImpersonating: boolean;
  targetUser?: {
    id: string;
    email: string;
  };
}

export function ImpersonationBanner() {
  const { t } = useLanguage();

  const { data: impersonation } = useQuery<ImpersonationData>({
    queryKey: ["/api/admin/impersonation/status"],
    retry: false,
  });

  const exitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/impersonation/exit");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/impersonation/status"] });
      window.location.href = "/confg-admin";
    },
  });

  if (!impersonation?.isImpersonating) {
    return null;
  }

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 h-12 bg-destructive/90 backdrop-blur-sm flex items-center justify-between px-4"
      data-testid="banner-impersonation"
    >
      <span className="text-destructive-foreground text-sm font-medium">
        {t("admin.impersonating")}: {impersonation.targetUser?.email}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => exitMutation.mutate()}
        disabled={exitMutation.isPending}
        className="bg-background/20 border-destructive-foreground/30 text-destructive-foreground"
        data-testid="button-exit-impersonation"
      >
        <LogOut className="w-4 h-4 mr-2" />
        {t("admin.returnToAdmin")}
      </Button>
    </div>
  );
}
