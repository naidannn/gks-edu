import { Global, Module } from '@nestjs/common';
import { Ga4Service } from './ga4.service.js';

/** Global for the same reason `MetaModule` is: conversions happen in payments, not here. */
@Global()
@Module({ providers: [Ga4Service], exports: [Ga4Service] })
export class AnalyticsModule {}
