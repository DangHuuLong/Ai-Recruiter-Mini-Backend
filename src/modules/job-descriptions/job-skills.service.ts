// Service for JobSkill CRUD and reconciling a job description's skills against freshly AI-parsed data.
import { Injectable } from '@nestjs/common';
import { JobSkillType } from '@prisma/client';

import { CreateJobSkillDto } from './dto/create-job-skill.dto';
import { UpdateJobSkillDto } from './dto/update-job-skill.dto';
import { AppException } from '../../common/exceptions/app.exception';
import { ParsedJobDescriptionData, ParsedJobSkill } from '../../common/types/ai-service.types';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class JobSkillsService {
  constructor(private readonly prisma: PrismaService) {}

  // Called by JobSkillsController.findByJobDescription — lists a JD's skills, sorted by type/core/name.
  async findByJobDescription(jobDescriptionId: string, organizationId: string) {
    await this.ensureActiveJobDescription(jobDescriptionId, organizationId);

    return this.prisma.jobSkill.findMany({
      where: { jobDescriptionId },
      orderBy: [{ type: 'asc' }, { isCore: 'desc' }, { name: 'asc' }],
    });
  }

  // Called by JobSkillsController.create — manually adds one JobSkill after uniqueness/normalization checks.
  async create(jobDescriptionId: string, createJobSkillDto: CreateJobSkillDto, organizationId: string) {
    await this.ensureActiveJobDescription(jobDescriptionId, organizationId);

    const normalizedName = this.normalizeSkillName(
      createJobSkillDto.normalizedName ?? createJobSkillDto.name,
    );

    await this.ensureSkillIsUnique(jobDescriptionId, normalizedName, createJobSkillDto.type);

    return this.prisma.jobSkill.create({
      data: {
        jobDescriptionId,
        name: createJobSkillDto.name,
        normalizedName,
        type: createJobSkillDto.type,
        isCore: createJobSkillDto.isCore ?? false,
        weightHint: createJobSkillDto.weightHint,
      },
    });
  }

  // Called by JobSkillsController.update — partial update, re-checking normalized-name uniqueness within the JD.
  async update(skillId: string, updateJobSkillDto: UpdateJobSkillDto, organizationId: string) {
    const existingSkill = await this.ensureJobSkillExists(skillId, organizationId);
    await this.ensureActiveJobDescription(existingSkill.jobDescriptionId, organizationId);

    const nextNormalizedName = this.normalizeSkillName(
      updateJobSkillDto.normalizedName ??
        updateJobSkillDto.name ??
        existingSkill.normalizedName ??
        existingSkill.name,
    );
    const nextType = updateJobSkillDto.type ?? existingSkill.type;

    await this.ensureSkillIsUnique(
      existingSkill.jobDescriptionId,
      nextNormalizedName,
      nextType,
      skillId,
    );

    return this.prisma.jobSkill.update({
      where: { id: skillId },
      data: {
        name: updateJobSkillDto.name,
        normalizedName: nextNormalizedName,
        type: updateJobSkillDto.type,
        isCore: updateJobSkillDto.isCore,
        weightHint: updateJobSkillDto.weightHint,
      },
    });
  }

  // Called by JobSkillsController.remove — hard-deletes a JobSkill after existence/ownership checks.
  async remove(skillId: string, organizationId: string) {
    const existingSkill = await this.ensureJobSkillExists(skillId, organizationId);
    await this.ensureActiveJobDescription(existingSkill.jobDescriptionId, organizationId);

    await this.prisma.jobSkill.delete({ where: { id: skillId } });

    return { id: skillId, deleted: true };
  }

  // Called by JobDescriptionsService.parse — reconciles a JD's skills with freshly AI-parsed data (upsert + prune stale rows).
  async syncFromParsedData(jobDescriptionId: string, parsedData: ParsedJobDescriptionData) {
    const parsedSkills = [
      ...this.mapParsedSkills(parsedData.required_skills ?? [], JobSkillType.REQUIRED),
      ...this.mapParsedSkills(parsedData.preferred_skills ?? [], JobSkillType.PREFERRED),
    ];
    const dedupedSkills = this.dedupeParsedSkills(parsedSkills);
    const existingSkills = await this.prisma.jobSkill.findMany({ where: { jobDescriptionId } });
    const keepSkillIds: string[] = [];

    for (const parsedSkill of dedupedSkills) {
      const existingSkill = existingSkills.find(
        (skill) =>
          this.normalizeSkillName(skill.normalizedName ?? skill.name) ===
            parsedSkill.normalizedName && skill.type === parsedSkill.type,
      );

      if (existingSkill) {
        const updatedSkill = await this.prisma.jobSkill.update({
          where: { id: existingSkill.id },
          data: parsedSkill,
        });
        keepSkillIds.push(updatedSkill.id);
        continue;
      }

      const createdSkill = await this.prisma.jobSkill.create({
        data: { jobDescriptionId, ...parsedSkill },
      });
      keepSkillIds.push(createdSkill.id);
    }

    await this.prisma.jobSkill.deleteMany({
      where: {
        jobDescriptionId,
        ...(keepSkillIds.length > 0 ? { id: { notIn: keepSkillIds } } : {}),
      },
    });

    return this.prisma.jobSkill.findMany({
      where: { jobDescriptionId },
      orderBy: [{ type: 'asc' }, { isCore: 'desc' }, { name: 'asc' }],
    });
  }

  // Shared guard used by findByJobDescription/create/update/remove — confirms the parent JD is active and org-owned.
  private async ensureActiveJobDescription(jobDescriptionId: string, organizationId: string) {
    const jobDescription = await this.prisma.jobDescription.findFirst({
      where: { id: jobDescriptionId, isActive: true, organizationId },
      select: { id: true },
    });

    if (!jobDescription) {
      throw new AppException('Job description not found', 404);
    }

    return jobDescription;
  }

  // Shared guard used by update/remove — fetches a JobSkill scoped to the org via its parent JD, or throws 404.
  private async ensureJobSkillExists(skillId: string, organizationId: string) {
    const jobSkill = await this.prisma.jobSkill.findFirst({
      where: { id: skillId, jobDescription: { organizationId } },
    });

    if (!jobSkill) {
      throw new AppException('Job skill not found', 404);
    }

    return jobSkill;
  }

  // Called by create() and update() — rejects duplicate normalizedName+type skills within the same JD.
  private async ensureSkillIsUnique(
    jobDescriptionId: string,
    normalizedName: string,
    type: JobSkillType,
    excludeSkillId?: string,
  ) {
    const existingSkill = await this.prisma.jobSkill.findFirst({
      where: {
        jobDescriptionId,
        normalizedName,
        type,
        ...(excludeSkillId ? { NOT: { id: excludeSkillId } } : {}),
      },
      select: { id: true },
    });

    if (existingSkill) {
      throw new AppException('Job skill already exists for this job description', 409);
    }
  }

  // Called by syncFromParsedData — maps AI-parsed skill objects into the JobSkill create/update shape.
  private mapParsedSkills(skills: ParsedJobSkill[], type: JobSkillType) {
    return skills
      .filter((skill) => skill.name)
      .map((skill) => ({
        name: skill.name,
        normalizedName: this.normalizeSkillName(skill.normalized_name ?? skill.name),
        type,
        isCore: skill.is_core ?? false,
        weightHint: skill.weight_hint,
      }));
  }

  // Called by syncFromParsedData — drops duplicate type+normalizedName entries from the AI-parsed skill list.
  private dedupeParsedSkills(
    skills: Array<{
      name: string;
      normalizedName: string;
      type: JobSkillType;
      isCore: boolean;
      weightHint: number | null | undefined;
    }>,
  ) {
    const seen = new Set<string>();
    const result: typeof skills = [];

    for (const skill of skills) {
      const key = `${skill.type}:${skill.normalizedName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(skill);
    }

    return result;
  }

  // Shared helper used across create/update/syncFromParsedData — lowercases/trims/collapses whitespace for name matching.
  private normalizeSkillName(value: string) {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }
}
