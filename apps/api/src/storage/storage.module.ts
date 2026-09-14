import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { StorageDriverName } from '../config/configuration.js';
import { FilesController } from './files.controller.js';
import { LocalStorageDriver } from './local-storage.driver.js';
import { S3StorageDriver } from './s3-storage.driver.js';
import { STORAGE_DRIVER, StorageService } from './storage.service.js';
import { SupabaseStorageDriver } from './supabase-storage.driver.js';
import type { StorageDriver } from './storage.types.js';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [FilesController],
  providers: [
    {
      provide: STORAGE_DRIVER,
      inject: [ConfigService, LocalStorageDriver, S3StorageDriver, SupabaseStorageDriver],
      useFactory: (
        config: ConfigService,
        local: LocalStorageDriver,
        s3: S3StorageDriver,
        supabase: SupabaseStorageDriver,
      ): StorageDriver => {
        // `configuration.ts` already rejected anything outside this set, so the
        // default arm here is only ever reached by `local`.
        switch (config.get<StorageDriverName>('storage.driver')) {
          case 's3':
            return s3;
          case 'supabase':
            return supabase;
          default:
            return local;
        }
      },
    },
    LocalStorageDriver,
    S3StorageDriver,
    SupabaseStorageDriver,
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
