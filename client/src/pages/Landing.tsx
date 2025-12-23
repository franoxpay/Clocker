import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Shield, Zap, Globe, BarChart3, Check } from "lucide-react";
import Auth from "./Auth";
import logoPreta from "@assets/preta_1766452084601.png";
import logoBranca from "@assets/branca_1766452088725.png";

const plans = [
  {
    id: 1,
    nameKey: "plan.starter",
    price: 99,
    offers: 2,
    domains: 1,
    clicks: "100k",
    hasTrial: true,
    trialDays: 7,
  },
  {
    id: 2,
    nameKey: "plan.professional",
    price: 249,
    offers: 5,
    domains: 3,
    clicks: "500k",
    hasTrial: false,
    popular: true,
  },
  {
    id: 3,
    nameKey: "plan.enterprise",
    price: 497,
    offers: "Ilimitado",
    domains: "Ilimitado",
    clicks: "Ilimitado",
    hasTrial: false,
  },
];

export default function Landing() {
  const { t, language } = useLanguage();
  const { theme } = useTheme();
  const [showAuth, setShowAuth] = useState(false);

  const features = [
    {
      icon: Shield,
      title: language === "pt-BR" ? "Proteção Avançada" : "Advanced Protection",
      description: language === "pt-BR" 
        ? "Sistema inteligente de filtragem por país, dispositivo e parâmetros de anúncio"
        : "Intelligent filtering system by country, device and ad parameters",
    },
    {
      icon: Zap,
      title: language === "pt-BR" ? "Redirecionamento Rápido" : "Fast Redirect",
      description: language === "pt-BR"
        ? "Redirecionamento instantâneo com menos de 100ms de latência"
        : "Instant redirect with less than 100ms latency",
    },
    {
      icon: Globe,
      title: language === "pt-BR" ? "Multi-Plataforma" : "Multi-Platform",
      description: language === "pt-BR"
        ? "Suporte completo para TikTok Ads e Facebook Ads"
        : "Full support for TikTok Ads and Facebook Ads",
    },
    {
      icon: BarChart3,
      title: language === "pt-BR" ? "Analytics Detalhado" : "Detailed Analytics",
      description: language === "pt-BR"
        ? "Acompanhe todos os clicks em tempo real com logs completos"
        : "Track all clicks in real time with complete logs",
    },
  ];

  if (showAuth) {
    return <Auth onBack={() => setShowAuth(false)} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center">
            <img 
              src={theme === "dark" ? logoBranca : logoPreta} 
              alt="Clerion" 
              className="h-8 w-auto"
            />
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
            <Button onClick={() => setShowAuth(true)} data-testid="button-login">
              {t("auth.login")}
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="py-20 md:py-32">
          <div className="container mx-auto px-4 text-center">
            <Badge variant="secondary" className="mb-6">
              {language === "pt-BR" ? "Plataforma de Cloaking" : "Cloaking Platform"}
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold mb-6 max-w-4xl mx-auto">
              {language === "pt-BR"
                ? "Proteja seus anúncios com o cloaker mais inteligente do mercado"
                : "Protect your ads with the smartest cloaker on the market"}
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              {language === "pt-BR"
                ? "Filtragem avançada por país, dispositivo e parâmetros de anúncio para TikTok e Facebook Ads"
                : "Advanced filtering by country, device and ad parameters for TikTok and Facebook Ads"}
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button size="lg" onClick={() => setShowAuth(true)} data-testid="button-start-now">
                {language === "pt-BR" ? "Começar Agora" : "Start Now"}
              </Button>
              <Button variant="outline" size="lg" asChild data-testid="button-learn-more">
                <a href="#pricing">
                  {language === "pt-BR" ? "Ver Planos" : "View Plans"}
                </a>
              </Button>
            </div>
          </div>
        </section>

        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-bold text-center mb-12">
              {language === "pt-BR" ? "Por que escolher nossa plataforma?" : "Why choose our platform?"}
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((feature, index) => (
                <Card key={index} className="bg-card">
                  <CardHeader>
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                      <feature.icon className="w-6 h-6 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="py-20">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-bold text-center mb-4">
              {language === "pt-BR" ? "Escolha seu plano" : "Choose your plan"}
            </h2>
            <p className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
              {language === "pt-BR"
                ? "Planos flexíveis para todos os tamanhos de operação"
                : "Flexible plans for all operation sizes"}
            </p>
            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {plans.map((plan) => (
                <Card
                  key={plan.id}
                  className={`relative ${plan.popular ? "border-primary" : ""}`}
                  data-testid={`card-plan-${plan.id}`}
                >
                  {plan.popular && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                      {language === "pt-BR" ? "Mais Popular" : "Most Popular"}
                    </Badge>
                  )}
                  <CardHeader className="text-center">
                    <CardTitle>{t(plan.nameKey)}</CardTitle>
                    <div className="mt-4">
                      <span className="text-4xl font-bold">R${plan.price}</span>
                      <span className="text-muted-foreground">/mês</span>
                    </div>
                    {plan.hasTrial && (
                      <Badge variant="secondary" className="mt-2">
                        {plan.trialDays} {t("auth.trial")}
                      </Badge>
                    )}
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary" />
                        <span>
                          {plan.offers} {t("plan.offers")}
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary" />
                        <span>
                          {plan.domains} {t("plan.domains")}
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary" />
                        <span>
                          {plan.clicks} {t("plan.clicks")}
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary" />
                        <span>SSL {language === "pt-BR" ? "automático" : "automatic"}</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary" />
                        <span>{language === "pt-BR" ? "Suporte 24/7" : "24/7 Support"}</span>
                      </li>
                    </ul>
                    <Button
                      className="w-full mt-6"
                      variant={plan.popular ? "default" : "outline"}
                      onClick={() => setShowAuth(true)}
                      data-testid={`button-select-plan-${plan.id}`}
                    >
                      {t("plan.select")}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground text-sm">
          <p>
            &copy; {new Date().getFullYear()} Clerion.{" "}
            {language === "pt-BR" ? "Todos os direitos reservados." : "All rights reserved."}
          </p>
        </div>
      </footer>
    </div>
  );
}
