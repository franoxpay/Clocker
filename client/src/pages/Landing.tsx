import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Shield, Zap, Globe, BarChart3, Check, Headphones } from "lucide-react";
import Auth from "./Auth";

import facebookLogo from "@assets/facebook-logo-facebook-icon-transparent-free-png_1768998868063.webp";
import instagramLogo from "@assets/Instagram_icon_1768998868062.png";
import tiktokLogo from "@assets/tiktok-logo-tikok-icon-transparent-tikok-app-logo-free-png_1768998868062.png";

const logoPreta = "/images/logo-dark.png";
const logoBranca = "/images/logo-light.png";

const plans = [
  {
    id: 1,
    nameKey: "plan.basic",
    price: 197,
    offers: 2,
    domains: 1,
    clicks: "30.000",
    support: "normal",
    trafficSources: ["facebook", "instagram"],
    hasTrial: false,
  },
  {
    id: 2,
    nameKey: "plan.advanced",
    price: 497,
    offers: 5,
    domains: 3,
    clicks: "100.000",
    support: "normal",
    trafficSources: ["facebook", "instagram", "tiktok"],
    hasTrial: false,
    popular: true,
  },
  {
    id: 3,
    nameKey: "plan.prescale",
    price: 997,
    offers: 15,
    domains: 10,
    clicks: "250.000",
    support: "vip",
    trafficSources: ["facebook", "instagram", "tiktok"],
    hasTrial: false,
  },
  {
    id: 4,
    nameKey: "plan.scale",
    price: 1997,
    offers: "∞",
    domains: 20,
    clicks: "750.000",
    support: "vip",
    trafficSources: ["facebook", "instagram", "tiktok"],
    hasTrial: false,
  },
  {
    id: 5,
    nameKey: "plan.unlimited",
    price: 2497,
    offers: "∞",
    domains: "∞",
    clicks: "∞",
    support: "vip",
    trafficSources: ["facebook", "instagram", "tiktok"],
    hasTrial: false,
  },
];

const trafficSourceLogos: Record<string, string> = {
  facebook: facebookLogo,
  instagram: instagramLogo,
  tiktok: tiktokLogo,
};

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
              className="h-10 w-auto"
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
            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 max-w-7xl mx-auto">
              {plans.map((plan) => (
                <Card
                  key={plan.id}
                  className={`relative flex flex-col h-full ${plan.popular ? "border-primary border-2" : ""}`}
                  data-testid={`card-plan-${plan.id}`}
                >
                  {plan.popular && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                      {language === "pt-BR" ? "Mais Popular" : "Most Popular"}
                    </Badge>
                  )}
                  <CardHeader className="text-center pb-2 flex-shrink-0">
                    <CardTitle className="text-lg">{t(plan.nameKey)}</CardTitle>
                    <div className="mt-3">
                      <span className="text-3xl font-bold">R${plan.price}</span>
                      <span className="text-muted-foreground text-sm">/mês</span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 flex-grow flex flex-col">
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span>
                          {plan.offers} {t("plan.offers")}
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span>
                          {plan.domains} {t("plan.domains")}
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span>
                          {plan.clicks} {t("plan.clicks")}
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Headphones className="w-4 h-4 text-primary flex-shrink-0" />
                        <span>
                          {language === "pt-BR" 
                            ? (plan.support === "vip" ? "Suporte VIP" : "Suporte Normal")
                            : (plan.support === "vip" ? "VIP Support" : "Normal Support")}
                        </span>
                      </li>
                    </ul>
                    
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-xs text-muted-foreground mb-2 text-center">
                        {language === "pt-BR" ? "FONTES DE TRÁFEGO" : "TRAFFIC SOURCES"}
                      </p>
                      <div className="flex justify-center gap-2">
                        {plan.trafficSources.map((source) => (
                          <div 
                            key={source} 
                            className="w-8 h-8 rounded-lg overflow-hidden bg-background flex items-center justify-center"
                          >
                            <img 
                              src={trafficSourceLogos[source]} 
                              alt={source} 
                              className="w-6 h-6 object-contain"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <Button
                      className="w-full mt-4"
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
