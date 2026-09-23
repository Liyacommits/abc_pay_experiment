import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { CONFIG } from './lib/config';
import { openApiSpec } from './lib/openapi';

// Routers
import paymentRequestsRouter from './routes/payment-requests';
import healthRouter from './routes/health';

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Request Timing Logger
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = performance.now();
  const { method, originalUrl } = req;
  res.on('finish', () => {
    const duration = (performance.now() - start).toFixed(1);
    console.log(`[${new Date().toISOString()}] ${method} ${originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// Interactive Swagger UI Documentation
app.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(openApiSpec, {
    customSiteTitle: 'Arc Payment Request API (Circle EVM L1)',
    customCss: '.swagger-ui .topbar { display: none }',
  })
);


app.get('/api/openapi.json', (_req: Request, res: Response) => {
  res.json(openApiSpec);
});

// Service Root
app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'Arc Payment Request API (Circle EVM Layer 1)',
    description: 'Direct USDC payment request generation for MetaMask, EIP-681 URLs, and EVM transaction payloads on Circle\'s Arc blockchain.',
    version: '1.0.0',
    documentation: '/docs',
    openApiSpec: '/api/openapi.json',
    endpoints: {
      health: 'GET /api/health',
      createPaymentRequest: 'POST /api/payment-requests',
      getPaymentRequest: 'GET /api/payment-requests/:id',
      confirmPaymentRequest: 'POST /api/payment-requests/:id/confirm',
      listPaymentRequests: 'GET /api/payment-requests',
    },
  });
});

// Mount Routes
app.use('/api/payment-requests', paymentRequestsRouter);
app.use('/api/health', healthRouter);

// 404 Route Handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    documentation: '/docs',
  });
});

// Global Error Handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message,
  });
});

const PORT = CONFIG.port;

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(` Arc Payment Request API running on http://localhost:${PORT}`);
  console.log(` Interactive Swagger UI: http://localhost:${PORT}/docs`);
  console.log(` OpenAPI 3.0 Specification: http://localhost:${PORT}/api/openapi.json`);
  console.log(`======================================================\n`);
});

export default app;
