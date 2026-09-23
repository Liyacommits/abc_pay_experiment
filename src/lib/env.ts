/**
 * Centralised, validated environment access.
 * Fails fast on boot if required secrets are missing — never let a
 * misconfigured deploy silently fall through to undefined signing keys.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set it in .env.local (dev) or your Railway service variables (prod).`
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

export const env = {
  // VALR API credentials — server-only, never exposed to the client bundle.
  VALR_API_KEY: () => required('VALR_API_KEY'),
  VALR_API_SECRET: () => required('VALR_API_SECRET'),
  VALR_API_BASE_URL: optional('VALR_API_BASE_URL', 'https://api.valr.com'),

  // Business config
  MARKUP_PERCENT: Number(optional('MARKUP_PERCENT', '2')), // 2 = 2%
  SUPPORTED_CRYPTO: optional('SUPPORTED_CRYPTO', 'USDC'),
  SETTLEMENT_FIAT: optional('SETTLEMENT_FIAT', 'ZAR'),

  // Optional: restrict which on-chain networks the app will accept for
  // deposits, as a comma-separated allow-list (e.g. "SOLANA,BASE").
  // Left unset by default — the actual source of truth is always the
  // live response from VALR's /v1/public/currencies (see valr/networks.ts).
  NETWORK_ALLOWLIST: optional('NETWORK_ALLOWLIST', ''),
};
