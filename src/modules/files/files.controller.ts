// REST controller for file assets: upload, fetch metadata, get a signed download URL, and soft-delete.
import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';

import { FilesService } from './files.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user.type';
import type { MulterUploadedFile } from '../../common/types/upload-file.type';
import { mapMulterFileToUploadFileInput } from '../../common/utils/upload-file.util';

@Controller('files')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  // POST /files/upload — accepts a Multer file, maps it, and delegates storage/validation to FilesService.
  @Post('upload')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(@UploadedFile() file: MulterUploadedFile, @CurrentUser() currentUser: AuthUser) {
    const uploadFileInput = file ? mapMulterFileToUploadFileInput(file) : undefined;

    return this.filesService.uploadFile(currentUser.organizationId, uploadFileInput);
  }

  // GET /files/:id — returns FileAsset metadata scoped to the caller's organization.
  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  findOne(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    return this.filesService.findOne(id, currentUser.organizationId);
  }

  // GET /files/:id/download-url — issues a time-limited signed URL via SupabaseStorageService.
  @Get(':id/download-url')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  getDownloadUrl(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    return this.filesService.getDownloadUrl(id, currentUser.organizationId);
  }

  // DELETE /files/:id — soft-deletes a FileAsset after confirming it's not linked to a resume.
  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  remove(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    return this.filesService.remove(id, currentUser.organizationId);
  }
}
