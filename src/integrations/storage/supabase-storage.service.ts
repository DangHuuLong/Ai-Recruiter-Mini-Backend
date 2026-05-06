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

  async uploadFile(params: { storageKey: string; buffer: Buffer; contentType: string }) {
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
    const { error } = await this.client.storage.from(this.bucket).remove([storageKey]);

    if (error) {
      throw new AppException(`Storage delete failed: ${error.message}`, 500);
    }

    return true;
  }

  async downloadFile(storageKey: string, bucket = this.bucket): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(bucket).download(storageKey);

    if (error || !data) {
      throw new AppException(`Storage download failed: ${error?.message ?? 'File not found'}`, 502);
    }

    return Buffer.from(await data.arrayBuffer());
  }

  async createSignedUrl(storageKey: string, expiresIn = 300, bucket = this.bucket) {
    const { data, error } = await this.client.storage
      .from(bucket)
      .createSignedUrl(storageKey, expiresIn);

    if (error || !data?.signedUrl) {
      throw new AppException(
        `Storage signed URL failed: ${error?.message ?? 'No signed URL returned'}`,
        502,
      );
    }

    return data.signedUrl;
  }

  getPublicUrl(storageKey: string) {
    const { data } = this.client.storage.from(this.bucket).getPublicUrl(storageKey);

    return data.publicUrl;
  }

  async checkBucket() {
    const { data, error } = await this.client.storage.getBucket(this.bucket);

    if (error || !data) {
      throw new AppException('Supabase storage bucket is not available', 500);
    }

    return true;
  }
}
