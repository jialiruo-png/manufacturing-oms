import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { HttpError, httpError } from '../lib/httpError';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(httpError(404, `接口不存在: ${req.method} ${req.originalUrl}`, 'NOT_FOUND'));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const normalized = normalizeError(err);
  const response: Record<string, unknown> = {
    error: normalized.message,
    code: normalized.code,
  };

  if (normalized.details !== undefined) {
    response.details = normalized.details;
  }

  if (normalized.status >= 500) {
    console.error('[request:error]', {
      method: req.method,
      path: req.originalUrl,
      status: normalized.status,
      code: normalized.code,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      userId: req.user?.userId,
    });
  }

  res.status(normalized.status).json(response);
};

function normalizeError(err: unknown) {
  if (err instanceof HttpError) return err;

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return httpError(413, '文件不能超过 10MB', 'PAYLOAD_TOO_LARGE');
    }
    return httpError(400, '上传文件不合法', 'BAD_REQUEST');
  }

  if (err instanceof SyntaxError && 'body' in err) {
    return httpError(400, '请求 JSON 格式错误', 'BAD_REQUEST');
  }

  const message = process.env.NODE_ENV === 'production'
    ? '服务器错误'
    : err instanceof Error ? err.message : '服务器错误';
  return new HttpError(500, message, 'INTERNAL_ERROR', undefined, false);
}
