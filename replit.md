# replit.md

## Overview

This is a TikTok/Facebook Ads Cloaking Platform - a SaaS application that helps users manage advertising campaigns with traffic filtering capabilities. The platform allows users to create offers with "black" and "white" pages, configure domains, filter traffic by country/device/platform, and track click analytics. It includes a multi-tenant user system with subscription plans managed through Stripe, admin controls, and internationalization support (Portuguese/English).

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens and CSS variables for theming
- **Charts**: Recharts for data visualization
- **Build Tool**: Vite with HMR support

The frontend follows a page-based architecture with shared components. Key patterns:
- Context providers for language (i18n) and theme (dark/light mode)
- Custom hooks for authentication state (`useAuth`)
- Centralized API request handling through `queryClient`
- Sidebar-based dashboard layout with responsive design

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Replit OpenID Connect (OIDC) with Passport.js
- **Session Management**: express-session with PostgreSQL session store (connect-pg-simple)
- **API Design**: RESTful endpoints under `/api/*` prefix

The backend uses a layered architecture:
- `routes.ts`: API endpoint definitions and request handling
- `storage.ts`: Data access layer with typed methods for all entities
- `db.ts`: Database connection and Drizzle instance
- `replitAuth.ts`: Authentication middleware and session configuration

### Data Models
Key entities defined in `shared/schema.ts`:
- **Users**: Multi-tenant users with subscription status, plan associations, and usage tracking
- **Plans**: Subscription tiers with limits (offers, domains, clicks)
- **Domains**: User-owned subdomains for campaign routing
- **Offers**: Campaign configurations with targeting rules (countries, devices, platforms)
- **ClickLogs**: Traffic analytics with redirect type tracking (black/white), response time (ms), and error tracking
- **DailyClickMetrics**: Aggregated analytics for dashboard
- **Notifications**: In-app notification system with bilingual content
- **AdminSettings**: Platform-wide configuration

### Routing Strategy
- Public landing page at root for unauthenticated users
- Authenticated user dashboard routes: `/`, `/offers`, `/domains`, `/logs`, `/settings`
- Admin routes under `/confg-admin/*` prefix
- Click tracking endpoint handles traffic routing based on offer configuration

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, required via `DATABASE_URL` environment variable
- **Drizzle ORM**: Type-safe database operations with schema defined in `shared/schema.ts`
- Schema migrations managed via `drizzle-kit push`

### Payment Processing
- **Stripe**: Subscription billing and payment management
- Uses Replit's Stripe connector for credential management
- `stripe-replit-sync` package for webhook handling and data synchronization
- Webhook endpoint at `/api/stripe/webhook/:uuid`

### Authentication
- **Replit OIDC**: OAuth2/OpenID Connect authentication
- Requires `ISSUER_URL` (defaults to Replit), `REPL_ID`, and `SESSION_SECRET` environment variables

### External APIs
- **IP Geolocation**: ip-api.com for country detection from visitor IP addresses

### Key NPM Dependencies
- `@tanstack/react-query`: Server state management
- `drizzle-orm` + `drizzle-zod`: Database ORM with Zod schema validation
- `passport` + `openid-client`: Authentication
- `date-fns`: Date formatting with locale support
- `recharts`: Dashboard charting
- `lucide-react`: Icon library

## Recent Changes

### January 9, 2026
- **Stripe Webhook Integration Fix**: Rewrote webhook handlers to use `stripe-replit-sync` managed webhooks:
  - Updated `server/index.ts` with proper initialization: `runMigrations()` → `getStripeSync()` → `findOrCreateManagedWebhook()` → `syncBackfill()`
  - Added `getStripeSync()` function to `server/stripeClient.ts` for stripe-replit-sync integration
  - Updated `server/webhookHandlers.ts` to use `stripeSync.processWebhook()` instead of manual implementation
  - Webhook now automatically configured with proper events: customer, subscription, invoice, checkout, payment_intent, product, price events
  - Stripe data sync runs in background on startup via `syncBackfill()`
- **Webhook Data Integrity Improvements**:
  - Fixed `handleCheckoutSessionCompleted` to validate planId before updating users table (prevents NaN corruption)
  - Now uses Stripe `session.created` timestamp for accurate subscription start dates
  - Fixed `Subscription.tsx` to use `window.history.replaceState` instead of router navigation to avoid infinite loops

### January 2, 2026
- **Admin Dashboard**: Created new `/confg-admin/dashboard` page with comprehensive system metrics:
  - Metrics cards showing clicks today/7 days (black/white/failed breakdown), user statistics (total/paid/free)
  - Charts for clicks by day and new users over time (7d/30d/1y periods)
  - User ranking table with pagination (25 per page), showing total clicks and daily clicks
  - Platform filter and auto-refresh every 5 minutes
  - Added dashboard link to admin sidebar with translations (pt-BR/en)
- **Storage Fixes**: Corrected platform filtering queries - platform field exists only in `offers` table, not `clickLogs`; updated `getSystemMetrics72h`, `getAdminDashboardMetrics`, and `getUsersRanking` to use proper joins with offers table
- **Analytics Filters**: Added offer and date range filtering to the Analytics page with proper query caching using queryKey-derived parameters
- **Admin Monitoring Enhancements**:
  - Added page type (black/white) and platform columns to slowest requests table
  - Implemented filters for page type and platform
  - Added reset button to clear filters
  - Added diagnostic dialog showing detailed request info including response time, page type, platform, country, device, date, possible slow causes, and request parameters
- **AdminUsers Clicks Display**: Updated clicks column to show "X today | Y month" format with tooltip breakdown showing daily, weekly, monthly, and lifetime totals
- **Admin Billing Page**: Created new `/confg-admin/billing` page with:
  - 8 metrics cards: active/inactive/trial/suspended subscriptions, users today/month, MRR, total revenue
  - New users chart with 7d/30d/1y period selector
  - Pie chart showing subscription status distribution
  - Subscribers tab with table, status/plan filters, and pagination (25/50/100 per page)
  - Payments tab showing Stripe payment history with user email, amount, status
  - Backend endpoints: `/api/admin/billing/metrics`, `/subscribers`, `/payments`, `/subscriptions-chart`
  - Bilingual translations (pt-BR: "Faturamento", en: "Billing")
  - Wallet icon in admin sidebar navigation