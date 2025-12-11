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
- **ClickLogs**: Traffic analytics with redirect type tracking (black/white)
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