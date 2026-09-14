export const STORAGE_DRIVER_NAMES = ['local', 's3', 'supabase'] as const;
export type StorageDriverName = (typeof STORAGE_DRIVER_NAMES)[number];

/**
 * A misspelt `STORAGE_DRIVER` must not silently write client passports to the
 * server's disk, so an unrecognised value is a boot failure rather than a
 * fallback. Unset is still `local` — that is the dev default.
 */
function storageDriverName(raw: string | undefined): StorageDriverName {
  if (!raw) return 'local';
  if ((STORAGE_DRIVER_NAMES as readonly string[]).includes(raw)) return raw as StorageDriverName;
  throw new Error(`Invalid STORAGE_DRIVER "${raw}" — expected one of ${STORAGE_DRIVER_NAMES.join(', ')}`);
}

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
  google: {
    /**
     * OAuth 2.0 Web client id. Empty disables "Google-ээр нэвтрэх" on both
     * sides: the API rejects `POST /auth/google`, the web hides the button.
     */
    clientId: string;
  };
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
    /** 1G-04 cost control: how many notification SMS one recipient may get per day. */
    dailyLimitPerUser: number;
    /** 1G-04 cost control: the whole platform's daily ceiling. */
    dailyLimitGlobal: number;
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
  notifications: {
    /** 1G-03 — Resend API key. Empty means "log the email instead of sending". */
    resendApiKey: string;
    /** From-address on every outgoing mail. */
    fromEmail: string;
    /** Base URL the `{{link}}` placeholders resolve against. */
    appUrl: string;
    /** Where staff-facing notifications (`LEAD_CREATED`) go when nobody is assigned. */
    staffFallbackEmail?: string;
    /**
     * `Reply-To` on every outgoing mail. The from-address is a no-reply, so
     * without this a client who hits "Reply" writes into a void; set it to the
     * office mailbox once GKS EDU names one.
     */
    replyToEmail?: string;
    slack: {
      /**
       * Bot token (`xoxb-…`) with `chat:write`. Empty means "log the message
       * instead of posting", so nothing is written to the real channel in
       * development.
       */
      botToken: string;
      /** The office channel every staff-side broadcast goes to. */
      channelId: string;
    };
  };
  deepseek: {
    /**
     * 1I-07 — the "research this school's programmes" button. A different
     * provider from the intake search on purpose: enumerating sixty departments
     * is a big-model job that nothing grounds, so it is bought at DeepSeek's
     * price rather than Gemini Pro's.
     */
    apiKey: string;
    baseUrl: string;
    timeoutMs: number;
    maxOutputTokens: number;
    mock: boolean;
  };
  gemini: {
    /**
     * 1H-10 — the "research this school's intake dates online" button. Google
     * is the only provider wired: Search grounding is what makes the answer a
     * lookup rather than a recollection.
     */
    apiKey: string;
    /** Overridden per run by `AdmissionConfig.researchModel`; this is the fallback. */
    model: string;
    /**
     * 2A-02 — the knowledge base's embedder. Separate from `model` because the
     * two are different models with different lifetimes: the chat model is
     * retuned from the admin screen, while changing this one means re-embedding
     * every chunk in the base, so it moves only on purpose.
     */
    embeddingModel: string;
    /** A 32-text batch is far quicker than a grounded search; it gets its own budget. */
    embeddingTimeoutMs: number;
    baseUrl: string;
    /** A grounded search takes 30-90s; the request must outlive it. */
    timeoutMs: number;
    /** Fakes the response instead of calling Google — the default, so the
     *  feature is runnable without a key (same idea as `QPAY_MOCK`). */
    mock: boolean;
    /** Sends the Google Search tool. False where the account has no grounding
     *  quota: the model then answers from memory and every candidate is LOW. */
    search: boolean;
  };
  meta: {
    /**
     * 1A-38 — the Meta dataset (pixel) id. Public by design: the browser
     * carries the same value in `NUXT_PUBLIC_META_PIXEL_ID`, and the two must
     * be identical or the pixel and the Conversions API write to different
     * datasets and nothing deduplicates.
     */
    pixelId: string;
    /** System-user token with the dataset's write scope. Empty = log instead of send. */
    accessToken: string;
    graphVersion: string;
    /** Events Manager → Test events. Set it only while testing: events carrying
     *  a code are shown in that tool and excluded from measurement. */
    testEventCode: string;
    timeoutMs: number;
    /** Forces the log-instead-of-send path even when a token is present. */
    mock: boolean;
  };
  storage: {
    /**
     * `local` writes to disk (dev default); `s3` is production (0-08);
     * `supabase` is the earlier backend, kept so an existing bucket stays
     * readable. Anything unrecognised falls back to `local`.
     */
    driver: StorageDriverName;
    localDir: string;
    signingSecret: string;
    supabaseUrl?: string;
    supabaseServiceRoleKey?: string;
    supabaseBucket: string;
    s3Bucket: string;
    s3Region: string;
    /** Absent = the SDK's default credential chain (EC2 instance role, shared config). */
    s3AccessKeyId?: string;
    s3SecretAccessKey?: string;
    /** Only for S3-compatible stores (MinIO, R2); empty for real AWS. */
    s3Endpoint?: string;
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
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
  },
  qpay: {
    baseUrl: process.env.QPAY_BASE_URL ?? 'https://merchant-sandbox.qpay.mn/v2',
    username: process.env.QPAY_USERNAME ?? '',
    password: process.env.QPAY_PASSWORD ?? '',
    invoiceCode: process.env.QPAY_INVOICE_CODE ?? '',
    callbackUrl: process.env.QPAY_CALLBACK_URL ?? 'http://localhost:3001/api/v1/payments/qpay/webhook',
    mock: (process.env.QPAY_MOCK ?? 'true') === 'true',
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY ?? '',
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
    timeoutMs: Number.parseInt(process.env.DEEPSEEK_TIMEOUT_MS ?? '300000', 10),
    // Sixty departments is ~13k output tokens; the provider's 8k default
    // truncates mid-JSON and the whole reply becomes unreadable.
    maxOutputTokens: Number.parseInt(process.env.DEEPSEEK_MAX_OUTPUT_TOKENS ?? '16384', 10),
    // Defaults to mock unless a key is present AND mocking is not forced on.
    mock: (process.env.DEEPSEEK_MOCK ?? (process.env.DEEPSEEK_API_KEY ? 'false' : 'true')) === 'true',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? '',
    model: process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite',
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-001',
    embeddingTimeoutMs: Number.parseInt(process.env.GEMINI_EMBEDDING_TIMEOUT_MS ?? '60000', 10),
    baseUrl: process.env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta',
    timeoutMs: Number.parseInt(process.env.GEMINI_TIMEOUT_MS ?? '120000', 10),
    // Defaults to mock unless a key is present AND mocking is not forced on.
    mock: (process.env.GEMINI_MOCK ?? (process.env.GEMINI_API_KEY ? 'false' : 'true')) === 'true',
    // Google Search grounding. On by default because a searched date is worth
    // far more than a recalled one; off where the account has no grounding
    // quota, which turns every grounded call into a 429.
    search: (process.env.GEMINI_SEARCH ?? 'true') === 'true',
  },
  sms: {
    provider: 'console',
    dailyLimitPerUser: Number.parseInt(process.env.SMS_DAILY_LIMIT_PER_USER ?? '3', 10),
    dailyLimitGlobal: Number.parseInt(process.env.SMS_DAILY_LIMIT_GLOBAL ?? '500', 10),
  },
  fx: {
    ratesUrl: process.env.FX_RATES_URL ?? 'https://monxansh.appspot.com/xansh.json?currency=KRW',
    fallbackKrwRate: Number.parseFloat(process.env.FX_FALLBACK_KRW_RATE ?? '2.65'),
  },
  notifications: {
    resendApiKey: process.env.RESEND_API_KEY ?? '',
    fromEmail: process.env.NOTIFICATION_FROM_EMAIL ?? 'GKSedu <noreply@gksedu.mn>',
    appUrl: process.env.APP_PUBLIC_URL ?? 'http://localhost:3000',
    staffFallbackEmail: process.env.NOTIFICATION_STAFF_EMAIL,
    replyToEmail: process.env.NOTIFICATION_REPLY_TO,
    slack: {
      botToken: process.env.SLACK_BOT_TOKEN ?? '',
      channelId: process.env.SLACK_CHANNEL_ID ?? '',
    },
  },
  meta: {
    pixelId: process.env.META_PIXEL_ID ?? '',
    accessToken: process.env.META_CAPI_ACCESS_TOKEN ?? '',
    // Meta retires a Graph version roughly two years after it ships; bump this
    // in `.env` rather than in code when the deprecation mail arrives.
    graphVersion: process.env.META_GRAPH_VERSION ?? 'v26.0',
    testEventCode: process.env.META_TEST_EVENT_CODE ?? '',
    timeoutMs: Number.parseInt(process.env.META_CAPI_TIMEOUT_MS ?? '10000', 10),
    mock: (process.env.META_CAPI_MOCK ?? 'false') === 'true',
  },
  storage: {
    driver: storageDriverName(process.env.STORAGE_DRIVER),
    localDir: process.env.STORAGE_LOCAL_DIR ?? 'storage',
    signingSecret: process.env.STORAGE_SIGNING_SECRET ?? process.env.JWT_SECRET!,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseBucket: process.env.SUPABASE_STORAGE_BUCKET ?? 'gks-edu-files',
    s3Bucket: process.env.S3_BUCKET ?? '',
    // The production box is in ap-southeast-1; a bucket anywhere else pays
    // cross-region transfer on every download.
    s3Region: process.env.AWS_REGION ?? 'ap-southeast-1',
    s3AccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    s3SecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    s3Endpoint: process.env.S3_ENDPOINT,
  },
});
