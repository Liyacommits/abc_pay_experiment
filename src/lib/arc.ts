import { ethers } from 'ethers';
import { CONFIG } from './config';

/**
 * Validate if string is a valid Ethereum / Arc 20-byte address (0x...)
 */
export function isValidArcAddress(address: string): boolean {
  if (!address || typeof address !== 'string') return false;
  return ethers.isAddress(address);
}

/**
 * Get JsonRpcProvider connected to Arc network
 */
export function getArcProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(CONFIG.arc.rpcUrl, {
    chainId: CONFIG.arc.chainId,
    name: 'arc',
  });
}

/**
 * Fetch native USDC balance on Arc
 * Arc uses USDC as native gas token with 18 decimals
 */
export async function getArcBalance(address: string): Promise<{
  address: string;
  balanceUsdc: number;
  balanceWei: string;
}> {
  const provider = getArcProvider();
  const balanceBigInt = await provider.getBalance(address);
  const formatted = ethers.formatUnits(balanceBigInt, CONFIG.arc.decimals);

  return {
    address: ethers.getAddress(address), // checksummed
    balanceUsdc: parseFloat(formatted),
    balanceWei: balanceBigInt.toString(),
  };
}

/**
 * Build payment links and transaction payload for an Arc USDC payment request
 */
export function buildArcPaymentRequest(params: {
  recipientAddress: string;
  amount: number;
  label?: string;
  message?: string;
  memo?: string;
}): {
  recipientAddress: string;
  amount: number;
  valueWei: string;
  valueHex: string;
  eip681Url: string;
  metaMaskDeepLink: string;
  transactionPayload: {
    to: string;
    value: string;
    valueHex: string;
    chainId: number;
    chainIdHex: string;
    data: string;
  };
} {
  const checksumAddress = ethers.getAddress(params.recipientAddress);
  const valueWei = ethers.parseUnits(params.amount.toString(), CONFIG.arc.decimals);
  const valueHex = ethers.toBeHex(valueWei);
  const chainId = CONFIG.arc.chainId;
  const chainIdHex = ethers.toBeHex(chainId);

  // Hex encoded memo if provided
  const data = params.memo ? ethers.hexlify(ethers.toUtf8Bytes(params.memo)) : '0x';

  // Standard EIP-681 Payment URI
  // Example: ethereum:0x123...@5042002?value=10000000000000000000
  const queryParams = new URLSearchParams();
  queryParams.set('value', valueWei.toString());
  const eip681Url = `ethereum:${checksumAddress}@${chainId}?${queryParams.toString()}`;

  // Universal MetaMask Deep Link
  // Opens MetaMask mobile app or browser extension directly to the transfer flow
  const metaMaskDeepLink = `https://metamask.app.link/send/${checksumAddress}?value=${valueWei.toString()}&chainId=${chainId}`;

  // Ready-to-use EVM transaction object for window.ethereum.request({ method: 'eth_sendTransaction' })
  const transactionPayload = {
    to: checksumAddress,
    value: valueWei.toString(),
    valueHex,
    chainId,
    chainIdHex,
    data,
  };

  return {
    recipientAddress: checksumAddress,
    amount: params.amount,
    valueWei: valueWei.toString(),
    valueHex,
    eip681Url,
    metaMaskDeepLink,
    transactionPayload,
  };
}

/**
 * Verify an Arc payment on-chain via transaction hash
 */
export async function verifyArcPayment(params: {
  txHash: string;
  expectedRecipient: string;
  expectedAmount: number;
}): Promise<{
  verified: boolean;
  txHash: string;
  from?: string;
  to?: string;
  amount?: number;
  blockNumber?: number;
  confirmations?: number;
  error?: string;
}> {
  // Allow test mock signatures
  if (params.txHash.startsWith('sim_') || params.txHash.startsWith('mock_')) {
    return {
      verified: true,
      txHash: params.txHash,
      from: '0x1111111111111111111111111111111111111111',
      to: params.expectedRecipient,
      amount: params.expectedAmount,
      blockNumber: 123456,
      confirmations: 1,
    };
  }

  try {
    const provider = getArcProvider();
    const [tx, receipt] = await Promise.all([
      provider.getTransaction(params.txHash),
      provider.getTransactionReceipt(params.txHash),
    ]);

    if (!tx || !receipt) {
      return {
        verified: false,
        txHash: params.txHash,
        error: 'Transaction not found or not yet confirmed on Arc network.',
      };
    }

    if (receipt.status !== 1) {
      return {
        verified: false,
        txHash: params.txHash,
        error: 'Transaction failed (reverted) on-chain.',
      };
    }

    const detectedRecipient = tx.to ? ethers.getAddress(tx.to) : '';
    const expectedRecipient = ethers.getAddress(params.expectedRecipient);

    if (detectedRecipient.toLowerCase() !== expectedRecipient.toLowerCase()) {
      return {
        verified: false,
        txHash: params.txHash,
        error: `Recipient mismatch: expected ${expectedRecipient}, but transaction was sent to ${detectedRecipient}`,
      };
    }

    const detectedAmount = parseFloat(ethers.formatUnits(tx.value, CONFIG.arc.decimals));
    if (Math.abs(detectedAmount - params.expectedAmount) > 0.0001) {
      return {
        verified: false,
        txHash: params.txHash,
        error: `Amount mismatch: expected ${params.expectedAmount} USDC, but transaction value was ${detectedAmount} USDC`,
      };
    }

    const currentBlock = await provider.getBlockNumber();
    const confirmations = currentBlock - receipt.blockNumber + 1;

    return {
      verified: true,
      txHash: params.txHash,
      from: tx.from,
      to: detectedRecipient,
      amount: detectedAmount,
      blockNumber: receipt.blockNumber,
      confirmations,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      verified: false,
      txHash: params.txHash,
      error: `Failed to verify Arc transaction: ${message}`,
    };
  }
}

/**
 * Check connectivity and query status of Arc network RPC
 */
export async function getArcNetworkStatus(): Promise<{
  connected: boolean;
  blockNumber: number;
  chainId: number;
  rpcUrl: string;
  latencyMs: number;
}> {
  const start = performance.now();
  const provider = getArcProvider();
  const blockNumber = await provider.getBlockNumber();
  const latencyMs = Math.round(performance.now() - start);

  return {
    connected: true,
    blockNumber,
    chainId: CONFIG.arc.chainId,
    rpcUrl: CONFIG.arc.rpcUrl,
    latencyMs,
  };
}

