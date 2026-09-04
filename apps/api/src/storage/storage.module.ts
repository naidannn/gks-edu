import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FilesController } from './files.controller.js';
import { LocalStorageDriver } from './local-storage.driver.js';
import { STORAGE_DRIVER, StorageService } from './storage.service.js';
import { SupabaseStorageDriver } from './supabase-storage.driver.js';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [FilesController],
  providers: [
    {
      provide: STORAGE_DRIVER,
      inject: [ConfigService, LocalStorageDriver, SupabaseStorageDriver],
      useFactory: (config: ConfigService, local: LocalStorageDriver, supabase: SupabaseStorageDriver) =>
        config.get<string>('storage.driver') === 'supabase' ? supabase : local,
    },
    LocalStorageDriver,
    SupabaseStorageDriver,
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
