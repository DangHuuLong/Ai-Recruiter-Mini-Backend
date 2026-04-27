type ResumeRawTextSource = {
  candidate: {
    fullName: string | null;
    primaryEmail: string | null;
    primaryPhone: string | null;
    location: string | null;
  };
  fileAsset: {
    fileName: string;
  };
};

export function buildMockResumeRawText(resume: ResumeRawTextSource): string {
  const candidateName = resume.candidate.fullName ?? 'Mock Candidate';

  return [
    `${candidateName} is a backend developer with experience in Python, FastAPI, PostgreSQL, Redis, Docker, and REST API development.`,
    resume.candidate.primaryEmail ? `Email: ${resume.candidate.primaryEmail}.` : '',
    resume.candidate.primaryPhone ? `Phone: ${resume.candidate.primaryPhone}.` : '',
    resume.candidate.location ? `Location: ${resume.candidate.location}.` : '',
    `Source file: ${resume.fileAsset.fileName}.`,
  ]
    .filter(Boolean)
    .join(' ');
}
