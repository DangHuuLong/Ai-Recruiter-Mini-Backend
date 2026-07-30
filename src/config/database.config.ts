// Reads DATABASE_URL and DIRECT_URL into the database config namespace.
// Registered in ConfigModule.forRoot({ load: [...] }) in app.module.ts; read by PrismaService/database setup via ConfigService.get('database.url').
export const databaseConfig = () => ({
  database: {
    url: process.env.DATABASE_URL,
    directUrl: process.env.DIRECT_URL,
  },
});
