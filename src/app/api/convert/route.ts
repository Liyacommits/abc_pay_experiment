import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { valr, ValrApiError } from '@/lib/valr/client';
import { getTransaction, updateTransaction } from '@/lib/transactions';
import { env } from '@/lib/env';

const ConvertRequestSchema = z.object({
  transactionId: z.string().uuid(),
});

/**
 * VALR's real Simple Swap order response shape.
 * POST /v1/simple/:currencyPair/order
 */
interface ValrSimpleOrderResponse {
  id: string;
  success: boolean;
  failureReason?: string;
}

/**
 * POST /api/convert
 *
 * Executes the actual VALR conversion (USDC -> ZAR) for a transaction
 * whose deposit has been confirmed. This moves REAL VALR account
 * balance from crypto to fiat — it is the point of no return for this
 * transaction, so it will refuse to run unless status is exactly
 * DEPOSIT_CONFIRMED.
 */
export async function POST(req: NextRequest) {
  const parsed = ConvertRequestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { transactionId } = parsed.data;

  const tx = getTransaction(transactionId);
  if (!tx) {
    return NextResponse.json({ error: `Transaction ${transactionId} not found` }, { status: 404 });
  }
  if (tx.status !== 'DEPOSIT_CONFIRMED') {
    return NextResponse.json(
      {
        error: `Transaction is in status ${tx.status}, expected DEPOSIT_CONFIRMED. ` +
          `Refusing to convert unconfirmed or already-processed funds.`,
      },
      { status: 409 }
    );
  }

  const currencyPair = `${tx.cryptoCurrency}${tx.fiatCurrency}`;

  try {
    updateTransaction(transactionId, { status: 'CONVERTING' });

    const order = await valr.post<ValrSimpleOrderResponse>(
      `/v1/simple/${currencyPair}/order`,
      {
        payInCurrency: tx.cryptoCurrency,
        payAmount: tx.cryptoAmount.toString(),
        side: 'SELL',
      }
    );

    if (!order.success) {
      const failed = updateTransaction(transactionId, {
        status: 'FAILED',
        failureReason: order.failureReason ?? 'VALR order returned success: false',
      });
      return NextResponse.json(
        { transactionId: failed.id, status: failed.status, error: failed.failureReason },
        { status: 502 }
      );
    }

    const updated = updateTransaction(transactionId, {
      status: 'CONVERTED',
      valrOrderId: order.id,
    });

    return NextResponse.json({
      transactionId: updated.id,
      status: updated.status,
      valrOrderId: order.id,
      note: `Conversion complete on VALR's side. VALR account credited ${tx.grossFiatAmount} ${tx.fiatCurrency}. ` +
        `Platform margin of ${tx.marginAmount} ${tx.fiatCurrency} retained; ` +
        `user payout of ${tx.netFiatAmount} ${tx.fiatCurrency} is next.`,
      nextStep: 'Call POST /api/withdraw with this transactionId to pay the user out',
    });
  } catch (err) {
    updateTransaction(transactionId, {
      status: 'FAILED',
      failureReason: err instanceof Error ? err.message : 'Unknown error during conversion',
    });
    if (err instanceof ValrApiError) {
      return NextResponse.json(
        { error: err.message, valrStatus: err.status, valrBody: err.body },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error during conversion' },
      { status: 500 }
    );
  }
}
