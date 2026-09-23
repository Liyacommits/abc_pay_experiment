import { Router, Request, Response } from 'express';
import { getArcNetworkStatus } from '../lib/arc';
import { CONFIG } from '../lib/config';

const router = Router();

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const status = await getArcNetworkStatus();

    res.json({
      status: 'healthy',
      service: 'Arc Payment Request API (Circle EVM L1)',
      network: CONFIG.arc.chainId === 5042002 ? 'Arc Testnet' : 'Arc Mainnet',
      chainId: status.chainId,
      blockNumber: status.blockNumber,
      latencyMs: status.latencyMs,
      rpcUrl: status.rpcUrl,
      currency: CONFIG.arc.currency,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(503).json({
      status: 'degraded',
      service: 'Arc Payment Request API (Circle EVM L1)',
      error: message,
      rpcUrl: CONFIG.arc.rpcUrl,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
