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
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { MulterUploadedFile } from '../../common/types/upload-file.type';
import { mapMulterFileToUploadFileInput } from '../../common/utils/upload-file.util';

@Controller('files')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(@UploadedFile() file: MulterUploadedFile) {
    const uploadFileInput = file ? mapMulterFileToUploadFileInput(file) : undefined;

    return this.filesService.uploadFile(uploadFileInput);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  findOne(@Param('id') id: string) {
    return this.filesService.findOne(id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.RECRUITER)
  remove(@Param('id') id: string) {
    return this.filesService.remove(id);
  }
}
