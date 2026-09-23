import { valrPublic } from './client';

/**
 * SAFETY-CRITICAL MODULE
 * =======================
 *
 * VALR's /v1/public/currencies endpoint is the source of truth for
 * supported networks.
 *
 * Never hardcode a blockchain network in the application.
 */

interface ValrSupportedNetwork {
  networkType: string;
  networkLongName: string;
  tokenContract: string;
  minimumWithdrawAmount: string;
  estimatedSendCost: string;
  deposit: boolean;
  withdraw: boolean;
  withdrawalDecimalPlaces: string;
}

interface ValrCurrency {
  symbol: string;
  isActive: boolean;
  withdrawalDecimalPlaces: string;
  collateral?: boolean;
  collateralWeight?: string;
  defaultNetworkType?: string;
  supportedNetworks?: ValrSupportedNetwork[];
}

export interface SupportedNetwork {
  network: string;
  isDefault: boolean;
  depositsEnabled: boolean;
  withdrawalsEnabled: boolean;
}

/**
 * Fetches the live networks VALR supports for a currency.
 */
export async function getSupportedNetworks(
  currencySymbol: string
): Promise<SupportedNetwork[]> {
  const currencies = await valrPublic<ValrCurrency[]>(
    '/v1/public/currencies'
  );

  const match = currencies.find(
    (c) => c.symbol.toUpperCase() === currencySymbol.toUpperCase()
  );

  if (!match) {
    throw new Error(
      `VALR does not list currency "${currencySymbol}" at all. ` +
        `Refusing to proceed — do not assume support based on documentation or memory.`
    );
  }

  if (!match.isActive) {
    throw new Error(
      `VALR currently has "${currencySymbol}" marked inactive. Refusing to proceed.`
    );
  }

  if (
    !match.supportedNetworks ||
    match.supportedNetworks.length === 0
  ) {
    throw new Error(
      `VALR returned no supported network metadata for "${currencySymbol}". ` +
        `Refusing to proceed.`
    );
  }

  return match.supportedNetworks.map((n) => ({
    network: n.networkType,

    isDefault:
      n.networkType.toUpperCase() ===
      match.defaultNetworkType?.toUpperCase(),

    depositsEnabled: n.deposit,

    withdrawalsEnabled: n.withdraw,
  }));
}

/**
 * Validates that a requested network is currently supported
 * for deposits by VALR.
 */
export async function assertNetworkIsDepositable(
  currencySymbol: string,
  requestedNetwork: string
): Promise<void> {
  const networks = await getSupportedNetworks(currencySymbol);

  const match = networks.find(
    (n) =>
      n.network.toUpperCase() === requestedNetwork.toUpperCase()
  );

  if (!match) {
    const available =
      networks.map((n) => n.network).join(', ') || 'none';

    throw new Error(
      `"${requestedNetwork}" is not a network VALR lists for ${currencySymbol}. ` +
        `Currently available: ${available}. Refusing to generate a deposit address.`
    );
  }

  if (!match.depositsEnabled) {
    throw new Error(
      `VALR currently has deposits DISABLED for ${currencySymbol} ` +
        `on ${requestedNetwork}. Refusing to generate a deposit address.`
    );
  }
}