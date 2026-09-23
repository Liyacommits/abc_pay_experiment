import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { valr, ValrApiError } from '@/lib/valr/client';
import { assertNetworkIsDepositable } from '@/lib/valr/networks';
import { applyMarkup } from '@/lib/markup';
import { createTransaction } from '@/lib/transactions';
import { env } from '@/lib/env';

const QuoteRequestSchema = z.object({
  cryptoAmount: z.number().positive(),
  network: z.string().min(1),
  bankAccountNumber: z.string().min(1),
  bankAccountHolder: z.string().min(1),
});

/**
 * VALR's real Simple Swap quote response shape.
 * POST /v1/simple/:currencyPair/quote
 * body: { payInCurrency, payAmount, side }
 */
interface ValrSimpleQuoteResponse {
  currencyPair: string;
  side: 'SELL' | 'BUY';
  payInCurrency: string;
  payAmount: string;
  receiveCurrency: string;
  receiveAmount: string;
  fee: string;
  feeCurrency: string;
  id: string; // quote id, required to place the matching order
  createdAt: string;
  expiresAt: string;
}

/**
 * POST /api/quote
 *
 * Flow:
 *  1. Validate the requested network is one VALR actually supports for
 *     USDC right now (live check — never trust a cached/assumed list).
 *  2. Ask VALR for a real quote: USDC -> ZAR.
 *  3. Apply our 2% markup on top of VALR's rate.
 *  4. Create a pending transaction record and return it to the caller,
 *     including the deposit step that must happen next.
 */
export async function POST(req: NextRequest) {
  const parsed = QuoteRequestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { cryptoAmount, network, bankAccountNumber, bankAccountHolder } = parsed.data;

  const cryptoCurrency = env.SUPPORTED_CRYPTO; // USDC
  const fiatCurrency = env.SETTLEMENT_FIAT; // ZAR
  const currencyPair = `${cryptoCurrency}${fiatCurrency}`; // e.g. USDCZAR

  try {
    // Step 1 — safety-critical live network check. Throws if the network
    // isn't currently valid for deposits, which the route below turns
    // into a 422 rather than silently proceeding.
    await assertNetworkIsDepositable(cryptoCurrency, network);

    // Step 2 — real VALR quote, SELL side because the user is selling
    // crypto to receive fiat.
    const valrQuote = await valr.post<ValrSimpleQuoteResponse>(
      `/v1/simple/${currencyPair}/quote`,
      {
        payInCurrency: cryptoCurrency,
        payAmount: cryptoAmount.toString(),
        side: 'SELL',
      }
    );

    const grossReceiveAmount = Number(valrQuote.receiveAmount);
    const impliedValrRate = grossReceiveAmount / cryptoAmount;

    // Step 3 — apply our markup on top of VALR's real quoted rate.
    const markup = applyMarkup(impliedValrRate, cryptoAmount);

    // Step 4 — persist as a pending transaction awaiting deposit.
    const transaction = createTransaction({
      cryptoCurrency,
      network,
      cryptoAmount,
      valrRate: markup.valrRate,
      userRate: markup.userRate,
      markupPercent: markup.markupPercent,
      grossFiatAmount: markup.grossFiatAmount,
      netFiatAmount: markup.netFiatAmount,
      marginAmount: markup.marginAmount,
      fiatCurrency,
      quoteExpiresAt: valrQuote.expiresAt,
      bankAccountNumber,
      bankAccountHolder,
    });

    return NextResponse.json({
      transactionId: transaction.id,
      status: transaction.status,
      quote: {
        cryptoCurrency,
        network,
        cryptoAmount,
        valrRate: markup.valrRate,
        userRate: markup.userRate,
        markupPercent: markup.markupPercent,
        userWillReceive: markup.netFiatAmount,
        fiatCurrency,
        expiresAt: valrQuote.expiresAt,
        valrQuoteId: valrQuote.id,
      },
      nextStep: 'Request a deposit address via POST /api/deposit-address with this transactionId',
    });
  } catch (err) {
    if (err instanceof ValrApiError) {
      return NextResponse.json(
        { error: err.message, valrStatus: err.status, valrBody: err.body },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error generating quote' },
      { status: 422 }
    );
  }
}
