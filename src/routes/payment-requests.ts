import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { isValidArcAddress, buildArcPaymentRequest, verifyArcPayment } from '../lib/arc';
import { CONFIG } from '../lib/config';
import { db, PaymentRequest } from '../lib/db';

const router = Router();

// ==========================================
// 1. Create Payment Request (Arc / MetaMask)
// ==========================================
const CreatePaymentRequestSchema = z.object({
  recipientAddress: z.string().min(1, 'Recipient address is required'),
  amount: z.number().positive('Amount must be greater than 0'),
  network: z.enum(['arc-testnet', 'arc-mainnet']).optional(),
  label: z.string().max(80).optional(),
  message: z.string().max(120).optional(),
  memo: z.string().max(80).optional(),
  ttlMinutes: z.number().min(1).max(43200).optional(), // default 60 min
});

router.post('/', (req: Request, res: Response): void => {
  try {
    const parseResult = CreatePaymentRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parseResult.error.format(),
      });
      return;
    }

    const {
      recipientAddress,
      amount,
      network = 'arc-testnet',
      label,
      message,
      memo,
      ttlMinutes = 60,
    } = parseResult.data;

    if (!isValidArcAddress(recipientAddress)) {
      res.status(400).json({
        success: false,
        error: `Invalid EVM/MetaMask address: '${recipientAddress}'. Must be a valid 20-byte 0x... hex address.`,
      });
      return;
    }

    const arcPayment = buildArcPaymentRequest({
      recipientAddress,
      amount,
      label,
      message,
      memo,
    });

    const now = Date.now();
    const expiresAt = now + ttlMinutes * 60 * 1000;
    const requestId = `pay_${now}_${Math.random().toString(36).substring(2, 8)}`;
    const reference = `ARC-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

    const record: PaymentRequest = {
      id: requestId,
      reference,
      network,
      recipientAddress: arcPayment.recipientAddress,
      amount,
      currency: 'USDC',
      label,
      message,
      memo,
      paymentUrl: arcPayment.eip681Url,
      metaMaskDeepLink: arcPayment.metaMaskDeepLink,
      transactionPayload: arcPayment.transactionPayload,
      status: 'PENDING',
      createdAt: now,
      expiresAt,
    };

    db.createPaymentRequest(record);

    res.status(201).json({
      success: true,
      requestId: record.id,
      reference: record.reference,
      network: 'Arc (Circle EVM L1)',
      chainId: CONFIG.arc.chainId,
      recipientAddress: record.recipientAddress,
      amount: record.amount,
      currency: 'USDC',
      formattedAmount: `${record.amount} USDC`,
      paymentUrl: record.paymentUrl,
      metaMaskDeepLink: record.metaMaskDeepLink,
      transactionPayload: record.transactionPayload,
      qrCodeData: record.paymentUrl,
      status: record.status,
      createdAt: new Date(record.createdAt).toISOString(),
      expiresAt: new Date(record.expiresAt).toISOString(),
      instructions: {
        metaMaskMobile: 'Open the metaMaskDeepLink or scan qrCodeData in MetaMask to prefill recipient and amount.',
        webDapp: 'Pass transactionPayload directly to window.ethereum.request({ method: "eth_sendTransaction", params: [transactionPayload] }).',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});


router.get('/:id', (req: Request, res: Response): void => {
  try {
    const id = String(req.params.id);
    const request = db.getPaymentRequest(id) || db.getPaymentRequestByReference(id);

    if (!request) {
      res.status(404).json({ success: false, error: `Payment request '${id}' not found` });
      return;
    }

    // Auto-expire if past expiresAt
    const isExpired = Date.now() > request.expiresAt && request.status === 'PENDING';
    if (isExpired) {
      db.updatePaymentRequest(request.id, { status: 'EXPIRED' });
      request.status = 'EXPIRED';
    }

    res.json({
      success: true,
      request,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

const ConfirmSchema = z.object({
  txHash: z.string().min(5, 'Transaction hash is required (0x...)'),
});

router.post('/:id/confirm', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const request = db.getPaymentRequest(id) || db.getPaymentRequestByReference(id);

    if (!request) {
      res.status(404).json({ success: false, error: `Payment request '${id}' not found` });
      return;
    }

    if (request.status === 'CONFIRMED') {
      res.json({
        success: true,
        message: 'Payment request is already confirmed.',
        request,
      });
      return;
    }

    const parseResult = ConfirmSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parseResult.error.format(),
      });
      return;
    }

    const { txHash } = parseResult.data;

    const verification = await verifyArcPayment({
      txHash,
      expectedRecipient: request.recipientAddress,
      expectedAmount: request.amount,
    });

    if (!verification.verified) {
      res.status(400).json({
        success: false,
        verified: false,
        error: verification.error,
        txHash,
      });
      return;
    }

    db.updatePaymentRequest(request.id, {
      status: 'CONFIRMED',
      txHash,
    });
    request.status = 'CONFIRMED';
    request.txHash = txHash;

    res.json({
      success: true,
      verified: true,
      message: 'Payment confirmed successfully on Arc network.',
      verification,
      request,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

// List All Payment Requests
router.get('/', (req: Request, res: Response): void => {
  try {
    const status = (req.query.status as string) || undefined;
    const recipient = (req.query.recipient as string) || undefined;

    const requests = db.listPaymentRequests({ status, recipient });

    const totalVolumeUsdc = requests
      .filter(r => r.status === 'CONFIRMED')
      .reduce((sum, r) => sum + r.amount, 0);

    res.json({
      success: true,
      count: requests.length,
      metrics: {
        totalRequests: requests.length,
        confirmedVolumeUsdc: parseFloat(totalVolumeUsdc.toFixed(6)),
      },
      paymentRequests: requests,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
