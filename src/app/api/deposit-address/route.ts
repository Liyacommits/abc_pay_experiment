import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { valr, ValrApiError } from '@/lib/valr/client';
import { assertNetworkIsDepositable } from '@/lib/valr/networks';
import { getTransaction, updateTransaction } from '@/lib/transactions';

const DepositAddressRequestSchema = z.object({
  transactionId: z.string().uuid(),
});

/**
 * VALR's real deposit address response shape.
 * GET /v1/wallet/crypto/:currencyCode/deposit/address?network=...
 */
interface ValrDepositAddressResponse {
  currency: string;
  address: string;
  tag?: string; // some currencies require a memo/tag in addition to the address
}

/**
 * POST /api/deposit-address
 *
 * SAFETY CRITICAL: this is the endpoint that hands the user an address
 * to send real USDC to. Two independent safeguards before it will do so:
 *
 *   1. Re-validates the transaction's stored network against VALR's LIVE
 *      /v1/public/currencies response — not the value cached at quote
 *      time, in case anything changed on VALR's side in the interim.
 *   2. Passes the network explicitly to VALR's deposit/address call so
 *      the address returned is guaranteed to be for that exact network.
 *
 * If either check fails, this returns an error and NO address — it must
 * never fall back to "just use the default network" silently.
 */
export async function POST(req: NextRequest) {
  const parsed = DepositAddressRequestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { transactionId } = parsed.data;

  const tx = getTransaction(transactionId);
  if (!tx) {
    return NextResponse.json({ error: `Transaction ${transactionId} not found` }, { status: 404 });
  }
  if (tx.status !== 'AWAITING_DEPOSIT') {
    return NextResponse.json(
      { error: `Transaction is in status ${tx.status}, expected AWAITING_DEPOSIT` },
      { status: 409 }
    );
  }
  if (new Date(tx.quoteExpiresAt).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Quote has expired. Request a new quote.' }, { status: 410 });
  }

  try {
    // Re-check live, do not trust the network stored at quote time alone.
    await assertNetworkIsDepositable(tx.cryptoCurrency, tx.network);

    const depositAddress = await valr.get<ValrDepositAddressResponse>(
      `/v1/wallet/crypto/${tx.cryptoCurrency}/deposit/address?network=${encodeURIComponent(tx.network)}`
    );

    const updated = updateTransaction(transactionId, {
      valrDepositAddress: depositAddress.address,
      status: 'AWAITING_DEPOSIT',
    });

    return NextResponse.json({
      transactionId: updated.id,
      depositAddress: depositAddress.address,
      depositTag: depositAddress.tag ?? null,
      currency: tx.cryptoCurrency,
      network: tx.network,
      cryptoAmountExpected: tx.cryptoAmount,
      warning: `Send EXACTLY ${tx.cryptoAmount} ${tx.cryptoCurrency} via the ${tx.network} network ONLY. ` +
        `Sending via any other network will result in permanent loss of funds.`,
      nextStep: 'Poll GET /api/transaction/' + updated.id + ' until status is DEPOSIT_CONFIRMED',
    });
  } catch (err) {
    if (err instanceof ValrApiError) {
      return NextResponse.json(
        { error: err.message, valrStatus: err.status, valrBody: err.body },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error fetching deposit address' },
      { status: 422 }
    );
  }
}
