// Reads REDIS_URL into the redis config namespace.
// Registered in ConfigModule.forRoot({ load: [...] }) in app.module.ts; consumed by RedisService/redis.module.ts to create the client connection.
export const redisConfig = () => ({
  redis: {
    url: process.env.REDIS_URL,
  },
});
