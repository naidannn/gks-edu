import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '../../prisma/client.js';
import type { Request, Response } from 'express';

/**
 * Single exit point for errors: turns anything thrown inside the app into the
 * `ApiErrorBody` shape the frontend expects, and keeps internal details out of
 * the response body while still logging them.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, error } = this.describe(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${status}: ${JSON.stringify(message)}`);
    }

    response.status(status).json({
      statusCode: status,
      message,
      error,
      requestId: request.headers['x-request-id'],
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private describe(exception: unknown): {
    status: number;
    message: string | string[];
    error?: string;
  } {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ?? exception.message);

      return { status: exception.getStatus(), message, error: exception.name };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.describePrisma(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Хүсэлтийн утга буруу байна',
        error: 'PrismaClientValidationError',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Дотоод алдаа гарлаа. Түр хүлээгээд дахин оролдоно уу',
      error: 'InternalServerError',
    };
  }

  private describePrisma(exception: Prisma.PrismaClientKnownRequestError): {
    status: number;
    message: string;
    error: string;
  } {
    switch (exception.code) {
      case 'P2002': {
        const target = (exception.meta?.target as string[] | undefined)?.join(', ') ?? 'утга';
        return {
          status: HttpStatus.CONFLICT,
          message: `Ийм ${target} утгатай бичлэг аль хэдийн бүртгэгдсэн байна`,
          error: 'UniqueConstraintViolation',
        };
      }
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Бичлэг олдсонгүй',
          error: 'NotFound',
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Холбогдох бичлэг олдсонгүй',
          error: 'ForeignKeyConstraintViolation',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Мэдээллийн сангийн алдаа гарлаа',
          error: `Prisma${exception.code}`,
        };
    }
  }
}
