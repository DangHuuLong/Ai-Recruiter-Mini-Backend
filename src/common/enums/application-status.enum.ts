// Lifecycle states of a candidate's Application from draft through hired/rejected.
export enum ApplicationStatusEnum {
  DRAFT = 'DRAFT',
  APPLIED = 'APPLIED',
  SCREENING = 'SCREENING',
  SHORTLISTED = 'SHORTLISTED',
  INTERVIEWING = 'INTERVIEWING',
  OFFER = 'OFFER',
  HIRED = 'HIRED',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
}
