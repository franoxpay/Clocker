import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/contexts/LanguageContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Link as LinkIcon, Loader2, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface AuthProps {
  onBack?: () => void;
}

export default function Auth({ onBack }: AuthProps) {
  const { language } = useLanguage();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [registerData, setRegisterData] = useState({ 
    email: "", 
    password: "", 
    confirmPassword: "",
    firstName: "", 
    lastName: "" 
  });

  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      return apiRequest("POST", "/api/auth/login", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: language === "pt-BR" ? "Login realizado!" : "Logged in!",
        description: language === "pt-BR" ? "Bem-vindo de volta!" : "Welcome back!",
      });
    },
    onError: (error: any) => {
      toast({
        title: language === "pt-BR" ? "Erro no login" : "Login error",
        description: error.message || (language === "pt-BR" ? "Credenciais inválidas" : "Invalid credentials"),
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; firstName?: string; lastName?: string }) => {
      return apiRequest("POST", "/api/auth/register", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: language === "pt-BR" ? "Conta criada!" : "Account created!",
        description: language === "pt-BR" ? "Bem-vindo à plataforma!" : "Welcome to the platform!",
      });
    },
    onError: (error: any) => {
      toast({
        title: language === "pt-BR" ? "Erro no cadastro" : "Registration error",
        description: error.message || (language === "pt-BR" ? "Erro ao criar conta" : "Error creating account"),
        variant: "destructive",
      });
    },
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginData.email || !loginData.password) {
      toast({
        title: language === "pt-BR" ? "Campos obrigatórios" : "Required fields",
        description: language === "pt-BR" ? "Preencha email e senha" : "Fill in email and password",
        variant: "destructive",
      });
      return;
    }
    loginMutation.mutate(loginData);
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerData.email || !registerData.password) {
      toast({
        title: language === "pt-BR" ? "Campos obrigatórios" : "Required fields",
        description: language === "pt-BR" ? "Preencha email e senha" : "Fill in email and password",
        variant: "destructive",
      });
      return;
    }
    if (registerData.password.length < 6) {
      toast({
        title: language === "pt-BR" ? "Senha fraca" : "Weak password",
        description: language === "pt-BR" ? "A senha deve ter pelo menos 6 caracteres" : "Password must be at least 6 characters",
        variant: "destructive",
      });
      return;
    }
    if (registerData.password !== registerData.confirmPassword) {
      toast({
        title: language === "pt-BR" ? "Senhas diferentes" : "Passwords don't match",
        description: language === "pt-BR" ? "As senhas não conferem" : "Passwords do not match",
        variant: "destructive",
      });
      return;
    }
    registerMutation.mutate({
      email: registerData.email,
      password: registerData.password,
      firstName: registerData.firstName || undefined,
      lastName: registerData.lastName || undefined,
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <button 
            onClick={onBack}
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
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">
              {language === "pt-BR" ? "Acesse sua conta" : "Access your account"}
            </CardTitle>
            <CardDescription>
              {language === "pt-BR" 
                ? "Entre ou crie uma conta para continuar" 
                : "Login or create an account to continue"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login" data-testid="tab-login">
                  {language === "pt-BR" ? "Entrar" : "Login"}
                </TabsTrigger>
                <TabsTrigger value="register" data-testid="tab-register">
                  {language === "pt-BR" ? "Cadastrar" : "Register"}
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={loginData.email}
                      onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                      data-testid="input-login-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">
                      {language === "pt-BR" ? "Senha" : "Password"}
                    </Label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="******"
                        value={loginData.password}
                        onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                        data-testid="input-login-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowPassword(!showPassword)}
                        data-testid="button-toggle-password"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={loginMutation.isPending}
                    data-testid="button-submit-login"
                  >
                    {loginMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : null}
                    {language === "pt-BR" ? "Entrar" : "Login"}
                  </Button>
                </form>
              </TabsContent>
              
              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="register-firstname">
                        {language === "pt-BR" ? "Nome" : "First Name"}
                      </Label>
                      <Input
                        id="register-firstname"
                        type="text"
                        placeholder="João"
                        value={registerData.firstName}
                        onChange={(e) => setRegisterData({ ...registerData, firstName: e.target.value })}
                        data-testid="input-register-firstname"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-lastname">
                        {language === "pt-BR" ? "Sobrenome" : "Last Name"}
                      </Label>
                      <Input
                        id="register-lastname"
                        type="text"
                        placeholder="Silva"
                        value={registerData.lastName}
                        onChange={(e) => setRegisterData({ ...registerData, lastName: e.target.value })}
                        data-testid="input-register-lastname"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-email">Email</Label>
                    <Input
                      id="register-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={registerData.email}
                      onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                      data-testid="input-register-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-password">
                      {language === "pt-BR" ? "Senha" : "Password"}
                    </Label>
                    <Input
                      id="register-password"
                      type="password"
                      placeholder="******"
                      value={registerData.password}
                      onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                      data-testid="input-register-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-confirm-password">
                      {language === "pt-BR" ? "Confirmar Senha" : "Confirm Password"}
                    </Label>
                    <Input
                      id="register-confirm-password"
                      type="password"
                      placeholder="******"
                      value={registerData.confirmPassword}
                      onChange={(e) => setRegisterData({ ...registerData, confirmPassword: e.target.value })}
                      data-testid="input-register-confirm-password"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={registerMutation.isPending}
                    data-testid="button-submit-register"
                  >
                    {registerMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : null}
                    {language === "pt-BR" ? "Criar Conta" : "Create Account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
