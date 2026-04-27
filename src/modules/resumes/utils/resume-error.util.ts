export function getResumeParsingErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Resume parsing failed';
}
