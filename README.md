# Arc Payment Request API (Circle EVM Layer 1)

[![Express.js](https://img.shields.io/badge/Express-5.x-blue.svg)](https://expressjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-3.0-brightgreen.svg)](http://localhost:3000/docs)
[![Arc](https://img.shields.io/badge/Circle%20Arc-EVM%20L1-blueviolet.svg)](https://docs.arc.network)

A clean, production-ready **Express.js (TypeScript)** API for generating and tracking **USDC payment requests on Circle's Arc blockchain**.

Built specifically for **MetaMask** and EVM wallets—**no private keys or wallet seeds are needed on your server**.

---

## ⚡ Why Arc & MetaMask?

1. **Native MetaMask Support**: Arc is a 100% EVM-compatible Layer 1 blockchain developed by Circle. Standard `0x...` Ethereum addresses and MetaMask wallets work natively.
2. **USDC as Native Gas**: Unlike Ethereum (where users need ETH for gas) or Solana (where users need SOL for gas), **Arc uses USDC as the native gas token**. Users only need USDC in their wallet for both the payment amount and network gas fees.
3. **Multi-Format Payment Links**:
   * **EIP-681 URLs**: Standard `ethereum:0x...@5042002?value=...` for mobile camera QR code scanning.
   * **MetaMask Universal Deep Links**: Direct `https://metamask.app.link/send/...` links that open the MetaMask app with pre-filled recipient and amount.
   * **Web3 Transaction Payload**: Ready-to-use EVM transaction object for 1-click checkout buttons in web dApps.

---

## 🚀 Quick Start

### 1. Installation
```bash
# Navigate to project folder
cd /path/to/abc_pay_experiment

# Install dependencies
npm install
```

### 2. Environment Configuration
```bash
cp .env.example .env
```
Default `.env` configuration:
```env
PORT=3000
ARC_RPC_URL=https://rpc.testnet.arc.network
ARC_CHAIN_ID=5042002
ARC_EXPLORER_URL=https://testnet.arcscan.app
```

### 3. Start the Server

#### Development Mode (with hot-reloading):
```bash
npm run dev
```

#### Production Mode:
```bash
npm start
```

Server will start on port `3000`:
* **Interactive Swagger UI**: [http://localhost:3000/docs](http://localhost:3000/docs)
* **Raw OpenAPI 3.0 JSON**: [http://localhost:3000/api/openapi.json](http://localhost:3000/api/openapi.json)

---

## 📚 API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/payment-requests` | Create an Arc USDC payment request for any `0x...` MetaMask address |
| `GET` | `/api/payment-requests/:id` | Look up payment request by ID (e.g. `pay_...`) or reference code (e.g. `ARC-...`) |
| `POST` | `/api/payment-requests/:id/confirm` | Confirm payment with transaction hash and verify on-chain via Arc RPC |
| `GET` | `/api/payment-requests` | List all payment requests and total confirmed volume |
| `GET` | `/api/health` | Arc RPC connectivity, block number, and network latency check |

---

## 🛠️ cURL Examples

### 1. Create a Payment Request
```bash
curl -X POST http://localhost:3000/api/payment-requests \
  -H "Content-Type: application/json" \
  -d '{
    "recipientAddress": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "amount": 12.5,
    "label": "Coffee & Pastry",
    "message": "Invoice #4029",
    "memo": "ORDER-4029",
    "ttlMinutes": 60
  }'
```

**Response:**
```json
{
  "success": true,
  "requestId": "pay_1790169683122_ct5go3",
  "reference": "ARC-UO04Z8Q",
  "network": "Arc (Circle EVM L1)",
  "chainId": 5042002,
  "recipientAddress": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  "amount": 12.5,
  "currency": "USDC",
  "formattedAmount": "12.5 USDC",
  "paymentUrl": "ethereum:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045@5042002?value=12500000000000000000",
  "metaMaskDeepLink": "https://metamask.app.link/send/0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045?value=12500000000000000000&chainId=5042002",
  "transactionPayload": {
    "to": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "value": "12500000000000000000",
    "valueHex": "0xad78ebc5ac620000",
    "chainId": 5042002,
    "chainIdHex": "0x4cef52",
    "data": "0x4f524445522d34303239"
  },
  "qrCodeData": "ethereum:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045@5042002?value=12500000000000000000",
  "status": "PENDING",
  "createdAt": "2026-09-23T13:21:23.122Z",
  "expiresAt": "2026-09-23T14:21:23.122Z"
}
```

---

### 2. Check Payment Status
```bash
# By Request ID
curl -X GET http://localhost:3000/api/payment-requests/pay_1790169683122_ct5go3

# Or by Reference Code
curl -X GET http://localhost:3000/api/payment-requests/ARC-UO04Z8Q
```

---

### 3. Confirm Payment (Verify On-Chain)
```bash
curl -X POST http://localhost:3000/api/payment-requests/pay_1790169683122_ct5go3/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "txHash": "0x8f7d9a8c1e2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d"
  }'
```

---

### 4. Check Health & Arc RPC Node Status
```bash
curl -X GET http://localhost:3000/api/health
```

---

## 🦊 Adding Arc Network to MetaMask

To test or send payments on Arc Testnet, add these network parameters to your MetaMask:
* **Network Name:** Arc Testnet
* **RPC URL:** `https://rpc.testnet.arc.network`
* **Chain ID:** `5042002`
* **Currency Symbol:** `USDC`
* **Block Explorer:** `https://testnet.arcscan.app`
* **Faucet (Free Testnet USDC):** [https://faucet.circle.com](https://faucet.circle.com)
