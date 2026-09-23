import crypto from 'crypto';

/**
 * Transaction lifecycle state store.
 *
 * IMPORTANT: this is an in-memory Map. It is fine for testing the flow
 * end-to-end on a single Railway instance, but:
 *   - it is wiped on every restart/redeploy
 *   - it will NOT work correctly with more than one instance/replica
 *   - it is not durable — a crash mid-transaction loses the record
 *
 * Before this goes anywhere near real user funds in production, replace
 * this module's internals with a real database (Postgres is the natural
 * choice on Railway) while keeping the same exported function signatures,
 * so nothing else in the codebase needs to change.
 */

export type TransactionStatus =
  | 'AWAITING_DEPOSIT' // quote issued, waiting for user's on-chain deposit
  | 'DEPOSIT_DETECTED' // deposit seen, not yet confirmed
  | 'DEPOSIT_CONFIRMED' // deposit has enough confirmations, safe to convert
  | 'CONVERTING' // VALR simple/order call in flight
  | 'CONVERTED' // crypto -> fiat conversion done on VALR
  | 'PAYOUT_INITIATED' // fiat withdrawal to user's bank submitted
  | 'PAYOUT_COMPLETE' // funds landed in user's bank account
  | 'FAILED';

export interface TransactionRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: TransactionStatus;

  // What the user is converting
  cryptoCurrency: string; // e.g. "USDC"
  network: string; // e.g. "SOLANA" - validated against live VALR data at quote time
  cryptoAmount: number;

  // Quote details (see markup.ts)
  valrRate: number;
  userRate: number;
  markupPercent: number;
  grossFiatAmount: number;
  netFiatAmount: number;
  marginAmount: number;
  fiatCurrency: string;
  quoteExpiresAt: string;

  // VALR-side references, populated as the flow progresses
  valrDepositAddress?: string;
  valrOrderId?: string;
  valrWithdrawId?: string;

  // Destination bank details (store minimally; see note in withdraw route)
  bankAccountNumber?: string;
  bankAccountHolder?: string;

  failureReason?: string;
}

const store = new Map<string, TransactionRecord>();

export function createTransaction(
  input: Omit<
    TransactionRecord,
    'id' | 'createdAt' | 'updatedAt' | 'status'
  >
): TransactionRecord {
  const now = new Date().toISOString();
  const record: TransactionRecord = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    status: 'AWAITING_DEPOSIT',
  };
  store.set(record.id, record);
  return record;
}

export function getTransaction(id: string): TransactionRecord | undefined {
  return store.get(id);
}

export function updateTransaction(
  id: string,
  patch: Partial<Omit<TransactionRecord, 'id' | 'createdAt'>>
): TransactionRecord {
  const existing = store.get(id);
  if (!existing) {
    throw new Error(`Transaction ${id} not found`);
  }
  const updated: TransactionRecord = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  store.set(id, updated);
  return updated;
}

export function listTransactions(): TransactionRecord[] {
  return Array.from(store.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
