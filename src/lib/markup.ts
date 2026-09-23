import { env } from '@/lib/env';

export interface MarkupResult {
  /** The raw rate VALR quoted, before any markup. Units: fiat per 1 unit of crypto. */
  valrRate: number;
  /** The rate actually shown to / honoured for the user, after markup. */
  userRate: number;
  /** Markup percentage applied, e.g. 2 for 2%. */
  markupPercent: number;
  /** Gross fiat amount VALR would pay out for the given crypto amount, pre-markup. */
  grossFiatAmount: number;
  /** Net fiat amount the user actually receives, post-markup. */
  netFiatAmount: number;
  /** Our margin in fiat currency for this transaction. */
  marginAmount: number;
}

/**
 * Applies the platform markup to a VALR-quoted rate.
 *
 * Model: user is converting crypto -> fiat. VALR gives us `valrRate` fiat
 * per unit of crypto. We take a cut by paying the user a worse rate than
 * VALR gave us, and keep the difference.
 *
 * This is the ONLY place markup math should happen. Every route that
 * touches money must import this function rather than reimplementing
 * the percentage calculation inline.
 */
export function applyMarkup(valrRate: number, cryptoAmount: number): MarkupResult {
  const markupPercent = env.MARKUP_PERCENT;

  if (!Number.isFinite(valrRate) || valrRate <= 0) {
    throw new Error(`Invalid VALR rate for markup calculation: ${valrRate}`);
  }
  if (!Number.isFinite(cryptoAmount) || cryptoAmount <= 0) {
    throw new Error(`Invalid crypto amount for markup calculation: ${cryptoAmount}`);
  }

  const userRate = valrRate * (1 - markupPercent / 100);
  const grossFiatAmount = valrRate * cryptoAmount;
  const netFiatAmount = userRate * cryptoAmount;
  const marginAmount = grossFiatAmount - netFiatAmount;

  return {
    valrRate,
    userRate,
    markupPercent,
    grossFiatAmount: round2(grossFiatAmount),
    netFiatAmount: round2(netFiatAmount),
    marginAmount: round2(marginAmount),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
