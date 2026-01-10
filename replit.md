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

### January 10, 2026 (Update 4)
- **Click Journey Feature**: Added gamification element to sidebar showing lifetime click statistics
  - New endpoint `GET /api/user/click-stats` returns `{ totalClicks, monthlyClicksUsed, monthlyClicksLimit, isUnlimited }`
  - Collapsible component in sidebar footer showing total clicks with Trophy icon
  - Milestone tracking system: 1K, 10K, 50K, 100K, 250K, 500K, 1M, 5M, 10M
  - Progress bar showing progress toward next milestone
  - Monthly plan usage with color-coded indicator:
    - Green: under 50% usage or unlimited plan
    - Yellow: 50-80% usage
    - Orange: 80-100% usage
    - Red: at or over limit
  - Auto-refresh every 60 seconds
  - Bilingual translations (pt-BR: "JORNADA DE CLIQUES", en: "CLICK JOURNEY")

### January 10, 2026 (Update 3)
- **Rate Limit Fix**: Changed anti-bot rate limit from 5 clicks/minute to 15 clicks per 3 minutes
  - Previous aggressive setting was incorrectly blocking real users during testing
  - When rate limited, users were sent to WHITE page and logs stopped appearing
- **Click Logs Preservation**: Changed `click_logs.offer_id` foreign key from `CASCADE` to `SET NULL`
  - Now when an offer is deleted, the click logs are preserved with `offer_id = null`
  - Historical data is maintained for analytics and billing verification

### January 10, 2026 (Update 2)
- **Plan Limits Enforcement - Offer Creation**: POST `/api/offers` now validates before creating:
  - Checks if user is suspended → returns 403 with `USER_SUSPENDED` code
  - Checks if user has active plan → returns 403 with `NO_ACTIVE_PLAN` code
  - Checks offer count against plan limit → returns 403 with `OFFER_LIMIT_REACHED` code
- **Plan Limits Enforcement - Domain Creation**: POST `/api/domains` now validates before creating:
  - Same checks as offers: suspended status, active plan, domain limit
  - Shared domains don't count toward user's limit (only user-owned domains)
- **Click Tracking with Grace Period**: Click endpoint (`/r/:slug`) now enforces limits:
  - Monthly reset happens BEFORE suspension check (allows auto-reactivation on anniversary)
  - Suspended users get 404 (not redirect to white page)
  - Grace period (48h) starts when clicks exceed limit
  - After grace period expires, user is suspended
  - On monthly reset: clicks reset to 0, suspension/grace period cleared
- **Auto-Increment Monthly Clicks**: `createClickLog` now auto-increments `clicksUsedThisMonth` for "black" redirects only
- **User State Refresh**: After monthly reset, code refreshes owner record to ensure accurate limit evaluation

### January 10, 2026
- **Immediate Payment Fix**: Changed `payment_behavior` from `'default_incomplete'` to `'error_if_incomplete'` to charge immediately when user has saved cards
- **Card Selector Dialog**: When subscribing with multiple saved cards:
  - Shows Dialog with RadioGroup to select which card to use
  - If only 1 card exists, uses it directly without dialog
  - If no cards exist, redirects to Stripe checkout to add card
  - Uses `paymentMethodId` parameter in checkout request
- **Payment Method Validation**: Backend validates ownership via `stripe.paymentMethods.retrieve()` and checks `pm.customer === customerId`
- **Fallback Card Retry**: On invoice.payment_failed:
  - Lists all customer cards and filters out the failed one
  - If other cards exist and invoice is open, updates invoice default_payment_method and retries payment
  - Only marks user as past_due if all attempts fail

### January 9, 2026 (Update 2)
- **Setup Mode Default Card**: When adding a card via setup checkout:
  - Checkout session now includes metadata (userId, setupMode: 'true')
  - Uses dedicated success URL: `checkout=setup_success`
  - Webhook handler retrieves setupIntent and sets new card as customer's default payment method
  - Prevents subscription failures when immediately subscribing after adding card
- **Checkout Error UI**: Added visible Alert component on checkout errors with:
  - Localized error messages (PT-BR/EN)
  - "Add Card" button to launch setup checkout
  - "Dismiss" button to clear error state

### January 9, 2026 (Previous)
- **Subscription Page Layout Improvements**:
  - Merged "Current Plan" and "Usage" sections into a single card (first column)
  - Moved "Saved Cards" section to second column for better layout
  - Changed "Manage Cards" button to "Add Card" that opens Stripe setup mode checkout
  - Delete button only appears when user has more than 1 saved card
- **Direct Subscription with Saved Cards**:
  - POST `/api/subscription/checkout` now creates subscription directly using saved payment method (skips checkout redirect)
  - Uses `payment_behavior: 'default_incomplete'` with expanded payment intent
  - Properly handles SCA/3DS by returning `requiresAction` + `clientSecret` when bank verification needed
  - Only marks user as active when subscription status is actually active/trialing (security fix)
  - Falls back to checkout redirect if no saved cards exist
- **Payment Method Deletion Validation**:
  - DELETE `/api/billing/payment-methods/:id` now prevents deletion when only 1 card remains
  - Returns 400 error with appropriate message in both languages
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
- **Saved Payment Methods Management**:
  - Added 4 new API endpoints for payment method CRUD operations:
    - `GET /api/billing/payment-methods` - List user's saved cards with default indicator
    - `POST /api/billing/payment-methods/setup` - Create Stripe Setup Intent for adding new cards
    - `POST /api/billing/payment-methods/:id/default` - Set a card as default (with ownership validation)
    - `DELETE /api/billing/payment-methods/:id` - Remove a card (with ownership validation, prevents deleting default)
  - Added payment methods UI section in Subscription page with list/set default/delete functionality
  - Security: All payment method endpoints validate ownership by verifying method.customer matches user.stripeCustomerId
  - Uses CreditCard icon from lucide-react instead of emojis for card brand display
  - All interactive elements have proper data-testid attributes for testing

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