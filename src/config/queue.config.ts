// Reads Redis URL and per-queue concurrency env vars into the queue config namespace.
// Registered in ConfigModule.forRoot({ load: [...] }) in app.module.ts; consumed by queue.module.ts and the BullMQ processors to set concurrency.
export const queueConfig = () => ({
  queue: {
    redisUrl: process.env.REDIS_URL,
    aiParseResumeConcurrency: process.env.AI_PARSE_RESUME_CONCURRENCY
      ? Number(process.env.AI_PARSE_RESUME_CONCURRENCY)
      : 8,
    aiParseJdConcurrency: process.env.AI_PARSE_JD_CONCURRENCY
      ? Number(process.env.AI_PARSE_JD_CONCURRENCY)
      : 8,
    aiScoreConcurrency: process.env.AI_SCORE_CONCURRENCY
      ? Number(process.env.AI_SCORE_CONCURRENCY)
      : 4,
  },
});
