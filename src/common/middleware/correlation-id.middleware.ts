import { Injectable, NestMiddleware } from '@nestjs/common';
import * as crypto from 'crypto';
import { NextFunction, Response } from 'express';
import { RequestWithUser } from 'src/auth/interfaces/request-with-user.interface';
import { asyncLocalStorage } from '../logger/async-context';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: RequestWithUser, res: Response, next: NextFunction): void {
    const correlationId =
      (req.headers['x-correlation-id'] as string) ?? crypto.randomUUID();

    res.setHeader('X-Correlation-ID', correlationId);

    const userId = req.user?.id;

    asyncLocalStorage.run(
      {
        correlationId,
        userId,
        method: req.method,
        url: req.originalUrl,
      },
      () => next(),
    );
  }
}
