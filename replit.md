# replit.md

## Overview

This project is a SaaS platform designed for TikTok/Facebook Ads Cloaking. Its primary purpose is to help users manage advertising campaigns by providing advanced traffic filtering capabilities. Key features include the creation of offers with "black" and "white" pages, domain configuration, traffic filtering based on country, device, and platform, and comprehensive click analytics. The platform supports a multi-tenant user system, integrates with Stripe for subscription management, offers admin controls, and provides internationalization for Portuguese and English. The business vision is to provide a robust tool for advertisers to optimize their campaign performance and compliance.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend is built with React 18 and TypeScript, utilizing Wouter for routing and TanStack React Query for server state management. UI components are developed using shadcn/ui, based on Radix UI primitives, with styling managed by Tailwind CSS, incorporating custom design tokens. Recharts is used for data visualization. The build process is handled by Vite, ensuring fast HMR. The architecture emphasizes a page-based approach with shared components, context providers for internationalization and theming, custom authentication hooks, and centralized API request handling. The dashboard features a responsive sidebar layout.

### Backend Architecture
The backend is an Express.js application written in TypeScript. It uses PostgreSQL as its primary database, accessed via Drizzle ORM. Authentication is handled through Replit OpenID Connect (OIDC) and Passport.js, with session management using `express-session` and a PostgreSQL session store. APIs are RESTful, prefixed with `/api/*`. The architecture is layered, separating API endpoint definitions, data access (storage), database connection, and authentication middleware.

### Data Models
Key data models include:
- **Users**: Multi-tenant users with subscription details and usage tracking.
- **Plans**: Subscription tiers defining limits for offers, domains, and clicks.
- **Domains**: User-owned subdomains for campaign traffic routing.
- **Offers**: Campaign configurations including targeting rules.
- **ClickLogs**: Detailed traffic analytics.
- **DailyClickMetrics**: Aggregated analytics for dashboards.
- **Notifications**: In-app notification system.
- **AdminSettings**: Platform-wide configuration.

### Routing Strategy
The platform uses distinct routing for public access, authenticated user dashboards (e.g., `/offers`, `/domains`), admin functionalities (`/confg-admin/*`), and a dedicated click tracking endpoint (`/r/:slug`) for traffic routing.

## External Dependencies

### Database
- **PostgreSQL**: The main data store, configured via `DATABASE_URL`.
- **Drizzle ORM**: Used for type-safe database interactions and schema management.

### Payment Processing
- **Stripe**: Handles subscription billing and payments, integrated via Replit's Stripe connector and `stripe-replit-sync` for webhooks and data synchronization.

### Authentication
- **Replit OIDC**: Provides OAuth2/OpenID Connect authentication, requiring `ISSUER_URL`, `REPL_ID`, and `SESSION_SECRET`.

### External APIs
- **ip-api.com**: Used for IP geolocation to determine visitor country.

### Key NPM Dependencies
- `@tanstack/react-query`: Server state management.
- `drizzle-orm` + `drizzle-zod`: ORM with Zod validation.
- `passport` + `openid-client`: Authentication libraries.
- `date-fns`: Date utility library.
- `recharts`: Charting library.
- `lucide-react`: Icon library.