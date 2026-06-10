import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpStatus,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { extractMessage } from '../utils/extract-message.util';
import { ErrorResponse } from '../types/error-response.type';
import { getRequestContext } from '../logger/async-context';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();

    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error !!';
    let errors: string[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();

      const res = exception.getResponse();
      const extracted = extractMessage(res);

      message = extracted.message;
      errors = extracted.errors;
    }

    const reqCtx = getRequestContext();

    const errorResponse: ErrorResponse = {
      statusCode: status,
      message,
      errors,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (reqCtx?.correlationId) {
      errorResponse.correlationId = reqCtx.correlationId;
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} — ${status} ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json(errorResponse);
  }
}
