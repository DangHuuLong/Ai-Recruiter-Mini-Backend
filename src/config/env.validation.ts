import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),

  PORT: Joi.number().default(3000),

  DATABASE_URL: Joi.string().required(),
  DIRECT_URL: Joi.string().optional(),

  SUPABASE_URL: Joi.string().uri().required(),
  SUPABASE_SERVICE_ROLE_KEY: Joi.string().required(),
  SUPABASE_BUCKET: Joi.string().default('cv-files'),

  REDIS_URL: Joi.string().optional(),

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
});
