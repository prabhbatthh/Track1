# Frontend — Community Reading Club & Library Management Platform

The React frontend for the Community Reading Club platform: browsing the catalogue,
borrowing/reserving books, booking study seats, joining events, tracking reading
progress, subscribing/paying for a plan, and role-specific dashboards for Members,
Guardians, Librarians, Managers, IT Heads, and Admins.

For the full product context (problem statement, architecture decisions, what's
mocked vs. real), see [`../docs/FINAL_SPEC.md`](../docs/FINAL_SPEC.md).
This file only covers running and developing the frontend itself.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- React Router v7 (routing, role-based route guards, lazy-loaded routes)
- TanStack Query (wired up, not yet used for real fetching — see "Current Status")
- React Hook Form + Zod (forms/validation)
- Framer Motion (animations, centralized variants in `lib/motion.ts`)
- react-i18next (3 languages — see "Internationalization")
- Sonner (toasts)
- Vitest + Testing Library (unit tests), Playwright (e2e, configured at the repo root)

## Current Status

Every screen is built and fully interactive against **mock data** (`src/mocks/*.ts`),
not a real backend yet — that's Milestone 3. Auth is also mocked: the Login page is a
role picker (Member / Librarian / Manager / Admin / IT Head / Guardian) that sets a
fake signed-in state, which is enough to exercise real route guards and role-specific
UI end-to-end. Payment is likewise mocked: the Pricing and Payment pages are real and
routable, but the "Pay with Razorpay" button and manager cash-payment flow just show a
toast — there's no backend to create a Razorpay order or verify a signature yet.

## Prerequisites

- Node.js 20+
- npm

## Setup

From this `frontend/` directory:

```bash
cp .env.example .env
npm install
```

`.env` only needs `VITE_API_URL` (the backend base URL — unused by the app until
Milestone 3 wires up real API calls).

## Development

```bash
npm run dev
```

Opens the app at http://localhost:5173 with hot module reload.

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check (`tsc -b`) then production-build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |
| `npm run format` | Run Prettier (writes changes) |
| `npm test` | Run Vitest unit tests |

End-to-end tests (Playwright) live in `tests/e2e/` but are run from the **repo root**
(`npm run test:e2e` there), since the Playwright config also manages starting the dev
server.

## Project Structure

```text
src/
├── main.tsx                 # Entry point — renders <AppProviders><AppRouter />
├── app/
│   ├── router/                # AppRouter (lazy-loaded route tree) + guards.tsx
│   └── layouts/                # PublicLayout, UserLayout, AdminLayout, ITHeadLayout,
│                                 GuardianLayout, AppShellLayout
├── providers/                # QueryClientProvider, ThemeProvider, LanguageProvider,
│                                AuthProvider (mocked)
├── components/
│   ├── ui/                    # Shared primitives: Button, Card, Input, Modal, Table, ...
│   ├── layout/                 # Header (Logo/DesktopNavigation/MobileNavigation/
│   │   └── header/               AuthActions), Sidebar, TopBar, Footer, UserMenu, ...
│   └── common/                 # Cross-feature building blocks: BookCard, EventCard,
│                                  StatisticCard, PageLoader, IconBadge, Section, ...
├── features/                 # One folder per screen — each owns its pages/ and components/
│   ├── landing/ | pricing/     # Marketing site + subscription plans
│   ├── dashboard/               # Role-aware: Member/Librarian/Manager dashboards
│   ├── admin/ | it-head/ | guardian/   # Dedicated role dashboards
│   ├── payment/                 # Razorpay/pay-at-library checkout (mocked)
│   ├── books/ | reservations/ | seat-booking/ | events/ | reviews/
│   ├── leaderboard/ | notifications/ | profile/ | reading-progress/
├── mocks/                    # Mock data per feature, shaped like the future real API
├── pages/                    # Login, Register, NotFound, PlaceholderPage
├── i18n/                     # i18next config + locales/*.json (en, hi, pa)
├── constants/                # ROUTES, navigation items
├── lib/                      # cn(), motion.ts (shared Framer Motion variants),
│                                authSchema.ts (Zod), comingSoonToast, format.ts, ...
├── styles.css                # Theme tokens (CSS variables) + Tailwind
└── test/                     # Vitest setup
```

**Rule of thumb:** every page is built from `components/ui`/`components/common` —
never bespoke one-off markup. If you're adding UI that doesn't fit an existing
primitive, add it to the shared kit rather than hand-rolling it in a feature folder.

## Routing & Roles

Route elements are `React.lazy`-loaded per page (see `app/router/AppRouter.tsx`) and
wrapped in `<Suspense fallback={<PageLoader />}>`; only layouts and small static pages
(NotFound, PlaceholderPage) load eagerly. Five top-level layouts, gated by route
guards in `app/router/guards.tsx`:

- **`PublicLayout`** — Landing, Pricing, Login, Register, Forgot Password
  (`PublicRoute` bounces already-signed-in users to their dashboard)
- **`UserLayout`** — Dashboard (role-aware — renders a different component per role),
  Books, Reservations, Seat Booking, Payment, Events, Community, Profile,
  Notifications, Reading Progress, Leaderboard, Reviews, Settings (`ProtectedRoute`
  requires sign-in; any authenticated role can reach these)
- **`AdminLayout` / `ITHeadLayout` / `GuardianLayout`** — each gated by `RoleRoute`
  to its specific role (`admin` / `it-head` / `guardian`)

## Internationalization

`src/i18n/config.ts` loads 3 locale bundles (`en`, `hi`, `pa`) via `react-i18next`;
`LanguageProvider` persists the chosen language and syncs `<html lang/dir>` (no
current locale is RTL, but the mechanism supports one). All locale files are kept in
exact key parity — when adding a new translatable string, add it to all 3 files, not
just `en.json`.

## Environment Variables

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend base URL — not yet consumed; reserved for Milestone 3 |

## Notes for Milestone 3

Swapping mocks for real data should mostly mean replacing `mocks/<feature>.ts`
imports with `useQuery(...)` calls inside the same components — `QueryClientProvider`
is already mounted in `providers/AppProviders.tsx`, and page components already treat
their data as a variable, not a live call. Two other pieces to replace without
touching their consumers:

- `AuthProvider` (`providers/AuthProvider.tsx`) — swap the mocked `login()`/`logout()`
  for real JWT-backed calls; the route guards that consume it don't need to change.
- `PaymentPage` (`features/payment/pages/PaymentPage.tsx`) — swap the mocked
  "Pay with Razorpay" handler for a real Razorpay Checkout.js call once a backend
  endpoint exists to create an order (`order_id`) and verify the payment signature.
