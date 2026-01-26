import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Link as LinkIcon, Loader2, Eye, EyeOff, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function ResetPassword() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get("token") || "";

  const { data: tokenValid, isLoading: tokenLoading } = useQuery({
    queryKey: ["/api/auth/verify-reset-token", token],
    queryFn: async () => {
      const response = await fetch(`/api/auth/verify-reset-token?token=${token}`);
      const data = await response.json();
      return data.valid;
    },
    enabled: !!token,
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: { token: string; password: string }) => {
      return apiRequest("POST", "/api/auth/reset-password", data);
    },
    onSuccess: () => {
      toast({
        title: language === "pt-BR" ? "Senha redefinida!" : "Password reset!",
        description: language === "pt-BR" 
          ? "Sua senha foi alterada com sucesso. Faça login com sua nova senha." 
          : "Your password has been changed successfully. Login with your new password.",
      });
      setLocation("/");
    },
    onError: (error: any) => {
      toast({
        title: language === "pt-BR" ? "Erro" : "Error",
        description: error.message || (language === "pt-BR" ? "Erro ao redefinir senha" : "Error resetting password"),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!password || !confirmPassword) {
      toast({
        title: language === "pt-BR" ? "Campos obrigatórios" : "Required fields",
        description: language === "pt-BR" ? "Preencha todos os campos" : "Fill in all fields",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: language === "pt-BR" ? "Senha fraca" : "Weak password",
        description: language === "pt-BR" ? "A senha deve ter pelo menos 6 caracteres" : "Password must be at least 6 characters",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: language === "pt-BR" ? "Senhas diferentes" : "Passwords don't match",
        description: language === "pt-BR" ? "As senhas não conferem" : "Passwords do not match",
        variant: "destructive",
      });
      return;
    }

    resetPasswordMutation.mutate({ token, password });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <button 
            onClick={() => setLocation("/")}
            className="flex items-center gap-3 hover-elevate rounded-md px-2 py-1"
            data-testid="button-back-home"
          >
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <LinkIcon className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg">Cloaker</span>
          </button>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          {tokenLoading ? (
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </CardContent>
          ) : !token || !tokenValid ? (
            <>
              <CardHeader className="text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                  <XCircle className="w-6 h-6 text-destructive" />
                </div>
                <CardTitle className="text-2xl">
                  {language === "pt-BR" ? "Link Inválido" : "Invalid Link"}
                </CardTitle>
                <CardDescription>
                  {language === "pt-BR" 
                    ? "Este link de redefinição é inválido ou expirou. Solicite um novo link." 
                    : "This reset link is invalid or has expired. Please request a new link."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  className="w-full" 
                  onClick={() => setLocation("/")}
                  data-testid="button-back-login"
                >
                  {language === "pt-BR" ? "Voltar ao Login" : "Back to Login"}
                </Button>
              </CardContent>
            </>
          ) : resetPasswordMutation.isSuccess ? (
            <>
              <CardHeader className="text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
                  <CheckCircle className="w-6 h-6 text-green-500" />
                </div>
                <CardTitle className="text-2xl">
                  {language === "pt-BR" ? "Senha Redefinida!" : "Password Reset!"}
                </CardTitle>
                <CardDescription>
                  {language === "pt-BR" 
                    ? "Sua senha foi alterada com sucesso." 
                    : "Your password has been changed successfully."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  className="w-full" 
                  onClick={() => setLocation("/")}
                  data-testid="button-go-login"
                >
                  {language === "pt-BR" ? "Fazer Login" : "Go to Login"}
                </Button>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">
                  {language === "pt-BR" ? "Nova Senha" : "New Password"}
                </CardTitle>
                <CardDescription>
                  {language === "pt-BR" 
                    ? "Digite sua nova senha abaixo" 
                    : "Enter your new password below"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">
                      {language === "pt-BR" ? "Nova Senha" : "New Password"}
                    </Label>
                    <div className="relative">
                      <Input
                        id="new-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="******"
                        className="pr-10"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        data-testid="input-new-password"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowPassword(!showPassword)}
                        data-testid="button-toggle-password"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">
                      {language === "pt-BR" ? "Confirmar Senha" : "Confirm Password"}
                    </Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="******"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      data-testid="input-confirm-password"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={resetPasswordMutation.isPending}
                    data-testid="button-submit-reset"
                  >
                    {resetPasswordMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : null}
                    {language === "pt-BR" ? "Redefinir Senha" : "Reset Password"}
                  </Button>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </main>
    </div>
  );
}
