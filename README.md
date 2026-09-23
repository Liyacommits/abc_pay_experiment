# VALR USDC → ZAR On/Off-Ramp — Backend

Real VALR API integration (no mocks). Next.js API routes, deployable to Railway.

## The model (confirmed, not assumed)

1. User has USDC and wants ZAR in their bank account.
2. We quote them VALR's real rate, minus our markup (`MARKUP_PERCENT`, default 2%).
3. User sends USDC to a deposit address **on our VALR account** — this is real,
   momentary custody, not a "no custody" model. Be clear-eyed about this for
   licensing purposes (South Africa: FSCA CASP licensing likely applies).
4. Once the deposit is confirmed, we call VALR's real Simple Swap API to convert
   USDC → ZAR inside our VALR account.
5. We pay the user out in ZAR — **at their marked-up rate**, keeping the
   difference as margin.

## Known constraint that changes the product, not just the code

VALR's fiat withdrawal API (`/v1/wallet/fiat/:currency/withdraw`) only pays out
to bank accounts **already linked and verified on your VALR account** (via the
"Link Bank Account" API permission). There's no way to pass an arbitrary
third-party account number directly to VALR per withdrawal.

This means one of two things must be true before real payouts work end-to-end:

- **(a)** Every end user's bank account gets linked to your VALR account ahead
  of time (a real onboarding/KYC step with VALR, not just with you), or
- **(b)** You use a separate ZAR payout rail / payments provider for the
  "pay an arbitrary bank account" leg, using the ZAR VALR converted into your
  account as the funding source. VALR does the crypto→fiat conversion; a
  different provider does the "fiat to any bank account" leg.

`/api/withdraw` is built for (a). It will fail loudly (not silently) if no
matching linked account exists — that failure is the real state of the system
today, not a bug to suppress.

## Network safety (why `/api/currencies` exists)

VALR states plainly: depositing via the wrong blockchain network results in
**permanent, unrecoverable loss** of funds. This codebase never hardcodes a
network name anywhere. `src/lib/valr/networks.ts` is the single source of
truth — it calls VALR's live `/v1/public/currencies` endpoint and only allows
a deposit address to be generated for a network VALR currently lists as
enabled for that currency. As of the last check (Sept 2026), VALR supports
USDC on **Arbitrum, Avalanche, Solana, Base, and Ethereum** — **not** Arc.
If you need Arc specifically, that is not currently possible via VALR and
needs its own decision (see conversation history / do not assume this has
changed without re-checking live).

## Endpoints

| Method | Path                      | Purpose |
|--------|---------------------------|---------|
| GET    | `/api/currencies`         | Live supported networks for a currency (default USDC) |
| POST   | `/api/quote`               | Real VALR quote + markup applied; creates a pending transaction |
| POST   | `/api/deposit-address`    | Real VALR deposit address, re-validated network |
| GET    | `/api/transaction/:id`    | Poll status; checks real VALR deposit history |
| POST   | `/api/convert`            | Executes real VALR Simple Swap order |
| POST   | `/api/withdraw`           | Real VALR fiat withdrawal to a pre-linked bank account |

## Transaction lifecycle

```
AWAITING_DEPOSIT → DEPOSIT_DETECTED → DEPOSIT_CONFIRMED → CONVERTING
  → CONVERTED → PAYOUT_INITIATED → PAYOUT_COMPLETE
                                  ↘ FAILED (from any step)
```

## Setup

```bash
cp .env.example .env.local
# fill in VALR_API_KEY / VALR_API_SECRET
npm install
npm run dev
```

### Verifying the signing implementation

Before trusting this against a real key, re-run the self-check whenever
`sign.ts` changes:

```bash
npx tsx src/lib/valr/sign.selfcheck.ts
```

It checks output against VALR's own published test vectors. Do not deploy
if this fails.

### Required VALR API key scopes

- **View** — balances, transaction history
- **Trade** — Simple Swap quote/order
- **Withdraw** — crypto & fiat withdrawals
- **Link Bank Account** — required for `/api/withdraw` to see linked accounts

## Deploying to Railway

1. Push this repo to GitHub.
2. In Railway: New Project → Deploy from GitHub repo.
3. Set environment variables in Railway's service settings (same names as
   `.env.example`) — **never** commit `.env.local`.
4. Railway auto-detects Next.js and runs `npm run build` / `npm run start`.
   `npm run start` binds to `$PORT` as Railway requires.
5. Test against `https://<your-app>.up.railway.app/api/currencies?symbol=USDC`
   first — it needs no user input and confirms your API key/secret are wired
   correctly end-to-end.

## What's still a stub / needs a real decision before production

- **Transaction store** (`src/lib/transactions.ts`) is in-memory. It will
  lose all data on redeploy and won't work with >1 Railway replica. Swap in
  Postgres before this holds real user transactions across restarts.
- **Deposit confirmation polling** (`/api/transaction/:id`) is pull-based
  (call it repeatedly). VALR's WebSocket API would give real-time deposit
  notifications instead — worth moving to for production.
- **Bank account linking flow** — not built yet. Needed before `/api/withdraw`
  can succeed for a real, arbitrary user (see constraint above).
- **CASP licensing** — this system custodies user funds, even briefly. Confirm
  regulatory status before onboarding real users with real money.
