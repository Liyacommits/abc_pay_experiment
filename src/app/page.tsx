export default function Home() {
  return (
    <main style={
      { 
      fontFamily: 'monospace',
      padding: '2rem',
      maxWidth: 720 
      }
      }>
      <h1>VALR On/Off-Ramp — Backend</h1>
      <p>This is a backend-only build. Endpoints:</p>
      <ul>
        <li>GET /api/currencies?symbol=USDC</li>
        <li>POST /api/quote</li>
        <li>POST /api/deposit-address</li>
        <li>GET /api/transaction/:id</li>
        <li>POST /api/convert</li>
        <li>POST /api/withdraw</li>
      </ul>
      <p>This is our demo application for VALR API Integration.</p>
    </main>
  );
}
