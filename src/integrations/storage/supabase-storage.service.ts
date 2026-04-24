import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppException } from '../../common/exceptions/app.exception';

@Injectable()
export class SupabaseStorageService {
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    this.client = createClient(
      this.configService.getOrThrow<string>('supabase.url'),
      this.configService.getOrThrow<string>('supabase.serviceRoleKey'),
    );

    this.bucket = this.configService.getOrThrow<string>('supabase.bucket');
  }

  async uploadFile(params: {
    storageKey: string;
    buffer: Buffer;
    contentType: string;
  }) {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .upload(params.storageKey, params.buffer, {
        contentType: params.contentType,
        upsert: false,
      });

    if (error) {
      throw new AppException(`Storage upload failed: ${error.message}`, 500);
    }

    return data;
  }

  async removeFile(storageKey: string) {
    const { error } = await this.client.storage
      .from(this.bucket)
      .remove([storageKey]);

    if (error) {
      throw new AppException(`Storage delete failed: ${error.message}`, 500);
    }

    return true;
  }

  getPublicUrl(storageKey: string) {
    const { data } = this.client.storage
      .from(this.bucket)
      .getPublicUrl(storageKey);

    return data.publicUrl;
  }
}