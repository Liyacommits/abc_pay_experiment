import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { valr, ValrApiError } from '@/lib/valr/client';
import { getTransaction, updateTransaction } from '@/lib/transactions';

const WithdrawRequestSchema = z.object({
  transactionId: z.string().uuid(),
});

/**
 * VALR's real fiat withdrawal response shape.
 * POST /v1/wallet/fiat/:currency/withdraw
 */
interface ValrFiatWithdrawResponse {
  id: string;
}

interface ValrLinkedBankAccount {
  id: string;
  accountHolder: string;
  accountNumber: string; // typically masked/partial in VALR's response
  bankName?: string;
  verified?: boolean;
}

/**
 * POST /api/withdraw
 *
 * *** CONFIRMED CONSTRAINT — this changes the product model, not just the code ***
 *
 * VALR's fiat withdrawal API (`GET /v1/wallet/fiat/:currency/accounts`,
 * `POST /v1/wallet/fiat/:currency/withdraw`) pays out ONLY to bank
 * accounts already linked and verified on YOUR VALR account — via the
 * dedicated "Link Bank Account" API key permission. There is no
 * parameter on VALR's withdraw endpoint for an arbitrary third-party
 * account number supplied per-request.
 *
 * Practically, this means one of two things has to be true for this
 * product to work as described ("funds directly deposited to the
 * user's account via bank account number"):
 *
 *   (a) Each end user's own bank account must be linked to YOUR VALR
 *       account ahead of time (via the Link Bank Account API/flow)
 *       before you can pay them out — meaning users effectively need
 *       an onboarding/KYC step with VALR itself, not just with you, or
 *   (b) You pay users out through a SEPARATE payment rail (a South
 *       African payments provider/PSP with its own payout API) using
 *       the ZAR VALR has already converted into your VALR account —
 *       VALR handles the crypto->fiat leg, a different provider
 *       handles the "fiat to arbitrary bank account" leg.
 *
 * This route is written for (a) since it's the direct VALR-only path,
 * and looks up a matching linked account by account number rather than
 * sending an arbitrary account number to VALR (which its API does not
 * accept). It will correctly fail with a clear error if no matching
 * linked account exists — which is the real-world state today unless
 * you've built a bank-linking step elsewhere in the product. Don't
 * paper over that failure; it's telling you option (b) needs a decision.
 */
export async function POST(req: NextRequest) {
  const parsed = WithdrawRequestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { transactionId } = parsed.data;

  const tx = getTransaction(transactionId);
  if (!tx) {
    return NextResponse.json({ error: `Transaction ${transactionId} not found` }, { status: 404 });
  }
  if (tx.status !== 'CONVERTED') {
    return NextResponse.json(
      { error: `Transaction is in status ${tx.status}, expected CONVERTED. Refusing to pay out.` },
      { status: 409 }
    );
  }

  try {
    updateTransaction(transactionId, { status: 'PAYOUT_INITIATED' });

    // SAFETY: explicitly use netFiatAmount (post-markup), never
    // grossFiatAmount. This assertion exists so a future refactor can't
    // accidentally swap these two fields.
    const payoutAmount = tx.netFiatAmount;
    if (payoutAmount >= tx.grossFiatAmount) {
      throw new Error(
        `Payout amount (${payoutAmount}) is not less than gross amount ` +
          `(${tx.grossFiatAmount}) — markup was not applied correctly. Refusing to pay out.`
      );
    }

    // Look up the user's bank account among accounts already linked to
    // this VALR account. If it isn't there, we cannot pay out via VALR
    // directly — see the model note above.
    const linkedAccounts = await valr.get<ValrLinkedBankAccount[]>(
      `/v1/wallet/fiat/${tx.fiatCurrency}/accounts`
    );
    const linkedAccount = linkedAccounts.find(
      (a) => a.accountNumber === tx.bankAccountNumber && a.verified
    );

    if (!linkedAccount) {
      throw new Error(
        `No verified bank account matching "${tx.bankAccountNumber}" is linked to the ` +
          `VALR account. VALR's withdraw API only pays out to pre-linked, verified bank ` +
          `accounts — this user's account must be linked via VALR's Link Bank Account ` +
          `flow before this transaction can be paid out, or a separate payout rail is ` +
          `needed for arbitrary bank accounts (see route comment above).`
      );
    }

    const withdrawal = await valr.post<ValrFiatWithdrawResponse>(
      `/v1/wallet/fiat/${tx.fiatCurrency}/withdraw`,
      {
        amount: payoutAmount.toString(),
        linkedBankAccountId: linkedAccount.id,
      }
    );

    const updated = updateTransaction(transactionId, {
      status: 'PAYOUT_COMPLETE',
      valrWithdrawId: withdrawal.id,
    });

    return NextResponse.json({
      transactionId: updated.id,
      status: updated.status,
      valrWithdrawId: withdrawal.id,
      amountPaidOut: payoutAmount,
      currency: tx.fiatCurrency,
      platformMargin: tx.marginAmount,
    });
  } catch (err) {
    updateTransaction(transactionId, {
      status: 'FAILED',
      failureReason: err instanceof Error ? err.message : 'Unknown error during withdrawal',
    });
    if (err instanceof ValrApiError) {
      return NextResponse.json(
        { error: err.message, valrStatus: err.status, valrBody: err.body },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error during withdrawal' },
      { status: 500 }
    );
  }
}
