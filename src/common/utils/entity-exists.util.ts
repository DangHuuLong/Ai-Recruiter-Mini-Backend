// Helpers that fetch an entity by id/organization scope or throw a 404 AppException.
import { PrismaService } from '../../database/prisma/prisma.service';
import { AppException } from '../exceptions/app.exception';

// Called by candidate services/controllers to scope-check a candidate before mutating it; throws AppException(404) if missing.
export async function ensureCandidateExists(
  prisma: PrismaService,
  id: string,
  organizationId?: string,
) {
  const candidate = await prisma.candidate.findFirst({
    where: { id, ...(organizationId ? { organizationId } : {}) },
    select: {
      id: true,
    },
  });

  if (!candidate) {
    throw new AppException('Candidate not found', 404);
  }

  return candidate;
}

// Called by resume services/controllers to scope-check a resume before mutating it; throws AppException(404) if missing.
export async function ensureResumeExists(
  prisma: PrismaService,
  id: string,
  organizationId?: string,
) {
  const resume = await prisma.resume.findFirst({
    where: { id, ...(organizationId ? { candidate: { organizationId } } : {}) },
    select: {
      id: true,
      candidateId: true,
    },
  });

  if (!resume) {
    throw new AppException('Resume not found', 404);
  }

  return resume;
}

// Called by upload/file services to scope-check a FileAsset before use; throws AppException(404) if missing.
export async function ensureFileAssetExists(
  prisma: PrismaService,
  id: string,
  organizationId?: string,
) {
  const fileAsset = await prisma.fileAsset.findFirst({
    where: { id, ...(organizationId ? { organizationId } : {}) },
    select: {
      id: true,
      status: true,
    },
  });

  if (!fileAsset) {
    throw new AppException('File asset not found', 404);
  }

  return fileAsset;
}
