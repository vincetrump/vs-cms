import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';

export interface ListResponse<T> {
  data: T[];
  total: number;
}

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        if (data && typeof data === 'object' && 'data' in data && 'total' in data) {
          const response = context.switchToHttp().getResponse<Response>();
          response.setHeader('X-Total-Count', String(data.total));
          response.setHeader('Access-Control-Expose-Headers', 'X-Total-Count');
          return data.data;
        }
        return data;
      }),
    );
  }
}
