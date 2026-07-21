import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ConfigService } from '@nestjs/config';
import type { HelmetOptions } from 'helmet';
import { STATUS_CODES } from 'node:http';
import { isAbsolute } from 'node:path';
import { parseAllowedClientOrigins } from './secure-socket-io.adapter';

export type HttpRateLimitConfig = {
  name: string;
  ttl: number;
  limit: number;
  blockDuration: number;
};

export const GLOBAL_HTTP_RATE_LIMIT: HttpRateLimitConfig = {
  name: 'default',
  ttl: 60_000,
  limit: 120,
  blockDuration: 60_000,
};

const REQUIRED_ENVIRONMENT_VARIABLES = [
  'DATABASE_URL',
  'MONGODB_URI',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'MAIL_HOST',
  'MAIL_PORT',
  'MAIL_USER',
  'MAIL_PASS',
  'MAIL_FROM',
  'FRONTEND_RESET_PASSWORD_URL',
] as const;

const TEST_ENVIRONMENT_DEFAULTS: Record<string, string> = {
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/tsea_test',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/tsea_test',
  JWT_SECRET: 'test-only-jwt-secret-with-at-least-32-characters',
  JWT_EXPIRES_IN: '15m',
  MAIL_HOST: '127.0.0.1',
  MAIL_PORT: '1025',
  MAIL_USER: 'test',
  MAIL_PASS: 'test',
  MAIL_FROM: 'test@tsea.local',
  FRONTEND_RESET_PASSWORD_URL: 'http://localhost:5173/reset-password',
};

export type ValidatedEnvironment = Record<string, unknown> & {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  API_INSTANCE_COUNT: number;
  HTTP_RATE_LIMIT_TTL_MS: number;
  HTTP_RATE_LIMIT_MAX: number;
  HTTP_RATE_LIMIT_BLOCK_DURATION_MS: number;
};

const INTERNAL_ERROR_MESSAGE = 'Erro interno do servidor.';
const RATE_LIMIT_MESSAGE =
  'Muitas requisicoes. Aguarde antes de tentar novamente.';
const TOO_MANY_REQUESTS_STATUS: number = HttpStatus.TOO_MANY_REQUESTS;
const PRIVATE_ERROR_FIELDS = new Set(['cause', 'name', 'stack']);

type HttpRequestInfo = {
  method?: string;
  originalUrl?: string;
  url?: string;
};

type PublicErrorPayload = Record<string, unknown>;

export function isProductionEnvironment(nodeEnv?: string): boolean {
  return nodeEnv?.trim().toLowerCase() === 'production';
}

export function shouldEnableSwagger(
  nodeEnv?: string,
  swaggerEnabled?: string | boolean,
): boolean {
  const enabled =
    typeof swaggerEnabled === 'boolean'
      ? swaggerEnabled
      : swaggerEnabled?.trim().toLowerCase() === 'true';

  return !isProductionEnvironment(nodeEnv) && enabled;
}

export function validateEnvironment(
  source: Record<string, unknown>,
): ValidatedEnvironment {
  const environment = { ...source };
  const nodeEnv = readOptionalString(environment.NODE_ENV) ?? 'development';

  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    throw new Error('NODE_ENV deve ser development, production ou test.');
  }

  environment.NODE_ENV = nodeEnv;

  if (nodeEnv === 'test') {
    for (const [key, value] of Object.entries(TEST_ENVIRONMENT_DEFAULTS)) {
      if (!readOptionalString(environment[key])) {
        environment[key] = value;
      }
    }
  }

  const missingVariables = REQUIRED_ENVIRONMENT_VARIABLES.filter(
    (key) => !readOptionalString(environment[key]),
  );
  if (missingVariables.length > 0) {
    throw new Error(
      `Variaveis de ambiente obrigatorias ausentes: ${missingVariables.join(', ')}.`,
    );
  }

  validateConnectionUrl(environment.DATABASE_URL, 'DATABASE_URL', [
    'postgres:',
    'postgresql:',
  ]);
  validateConnectionUrl(environment.MONGODB_URI, 'MONGODB_URI', [
    'mongodb:',
    'mongodb+srv:',
  ]);
  validateConnectionUrl(
    environment.FRONTEND_RESET_PASSWORD_URL,
    'FRONTEND_RESET_PASSWORD_URL',
    ['http:', 'https:'],
  );

  const jwtSecret = readRequiredString(environment.JWT_SECRET, 'JWT_SECRET');
  if (nodeEnv === 'production' && jwtSecret.length < 32) {
    throw new Error(
      'JWT_SECRET deve possuir ao menos 32 caracteres em producao.',
    );
  }

  const jwtExpiresIn = readRequiredString(
    environment.JWT_EXPIRES_IN,
    'JWT_EXPIRES_IN',
  );
  if (!/^\d+(?:ms|s|m|h|d|w|y)?$/i.test(jwtExpiresIn)) {
    throw new Error(
      'JWT_EXPIRES_IN deve ser um inteiro ou uma duracao como 15m, 1h ou 1d.',
    );
  }

  environment.PORT = parsePositiveInteger(
    environment.PORT,
    'PORT',
    3000,
    65_535,
  );
  const apiInstanceCount = parsePositiveInteger(
    environment.API_INSTANCE_COUNT,
    'API_INSTANCE_COUNT',
    1,
  );
  environment.API_INSTANCE_COUNT = apiInstanceCount;
  if (apiInstanceCount > 1) {
    throw new Error(
      'API_INSTANCE_COUNT maior que 1 exige ThrottlerStorage compartilhado; esta versao suporta rate limiting seguro em uma unica instancia.',
    );
  }
  environment.MAIL_PORT = parsePositiveInteger(
    environment.MAIL_PORT,
    'MAIL_PORT',
    undefined,
    65_535,
  );
  environment.HTTP_RATE_LIMIT_TTL_MS = parsePositiveInteger(
    environment.HTTP_RATE_LIMIT_TTL_MS,
    'HTTP_RATE_LIMIT_TTL_MS',
    GLOBAL_HTTP_RATE_LIMIT.ttl,
  );
  environment.HTTP_RATE_LIMIT_MAX = parsePositiveInteger(
    environment.HTTP_RATE_LIMIT_MAX,
    'HTTP_RATE_LIMIT_MAX',
    GLOBAL_HTTP_RATE_LIMIT.limit,
  );
  environment.HTTP_RATE_LIMIT_BLOCK_DURATION_MS = parsePositiveInteger(
    environment.HTTP_RATE_LIMIT_BLOCK_DURATION_MS,
    'HTTP_RATE_LIMIT_BLOCK_DURATION_MS',
    GLOBAL_HTTP_RATE_LIMIT.blockDuration,
  );

  environment.SWAGGER_ENABLED = normalizeBoolean(
    environment.SWAGGER_ENABLED,
    'SWAGGER_ENABLED',
    false,
  );

  const configuredOrigins = readOptionalString(
    environment.CORS_ALLOWED_ORIGINS,
  );
  if (nodeEnv === 'production' && !configuredOrigins) {
    throw new Error(
      'CORS_ALLOWED_ORIGINS e obrigatoria em producao e deve listar origens explicitas.',
    );
  }
  environment.CORS_ALLOWED_ORIGINS =
    parseAllowedClientOrigins(configuredOrigins).join(',');

  environment.TRUST_PROXY = parseTrustProxySetting(
    readOptionalString(environment.TRUST_PROXY),
  );

  const credentialsPath = readOptionalString(
    environment.MQTT_CREDENTIALS_FILE_PATH,
  );
  if (credentialsPath && !isAbsolute(credentialsPath)) {
    throw new Error(
      'MQTT_CREDENTIALS_FILE_PATH deve ser um caminho absoluto quando configurada.',
    );
  }

  return environment as ValidatedEnvironment;
}

export function createGlobalHttpRateLimit(
  configService: ConfigService,
): HttpRateLimitConfig {
  return {
    name: 'default',
    ttl: configService.getOrThrow<number>('HTTP_RATE_LIMIT_TTL_MS'),
    limit: configService.getOrThrow<number>('HTTP_RATE_LIMIT_MAX'),
    blockDuration: configService.getOrThrow<number>(
      'HTTP_RATE_LIMIT_BLOCK_DURATION_MS',
    ),
  };
}

export function parseTrustProxySetting(value?: unknown): string | false {
  if (
    value === undefined ||
    value === null ||
    value === false ||
    value === ''
  ) {
    return false;
  }

  if (typeof value !== 'string') {
    throw new Error(
      'TRUST_PROXY deve ser uma lista textual de proxies confiaveis.',
    );
  }

  if (!value.trim()) {
    return false;
  }

  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (
    entries.length === 0 ||
    entries.some((entry) =>
      ['true', 'false', '*'].includes(entry.toLowerCase()),
    )
  ) {
    throw new Error(
      'TRUST_PROXY deve listar proxies/sub-redes confiaveis; true, false e curinga nao sao aceitos.',
    );
  }

  return entries.join(', ');
}

export function createHelmetOptions(
  nodeEnv?: string,
  swaggerEnabled = false,
): HelmetOptions {
  const isProduction = isProductionEnvironment(nodeEnv);

  return {
    contentSecurityPolicy: {
      directives: {
        upgradeInsecureRequests: isProduction ? [] : null,
        ...(swaggerEnabled
          ? {
              imgSrc: ["'self'", 'data:'],
              scriptSrc: ["'self'", "'unsafe-inline'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
            }
          : {}),
      },
    },
    strictTransportSecurity: isProduction
      ? {
          maxAge: 31_536_000,
          includeSubDomains: true,
          preload: false,
        }
      : false,
  };
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function readRequiredString(value: unknown, key: string): string {
  const normalized = readOptionalString(value);
  if (!normalized) {
    throw new Error(`${key} e obrigatoria.`);
  }

  return normalized;
}

function validateConnectionUrl(
  value: unknown,
  key: string,
  allowedProtocols: readonly string[],
): void {
  const normalized = readRequiredString(value, key);
  let url: URL;

  try {
    url = new URL(normalized);
  } catch {
    throw new Error(`${key} deve conter uma URL valida.`);
  }

  if (!allowedProtocols.includes(url.protocol)) {
    throw new Error(
      `${key} deve usar um destes protocolos: ${allowedProtocols.join(', ')}.`,
    );
  }
}

function parsePositiveInteger(
  value: unknown,
  key: string,
  fallback?: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const normalized = readOptionalString(value);
  if (!normalized && fallback !== undefined) {
    return fallback;
  }

  const parsed = Number(normalized ?? value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new Error(`${key} deve ser um inteiro entre 1 e ${maximum}.`);
  }

  return parsed;
}

function normalizeBoolean(
  value: unknown,
  key: string,
  fallback: boolean,
): boolean {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = readOptionalString(value)?.toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }

  throw new Error(`${key} deve ser true ou false.`);
}

@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  protected override async shouldSkip(
    context: ExecutionContext,
  ): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    return super.shouldSkip(context);
  }
}

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const context = host.switchToHttp();
    const request = context.getRequest<HttpRequestInfo>();
    const response = context.getResponse<unknown>();
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (httpAdapter.isHeadersSent(response)) {
      this.logUnexpectedException(exception, request);
      return;
    }

    const payload = this.buildPayload(exception, statusCode, request);

    httpAdapter.setHeader(response, 'Cache-Control', 'no-store');
    httpAdapter.reply(response, payload, statusCode);

    if (!(exception instanceof HttpException)) {
      this.logUnexpectedException(exception, request);
    }
  }

  private buildPayload(
    exception: unknown,
    statusCode: number,
    request: HttpRequestInfo,
  ): PublicErrorPayload {
    const publicException = this.getPublicExceptionPayload(exception);
    const message = this.resolveMessage(exception, publicException, statusCode);
    const error =
      typeof publicException.error === 'string'
        ? publicException.error
        : (STATUS_CODES[statusCode] ?? 'Error');

    return {
      ...publicException,
      statusCode,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: request.originalUrl ?? request.url ?? '/',
      method: request.method ?? 'UNKNOWN',
    };
  }

  private getPublicExceptionPayload(exception: unknown): PublicErrorPayload {
    if (!(exception instanceof HttpException)) {
      return {};
    }

    const response = exception.getResponse();

    if (typeof response === 'string') {
      return { message: response };
    }

    if (!this.isRecord(response)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(response).filter(
        ([field]) => !PRIVATE_ERROR_FIELDS.has(field),
      ),
    );
  }

  private resolveMessage(
    exception: unknown,
    publicException: PublicErrorPayload,
    statusCode: number,
  ): string | string[] {
    if (statusCode === TOO_MANY_REQUESTS_STATUS) {
      return RATE_LIMIT_MESSAGE;
    }

    if (!(exception instanceof HttpException)) {
      return INTERNAL_ERROR_MESSAGE;
    }

    const message = publicException.message;

    if (typeof message === 'string') {
      return message;
    }

    if (
      Array.isArray(message) &&
      message.every((item) => typeof item === 'string')
    ) {
      return message;
    }

    return STATUS_CODES[statusCode] ?? 'Erro na requisicao.';
  }

  private logUnexpectedException(
    exception: unknown,
    request: HttpRequestInfo,
  ): void {
    const method = request.method ?? 'UNKNOWN';
    const path = request.originalUrl ?? request.url ?? '/';
    const trace = exception instanceof Error ? exception.stack : undefined;

    this.logger.error(`Falha HTTP nao tratada em ${method} ${path}`, trace);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
