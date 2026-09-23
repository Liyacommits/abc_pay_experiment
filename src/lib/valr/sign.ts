import crypto from 'crypto';

/**
 * VALR request signature.
 *
 * Per https://docs.valr.com/ ("Request signing"):
 *   signature = HMAC_SHA512(secret, timestamp + VERB + path + body)
 * where:
 *   - timestamp is the current unix time in MILLISECONDS, as a string
 *   - VERB is uppercase (GET, POST, PUT, DELETE)
 *   - path includes the query string, excludes the host
 *   - body is the exact JSON string sent (empty string if none)
 *
 * This function is verified against VALR's own published test vectors
 * in signRequest.test.ts before ever being used against a live key.
 */
export function signRequest(
  apiSecret: string,
  timestampMs: string | number,
  verb: string,
  path: string,
  body: string = ''
): string {
  const payload = `${timestampMs}${verb.toUpperCase()}${path}${body}`;
  return crypto.createHmac('sha512', apiSecret).update(payload).digest('hex');
}
