// HTML templates for verification, password-reset, and batch-completed emails.
// Builds the account-verification email sent by the auth flow via EmailService.send().
export function verifyEmailTemplate(params: { fullName: string | null; verifyUrl: string }) {
  const greeting = params.fullName ? `Hi ${params.fullName},` : 'Hi,';

  return {
    subject: 'Verify your AI Recruiter Mini account',
    html: `<p>${greeting}</p>
<p>Please click the link below to verify your account (valid for a limited time):</p>
<p><a href="${params.verifyUrl}">${params.verifyUrl}</a></p>
<p>If you did not request this registration, please ignore this email.</p>`,
  };
}

// Builds the password-reset email sent by the auth flow via EmailService.send().
export function passwordResetTemplate(params: { fullName: string | null; resetUrl: string }) {
  const greeting = params.fullName ? `Hi ${params.fullName},` : 'Hi,';

  return {
    subject: 'Reset your AI Recruiter Mini password',
    html: `<p>${greeting}</p>
<p>Click the link below to reset your password (valid for a limited time):</p>
<p><a href="${params.resetUrl}">${params.resetUrl}</a></p>
<p>If you did not request a password reset, please ignore this email.</p>`,
  };
}

// Builds the scoring-batch-completed notification email sent from notify.processor.ts via EmailService.send().
export function batchCompletedTemplate(params: {
  batchId: string;
  status: string;
  summaryUrl?: string;
}) {
  return {
    subject: `Scoring batch ${params.batchId} has completed (${params.status})`,
    html: `<p>Scoring batch <strong>${params.batchId}</strong> has completed with status <strong>${params.status}</strong>.</p>
${params.summaryUrl ? `<p>View details: <a href="${params.summaryUrl}">${params.summaryUrl}</a></p>` : ''}`,
  };
}
