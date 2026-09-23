import { valrPublic } from './client';

/**
 * SAFETY-CRITICAL MODULE
 * =======================
 * VALR states explicitly: depositing a currency via a network OTHER than
 * the one VALR has configured for that deposit address results in
 * PERMANENT, UNRECOVERABLE LOSS of the funds.
 *
 * This module is the single source of truth for "which networks does
 * VALR actually support for currency X, right now". Nothing else in this
 * codebase is allowed to hardcode a network name (e.g. "ARC", "SOLANA").
 * If a network isn't in VALR's own live response, it must not be
 * offered to a user, no matter what the product spec assumes.
 */

interface ValrCurrency {
  symbol: string; // e.g. "USDC"
  isActive: boolean;
  supportedWithdrawDecimalPlaces: number;
  // VALR's /v1/public/currencies response includes per-currency network
  // metadata since the changelog update noted in their docs. Field names
  // below are defensive — VALR does not publish a formal JSON schema, so
  // we validate shape at runtime rather than trusting types blindly.
  collateralCurrency?: boolean;
  networks?: Array<{
    network: string; // e.g. "SOLANA", "BASE", "ARBITRUM"
    isDefault?: boolean;
    depositsEnabled?: boolean;
    withdrawalsEnabled?: boolean;
  }>;
}

export interface SupportedNetwork {
  network: string;
  isDefault: boolean;
  depositsEnabled: boolean;
  withdrawalsEnabled: boolean;
}

/**
 * Fetches the live, current list of networks VALR supports for a given
 * currency. This hits VALR on every call by design for the deposit-address
 * step (correctness over latency) — /v1/public/currencies is cached by
 * VALR for 60s server-side per their docs, so this is cheap.
 *
 * Throws if the currency isn't found or has no network data — callers
 * MUST treat that as "cannot safely proceed", never as "assume a default".
 */
export async function getSupportedNetworks(currencySymbol: string): Promise<SupportedNetwork[]> {
  const currencies = await valrPublic<ValrCurrency[]>('/v1/public/currencies');

  const match = currencies.find(
    (c) => c.symbol.toUpperCase() === currencySymbol.toUpperCase()
  );

  if (!match) {
    throw new Error(
      `VALR does not list currency "${currencySymbol}" at all. Refusing to proceed — ` +
        `do not assume support based on documentation or memory.`
    );
  }

  if (!match.isActive) {
    throw new Error(`VALR currently has "${currencySymbol}" marked inactive. Refusing to proceed.`);
  }

  if (!match.networks || match.networks.length === 0) {
    throw new Error(
      `VALR returned no network metadata for "${currencySymbol}". This likely means the ` +
        `API response shape has changed since this code was written — stop and re-verify ` +
        `against live docs before allowing any deposit flow to continue.`
    );
  }

  return match.networks.map((n) => ({
    network: n.network,
    isDefault: n.isDefault ?? false,
    depositsEnabled: n.depositsEnabled ?? false,
    withdrawalsEnabled: n.withdrawalsEnabled ?? false,
  }));
}

/**
 * Validates that a network name the user/frontend selected is one VALR
 * currently accepts deposits on for this currency. Call this immediately
 * before requesting a deposit address — never trust a network string that
 * arrived from the client without re-checking it against a fresh call here.
 */
export async function assertNetworkIsDepositable(
  currencySymbol: string,
  requestedNetwork: string
): Promise<void> {
  const networks = await getSupportedNetworks(currencySymbol);
  const match = networks.find(
    (n) => n.network.toUpperCase() === requestedNetwork.toUpperCase()
  );

  if (!match) {
    const available = networks.map((n) => n.network).join(', ') || 'none';
    throw new Error(
      `"${requestedNetwork}" is not a network VALR lists for ${currencySymbol}. ` +
        `Currently available: ${available}. Refusing to generate a deposit address.`
    );
  }

  if (!match.depositsEnabled) {
    throw new Error(
      `VALR currently has deposits DISABLED for ${currencySymbol} on ${requestedNetwork}. ` +
        `Refusing to generate a deposit address — this would be a bug on VALR's side, not ` +
        `something to route around.`
    );
  }
}
