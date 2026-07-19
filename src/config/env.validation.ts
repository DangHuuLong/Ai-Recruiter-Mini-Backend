import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),

  PORT: Joi.number().default(3000),

  DATABASE_URL: Joi.string().required(),
  DIRECT_URL: Joi.string().optional(),

  SUPABASE_URL: Joi.string().uri().required(),
  SUPABASE_SERVICE_ROLE_KEY: Joi.string().required(),
  SUPABASE_BUCKET: Joi.string().default('cv-files'),

  REDIS_URL: Joi.string().required(),

  GEMINI_API_KEY: Joi.string().optional(),
  GEMINI_MODEL: Joi.string().default('gemini-3-flash-preview'),

  MAX_FILE_SIZE_MB: Joi.number().default(5),

  AI_SERVICE_URL: Joi.string().uri().default('http://localhost:8000'),

  AI_REQUEST_TIMEOUT_MS: Joi.number().integer().positive().default(30000),

  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN_SECONDS: Joi.number().integer().positive().default(86400),
  
  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().optional(),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASSWORD: Joi.string().optional(),
  EMAIL_FROM: Joi.string().optional(),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:3001'),
  EMAIL_VERIFICATION_TOKEN_TTL_SECONDS: Joi.number().integer().positive().default(86400),
  PASSWORD_RESET_TOKEN_TTL_SECONDS: Joi.number().integer().positive().default(3600),

  AI_PARSE_RESUME_CONCURRENCY: Joi.number().integer().positive().default(8),
  AI_PARSE_JD_CONCURRENCY: Joi.number().integer().positive().default(8),
  AI_SCORE_CONCURRENCY: Joi.number().integer().positive().default(4),

  ENTERPRISE_MAX_FILES_PER_BATCH: Joi.number().integer().positive().default(2000),
  ENTERPRISE_MAX_JDS_PER_BATCH: Joi.number().integer().positive().default(50),

  PUBLIC_MAX_FILES_PER_BATCH: Joi.number().integer().positive().default(2),
  PUBLIC_MAX_JDS_PER_BATCH: Joi.number().integer().positive().default(10),
  PUBLIC_BATCH_TTL_SECONDS: Joi.number().integer().positive().default(21600),
  PUBLIC_RATE_LIMIT_MAX_BATCHES_PER_HOUR: Joi.number().integer().positive().default(5),
  SUPABASE_PUBLIC_TEMP_BUCKET: Joi.string().default('file-public'),

  ENTERPRISE_RATE_LIMIT_MAX_BATCHES_PER_HOUR: Joi.number().integer().positive().default(20),
  ENTERPRISE_RATE_LIMIT_MAX_QUESTION_SEARCHES_PER_HOUR: Joi.number().integer().positive().default(100),

  GEMINI_API_KEY_1: Joi.string().optional(),
  GEMINI_API_KEY_2: Joi.string().optional(),
  GEMINI_API_KEY_3: Joi.string().optional(),
  GEMINI_API_KEY_4: Joi.string().optional(),
  GEMINI_EMBEDDING_MODEL: Joi.string().default('gemini-embedding-001'),

  GPT_API_KEY_1: Joi.string().optional(),
  GPT_API_KEY_2: Joi.string().optional(),
  GPT_API_KEY_3: Joi.string().optional(),
  GPT_API_KEY_4: Joi.string().optional(),
  GPT_MODEL: Joi.string().default('gpt-4o-mini'),

  GROQ_API_KEY_1: Joi.string().optional(),
  GROQ_API_KEY_2: Joi.string().optional(),
  GROQ_API_KEY_3: Joi.string().optional(),
  GROQ_API_KEY_4: Joi.string().optional(),
  GROQ_MODEL: Joi.string().default('llama-3.3-70b-versatile'),

  CEREBRAS_API_KEY_1: Joi.string().optional(),
  CEREBRAS_API_KEY_2: Joi.string().optional(),
  CEREBRAS_API_KEY_3: Joi.string().optional(),
  CEREBRAS_API_KEY_4: Joi.string().optional(),
  CEREBRAS_MODEL: Joi.string().default('gpt-oss-120b'),

  INTERVIEW_QUESTION_SIMILARITY_THRESHOLD: Joi.number().min(0).max(1).default(0.55),
  INTERVIEW_QUESTION_FALLBACK_GENERATE_COUNT: Joi.number().integer().positive().default(5),
});
