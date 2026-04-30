import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Upload, ImageIcon, MessageCircle, Save } from "lucide-react";

interface AdminConfig {
  logoUrl?: string;
  supportWhatsapp?: string | null;
}

export default function AdminSettings() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState("");

  const { data: config, isLoading } = useQuery<AdminConfig>({
    queryKey: ["/api/admin/config"],
  });

  useEffect(() => {
    if (config?.supportWhatsapp) {
      setWhatsappNumber(config.supportWhatsapp);
    }
  }, [config?.supportWhatsapp]);

  const updateWhatsappMutation = useMutation({
    mutationFn: async (supportWhatsapp: string) => {
      return apiRequest("PATCH", "/api/admin/config", { supportWhatsapp });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/support-whatsapp"] });
      toast({
        title: t("common.success"),
        description: language === "pt-BR" ? "Número de WhatsApp atualizado" : "WhatsApp number updated",
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: language === "pt-BR" ? "Erro ao atualizar WhatsApp" : "Error updating WhatsApp",
        variant: "destructive",
      });
    },
  });

  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      setUploading(true);
      const formData = new FormData();
      formData.append("logo", file);

      const res = await fetch("/api/admin/config/logo", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Upload failed");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/config"] });
      toast({
        title: t("common.success"),
        description: language === "pt-BR" ? "Logo atualizado" : "Logo updated",
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: language === "pt-BR" ? "Erro ao enviar logo" : "Error uploading logo",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setUploading(false);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast({
          title: t("common.error"),
          description: language === "pt-BR" ? "Selecione uma imagem" : "Select an image",
          variant: "destructive",
        });
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        toast({
          title: t("common.error"),
          description: language === "pt-BR" ? "Imagem muito grande (max 2MB)" : "Image too large (max 2MB)",
          variant: "destructive",
        });
        return;
      }
      uploadLogoMutation.mutate(file);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.settings.logo")}</CardTitle>
          <CardDescription>{t("admin.settings.logoHelp")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <Skeleton className="h-24 w-48" />
          ) : (
            <div className="flex items-start gap-6">
              <div className="w-48 h-24 border rounded-md flex items-center justify-center bg-muted/30">
                {config?.logoUrl ? (
                  <img
                    src={config.logoUrl}
                    alt="Logo"
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <ImageIcon className="w-12 h-12 text-muted-foreground" />
                )}
              </div>
              <div className="space-y-2">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/svg+xml,image/jpeg"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  data-testid="button-upload-logo"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {uploading ? t("common.loading") : t("admin.settings.uploadLogo")}
                </Button>
                <p className="text-xs text-muted-foreground">
                  PNG, SVG ou JPG. Max 2MB.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5" />
            {language === "pt-BR" ? "Suporte WhatsApp" : "WhatsApp Support"}
          </CardTitle>
          <CardDescription>
            {language === "pt-BR" 
              ? "Configure o número de WhatsApp que aparecerá no botão de suporte para os usuários." 
              : "Configure the WhatsApp number that will appear in the support button for users."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="whatsapp">
              {language === "pt-BR" ? "Número do WhatsApp" : "WhatsApp Number"}
            </Label>
            <div className="flex gap-2">
              <Input
                id="whatsapp"
                placeholder="+5511999999999"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                data-testid="input-whatsapp-number"
              />
              <Button
                onClick={() => updateWhatsappMutation.mutate(whatsappNumber)}
                disabled={updateWhatsappMutation.isPending}
                data-testid="button-save-whatsapp"
              >
                <Save className="w-4 h-4 mr-2" />
                {updateWhatsappMutation.isPending 
                  ? t("common.loading") 
                  : (language === "pt-BR" ? "Salvar" : "Save")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {language === "pt-BR" 
                ? "Inclua o código do país (ex: +55 para Brasil). Se vazio, o botão de suporte não aparecerá." 
                : "Include country code (e.g., +1 for US). If empty, the support button won't appear."}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
