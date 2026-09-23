import { CONFIG } from './config';

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Arc Payment Request API (Circle EVM Layer 1)',
    version: '1.0.0',
    description:
      'API for generating USDC payment requests, MetaMask deep links, EIP-681 URLs, and EVM transaction payloads on Circle\'s Arc Layer 1 blockchain.',
    contact: {
      name: 'ABC Pay Developer Support',
    },
  },
  servers: [
    {
      url: `http://localhost:${CONFIG.port}`,
      description: 'Local Express Service',
    },
  ],
  tags: [
    {
      name: 'Payment Requests',
      description: 'Generate and verify Arc USDC payment requests for MetaMask',
    },
    {
      name: 'System',
      description: 'Service health and Arc RPC connectivity',
    },
  ],
  paths: {
    '/api/payment-requests': {
      post: {
        tags: ['Payment Requests'],
        summary: 'Create Arc payment request (MetaMask & EIP-681)',
        description:
          'Generates a payment request for a recipient address on Arc. Returns an EIP-681 URI (for QR codes), MetaMask universal deep link, and EVM transaction payload with USDC (native gas token).',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PaymentRequestInput' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Payment request created successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaymentRequestResponse' },
              },
            },
          },
          '400': { description: 'Validation failed or invalid 0x address' },
        },
      },
      get: {
        tags: ['Payment Requests'],
        summary: 'List payment requests',
        description: 'Returns all created payment requests with optional filtering by status and recipient.',
        parameters: [
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['PENDING', 'CONFIRMED', 'EXPIRED'] },
            description: 'Filter by status',
          },
          {
            name: 'recipient',
            in: 'query',
            schema: { type: 'string' },
            description: 'Filter by recipient address (0x...)',
          },
        ],
        responses: {
          '200': {
            description: 'List of payment requests and total confirmed volume',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaymentRequestsListResponse' },
              },
            },
          },
        },
      },
    },
    '/api/payment-requests/{id}': {
      get: {
        tags: ['Payment Requests'],
        summary: 'Get payment request by ID or Reference',
        description: 'Retrieves payment request status, amounts, and MetaMask links.',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'The payment request ID (e.g. pay_...) or reference code (e.g. ARC-...)',
          },
        ],
        responses: {
          '200': {
            description: 'Payment request details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaymentRequestDetail' },
              },
            },
          },
          '404': { description: 'Payment request not found' },
        },
      },
    },
    '/api/payment-requests/{id}/confirm': {
      post: {
        tags: ['Payment Requests'],
        summary: 'Confirm payment with transaction hash',
        description: 'Verifies the transaction on Arc RPC and marks the payment request as CONFIRMED.',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'The payment request ID or reference code',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['txHash'],
                properties: {
                  txHash: {
                    type: 'string',
                    example: '0x8f7d9a8c1e2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Payment confirmed successfully' },
          '400': { description: 'Transaction verification failed on Arc RPC' },
          '404': { description: 'Payment request not found' },
        },
      },
    },
    '/api/health': {
      get: {
        tags: ['System'],
        summary: 'Check Arc RPC status and latency',
        description: 'Returns connection status with Arc RPC node, block number, and network latency.',
        responses: {
          '200': {
            description: 'System is healthy',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthResponse' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      PaymentRequestInput: {
        type: 'object',
        required: ['recipientAddress', 'amount'],
        properties: {
          recipientAddress: {
            type: 'string',
            description: 'MetaMask 0x... EVM address',
            example: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
          },
          amount: { type: 'number', example: 12.5 },
          network: {
            type: 'string',
            enum: ['arc-testnet', 'arc-mainnet'],
            example: 'arc-testnet',
          },
          label: { type: 'string', example: 'Test' },
          message: { type: 'string', example: 'Test message' },
          memo: { type: 'string', example: 'Order #12345' },
          ttlMinutes: { type: 'number', example: 60 },
        },
      },
      PaymentRequestResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          requestId: { type: 'string', example: 'pay_1790169..._ct5go3' },
          reference: { type: 'string', example: 'ARC-UO04Z8Q' },
          network: { type: 'string', example: 'Arc (Circle' },
          chainId: { type: 'number', example: 5042002 },
          recipientAddress: { type: 'string', example: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' },
          amount: { type: 'number', example: 12.5 },
          currency: { type: 'string', example: 'USDC' },
          formattedAmount: { type: 'string', example: '0.5 USDC' },
          paymentUrl: {
            type: 'string',
            example: 'ethereum:0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045@5042002?value=12500000000000000000',
          },
          metaMaskDeepLink: {
            type: 'string',
            example: 'https://metamask.app.link/send/0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045?value=12500000000000000000&chainId=5042002',
          },
          transactionPayload: {
            type: 'object',
            properties: {
              to: { type: 'string' },
              value: { type: 'string' },
              valueHex: { type: 'string' },
              chainId: { type: 'number' },
              chainIdHex: { type: 'string' },
              data: { type: 'string' },
            },
          },
          qrCodeData: { type: 'string' },
          status: { type: 'string', example: 'PENDING' },
          createdAt: { type: 'string' },
          expiresAt: { type: 'string' },
          instructions: { type: 'object' },
        },
      },
      PaymentRequestDetail: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          request: { type: 'object' },
        },
      },
      PaymentRequestsListResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          count: { type: 'number' },
          metrics: {
            type: 'object',
            properties: {
              totalRequests: { type: 'number' },
              confirmedVolumeUsdc: { type: 'number' },
            },
          },
          paymentRequests: { type: 'array', items: { type: 'object' } },
        },
      },
      HealthResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'healthy' },
          service: { type: 'string' },
          network: { type: 'string' },
          chainId: { type: 'number' },
          blockNumber: { type: 'number' },
          latencyMs: { type: 'number' },
          rpcUrl: { type: 'string' },
          currency: { type: 'string', example: 'USDC' },
          timestamp: { type: 'string' },
        },
      },
    },
  },
};
