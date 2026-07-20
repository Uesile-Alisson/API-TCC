import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { IncomingMessage } from 'node:http';
import type { Server, ServerOptions } from 'socket.io';

export const DEFAULT_CLIENT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
] as const;

type SocketServerOptions = Partial<ServerOptions>;

export function parseAllowedClientOrigins(
  configuredOrigins: string | undefined,
): string[] {
  const candidates = configuredOrigins?.trim()
    ? configuredOrigins.split(',')
    : [...DEFAULT_CLIENT_ORIGINS];
  const origins = candidates.map((candidate) => normalizeOrigin(candidate));

  return [...new Set(origins)];
}

export function buildSecureSocketServerOptions(
  options: SocketServerOptions | undefined,
  allowedOrigins: readonly string[],
): SocketServerOptions {
  const previousAllowRequest = options?.allowRequest;
  const connectionStateRecovery = options?.connectionStateRecovery;

  return {
    ...options,
    cors: {
      origin: [...allowedOrigins],
      credentials: true,
      methods: ['GET', 'POST'],
    },
    allowRequest: (request, callback) => {
      if (!isAllowedRequestOrigin(request, allowedOrigins)) {
        callback(null, false);
        return;
      }

      if (previousAllowRequest) {
        previousAllowRequest(request, callback);
        return;
      }

      callback(null, true);
    },
    ...(connectionStateRecovery
      ? {
          connectionStateRecovery: {
            ...connectionStateRecovery,
            skipMiddlewares: false,
          },
        }
      : {}),
  };
}

export class SecureSocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly allowedOrigins: readonly string[],
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const secureOptions = buildSecureSocketServerOptions(
      options,
      this.allowedOrigins,
    );

    return super.createIOServer(port, secureOptions) as Server;
  }
}

function isAllowedRequestOrigin(
  request: IncomingMessage,
  allowedOrigins: readonly string[],
): boolean {
  const origin = request.headers.origin;

  if (!origin) {
    return false;
  }

  try {
    return allowedOrigins.includes(normalizeOrigin(origin));
  } catch {
    return false;
  }
}

function normalizeOrigin(candidate: string): string {
  const value = candidate.trim();

  if (!value || value === '*') {
    throw new Error(
      'CORS_ALLOWED_ORIGINS deve conter origens explicitas; curinga nao e permitido.',
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Origem CORS invalida: ${value}.`);
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error(
      `Origem CORS invalida: ${value}. Informe apenas protocolo, host e porta.`,
    );
  }

  return url.origin;
}
