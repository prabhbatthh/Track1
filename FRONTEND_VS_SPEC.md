# Frontend vs. FINAL_SPEC.md — Build Status Report

**Compared:** `frontend/` (React 19 + TypeScript + Vite) against `docs/FINAL_SPEC.md` §8 (31-item Frozen Scope), §9 (Tech Stack), §10 (Pages), §10-11 (Reusable Components).
**Date:** 2026-07-24

## Headline


The frontend is a **fully mocked prototype, not wired to the backend**. There is no `src/api`/`src/services` layer, no `axios`, and no `useQuery`/`useMutation` usage anywhere, despite `@tanstack/react-query`'s `QueryClientProvider` being set up unused in `frontend/src/providers/AppProviders.tsx`. Auth is a `localStorage`-backed mock (comment in `AuthProvider.tsx`: *"no backend yet, auth state is a mocked localStorage flag until Milestone 3 wires real JWT auth"*). Most write actions call `comingSoonToast()` instead of a real mutation. The backend only implements `books` and `members` modules — the frontend calls neither.

So "BUILT (wired to real backend)" applies to nothing below. Status is PARTIAL (UI exists, mock data / no persistence) or NOT BUILT.

## Feature-by-Feature (§8 Frozen Scope, 31 items)

| # | Feature | Status | Notes |
|---|---|---|---|
| 1 | Register/Login/JWT/Forgot Password | PARTIAL | Real RHF+Zod forms (`pages/Login.tsx`, `Register.tsx`), but submit just sets a mock role in `AuthProvider`. No JWT. Forgot Password is a placeholder page. Login even has one-click "sign in as any role" buttons. |
| 2 | Role-Based Access Control | PARTIAL | Client-side route guards work (`app/router/guards.tsx`), but role is a trivially-editable `localStorage` flag, no server-side check, roles diverge from spec (admin/member/manager/it-head/guardian vs. spec's Admin/Librarian/Member/Manager). |
| 3 | Book CRUD, Categories, Authors, ISBN, Covers, Multiple Copies | PARTIAL | Browsable catalog from mocks only. No ISBN field, no cover images, **no create/edit/delete UI at all**. Backend has a real `books` module the frontend never calls. |
| 4 | Full-text Book Search | PARTIAL | In-memory substring match over 9 hardcoded books. No backend search. |
| 5 | Issue/Return/Renew Book | NOT BUILT | No return/renew UI anywhere; "Issue Book" quick action is a stub toast. |
| 6 | Borrow History | PARTIAL | Static display-only table on Profile page, no filtering, no backend. |
| 7 | Automatic Fine (configurable rules) | PARTIAL | Hardcoded fine numbers shown in a few places; no calculation engine, no config UI. |
| 8 | Basic Reservation (single queue) | PARTIAL | Reserve/cancel act on local state only, all data mocked. |
| 9 | Basic Seat Booking (day-level) | PARTIAL | Interactive seat grid, but "Confirm" is a stub toast; no date/day picker exists. |
| 10 | Membership Fees & Fine Payments + History | PARTIAL | Checkout screen exists, both payment methods stub out ("no backend yet to create a Razorpay order"). **No Payment History page exists at all.** |
| 11 | Basic Admin Dashboard (Revenue, Active Members, Overdue) | PARTIAL | Revenue/Expenses/Members shown from mocks; **Overdue Books metric is missing entirely**. |
| 12 | Basic Member Dashboard | PARTIAL | Full UI, zero live data. |
| 13 | Notification Service (email) | PARTIAL | In-app notification list + preference toggles, both mock. No email delivery, no backend service. |
| 14 | Reservation Queue + Notifications | PARTIAL | Static queue position/wait display. No auto-expiry/promotion, no real notification trigger. |
| 15 | Unified QR Scanning (books + seats) | NOT BUILT | Only mentioned in marketing copy and a mock support ticket. No scanner component or route. |
| 16 | Seat Plans, Live Availability, Occupancy Dashboard | PARTIAL | Single seat grid only (no zones/rooms). Occupancy widgets are static mock data, not live. |
| 17 | Analytics Service: Popular Books, Monthly Reports | PARTIAL | Report names listed, every "View Report" is a stub toast. No Popular Books analytics anywhere. |
| 18 | Data Export (CSV/PDF) | NOT BUILT | No export/download code found anywhere. |
| 19 | Content Moderation (report/flag) | PARTIAL | Genuinely fleshed-out UX (report, ban, filter reported items) but entirely local state, no persistence. |
| 20 | Book Donations (with approval workflow) | NOT BUILT | No submission form or approval queue; only a record type in a read-only log. |
| 21 | Book Reviews | PARTIAL | Full write/edit/delete UX, local state only, no backend persistence. |
| 22 | Book Discussion Rooms | PARTIAL | Community page is one general feed with optional book tags, not per-book rooms as spec implies. |
| 23 | Gamification Engine | PARTIAL | Leaderboard + achievements list, both static mock data, no scoring engine. |
| 24 | Quote of the Day | NOT BUILT | No trace anywhere. |
| 25 | Mood-Based Recommendation | PARTIAL | Exists only as a static marketing section on the public landing page, not an interactive in-app tool for logged-in members. |
| 26 | AI Librarian (LLM-backed) | PARTIAL | Chat widget UI with canned `setTimeout` reply, explicitly commented as a UI-only demo. No LLM integration. |
| 27 | Book Heatmap | NOT BUILT | No evidence. |
| 28 | Telegram Notifications | NOT BUILT | No evidence. |
| 29 | Multi-Branch Support | NOT BUILT | No evidence. |
| 30 | Predictive Analytics | NOT BUILT | No evidence. |
| 31 | Native Mobile App | NOT BUILT | Web SPA only, no React Native/Expo/Capacitor. |

**Tally:** 0 fully built · 22 partial (UI shell, mock data) · 9 not built.

## Tech Stack (§9) vs. `frontend/package.json`

- **Axios — missing.** Spec requires it; absent from dependencies. Consistent with no API layer existing.
- **TanStack Query — installed but unused.** Provider is wired, but no `useQuery`/`useMutation` call exists anywhere.
- React 19 ✓, TypeScript ✓, Vite ✓ (`^8.1.1`, unusually new), Tailwind v4 ✓, React Router DOM ✓, React Hook Form + Zod ✓ (genuinely used), Framer Motion ✓, Sonner ✓.
- Lucide React is pinned at `^1.23.0` — worth double-checking, that major range is atypical for this package.
- **Extra, not in spec:** full `i18next`/`react-i18next` system (en/hi/pa locales) — not mentioned in §9 at all.

## Pages (§10)

- **Public:** Landing ✓, Login ✓, Register ✓, Forgot Password — placeholder only.
- **User:** Dashboard ✓, Books ✓, Book Details ✓, Reservations ✓, Seat Booking ✓, Community ✓, Events ✓, Profile ✓, Notifications ✓, Settings ✓. **Borrow — missing** (no dedicated borrow/checkout page).
- **Admin:** Dashboard ✓ (single page at `/admin`). **Books, Members, Reports, Analytics, Donations, Events, User Management — all missing as distinct routes.** Everything lives as widgets on one dashboard page. This is the single biggest structural gap vs. spec.

## Reusable Components (§10-11)

- **Layout:** all present (Header used in place of the spec's "Navbar" naming).
- **UI:** all 16 present, matches spec exactly.
- **Feature:** BookCard, SeatCard, EventCard, FeatureCard, ReviewCard, NotificationCard, StatisticCard all present. **AchievementBadge — missing**, achievements use the generic `Badge` component instead.

## Extra / Out-of-Scope (built but not in the 31-item list or §10 pages)

- Pricing page (full marketing page, plans, FAQ)
- Contact Us page
- Reading Progress page (goals, streaks, reading lists)
- Two extra roles not in the spec's role model: **IT-Head** and **Guardian**, each with their own dashboards/features
- Wishlist on Books
- Guardian-linking in Settings
- Manager staff-assist tooling (walk-in assistance, new registrations, add guardian) — mostly stubbed
- Full i18n system (English/Hindi/Punjabi)
- Light/dark/system theming
- Admin Audit Log widget
- Budget/Expense tracking, Cash Flow breakdown, Pending Requests widgets on the admin dashboard — goes beyond the "basic Revenue/Active Members/Overdue" scope of item 11

## Bottom Line

What exists is a broad, polished **click-through prototype**: nearly every screen in the spec (and several not in the spec) has a real, styled UI. What's missing is the entire backend integration layer — no live auth, no real book/loan/seat/payment data, no persistence for anything a user writes. The single biggest scope gap is the Admin section, which spec calls for as 8 distinct pages but exists as one dashboard. Priority to move toward MVP: wire Auth + Book CRUD + Issue/Return to the real backend before adding any more UI surface.
