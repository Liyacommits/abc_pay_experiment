import { NextRequest, NextResponse } from 'next/server';
import { valr, ValrApiError } from '@/lib/valr/client';
import { getTransaction, updateTransaction } from '@/lib/transactions';

/**
 * VALR's real deposit history response shape (subset of fields used here).
 * GET /v1/wallet/crypto/:currencyCode/deposit/history
 */
interface ValrDepositHistoryEntry {
  currency: string;
  address: string;
  amount: string;
  confirmations: number;
  transactionHash: string;
  createdAt: string;
  // VALR marks a deposit "confirmed" once it reaches network-specific
  // required confirmations; exact field name should be re-verified
  // against a live response the first time this runs.
  confirmed?: boolean;
}

/**
 * GET /api/transaction/:id
 *
 * Polls VALR's real deposit history for this transaction's deposit
 * address, and advances the transaction's status when a matching,
 * sufficiently-confirmed deposit is found. This does NOT yet trigger
 * conversion — that only happens via the explicit POST /api/convert
 * call, so a human/frontend decision point sits between "money arrived"
 * and "we sold it and started a payout".
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const tx = getTransaction(params.id);
  if (!tx) {
    return NextResponse.json({ error: `Transaction ${params.id} not found` }, { status: 404 });
  }

  // Only worth checking VALR if we're still waiting on the deposit.
  if (tx.status === 'AWAITING_DEPOSIT' && tx.valrDepositAddress) {
    try {
      const history = await valr.get<ValrDepositHistoryEntry[]>(
        `/v1/wallet/crypto/${tx.cryptoCurrency}/deposit/history`
      );

      const match = history.find(
        (d) =>
          d.address === tx.valrDepositAddress &&
          Number(d.amount) >= tx.cryptoAmount * 0.999 // tolerate dust/fee rounding
      );

      if (match) {
        // We're inside the `tx.status === 'AWAITING_DEPOSIT'` branch, so
        // any match found here is necessarily a status advance — always
        // write it rather than comparing against the (narrowed) old value.
        const newStatus = match.confirmed ? 'DEPOSIT_CONFIRMED' : 'DEPOSIT_DETECTED';
        updateTransaction(tx.id, { status: newStatus });
      }
    } catch (err) {
      // Don't fail the whole status check if VALR's deposit history call
      // has a transient error — just return the last known local state.
      console.error('Error checking VALR deposit history:', err);
    }
  }

  const fresh = getTransaction(tx.id)!;
  return NextResponse.json({
    transactionId: fresh.id,
    status: fresh.status,
    cryptoCurrency: fresh.cryptoCurrency,
    network: fresh.network,
    cryptoAmount: fresh.cryptoAmount,
    fiatCurrency: fresh.fiatCurrency,
    netFiatAmount: fresh.netFiatAmount,
    valrDepositAddress: fresh.valrDepositAddress ?? null,
    valrOrderId: fresh.valrOrderId ?? null,
    valrWithdrawId: fresh.valrWithdrawId ?? null,
    failureReason: fresh.failureReason ?? null,
    updatedAt: fresh.updatedAt,
  });
}
