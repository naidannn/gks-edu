import { SetMetadata } from '@nestjs/common';

export const CASE_PARAM_KEY = 'caseParam';

/**
 * Tells `CaseAccessGuard` which route parameter carries the case id.
 * Defaults to `caseId`; use `@CaseParam('id')` on `/cases/:id` routes.
 */
export const CaseParam = (name: string) => SetMetadata(CASE_PARAM_KEY, name);
