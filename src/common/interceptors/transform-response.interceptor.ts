import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { ResponsePayload, StandardResponse } from '../types/api-response.type';

@Injectable()
export class TransformResponseInterceptor implements NestInterceptor<
  unknown,
  StandardResponse | ResponsePayload
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<StandardResponse | ResponsePayload> {
    return next.handle().pipe(
      map((data: unknown) => {
        const payload = data as ResponsePayload;

        if (payload && payload.success !== undefined) {
          return payload;
        }

        if (payload && payload.data !== undefined && payload.meta !== undefined) {
          return {
            success: true,
            message: payload.message || 'Success',
            data: payload.data,
            meta: payload.meta,
          };
        }

        if (payload && payload.data !== undefined) {
          return {
            success: true,
            message: payload.message || 'Success',
            data: payload.data,
          };
        }

        return {
          success: true,
          message: 'Success',
          data: data ?? null,
        };
      }),
    );
  }
}
