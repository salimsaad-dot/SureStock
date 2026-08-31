import fp from 'fastify-plugin';
import type { FastifyError, FastifyInstance } from 'fastify';
import { HttpError } from '../lib/http-error.js';

export default fp(async function errorHandlerPlugin(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError | HttpError, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({
        code: error.code,
        message: error.message,
        details: error.details,
      });
    }

    // Fastify's own schema-validation errors carry a `.validation` array —
    // surface those as a client mistake (400), not a server fault (500).
    if (error.validation) {
      return reply.code(400).send({
        code: 'VALIDATION_ERROR',
        message: 'The request body failed validation.',
        details: error.validation,
      });
    }

    // A real gap found alongside the empty-JSON-body bug (T-32, 2026-08-25):
    // Fastify's own body-parsing failures (malformed JSON, the custom
    // parser above) already carry a correct 4xx `.statusCode` — this used
    // to fall straight through to the generic 500 below regardless,
    // masking a genuine client mistake as a server fault.
    if (typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({
        code: 'BAD_REQUEST',
        message: error.message || 'The request could not be processed.',
      });
    }

    request.log.error({ err: error }, 'unhandled error');
    return reply.code(500).send({
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our end.',
    });
  });
});
