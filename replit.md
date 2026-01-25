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
- **Users**: Multi-tenant users with subscription details and usage tracking. Includes `hasUsedCoupon` field for lifetime coupon usage tracking.
- **Plans**: Subscription tiers defining limits for offers, domains, and clicks.
- **Domains**: User-owned subdomains for campaign traffic routing.
- **Offers**: Campaign configurations including targeting rules.
- **ClickLogs**: Detailed traffic analytics.
- **DailyClickMetrics**: Aggregated analytics for dashboards.
- **Notifications**: In-app notification system.
- **AdminSettings**: Platform-wide configuration.
- **Coupons**: Discount coupons with affiliate tracking, supporting percentage or fixed discounts, plan restrictions, and expiration dates.
- **CouponUsages**: Tracks when users apply coupons, linking to Stripe subscriptions.
- **Commissions**: Affiliate commission records with status tracking (pending, paid, reversed) and payout management.

### Referral/Affiliate System
The platform includes a complete affiliate/referral system:
- **Coupon Management**: Admin creates discount coupons linked to affiliate users
- **Commission Types**: Percentage or fixed amount, one-time or recurring
- **Business Rules**:
  - Each user can only use 1 coupon (lifetime)
  - Affiliate cannot use their own coupon
  - Affiliate must have active subscription to receive commissions
  - Commissions are automatically reversed if subscription is canceled early
- **Admin Controls**: Manage coupons, view commissions, mark commissions as paid, view reports and top affiliates
- **User Dashboard**: Settings > Referrals tab shows affiliate statistics and coupons
- **Stripe Integration**: Dynamic coupon creation during checkout, webhook handlers for commission creation/reversal

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

### Caching
- **Redis**: External Redis server for caching IP geolocation results, reducing API calls and improving performance. Configured via `REDIS_URL`.

### External APIs
- **ip-api.com**: Used for IP geolocation to determine visitor country (cached in Redis for 1 hour).

### Email Service
- **Resend**: Transactional email service configured via `RESEND_API_KEY`. Email functions are in `server/email.ts`. Configured to send from `noreply@cleryon.com`.
- **Email Types**: welcome, subscription, domain_inactive, shared_domain_inactive, plan_limit, notification, password_reset
- **Email Logging**: All emails are logged in `email_logs` table with status (sent/failed), resendId, and metadata
- **Admin Interface**: AdminEmails.tsx page shows email history, stats by type/status, and filtering options
- **Automated Triggers**:
  - Welcome email on user registration
  - Subscription confirmation on checkout completion
  - Domain inactive notification when user's domain fails health check (24h cooldown)
  - Shared domain inactive notification to affected users (24h cooldown)
  - Plan limit email when user exceeds clicks limit and grace period starts

### Key NPM Dependencies
- `@tanstack/react-query`: Server state management.
- `drizzle-orm` + `drizzle-zod`: ORM with Zod validation.
- `passport` + `openid-client`: Authentication libraries.
- `date-fns`: Date utility library.
- `recharts`: Charting library.
- `lucide-react`: Icon library.