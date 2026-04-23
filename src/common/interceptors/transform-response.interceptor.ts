import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';

@Injectable()
export class TransformResponseInterceptor<T>
  implements NestInterceptor<T, any> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        if (data && data.success !== undefined) {
          return data;
        }

        if (data && data.data !== undefined && data.meta !== undefined) {
          return {
            success: true,
            message: data.message || 'Success',
            data: data.data,
            meta: data.meta,
          };
        }

        if (data && data.data !== undefined) {
          return {
            success: true,
            message: data.message || 'Success',
            data: data.data,
          };
        }

        return {
          success: true,
          message: 'Success',
          data,
        };
      }),
    );
  }
}