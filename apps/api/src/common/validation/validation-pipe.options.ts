import { BadRequestException, type ValidationPipeOptions } from '@nestjs/common';
import { mongolianValidationMessages } from './validation-messages.js';

/**
 * The one `ValidationPipe` configuration, shared by `main.ts` and the tests
 * that assert against "the real pipe".
 *
 * No `enableImplicitConversion`: it coerces by the reflected design type, which
 * turns the query string "false" into `Boolean('false') === true` and overrides
 * a DTO's own @Transform. Query DTOs state their conversions explicitly with
 * @Type / @Transform instead.
 */
export const VALIDATION_PIPE_OPTIONS: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory: (errors) => new BadRequestException(mongolianValidationMessages(errors)),
};
