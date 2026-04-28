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
import { Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTheme } from "@/contexts/ThemeContext";
import cleryonLogo from "@/assets/cleryon-logo.webp";

interface AuthProps {
  onBack?: () => void;
}

export default function Auth({ onBack }: AuthProps) {
  const { language } = useLanguage();
  const { theme } = useTheme();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  
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

  const forgotPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      return apiRequest("POST", "/api/auth/forgot-password", { email });
    },
    onSuccess: () => {
      toast({
        title: language === "pt-BR" ? "Email enviado!" : "Email sent!",
        description: language === "pt-BR" 
          ? "Se existe uma conta com esse email, você receberá um link para redefinir sua senha." 
          : "If an account with that email exists, you will receive a link to reset your password.",
      });
      setShowForgotPassword(false);
      setForgotPasswordEmail("");
    },
    onError: (error: any) => {
      toast({
        title: language === "pt-BR" ? "Erro" : "Error",
        description: error.message || (language === "pt-BR" ? "Erro ao enviar email" : "Error sending email"),
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

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotPasswordEmail) {
      toast({
        title: language === "pt-BR" ? "Campo obrigatório" : "Required field",
        description: language === "pt-BR" ? "Preencha o email" : "Fill in the email",
        variant: "destructive",
      });
      return;
    }
    forgotPasswordMutation.mutate(forgotPasswordEmail);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center"
            data-testid="button-back-home"
          >
            <img
              src={cleryonLogo}
              alt="Cleryon"
              className="h-7 w-auto"
              style={theme === "light" ? { filter: "invert(1)" } : undefined}
            />
          </button>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          {showForgotPassword ? (
            <>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">
                  {language === "pt-BR" ? "Redefinir Senha" : "Reset Password"}
                </CardTitle>
                <CardDescription>
                  {language === "pt-BR" 
                    ? "Digite seu email para receber um link de redefinição" 
                    : "Enter your email to receive a reset link"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email">Email</Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={forgotPasswordEmail}
                      onChange={(e) => setForgotPasswordEmail(e.target.value)}
                      data-testid="input-forgot-email"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={forgotPasswordMutation.isPending}
                    data-testid="button-submit-forgot"
                  >
                    {forgotPasswordMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : null}
                    {language === "pt-BR" ? "Enviar Link" : "Send Link"}
                  </Button>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    className="w-full" 
                    onClick={() => setShowForgotPassword(false)}
                    data-testid="button-back-login"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    {language === "pt-BR" ? "Voltar ao Login" : "Back to Login"}
                  </Button>
                </form>
              </CardContent>
            </>
          ) : (
            <>
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
                        <div className="flex items-center justify-between">
                          <Label htmlFor="login-password">
                            {language === "pt-BR" ? "Senha" : "Password"}
                          </Label>
                          <button
                            type="button"
                            className="text-sm text-primary hover:underline"
                            onClick={() => setShowForgotPassword(true)}
                            data-testid="link-forgot-password"
                          >
                            {language === "pt-BR" ? "Esqueceu a senha?" : "Forgot password?"}
                          </button>
                        </div>
                        <div className="relative">
                          <Input
                            id="login-password"
                            type={showPassword ? "text" : "password"}
                            placeholder="******"
                            className="pr-10"
                            value={loginData.password}
                            onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                            data-testid="input-login-password"
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
            </>
          )}
        </Card>
      </main>
    </div>
  );
}
