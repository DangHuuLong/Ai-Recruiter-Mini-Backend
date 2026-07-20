// Reads PORT and NODE_ENV into the app config namespace.
// Registered in ConfigModule.forRoot({ load: [...] }) in app.module.ts; consumed via ConfigService.get('app.port') in main.ts.
export const appConfig = () => ({
  app: {
    port: parseInt(process.env.PORT ?? '3000', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
  },
});
