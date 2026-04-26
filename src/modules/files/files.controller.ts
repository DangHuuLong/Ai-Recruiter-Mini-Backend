import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { FilesService } from './files.service';
import type { MulterUploadedFile } from '../../common/types/upload-file.type';
import { mapMulterFileToUploadFileInput } from '../../common/utils/upload-file.util';

@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(@UploadedFile() file: MulterUploadedFile) {
    const uploadFileInput = file ? mapMulterFileToUploadFileInput(file) : undefined;

    return this.filesService.uploadFile(uploadFileInput);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.filesService.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.filesService.remove(id);
  }
}
