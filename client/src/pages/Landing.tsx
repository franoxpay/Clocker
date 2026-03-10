import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Shield, Zap, Globe, BarChart3, Check, Headphones, Gift, ArrowRight, Menu, X } from "lucide-react";
import { AnimatedGroup } from "@/components/ui/animated-group";
import { cn } from "@/lib/utils";
import Auth from "./Auth";

import facebookLogo from "../assets/facebook-logo.png";
import instagramLogo from "../assets/instagram-logo.png";
import tiktokLogo from "../assets/tiktok-logo.png";

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
    bonus: true,
  },
];

const trafficSourceLogos: Record<string, string> = {
  facebook: facebookLogo,
  instagram: instagramLogo,
  tiktok: tiktokLogo,
};

const transitionVariants = {
  item: {
    hidden: { opacity: 0, y: 12 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: 'spring', bounce: 0.3, duration: 1.5 },
    },
  },
};

function HeroHeader({ onLogin, theme }: { onLogin: () => void; theme: string }) {
  const { t, language } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const logoPreta = "/images/logo-dark.png";
  const logoBranca = "/images/logo-light.png";

  const menuItems = [
    { label: language === "pt-BR" ? "Recursos" : "Features", href: "#features" },
    { label: language === "pt-BR" ? "Planos" : "Pricing", href: "#pricing" },
  ];

  return (
    <header>
      <nav data-state={menuOpen ? 'active' : undefined} className="fixed z-20 w-full px-2 group">
        <div className={cn(
          'mx-auto mt-2 max-w-6xl px-6 transition-all duration-300 lg:px-12',
          scrolled && 'bg-background/80 max-w-4xl rounded-2xl border backdrop-blur-lg lg:px-5'
        )}>
          <div className="relative flex flex-wrap items-center justify-between gap-6 py-3 lg:gap-0 lg:py-4">
            <div className="flex w-full justify-between lg:w-auto">
              <a href="/" aria-label="home" className="flex items-center">
                <img
                  src={theme === "dark" ? logoBranca : logoPreta}
                  alt="Cleryon"
                  className="h-9 w-auto"
                />
              </a>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                aria-label={menuOpen ? 'Close Menu' : 'Open Menu'}
                className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden"
              >
                <Menu className="group-data-[state=active]:scale-0 group-data-[state=active]:opacity-0 m-auto size-6 duration-200" />
                <X className="group-data-[state=active]:rotate-0 group-data-[state=active]:scale-100 group-data-[state=active]:opacity-100 absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200" />
              </button>
            </div>

            <div className="absolute inset-0 m-auto hidden size-fit lg:block">
              <ul className="flex gap-8 text-sm">
                {menuItems.map((item) => (
                  <li key={item.href}>
                    <a href={item.href} className="text-muted-foreground hover:text-foreground block duration-150">
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-background group-data-[state=active]:block lg:group-data-[state=active]:flex mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border p-6 shadow-2xl shadow-zinc-300/20 md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none dark:shadow-none dark:lg:bg-transparent">
              <div className="lg:hidden">
                <ul className="space-y-6 text-base">
                  {menuItems.map((item) => (
                    <li key={item.href}>
                      <a href={item.href} className="text-muted-foreground hover:text-foreground block duration-150">
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex w-full flex-col gap-2 sm:flex-row md:w-fit">
                <LanguageToggle />
                <ThemeToggle />
                <Button
                  size="sm"
                  onClick={onLogin}
                  data-testid="button-login"
                  className={cn(scrolled && 'lg:inline-flex')}
                >
                  {t("auth.login")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}

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
      <HeroHeader onLogin={() => setShowAuth(true)} theme={theme} />

      <main className="overflow-hidden">
        <div
          aria-hidden
          className="z-[2] absolute inset-0 pointer-events-none isolate opacity-50 contain-strict hidden lg:block"
        >
          <div className="w-[35rem] h-[80rem] -translate-y-[350px] absolute left-0 top-0 -rotate-45 rounded-full bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,hsla(0,0%,85%,.08)_0,hsla(0,0%,55%,.02)_50%,hsla(0,0%,45%,0)_80%)]" />
          <div className="h-[80rem] absolute left-0 top-0 w-56 -rotate-45 rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,hsla(0,0%,85%,.06)_0,hsla(0,0%,45%,.02)_80%,transparent_100%)] [translate:5%_-50%]" />
          <div className="h-[80rem] -translate-y-[350px] absolute left-0 top-0 w-56 -rotate-45 bg-[radial-gradient(50%_50%_at_50%_50%,hsla(0,0%,85%,.04)_0,hsla(0,0%,45%,.02)_80%,transparent_100%)]" />
        </div>

        <section>
          <div className="relative pt-24 md:pt-36">
            <AnimatedGroup
              variants={{
                container: { visible: { transition: { delayChildren: 0.8 } } },
                item: { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: 'spring', bounce: 0.3, duration: 2 } } },
              }}
              className="absolute inset-0 -z-20"
            >
              <img
                src="https://ik.imagekit.io/lrigu76hy/tailark/night-background.jpg?updatedAt=1745733451120"
                alt="background"
                className="absolute inset-x-0 top-56 -z-20 hidden lg:top-32 dark:block"
                width="3276"
                height="4095"
              />
            </AnimatedGroup>

            <div aria-hidden className="absolute inset-0 -z-10 size-full [background:radial-gradient(125%_125%_at_50%_100%,transparent_0%,var(--background)_75%)]" />

            <div className="mx-auto max-w-7xl px-6">
              <div className="text-center sm:mx-auto lg:mr-auto lg:mt-0">
                <AnimatedGroup variants={transitionVariants}>
                  <button
                    onClick={() => setShowAuth(true)}
                    className="hover:bg-background dark:hover:border-t-border bg-muted group mx-auto flex w-fit items-center gap-4 rounded-full border p-1 pl-4 shadow-md shadow-black/5 transition-all duration-300 dark:border-t-white/5 dark:shadow-zinc-950"
                  >
                    <span className="text-foreground text-sm">
                      {language === "pt-BR" ? "🚀 A plataforma de cloaking mais segura do mercado" : "🚀 The safest cloaking platform on the market"}
                    </span>
                    <span className="dark:border-background block h-4 w-0.5 border-l bg-white dark:bg-zinc-700" />
                    <div className="bg-background group-hover:bg-muted size-6 overflow-hidden rounded-full duration-500">
                      <div className="flex w-12 -translate-x-1/2 duration-500 ease-in-out group-hover:translate-x-0">
                        <span className="flex size-6"><ArrowRight className="m-auto size-3" /></span>
                        <span className="flex size-6"><ArrowRight className="m-auto size-3" /></span>
                      </div>
                    </div>
                  </button>

                  <h1 className="mt-8 max-w-4xl mx-auto text-balance text-5xl font-bold md:text-6xl lg:mt-16 xl:text-[5rem]">
                    {language === "pt-BR"
                      ? "Proteja seus anúncios com o cloaker mais inteligente"
                      : "Protect your ads with the smartest cloaker"}
                  </h1>
                  <p className="mx-auto mt-8 max-w-2xl text-balance text-lg text-muted-foreground">
                    {language === "pt-BR"
                      ? "Filtragem avançada por país, dispositivo e parâmetros de anúncio para TikTok e Facebook Ads — com analytics em tempo real."
                      : "Advanced filtering by country, device and ad parameters for TikTok and Facebook Ads — with real-time analytics."}
                  </p>
                </AnimatedGroup>

                <AnimatedGroup
                  variants={{
                    container: { visible: { transition: { staggerChildren: 0.05, delayChildren: 0.75 } } },
                    ...transitionVariants,
                  }}
                  className="mt-12 flex flex-col items-center justify-center gap-2 md:flex-row"
                >
                  <div className="bg-foreground/10 rounded-[14px] border p-0.5">
                    <Button
                      size="lg"
                      className="rounded-xl px-5 text-base"
                      onClick={() => setShowAuth(true)}
                      data-testid="button-start-now"
                    >
                      <span className="text-nowrap">{language === "pt-BR" ? "Começar Agora" : "Start Now"}</span>
                    </Button>
                  </div>
                  <Button
                    size="lg"
                    variant="ghost"
                    className="rounded-xl px-5"
                    asChild
                    data-testid="button-learn-more"
                  >
                    <a href="#pricing">
                      <span className="text-nowrap">{language === "pt-BR" ? "Ver Planos" : "View Plans"}</span>
                    </a>
                  </Button>
                </AnimatedGroup>
              </div>
            </div>

            <AnimatedGroup
              variants={{
                container: { visible: { transition: { staggerChildren: 0.05, delayChildren: 0.75 } } },
                ...transitionVariants,
              }}
            >
              <div className="relative -mr-56 mt-8 overflow-hidden px-2 sm:mr-0 sm:mt-12 md:mt-20">
                <div aria-hidden className="bg-gradient-to-b to-background absolute inset-0 z-10 from-transparent from-35%" />
                <div className="inset-shadow-2xs ring-background dark:inset-shadow-white/20 bg-background relative mx-auto max-w-6xl overflow-hidden rounded-2xl border p-4 shadow-lg shadow-zinc-950/15 ring-1">
                  <img
                    className="bg-background aspect-15/8 relative hidden rounded-2xl dark:block"
                    src="https://tailark.com//_next/image?url=%2Fmail2.png&w=3840&q=75"
                    alt="dashboard"
                    width="2700"
                    height="1440"
                  />
                  <img
                    className="z-2 border-border/25 aspect-15/8 relative rounded-2xl border dark:hidden"
                    src="https://tailark.com/_next/image?url=%2Fmail2-light.png&w=3840&q=75"
                    alt="dashboard"
                    width="2700"
                    height="1440"
                  />
                </div>
              </div>
            </AnimatedGroup>
          </div>
        </section>

        <section className="bg-background pb-16 pt-16 md:pb-24">
          <div className="group relative m-auto max-w-5xl px-6">
            <div className="mx-auto mt-6 grid max-w-2xl grid-cols-3 gap-x-12 gap-y-8 sm:gap-x-16 sm:gap-y-14 place-items-center">
              <div className="flex items-center justify-center">
                <img src={facebookLogo} alt="Facebook Ads" className="h-8 w-auto object-contain" />
              </div>
              <div className="flex items-center justify-center">
                <img src={instagramLogo} alt="Instagram Ads" className="h-8 w-auto object-contain" />
              </div>
              <div className="flex items-center justify-center">
                <img src={tiktokLogo} alt="TikTok Ads" className="h-8 w-auto object-contain" />
              </div>
            </div>
            <p className="text-center text-sm text-muted-foreground mt-6">
              {language === "pt-BR" ? "Compatível com as principais plataformas de anúncios" : "Compatible with the main ad platforms"}
            </p>
          </div>
        </section>

        <section id="features" className="py-20 bg-muted/30">
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
                  className={`relative flex flex-col h-full bg-card ${plan.popular ? "border-primary border-2" : ""}`}
                  data-testid={`card-plan-${plan.id}`}
                >
                  {plan.popular && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 z-10" variant="default">
                      {language === "pt-BR" ? "Mais Popular" : "Most Popular"}
                    </Badge>
                  )}
                  {plan.bonus && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 gap-1 bg-gradient-to-r from-amber-500 to-orange-500 border-0" variant="default">
                      <Gift className="w-3 h-3" />
                      {language === "pt-BR" ? "Bônus" : "Bonus"}
                    </Badge>
                  )}
                  <CardHeader className={`text-center pb-2 flex-shrink-0 ${plan.popular || plan.bonus ? "pt-6" : ""}`}>
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
