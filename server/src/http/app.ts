import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express, { type ErrorRequestHandler, type Request, type RequestHandler } from 'express';
import multer from 'multer';
import type { ApiErrorBody, HealthResponse, SendMessageRequest, UploadResponse } from '../../../shared/types.js';
import type { Services } from '../container.js';
import { DomainError } from '../domain/errors.js';
import { MAX_IMAGE_BYTES } from '../storage/ImageStorage.js';

const ID_PATTERN = /^[a-z]{2,4}_[a-z0-9]{6,32}$/;

export function createApp(services: Services, options: { webDistDir?: string } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '200kb' }));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES, files: 10 },
  });

  const api = express.Router();

  api.get('/health', (_req, res) => {
    const body: HealthResponse = {
      ok: true,
      catalogAdapter: services.repo.info,
      ai: { configured: services.llm.configured, provider: services.llm.provider, model: services.llm.model },
    };
    res.json(body);
  });

  api.get('/conversations', (_req, res) => {
    res.json({ conversations: services.chat.listConversations() });
  });

  api.get('/conversations/:id', (req, res) => {
    res.json({ conversation: services.chat.getConversation(param(req, 'id')) });
  });

  api.delete('/conversations/:id', (req, res) => {
    services.chat.deleteConversation(param(req, 'id'));
    res.status(204).end();
  });

  api.post(
    '/chat',
    asyncHandler(async (req, res) => {
      const body = (req.body ?? {}) as Partial<SendMessageRequest>;
      const conversationId = body.conversationId === undefined ? undefined : checkId(String(body.conversationId));
      res.json(
        await services.chat.sendMessage({
          conversationId,
          text: typeof body.text === 'string' ? body.text : '',
          attachmentIds: Array.isArray(body.attachmentIds) ? body.attachmentIds.map(String) : [],
        }),
      );
    }),
  );

  api.post(
    '/uploads',
    upload.array('images', 10),
    asyncHandler(async (req, res) => {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) throw new DomainError('VALIDATION', 'Aucune image reçue.');
      const uploads = [];
      for (const file of files) {
        uploads.push(
          await services.images.stage({ originalName: file.originalname, mimeType: file.mimetype, buffer: file.buffer }),
        );
      }
      const body: UploadResponse = { uploads };
      res.status(201).json(body);
    }),
  );

  api.post(
    '/operations/:id/confirm',
    asyncHandler(async (req, res) => {
      res.json(await services.chat.confirmOperation(param(req, 'id')));
    }),
  );

  api.post('/operations/:id/cancel', (req, res) => {
    res.json(services.chat.cancelOperation(param(req, 'id')));
  });

  api.use((_req, _res, next) => next(new DomainError('NOT_FOUND', 'Route API inconnue.')));

  app.use('/api', api);
  app.use('/media', express.static(services.images.mediaRoot, { fallthrough: false, maxAge: '1d' }));

  // En production, le serveur sert aussi l'interface compilée (web/dist).
  if (options.webDistDir && existsSync(options.webDistDir)) {
    app.use(express.static(options.webDistDir));
    app.get(/^(?!\/api|\/media).*/, (_req, res) => res.sendFile(join(options.webDistDir!, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}

function param(req: Request, name: string): string {
  return checkId(String(req.params[name] ?? ''));
}

function checkId(id: string): string {
  if (!ID_PATTERN.test(id)) throw new DomainError('VALIDATION', 'Identifiant invalide.');
  return id;
}

function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  let status = 500;
  let body: ApiErrorBody = { error: { code: 'INTERNAL', message: 'Erreur interne du serveur.' } };

  if (error instanceof DomainError) {
    status = error.httpStatus;
    body = { error: { code: error.code, message: error.message } };
  } else if (error instanceof multer.MulterError) {
    status = 400;
    const message =
      error.code === 'LIMIT_FILE_SIZE'
        ? 'Une image dépasse 8 Mo.'
        : error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE'
          ? '10 images maximum à la fois.'
          : 'Envoi des images impossible.';
    body = { error: { code: 'VALIDATION', message } };
  } else if ((error as { type?: string }).type === 'entity.parse.failed') {
    status = 400;
    body = { error: { code: 'VALIDATION', message: 'Requête JSON invalide.' } };
  } else if ((error as { status?: number }).status === 404) {
    status = 404;
    body = { error: { code: 'NOT_FOUND', message: 'Fichier introuvable.' } };
  } else {
    console.error('[http] erreur inattendue', error);
  }
  res.status(status).json(body);
};
