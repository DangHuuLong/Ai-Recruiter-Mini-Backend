// Wraps the Supabase Storage client: upload/download/remove files and generate signed URLs.
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { AppException } from '../../common/exceptions/app.exception';

@Injectable()
export class SupabaseStorageService {
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  // Initializes the Supabase client and default bucket from supabase config; used by every method below.
  constructor(private readonly configService: ConfigService) {
    this.client = createClient(
      this.configService.getOrThrow<string>('supabase.url'),
      this.configService.getOrThrow<string>('supabase.serviceRoleKey'),
    );

    this.bucket = this.configService.getOrThrow<string>('supabase.bucket');
  }

  // Called by files.service.ts when a resume/JD file is registered, to persist the raw file bytes.
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

  // Called by files.service.ts and the resume/jd parse processors to clean up stored files after use or on deletion.
  async removeFile(storageKey: string, bucket = this.bucket) {
    const { error } = await this.client.storage.from(bucket).remove([storageKey]);

    if (error) {
      throw new AppException(`Storage delete failed: ${error.message}`, 500);
    }

    return true;
  }

  // Called by public-batches/scoring-batches services to fetch file bytes for parsing.
  async downloadFile(storageKey: string, bucket = this.bucket): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(bucket).download(storageKey);

    if (error || !data) {
      throw new AppException(`Storage download failed: ${error?.message ?? 'File not found'}`, 502);
    }

    return Buffer.from(await data.arrayBuffer());
  }

  // Called by resumes/jd-parse/resume-parse flows to hand the AI service a time-limited download link instead of raw bytes.
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

  // Called by public-batches/scoring-batches services to let clients upload files directly to storage.
  async createSignedUploadUrl(storageKey: string, bucket = this.bucket) {
    const { data, error } = await this.client.storage
      .from(bucket)
      .createSignedUploadUrl(storageKey);

    if (error || !data?.signedUrl) {
      throw new AppException(
        `Storage signed upload URL failed: ${error?.message ?? 'No signed URL returned'}`,
        502,
      );
    }

    return data.signedUrl;
  }

  // Called by public-batches/scoring-batches services to confirm a client-side upload actually landed before processing it.
  async objectExists(storageKey: string, bucket = this.bucket): Promise<boolean> {
    const lastSlashIndex = storageKey.lastIndexOf('/');
    const folder = lastSlashIndex === -1 ? '' : storageKey.slice(0, lastSlashIndex);
    const fileName = lastSlashIndex === -1 ? storageKey : storageKey.slice(lastSlashIndex + 1);

    const { data, error } = await this.client.storage
      .from(bucket)
      .list(folder, { search: fileName, limit: 1 });

    if (error) {
      throw new AppException(`Storage list failed: ${error.message}`, 502);
    }

    return (data ?? []).some((item) => item.name === fileName);
  }

  // Called by files.service.ts/scoring-batches.service.ts to build the URL returned in API responses for a stored file.
  getPublicUrl(storageKey: string, bucket = this.bucket) {
    const { data } = this.client.storage.from(bucket).getPublicUrl(storageKey);

    return data.publicUrl;
  }

  // Exposes the configured bucket name to callers (files.service.ts, scoring-batches.service.ts) that need it for storage keys.
  getDefaultBucket(): string {
    return this.bucket;
  }

  // Called by health.service.ts to verify the Supabase storage bucket is reachable.
  async checkBucket() {
    const { data, error } = await this.client.storage.getBucket(this.bucket);

    if (error || !data) {
      throw new AppException('Supabase storage bucket is not available', 500);
    }

    return true;
  }
}
