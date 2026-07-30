// Normalizes an unknown thrown value into a human-readable resume parsing error message.
// Called by ResumesService.parse's catch block — turns the AI parsing failure into the string stored on Resume.parsingError.
export function getResumeParsingErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Resume parsing failed';
}
