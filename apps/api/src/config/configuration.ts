export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  apiPrefix: string;
  corsOrigin: string[];
  databaseUrl: string;
  directUrl?: string;
  redisUrl: string;
  jwt: {
    secret: string;
    expiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
  embeddingDimensions: number;
  qpay: {
    baseUrl: string;
    username: string;
    password: string;
    invoiceCode: string;
    callbackUrl: string;
    /** Skips real QPay HTTP calls and fakes invoice/payment-check responses (dev/test only). */
    mock: boolean;
  };
  sms: {
    /** §18 question 10 — the real Mongolian gateway is not chosen yet; `console` logs instead of sending. */
    provider: 'console';
  };
  fx: {
    /**
     * Daily reference-rate feed (1E-07). Mongolbank publishes the rate on its
     * website but exposes no documented JSON API, so the default is the
     * long-standing public mirror of it; point `FX_RATES_URL` at an official
     * feed once the business names one.
     */
    ratesUrl: string;
    /** Used when the feed is unreachable and the table is still empty. */
    fallbackKrwRate: number;
  };
  storage: {
    /** `local` writes to disk; `supabase` needs SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (0-08). */
    driver: 'local' | 'supabase';
    localDir: string;
    signingSecret: string;
    supabaseUrl?: string;
    supabaseServiceRoleKey?: string;
    supabaseBucket: string;
  };
}

export const configuration = (): AppConfig => ({
  nodeEnv: (process.env.NODE_ENV as AppConfig['nodeEnv']) ?? 'development',
  port: Number.parseInt(process.env.API_PORT ?? '3001', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  databaseUrl: process.env.DATABASE_URL!,
  directUrl: process.env.DIRECT_URL,
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  jwt: {
    secret: process.env.JWT_SECRET!,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET!,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  embeddingDimensions: Number.parseInt(process.env.EMBEDDING_DIMENSIONS ?? '1536', 10),
  qpay: {
    baseUrl: process.env.QPAY_BASE_URL ?? 'https://merchant-sandbox.qpay.mn/v2',
    username: process.env.QPAY_USERNAME ?? '',
    password: process.env.QPAY_PASSWORD ?? '',
    invoiceCode: process.env.QPAY_INVOICE_CODE ?? '',
    callbackUrl: process.env.QPAY_CALLBACK_URL ?? 'http://localhost:3001/api/v1/payments/qpay/webhook',
    mock: (process.env.QPAY_MOCK ?? 'true') === 'true',
  },
  sms: {
    provider: 'console',
  },
  fx: {
    ratesUrl: process.env.FX_RATES_URL ?? 'https://monxansh.appspot.com/xansh.json?currency=KRW',
    fallbackKrwRate: Number.parseFloat(process.env.FX_FALLBACK_KRW_RATE ?? '2.65'),
  },
  storage: {
    driver: (process.env.STORAGE_DRIVER as 'local' | 'supabase') ?? 'local',
    localDir: process.env.STORAGE_LOCAL_DIR ?? 'storage',
    signingSecret: process.env.STORAGE_SIGNING_SECRET ?? process.env.JWT_SECRET!,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseBucket: process.env.SUPABASE_STORAGE_BUCKET ?? 'gks-edu-files',
  },
});
