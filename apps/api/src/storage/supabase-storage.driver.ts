import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import type { StorageDriver } from './storage.types.js';

/**
 * Real target per 0-08 (private Supabase Storage bucket). Selected via
 * `STORAGE_DRIVER=supabase` once `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`
 * exist — until then `LocalStorageDriver` is the default so the rest of 1C
 * (contracts, scans, collateral files) is runnable without a new account.
 *
 * The Supabase client is built lazily so this provider can be constructed
 * (Nest instantiates every provider in the module) without those env vars
 * present — it only throws if something actually tries to use it while
 * `STORAGE_DRIVER` isn't `supabase`.
 */
@Injectable()
export class SupabaseStorageDriver implements StorageDriver {
  private readonly logger = new Logger(SupabaseStorageDriver.name);
  private clientInstance?: SupabaseClient;

  constructor(private readonly config: ConfigService) {}

  async upload(path: string, buffer: Buffer): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).upload(path, buffer, { upsert: true });
    if (error) {
      this.logger.error(`Upload failed for ${path}: ${error.message}`);
      throw error;
    }
  }

  async read(path: string): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(this.bucket).download(path);
    if (error || !data) {
      this.logger.error(`Download failed for ${path}: ${error?.message}`);
      throw error ?? new Error(`Failed to download ${path}`);
    }
    return Buffer.from(await data.arrayBuffer());
  }

  async delete(path: string): Promise<void> {
    // Logical delete (ARCHITECTURE.md §9): move under a `deleted/` prefix instead of removing.
    const { data, error: downloadError } = await this.client.storage.from(this.bucket).download(path);
    if (downloadError || !data) return;
    await this.client.storage.from(this.bucket).upload(`deleted/${path}`, await data.arrayBuffer(), { upsert: true });
    await this.client.storage.from(this.bucket).remove([path]);
  }

  private get bucket(): string {
    return this.config.getOrThrow<string>('storage.supabaseBucket');
  }

  private get client(): SupabaseClient {
    if (!this.clientInstance) {
      this.clientInstance = createClient(
        this.config.getOrThrow<string>('storage.supabaseUrl'),
        this.config.getOrThrow<string>('storage.supabaseServiceRoleKey'),
      );
    }
    return this.clientInstance;
  }
}
