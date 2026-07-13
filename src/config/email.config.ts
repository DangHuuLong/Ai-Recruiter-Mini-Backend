export const emailConfig = () => ({
  email: {
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
    smtpUser: process.env.SMTP_USER,
    smtpPassword: process.env.SMTP_PASSWORD,
    from: process.env.EMAIL_FROM,
    frontendUrl: process.env.FRONTEND_URL,
  },
});
