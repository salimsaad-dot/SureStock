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

    request.log.error({ err: error }, 'unhandled error');
    return reply.code(500).send({
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our end.',
    });
  });
});
