/**
 * Self-check: verifies signRequest() produces byte-identical output to
 * VALR's own published test vectors (docs.valr.com, "Request signing"
 * section). Run this once after any change to sign.ts:
 *
 *   npx tsx src/lib/valr/sign.selfcheck.ts
 *
 * If either check fails, DO NOT deploy — it means the signing
 * implementation has drifted from VALR's spec and every authenticated
 * call will be rejected (or worse, silently malformed).
 */
import { signRequest } from './sign';

const CHECKS = [
  {
    name: 'GET /v1/account/balances',
    secret: '4961b74efac86b25cce8fbe4c9811c4c7a787b7a5996660afcc2e287ad864363',
    timestamp: '1558014486185',
    verb: 'GET',
    path: '/v1/account/balances',
    body: '',
    expected:
      '9d52c181ed69460b49307b7891f04658e938b21181173844b5018b2fe783a6d4c62b8e67a03de4d099e7437ebfabe12c56233b73c6a0cc0f7ae87e05f6289928',
  },
  {
    name: 'POST /v1/orders/market',
    secret: '4961b74efac86b25cce8fbe4c9811c4c7a787b7a5996660afcc2e287ad864363',
    timestamp: '1558017528946',
    verb: 'POST',
    path: '/v1/orders/market',
    body: '{"customerOrderId":"ORDER-000001","pair":"BTCUSDC","side":"BUY","quoteAmount":"80000"}',
    expected:
      '09f536e3dfdad58443f16010a97a0a21ad27486b7b8d6d4103170d885410ed77f037f1fa628474190d4f5c08ca12c1acc850901f1c2e75c6d906ec3b32b008d0',
  },
];

let allPassed = true;
for (const c of CHECKS) {
  const actual = signRequest(c.secret, c.timestamp, c.verb, c.path, c.body);
  const pass = actual === c.expected;
  allPassed &&= pass;
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${c.name}`);
  if (!pass) {
    console.log(`  expected: ${c.expected}`);
    console.log(`  actual:   ${actual}`);
  }
}

if (!allPassed) {
  console.error('\nSigning implementation does NOT match VALR test vectors. Fix before deploying.');
  process.exit(1);
} else {
  console.log('\nSigning implementation matches VALR test vectors exactly.');
}
