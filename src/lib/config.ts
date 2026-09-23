import dotenv from 'dotenv';

dotenv.config();

export const CONFIG = {
  port: parseInt(process.env.PORT || '3000', 10),

  arc: {
    // Arc Network RPC URL (Circle EVM Layer 1)
    rpcUrl: process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network',
    chainId: parseInt(process.env.ARC_CHAIN_ID || '5042002', 10),
    currency: 'USDC',
    decimals: 18,
    explorerUrl: process.env.ARC_EXPLORER_URL || 'https://testnet.arcscan.app',
  },
};
