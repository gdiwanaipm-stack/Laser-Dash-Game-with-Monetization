# Laser Dash 🏎️⚡

> An AI-powered laser obstacle game built for elementary kids — created by a father and son team.

**[Play Live →](https://laser-dash.lovable.app)**

---

## What Is Laser Dash?

Laser Dash is a fast-paced side-scrolling game where players dodge AI-generated laser death traps and collect gems as they race through 5 increasingly intense levels. The further you get, the smarter and more unpredictable the lasers become. Power-ups help you survive — but you have to earn them.

Built with ❤️ by a dad and his kid as a fun project to explore game development and AI together.

---

## Features

| Feature | Details |
|---|---|
| 5 Levels | Levels 1–2 free; Levels 3–5 unlocked with a one-time payment |
| AI Death Traps | Laser patterns adapt and escalate as you progress |
| Gem System | Collect 💎 gems during gameplay to spend in the Power-Up Store |
| Power-Up Store | Buy **Extra Heart** (❤️ 20 gems) or **Shield** (🛡️ 30 gems) before each level |
| Progress Saving | Sign in to save your level progress and gem balance |
| Google SSO | One-click sign-in — no passwords required |

---

## Authentication — Google SSO

Authentication is handled entirely via **Google Single Sign-On (SSO)** — no email/password accounts.

### How it works

1. The player taps **"Sign in with Google"** on the login screen
2. [`Login.tsx`](./src/pages/Login.tsx) calls `lovable.auth.signInWithOAuth("google")` via **Lovable Cloud Auth**
3. Lovable Cloud Auth delegates to **Supabase Auth** which handles the OAuth handshake with Google
4. On success, a JWT session is issued and managed globally via [`AuthContext.tsx`](./src/contexts/AuthContext.tsx)
5. All Supabase Edge Functions validate this JWT on every request — the `userId` is always derived server-side from the token, never trusted from the request body

```
Player → Login.tsx
           ↓ lovable.auth.signInWithOAuth("google")
       Lovable Cloud Auth
           ↓
       Supabase Auth (Google OAuth provider)
           ↓
       JWT session → AuthContext → all app routes
```

### In-App Browser Handling

Google OAuth does **not** work inside Instagram, TikTok, or Facebook in-app browsers. The login screen detects this automatically and prompts the player to open the game in Safari (iOS) or Chrome (Android) with step-by-step instructions.

---

## Monetization — Stripe

Levels 3–5 are unlocked with a **one-time payment of $0.99** — charged the moment a player completes Level 2.

### Payment Flow

```
Player completes Level 2
        ↓
UnlockCheckout.tsx renders Stripe Embedded Checkout
        ↓
supabase.functions.invoke("create-checkout")
        ↓  [Edge Function — Deno]
Validates JWT → Creates Stripe Checkout Session
  mode: "payment"  |  price: $0.99  |  ui_mode: "embedded"
  metadata: { userId, product: "level_3_unlock" }
        ↓
Player pays → Stripe fires checkout.session.completed webhook
        ↓
payments-webhook Edge Function
  ├── Verifies Stripe webhook signature
  ├── Writes to `orders` table (audit trail)
  └── Writes to `game_unlocks` table (access control)
        ↓
Game reads `game_unlocks` → Levels 3–5 unlocked forever ✅
```

### Key Implementation Details

**[`src/components/game/UnlockCheckout.tsx`](./src/components/game/UnlockCheckout.tsx)**
- Uses `@stripe/react-stripe-js` `EmbeddedCheckoutProvider` + `EmbeddedCheckout`
- Calls the `create-checkout` Edge Function to fetch a `clientSecret`
- Renders inside a full-screen overlay — no redirect, no page reload

**[`supabase/functions/create-checkout/index.ts`](./supabase/functions/create-checkout/index.ts)**
- Validates the player's JWT before touching Stripe — `userId` is always server-derived
- Looks up the price via Stripe lookup key (`level_3_unlock_onetime`)
- Creates a Stripe Checkout Session in `embedded` UI mode
- Returns `clientSecret` to the frontend

**[`supabase/functions/payments-webhook/index.ts`](./supabase/functions/payments-webhook/index.ts)**
- Verifies the Stripe webhook signature before processing any event
- Handles `checkout.session.completed` and `checkout.session.async_payment_succeeded`
- Uses `upsert` with `onConflict` to make the handler idempotent (safe to retry)
- Supports both sandbox and production Stripe environments via `?env=` query param

### Database Tables

| Table | Purpose |
|---|---|
| `orders` | Full audit trail of every Stripe session — amount, currency, status, environment |
| `game_unlocks` | Access control — one row per `(user_id, product, environment)` grants level access |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS, shadcn/ui |
| Auth | Lovable Cloud Auth + Supabase Auth (Google OAuth) |
| Backend | Supabase Edge Functions (Deno) |
| Database | Supabase (PostgreSQL) |
| Payments | Stripe Embedded Checkout |
| Hosting | Lovable Cloud |
| Testing | Vitest + Playwright |

---

## Local Development

### Prerequisites

- Node.js 18+ / Bun
- Supabase CLI
- A Stripe account (test mode keys)

### Setup

```bash
# Clone the repo
git clone https://github.com/gdiwanaipm-stack/laser-dash.git
cd laser-dash

# Install dependencies
npm install

# Set environment variables
cp .env.development .env.local
# Fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_STRIPE_PUBLISHABLE_KEY

# Run locally
npm run dev
```

### Running Tests

```bash
npm run test          # Unit tests (Vitest)
npx playwright test   # E2E tests (Playwright)
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                   Lovable Cloud                     │
│   React App (laser-dash.lovable.app)                │
│   ┌──────────┐  ┌────────────────┐  ┌───────────┐  │
│   │ Login.tsx│  │  Game.tsx      │  │GameStore  │  │
│   │ Google   │  │  5 Levels      │  │Gems/      │  │
│   │ SSO      │  │  AI Lasers     │  │Power-ups  │  │
│   └────┬─────┘  └───────┬────────┘  └───────────┘  │
└────────┼───────────────┼────────────────────────────┘
         │               │
         ▼               ▼
┌────────────────┐  ┌──────────────────────────────┐
│ Supabase Auth  │  │   Supabase Edge Functions     │
│ Google OAuth   │  │   ┌──────────────────────┐   │
│ JWT Sessions   │  │   │  create-checkout      │   │
└────────────────┘  │   │  (Stripe session)     │   │
                    │   ├──────────────────────┤   │
                    │   │  payments-webhook     │   │
                    │   │  (Stripe events)      │   │
                    │   └──────────────────────┘   │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼───────────────┐
                    │       Supabase DB             │
                    │   orders | game_unlocks       │
                    └──────────────────────────────┘
                                   ▲
                    ┌──────────────┴───────────────┐
                    │         Stripe               │
                    │   Embedded Checkout ($0.99)  │
                    │   Webhook → game_unlocks     │
                    └──────────────────────────────┘
```

---

## Project Info

- **Live App**: https://laser-dash.lovable.app
- **Lovable Project**: https://lovable.dev/projects/laser-dash
- **Built with**: [Lovable](https://lovable.dev) — AI-powered full-stack app builder

---

*Made with love by a dad and his kid. 🏎️⚡*
