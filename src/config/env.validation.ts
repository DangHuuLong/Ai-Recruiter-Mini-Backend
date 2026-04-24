import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

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
});