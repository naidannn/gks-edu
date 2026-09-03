import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface ApiResponse<T> {
  data: T;
  timestamp: string;
}

/**
 * Wraps successful handler results in `{ data, timestamp }`.
 *
 * Not registered globally by default — enable it in `main.ts` if you want the
 * envelope, and mirror the change in the Nuxt `$api` client.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(map((data) => ({ data, timestamp: new Date().toISOString() })));
  }
}
