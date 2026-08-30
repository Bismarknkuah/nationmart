import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { connectDatabase } from './config/database';
import authRoutes from './routes/auth';
import productRoutes from './routes/products';
import orderRoutes from './routes/orders';
import exportRoutes from './routes/export';
import licenseRoutes from './routes/licenses';
import adminRoutes from './routes/admin';
import paymentRoutes from './routes/payments';
import { paystackWebhook } from './controllers/paymentController';
import reportRoutes from './routes/reports';
import ratingRoutes from './routes/ratings';
import userRoutes from './routes/users';
import notificationRoutes from './routes/notifications';
import storeRoutes from './routes/stores';
import storeCategoryRoutes from './routes/storeCategories';
import discoverRoutes from './routes/discover';
import hrRoutes from './routes/hr';
import walletRoutes from './routes/wallet';
import messageRoutes from './routes/messages';
import promoRoutes from './routes/promos';
import disputeRoutes from './routes/disputes';
import searchRoutes from './routes/search';
import payoutRoutes from './routes/payouts';
import receiptRoutes from './routes/receipts';
import currencyRoutes from './routes/currency';
import workflowRoutes from './routes/workflows';
import officerCommsRoutes from './routes/officerComms';
import deliveryRoutes from './routes/deliveries';
import managementRoutes from './routes/management';
import aiRoutes from './routes/ai';
import officeRoutes from './routes/office';
import { startLicenseExpiryJob } from './services/licenseExpiryJob';
import { startSubscriptionJob } from './services/subscriptionJob';
import { startReconciliationJob } from './services/reconciliationJob';
import { startDisputeSlaJob } from './services/disputeSlaJob';
import { installDefaults } from './services/bootstrap';

dotenv.config();

const app = express();

// ─── Security Headers ─────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com', 'https://images.unsplash.com'],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  ...(process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  'http://localhost:3001',
  'http://localhost:3002',
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
// General API limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { error: 'Too many requests. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict limiter for auth routes (prevents brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  skipSuccessfulRequests: true,
});

// Admin routes limiter
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many admin requests.' },
});

app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/admin', adminLimiter);

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb', verify: (req: any, _res, buf) => { req.rawBody = buf.toString('utf8'); } }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── NoSQL Injection Protection ───────────────────────────────────────────────

// ─── Logging ──────────────────────────────────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Trust proxy (for rate limiting behind reverse proxy) ─────────────────────
app.set('trust proxy', 1);

// ─── Database ─────────────────────────────────────────────────────────────────
connectDatabase();

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/licenses', licenseRoutes);
app.use('/api/admin', adminRoutes);
app.post('/api/payments/webhook', paystackWebhook);
app.use('/api/payments', paymentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/store-categories', storeCategoryRoutes);
app.use('/api/discover', discoverRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/promos', promoRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/payouts', payoutRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api/currency', currencyRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/officer-comms', officerCommsRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/management', managementRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/office', officeRoutes);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'NationMart API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Don't leak stack traces in production
  const isDev = process.env.NODE_ENV !== 'production';
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(isDev && { stack: err.stack }),
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 5000;
app.listen(PORT, () => {
  console.log(`▲ NationMart API running on port ${PORT}`);
  console.log(`  Security: Helmet, CORS, rate limiting, parameterised SQL`);
  if (process.env.NODE_ENV !== 'test') {
    startLicenseExpiryJob();
    console.log(`  License expiry job scheduled (daily 08:00 UTC)`);
    startSubscriptionJob();
    startReconciliationJob();
    startDisputeSlaJob();
    console.log(`  Subscription billing job scheduled`);
    // Idempotently install the built-in workflow templates and officer channels.
    installDefaults().catch((err: any) => console.error('[bootstrap] failed:', err?.message));
  }
});

export default app;
