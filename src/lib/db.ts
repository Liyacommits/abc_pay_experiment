import fs from 'fs';
import path from 'path';

export interface PaymentRequest {
  id: string;
  reference: string;
  network: string; // 'arc-testnet' | 'arc-mainnet'
  recipientAddress: string;
  amount: number;
  currency: string; // 'USDC'
  label?: string;
  message?: string;
  memo?: string;
  paymentUrl: string; // EIP-681 URL
  metaMaskDeepLink: string;
  transactionPayload: {
    to: string;
    value: string;
    valueHex: string;
    chainId: number;
    chainIdHex: string;
    data: string;
  };
  status: 'PENDING' | 'CONFIRMED' | 'EXPIRED';
  txHash?: string;
  createdAt: number;
  expiresAt: number;
}

interface DatabaseSchema {
  paymentRequests: Record<string, PaymentRequest>;
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'payment-requests.json');

class Database {
  private data: DatabaseSchema = {
    paymentRequests: {},
  };
  private isLoaded = false;

  private ensureLoaded() {
    if (this.isLoaded) return;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(fileContent);
      } else {
        this.save();
      }
    } catch (e) {
      console.error('Failed to load database file, using memory store:', e);
    }
    this.isLoaded = true;
  }

  private save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to persist database file:', e);
    }
  }

  createPaymentRequest(req: PaymentRequest): PaymentRequest {
    this.ensureLoaded();
    this.data.paymentRequests[req.id] = req;
    this.save();
    return req;
  }

  getPaymentRequest(id: string): PaymentRequest | null {
    this.ensureLoaded();
    return this.data.paymentRequests[id] || null;
  }

  getPaymentRequestByReference(ref: string): PaymentRequest | null {
    this.ensureLoaded();
    const all = Object.values(this.data.paymentRequests);
    return all.find(r => r.reference.toUpperCase() === ref.toUpperCase()) || null;
  }

  updatePaymentRequest(id: string, updates: Partial<PaymentRequest>): PaymentRequest | null {
    this.ensureLoaded();
    const item = this.data.paymentRequests[id];
    if (!item) return null;
    Object.assign(item, updates);
    this.save();
    return item;
  }

  listPaymentRequests(filter?: { status?: string; recipient?: string }): PaymentRequest[] {
    this.ensureLoaded();
    let items = Object.values(this.data.paymentRequests);
    if (filter?.status) {
      items = items.filter(r => r.status === filter.status);
    }
    if (filter?.recipient) {
      const recipient = filter.recipient.toLowerCase();
      items = items.filter(r => r.recipientAddress.toLowerCase() === recipient);
    }
    return items.sort((a, b) => b.createdAt - a.createdAt);
  }
}

export const db = new Database();
