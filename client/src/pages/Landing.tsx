import { useState, useEffect, useRef, memo, lazy, Suspense, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Shield, Zap, Globe, BarChart3, CheckCircle2, Gift, ArrowRight, Menu, X, Star } from "lucide-react";
import { AnimatedGroup } from "@/components/ui/animated-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { motion, Transition } from "framer-motion";
import { cn } from "@/lib/utils";

const Auth = lazy(() => import("./Auth"));

import facebookLogo from "../assets/facebook-logo.png";
import instagramLogo from "../assets/instagram-logo.png";
import tiktokLogo from "../assets/tiktok-logo.png";
import cleryonLogo from "@/assets/cleryon-logo.webp";

const logoPreta = cleryonLogo;
const logoBranca = cleryonLogo;

const plans = [
  {
    id: 1,
    nameKey: "plan.basic",
    infoKey: "plan.basic.info",
    price: { monthly: 197, yearly: Math.round(197 * 10) },
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
    infoKey: "plan.advanced.info",
    price: { monthly: 497, yearly: Math.round(497 * 10) },
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
    infoKey: "plan.prescale.info",
    price: { monthly: 997, yearly: Math.round(997 * 10) },
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
    infoKey: "plan.scale.info",
    price: { monthly: 1997, yearly: Math.round(1997 * 10) },
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
    infoKey: "plan.unlimited.info",
    price: { monthly: 2497, yearly: Math.round(2497 * 10) },
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

function BorderTrail({
  className,
  size = 60,
  transition,
  style,
}: {
  className?: string;
  size?: number;
  transition?: Transition;
  style?: React.CSSProperties;
}) {
  const BASE_TRANSITION: Transition = { repeat: Infinity, duration: 5, ease: "linear" };
  return (
    <div className="pointer-events-none absolute inset-0 rounded-[inherit] border border-transparent [mask-clip:padding-box,border-box] [mask-composite:intersect] [mask-image:linear-gradient(transparent,transparent),linear-gradient(#000,#000)]">
      <motion.div
        className={cn("absolute aspect-square bg-white/60", className)}
        style={{ width: size, offsetPath: `rect(0 auto auto 0 round ${size}px)`, ...style }}
        animate={{ offsetDistance: ["0%", "100%"] }}
        transition={transition ?? BASE_TRANSITION}
      />
    </div>
  );
}

const platformsConfig = [
  { id: "facebook", logo: facebookLogo, alt: "Facebook Ads", phase: 0 },
  { id: "instagram", logo: instagramLogo, alt: "Instagram Ads", phase: (2 * Math.PI) / 3 },
  { id: "tiktok", logo: tiktokLogo, alt: "TikTok Ads", phase: (4 * Math.PI) / 3 },
];

const ORBIT_RADIUS = 160;

const OrbitingPlatforms = memo(function OrbitingPlatforms({ centerLogo }: { centerLogo: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const timeRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    const animate = (now: number) => {
      if (lastTimeRef.current !== null && !pausedRef.current) {
        timeRef.current += (now - lastTimeRef.current) / 1000;
        const t = timeRef.current * 0.5;
        const nodes = containerRef.current?.querySelectorAll<HTMLElement>("[data-orbit]");
        nodes?.forEach((el, i) => {
          const phase = (i * 2 * Math.PI) / 3;
          const angle = t + phase;
          const x = Math.cos(angle) * ORBIT_RADIUS;
          const y = Math.sin(angle) * ORBIT_RADIUS;
          el.style.transform = `translate(calc(${x}px - 50%), calc(${y}px - 50%))`;
        });
      }
      lastTimeRef.current = now;
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        ref={containerRef}
        className="relative flex items-center justify-center"
        style={{ width: 400, height: 400 }}
        onMouseEnter={() => { pausedRef.current = true; }}
        onMouseLeave={() => { pausedRef.current = false; }}
      >
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
          style={{ width: ORBIT_RADIUS * 2, height: ORBIT_RADIUS * 2 }}
        >
          <div
            className="absolute inset-0 rounded-full"
            style={{
              border: "1px solid rgba(59,130,246,0.3)",
              boxShadow: "0 0 60px rgba(59,130,246,0.15), inset 0 0 60px rgba(59,130,246,0.08)",
            }}
          />
          <div
            className="absolute inset-0 rounded-full animate-pulse"
            style={{
              background: "radial-gradient(circle, transparent 30%, rgba(59,130,246,0.1) 70%, rgba(59,130,246,0.18) 100%)",
            }}
          />
        </div>

        <div className="relative z-10 w-20 h-20 rounded-full flex items-center justify-center bg-background border border-border shadow-lg">
          <div className="absolute inset-0 rounded-full bg-blue-500/25 blur-2xl animate-pulse" />
          <img src={centerLogo} alt="Cleryon" className="w-12 h-12 object-contain relative z-10" />
        </div>

        {platformsConfig.map((p, i) => (
          <div
            key={p.id}
            data-orbit={i}
            className="absolute top-1/2 left-1/2"
            style={{ width: 62, height: 62, transform: "translate(-50%, -50%)", zIndex: 10 }}
          >
            <div className="w-full h-full rounded-full bg-background border border-border shadow-md flex items-center justify-center hover:scale-110 transition-transform duration-200 cursor-pointer">
              <img src={p.logo} alt={p.alt} className="w-8 h-8 object-contain" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

function PricingGrid({ language, t, onSelectPlan }: { language: string; t: (k: string) => string; onSelectPlan: () => void }) {
  const isPT = language === "pt-BR";

  const planInfos: Record<number, [string, string]> = {
    1: ["Para iniciantes", "For beginners"],
    2: ["Para quem está crescendo", "For growing businesses"],
    3: ["Para escalar com segurança", "To scale safely"],
    4: ["Para grandes operações", "For large operations"],
    5: ["Sem limites", "No limits"],
  };

  return (
    <div className="flex w-full flex-col items-center justify-center space-y-8 px-4">
      <div className="mx-auto max-w-xl space-y-2">
        <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl text-foreground">
          {isPT ? "Escolha seu plano" : "Choose your plan"}
        </h2>
        <p className="text-muted-foreground text-center text-sm md:text-base">
          {isPT ? "Planos flexíveis para todos os tamanhos de operação" : "Flexible plans for all operation sizes"}
        </p>
      </div>

      <TooltipProvider>
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {plans.map((plan) => {
          const features = [
            { text: `${plan.offers} ${isPT ? "oferta(s)" : "offer(s)"}`, tooltip: isPT ? "Quantidade de ofertas ativas" : "Number of active offers" },
            { text: `${plan.domains} ${isPT ? "domínio(s)" : "domain(s)"}`, tooltip: isPT ? "Domínios para cloaking" : "Domains for cloaking" },
            { text: `${plan.clicks} ${isPT ? "clicks/mês" : "clicks/month"}`, tooltip: isPT ? "Volume de clicks monitorados" : "Volume of monitored clicks" },
            { text: plan.support === "vip" ? (isPT ? "Suporte VIP 24/7" : "24/7 VIP Support") : (isPT ? "Suporte normal" : "Normal support"), tooltip: plan.support === "vip" ? (isPT ? "Atendimento prioritário via chat" : "Priority support via chat") : undefined },
            { text: isPT ? "Analytics em tempo real" : "Real-time analytics" },
            ...(plan.trafficSources.includes("tiktok") ? [{ text: "TikTok Ads", tooltip: isPT ? "Suporte a campanhas TikTok Ads" : "TikTok Ads campaign support" }] : []),
          ];
          return (
            <div
              key={plan.id}
              className={cn("relative flex w-full flex-col rounded-lg border bg-card text-card-foreground", plan.popular && "shadow-lg shadow-primary/10")}
              data-testid={`card-plan-${plan.id}`}
            >
              {plan.popular && (
                <BorderTrail style={{ boxShadow: "0px 0px 60px 30px rgb(255 255 255 / 20%), 0 0 100px 60px rgb(0 0 0 / 50%)" }} size={80} />
              )}

              <div className={cn("rounded-t-lg border-b p-4 bg-muted/30 dark:bg-muted/20")}>
                <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 flex-wrap justify-end max-w-[60%]">
                  {plan.popular && (
                    <span className="bg-card text-card-foreground flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs">
                      <Star className="h-3 w-3 fill-current" /> Popular
                    </span>
                  )}
                  {plan.bonus && (
                    <span className="flex items-center gap-1 rounded-md bg-gradient-to-r from-amber-500 to-orange-500 px-2 py-0.5 text-xs text-white">
                      <Gift className="h-3 w-3" /> {isPT ? "Bônus" : "Bonus"}
                    </span>
                  )}
                </div>

                <div className="text-lg font-semibold text-card-foreground">{t(plan.nameKey)}</div>
                <p className="text-muted-foreground text-sm">{isPT ? planInfos[plan.id][0] : planInfos[plan.id][1]}</p>
                <h3 className="mt-2 flex items-end gap-1">
                  <span className="text-3xl font-bold text-card-foreground">R${plan.price.monthly.toLocaleString("pt-BR")}</span>
                  <span className="text-muted-foreground text-sm">/mês</span>
                </h3>
              </div>

              <div className="space-y-3 px-4 py-5 text-sm flex-grow">
                {features.map((feature, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <CheckCircle2 className="text-primary h-4 w-4 flex-shrink-0" />
                    <Tooltip delayDuration={0}>
                      <TooltipTrigger asChild>
                        <p className={cn("text-muted-foreground", feature.tooltip && "cursor-pointer border-b border-dashed border-muted-foreground/40")}>
                          {feature.text}
                        </p>
                      </TooltipTrigger>
                      {feature.tooltip && <TooltipContent><p>{feature.tooltip}</p></TooltipContent>}
                    </Tooltip>
                  </div>
                ))}

                <div className="pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">{isPT ? "Fontes de Tráfego" : "Traffic Sources"}</p>
                  <div className="flex gap-2">
                    {plan.trafficSources.map((source) => (
                      <div key={source} className="w-7 h-7 rounded-lg bg-background border border-border flex items-center justify-center">
                        <img src={trafficSourceLogos[source]} alt={source} className="w-5 h-5 object-contain" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-auto w-full border-t border-border p-3">
                <Button
                  className="w-full"
                  variant={plan.popular ? "default" : "outline"}
                  onClick={onSelectPlan}
                  data-testid={`button-select-plan-${plan.id}`}
                >
                  {t("plan.select")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      </TooltipProvider>
    </div>
  );
}

function HeroHeader({ onLogin, theme }: { onLogin: () => void; theme: string }) {
  const { t, language } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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

  const features = useMemo(() => [
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
  ], [language]);

  if (showAuth) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <Auth onBack={() => setShowAuth(false)} />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <HeroHeader onLogin={() => setShowAuth(true)} theme={theme} />

      <main className="overflow-x-hidden">
        <div
          aria-hidden
          className="z-[2] absolute inset-0 pointer-events-none isolate opacity-50 contain-strict hidden lg:block"
        >
          <div className="w-[35rem] h-[80rem] -translate-y-[350px] absolute left-0 top-0 -rotate-45 rounded-full bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,hsla(0,0%,85%,.08)_0,hsla(0,0%,55%,.02)_50%,hsla(0,0%,45%,0)_80%)]" />
          <div className="h-[80rem] absolute left-0 top-0 w-56 -rotate-45 rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,hsla(0,0%,85%,.06)_0,hsla(0,0%,45%,.02)_80%,transparent_100%)] [translate:5%_-50%]" />
          <div className="h-[80rem] -translate-y-[350px] absolute left-0 top-0 w-56 -rotate-45 bg-[radial-gradient(50%_50%_at_50%_50%,hsla(0,0%,85%,.04)_0,hsla(0,0%,45%,.02)_80%,transparent_100%)]" />
        </div>

        <section>
          <div className="relative pt-24 md:pt-36 pb-16">
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
                loading="lazy"
                decoding="async"
              />
            </AnimatedGroup>

            <div aria-hidden className="absolute inset-0 -z-10 size-full [background:radial-gradient(125%_125%_at_50%_100%,transparent_0%,var(--background)_75%)]" />

            <div className="mx-auto max-w-7xl px-6">
              <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">

                {/* Left: hero text */}
                <div className="flex-1 min-w-0 flex flex-col items-start text-left">
                  <AnimatedGroup variants={transitionVariants}>
                    <button
                      onClick={() => setShowAuth(true)}
                      className="hover:bg-background dark:hover:border-t-border bg-muted group flex w-fit items-center gap-4 rounded-full border p-1 pl-4 shadow-md shadow-black/5 transition-all duration-300 dark:border-t-white/5 dark:shadow-zinc-950"
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

                    <h1 className="mt-8 text-balance text-5xl font-bold md:text-6xl lg:mt-10 xl:text-[5rem] leading-tight">
                      {language === "pt-BR"
                        ? "Proteja seus anúncios com o cloaker mais inteligente"
                        : "Protect your ads with the smartest cloaker"}
                    </h1>
                    <p className="mt-6 max-w-xl text-balance text-lg text-muted-foreground">
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
                    className="mt-10 flex flex-col items-start gap-2 sm:flex-row"
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

                {/* Right: orbiting platforms */}
                <div className="flex-shrink-0 flex flex-col items-center justify-center pr-8 lg:pr-10">
                  <OrbitingPlatforms centerLogo={theme === "dark" ? logoBranca : logoPreta} />
                  <p className="text-center text-sm text-muted-foreground -mt-4">
                    {language === "pt-BR" ? "Compatível com as principais plataformas de anúncios" : "Compatible with the main ad platforms"}
                  </p>
                </div>

              </div>
            </div>
          </div>
        </section>

        <section id="features" className="py-20">
          <div className="max-w-7xl mx-auto px-6">
            <h2 className="text-3xl font-bold text-center mb-4">
              {language === "pt-BR" ? "Por que escolher nossa plataforma?" : "Why choose our platform?"}
            </h2>
            <p className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
              {language === "pt-BR"
                ? "Tudo que você precisa para proteger suas campanhas e escalar com segurança"
                : "Everything you need to protect your campaigns and scale safely"}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 relative z-10">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className={cn(
                    "flex flex-col lg:border-r py-10 relative group/feature dark:border-neutral-800 border-border",
                    (index === 0 || index === 4) && "lg:border-l dark:border-neutral-800 border-border",
                    index < 4 && "lg:border-b dark:border-neutral-800 border-border"
                  )}
                >
                  {index < 4 && (
                    <div className="opacity-0 group-hover/feature:opacity-100 transition duration-200 absolute inset-0 h-full w-full bg-gradient-to-t from-muted to-transparent pointer-events-none" />
                  )}
                  {index >= 4 && (
                    <div className="opacity-0 group-hover/feature:opacity-100 transition duration-200 absolute inset-0 h-full w-full bg-gradient-to-b from-muted to-transparent pointer-events-none" />
                  )}
                  <div className="mb-4 relative z-10 px-10 text-muted-foreground">
                    <feature.icon className="w-6 h-6" />
                  </div>
                  <div className="text-lg font-bold mb-2 relative z-10 px-10">
                    <div className="absolute left-0 inset-y-0 h-6 group-hover/feature:h-8 w-1 rounded-tr-full rounded-br-full bg-border group-hover/feature:bg-primary transition-all duration-200 origin-center" />
                    <span className="group-hover/feature:translate-x-2 transition duration-200 inline-block text-foreground">
                      {feature.title}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground max-w-xs relative z-10 px-10">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="py-20">
          <PricingGrid language={language} t={t} onSelectPlan={() => setShowAuth(true)} />
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
