import { NextRequest, NextResponse } from 'next/server';
import { getSupportedNetworks } from '@/lib/valr/networks';
import { env } from '@/lib/env';
import { ValrApiError } from '@/lib/valr/client';

/**
 * GET /api/currencies?symbol=USDC
 *
 * Returns the LIVE list of networks VALR currently supports for the given
 * currency, straight from /v1/public/currencies. The frontend's network
 * selector must be populated from this response and nothing else — never
 * hardcode a network name in the UI.
 */
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol') ?? env.SUPPORTED_CRYPTO;

  try {
    const networks = await getSupportedNetworks(symbol);
    return NextResponse.json({
      currency: symbol,
      networks,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof ValrApiError) {
      return NextResponse.json(
        { error: err.message, valrStatus: err.status },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error fetching networks' },
      { status: 500 }
    );
  }
}
