# Design Guidelines: TikTok/Facebook Ads Cloaking Platform

## Design Approach

**System Selection:** Fluent Design System + Modern SaaS Dashboard Patterns
**Rationale:** This data-intensive productivity tool requires clarity, efficiency, and professional polish. Drawing inspiration from Linear's clean interface, Stripe Dashboard's data presentation, and Vercel's modern aesthetic while maintaining Fluent's component consistency.

**Design Principles:**
- Data clarity over decoration
- Efficient workflows with minimal clicks
- Professional, trustworthy aesthetic
- Dark mode optimized for extended use
- Responsive across all devices

---

## Typography

**Font Stack:**
- Primary: Inter (Google Fonts) - UI elements, body text, data tables
- Monospace: JetBrains Mono (Google Fonts) - codes, xcode, technical data

**Hierarchy:**
- H1 (Page Titles): text-3xl font-semibold
- H2 (Section Headers): text-2xl font-semibold  
- H3 (Card Headers): text-lg font-medium
- Body: text-base font-normal
- Small/Meta: text-sm font-normal
- Micro (timestamps, labels): text-xs font-medium uppercase tracking-wide

---

## Layout System

**Spacing Primitives:** Use Tailwind units of **2, 4, 6, 8, 12, 16, 24**
- Tight spacing: p-2, gap-2 (compact tables)
- Standard spacing: p-4, gap-4 (cards, forms)
- Section spacing: p-8, py-12 (page sections)
- Large spacing: p-16, py-24 (major separations)

**Grid System:**
- Dashboard main layout: Sidebar (w-64 fixed) + Main content (flex-1)
- Content max-width: max-w-7xl mx-auto
- Card grids: grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6
- Form layouts: Single column max-w-2xl for optimal readability

---

## Component Library

### Navigation
**Sidebar (User & Admin Panels):**
- Fixed left sidebar, full height
- Logo area at top (h-16) - configurable upload
- Navigation items with icons (Heroicons)
- Active state: subtle background distinction
- User profile/settings at bottom
- Admin indicator banner when impersonating users

**Top Bar:**
- Breadcrumb navigation (text-sm)
- Action buttons aligned right
- Language switcher (PT-BR/EN flag icons)
- Plan badge display (Starter/Professional/Enterprise)

### Dashboard Components

**Stat Cards:**
- Grid layout for metrics overview
- Icon + Label + Large Number + Trend indicator
- Compact padding (p-6)
- Subtle borders, rounded-lg

**Click Graph:**
- Hero element on dashboard
- Line/area chart showing 7-day trend
- Clear axis labels, grid lines
- Interactive tooltips on hover
- Responsive height (h-64 md:h-80)

**Data Tables:**
- Zebra striping for row distinction
- Sticky headers on scroll
- Sortable columns with icons
- Action buttons per row (edit, delete, view)
- Pagination controls at bottom (50 per page)
- Responsive: stack columns on mobile

### Forms & Inputs

**Form Structure:**
- Clear labels above inputs (text-sm font-medium)
- Input fields with subtle borders, rounded-md
- Consistent height (h-10 for text inputs)
- Error states with inline messages
- Helper text below inputs (text-xs)

**Offer Creation Form:**
- Multi-step if needed for clarity
- Slug preview with domain (monospace font)
- Platform selector (TikTok/Facebook radio/toggle)
- Country multi-select dropdown (all countries)
- Device checkboxes (Smartphone, Desktop, Tablet)
- Generated xcode display (read-only, monospace)

**Domain Management:**
- Add domain modal/form
- Verification status indicator (checking/verified/error)
- SSL status badge
- Hourly check timestamp display
- Alert banner for domain issues

### Status & Alerts

**Status Badges:**
- Active/Inactive for offers
- Plan type badges (Starter/Pro/Enterprise)
- Verification states (pending/verified/failed)
- Rounded-full, px-3 py-1, text-xs font-medium

**Alert Banners:**
- Warning (80% clicks used - 3 days to upgrade)
- Error (payment failed, domain issue)
- Success (actions completed)
- Info (account regularization needed)
- Full-width or within containers, rounded-lg, p-4
- Icon + Message + Action button

### Modals & Overlays

**Modal Structure:**
- Centered overlay with backdrop blur
- Max width constraints (max-w-lg for forms, max-w-4xl for tables)
- Clear header with close button
- Action buttons at footer (Cancel + Primary action)
- Smooth fade-in transition

**Confirmation Dialogs:**
- Destructive actions (delete offer, suspend user)
- Clear consequences explained
- Two-button choice (Cancel/Confirm)

### Admin-Specific Components

**User Management Table:**
- Columns: Email, Plan, Status, Clicks used, Actions
- Quick actions: Suspend/Activate, Impersonate, Force payment
- Expandable rows for detailed info

**Plan Configuration Panel:**
- Card-based layout for each plan
- Editable fields: Name, Price, Limits (offers, domains, clicks)
- Toggle active/inactive
- Create new plan button

**Impersonation Mode:**
- Persistent top banner (h-12, fixed)
- Shows "Viewing as: user@email.com"
- "Return to Admin" button (right side)
- Distinct visual treatment (subtle border)

### Authentication Pages

**Login/Register:**
- Centered card on clean background
- max-w-md container
- Logo placeholder at top
- Email + Password fields
- "Login with Google" button (secondary style)
- Links to forgot password, switch auth mode
- Trial badge for signup (7 days free)

**Settings Page:**
- Tabbed interface (Account, Billing, Security, Language)
- Stripe payment method management integration
- Invoice history table with download links
- Password change form with confirmation

---

## Responsive Behavior

**Breakpoints:**
- Mobile: base (< 768px) - single column, stacked nav
- Tablet: md (768px+) - two columns where appropriate
- Desktop: lg (1024px+) - full layout with sidebar
- Wide: xl (1280px+) - optimized spacing

**Mobile Adaptations:**
- Sidebar becomes bottom tab bar or hamburger menu
- Tables scroll horizontally or transform to cards
- Stat grids stack to single column
- Forms maintain single column
- Reduce padding (p-4 instead of p-8)

---

## Icons & Visual Assets

**Icon Library:** Heroicons (outline style for navigation, solid for actions)
- Navigation: home, chart-bar, link, server, cog, users
- Actions: plus, trash, pencil, eye, arrows
- Status: check-circle, x-circle, exclamation-triangle, clock

**Images:**
No hero images for this application - it's a pure dashboard/tool interface. Focus on data visualization (charts) and clear iconography.

---

## Accessibility

- All interactive elements minimum 44px touch target
- Form inputs with associated labels (label + id pairing)
- Error messages programmatically linked (aria-describedby)
- Keyboard navigation throughout (focus states visible)
- Status messages announced to screen readers
- Table headers properly marked (thead/th scope)
- Consistent tab order matching visual hierarchy

---

## Animations

**Minimal, Purposeful Motion:**
- Page transitions: subtle fade (duration-200)
- Modal entrance: fade + scale (duration-300)
- Dropdown menus: slide-down (duration-150)
- Loading states: simple spinner or skeleton screens
- No scroll-triggered animations
- No decorative parallax or complex effects

---

## Special Considerations

**Bilingual Support:**
- All text as translatable variables/keys
- Date formatting respects locale (GMT-3 for PT-BR)
- Currency formatting (R$ for BR, $ for EN)
- Consistent right-to-left safe layouts

**404 Error Page:**
- Simple, clean, centered message
- Standard HTTP 404 text
- No branding, minimal styling

**Email Templates:**
- Responsive HTML templates
- Plain text versions included
- AWS SES compatible
- Transactional style (no marketing fluff)
- Clear CTAs for account actions