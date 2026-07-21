import {
  BadRequestException,
  Controller,
  Get,
  INestApplication,
  Logger,
  Module,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import helmet from 'helmet';
import type { Server } from 'node:http';
import request from 'supertest';
import {
  createHelmetOptions,
  parseTrustProxySetting,
  shouldEnableSwagger,
  validateEnvironment,
} from './http-security';
import { SecurityModule } from './security.module';

@Controller('http-protections-test')
class HttpProtectionsTestController {
  @Get('limited')
  @Throttle({
    default: { limit: 2, ttl: 60_000, blockDuration: 60_000 },
  })
  limited() {
    return { success: true };
  }

  @Get('structured-error')
  structuredError(): never {
    throw new BadRequestException({
      message: 'Operacao bloqueada.',
      code: 'OPERATION_BLOCKED',
      reasons: ['Motivo operacional.'],
      cause: 'nao deve ser publico',
      stack: 'nao deve ser publico',
    });
  }

  @Get('unknown-error')
  unknownError(): never {
    throw new Error('detalhe interno sigiloso');
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: (input) => validateEnvironment({ ...input, NODE_ENV: 'test' }),
    }),
    SecurityModule,
  ],
  controllers: [HttpProtectionsTestController],
})
class HttpProtectionsTestModule {}

describe('HTTP security protections', () => {
  let app: INestApplication;
  let server: Server;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const moduleRef = await Test.createTestingModule({
      imports: [HttpProtectionsTestModule],
    }).compile();

    const expressApp =
      moduleRef.createNestApplication<NestExpressApplication>();
    expressApp.set('trust proxy', 'loopback');
    app = expressApp;
    app.use(helmet(createHelmetOptions('development', false)));
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  it('aplica Helmet sem HSTS no ambiente local', async () => {
    const response = await request(server).get(
      '/http-protections-test/limited',
    );

    expect(response.status).toBe(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['strict-transport-security']).toBeUndefined();
  });

  it('limita a rota e padroniza a resposta 429', async () => {
    await request(server).get('/http-protections-test/limited').expect(200);
    await request(server).get('/http-protections-test/limited').expect(200);
    const response = await request(server)
      .get('/http-protections-test/limited')
      .expect(429);

    expect(response.headers['retry-after']).toBeDefined();
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual(
      expect.objectContaining({
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Muitas requisicoes. Aguarde antes de tentar novamente.',
        path: '/http-protections-test/limited',
        method: 'GET',
      }),
    );
  });

  it('individualiza o rate limit pelo IP entregue por um proxy confiavel', async () => {
    await request(server)
      .get('/http-protections-test/limited')
      .set('X-Forwarded-For', '198.51.100.10')
      .expect(200);
    await request(server)
      .get('/http-protections-test/limited')
      .set('X-Forwarded-For', '198.51.100.10')
      .expect(200);
    await request(server)
      .get('/http-protections-test/limited')
      .set('X-Forwarded-For', '198.51.100.11')
      .expect(200);
  });

  it('preserva o contrato operacional publico e remove campos internos', async () => {
    const response = await request(server)
      .get('/http-protections-test/structured-error')
      .expect(400);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual(
      expect.objectContaining({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Operacao bloqueada.',
        code: 'OPERATION_BLOCKED',
        reasons: ['Motivo operacional.'],
        path: '/http-protections-test/structured-error',
        method: 'GET',
      }),
    );
    expect(response.body).not.toHaveProperty('cause');
    expect(response.body).not.toHaveProperty('stack');
  });

  it('nao expoe detalhes de erros internos', async () => {
    const response = await request(server)
      .get('/http-protections-test/unknown-error')
      .expect(500);

    expect(response.body).toEqual(
      expect.objectContaining({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Erro interno do servidor.',
      }),
    );
    expect(JSON.stringify(response.body)).not.toContain(
      'detalhe interno sigiloso',
    );
  });
});

describe('Swagger environment policy', () => {
  it('exige opt-in explicito fora de producao', () => {
    expect(shouldEnableSwagger('development', 'true')).toBe(true);
    expect(shouldEnableSwagger('development', undefined)).toBe(false);
    expect(shouldEnableSwagger('test', 'false')).toBe(false);
  });

  it('mantem o Swagger desativado em producao mesmo com flag ativa', () => {
    expect(shouldEnableSwagger('production', 'true')).toBe(false);
    expect(shouldEnableSwagger(' PRODUCTION ', 'TRUE')).toBe(false);
  });

  it('abre somente as diretivas necessarias para o Swagger local', () => {
    const options = createHelmetOptions('development', true);
    const contentSecurityPolicy = options.contentSecurityPolicy;

    expect(contentSecurityPolicy).not.toBe(false);
    expect(contentSecurityPolicy).toEqual(
      expect.objectContaining({
        directives: expect.objectContaining({
          imgSrc: ["'self'", 'data:'],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          upgradeInsecureRequests: null,
        }),
      }),
    );
  });
});

describe('Environment validation', () => {
  it('falha cedo e lista variaveis obrigatorias ausentes', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        CORS_ALLOWED_ORIGINS: 'https://app.example.com',
      }),
    ).toThrow(/DATABASE_URL.*MONGODB_URI.*JWT_SECRET/);
  });

  it('normaliza configuracoes seguras e limites numericos', () => {
    const validated = validateEnvironment({
      ...makeRequiredEnvironment(),
      NODE_ENV: 'production',
      PORT: '8080',
      CORS_ALLOWED_ORIGINS: 'https://app.example.com',
      TRUST_PROXY: 'loopback, 10.0.0.0/8',
      HTTP_RATE_LIMIT_MAX: '50',
      HTTP_RATE_LIMIT_TTL_MS: '30000',
      HTTP_RATE_LIMIT_BLOCK_DURATION_MS: '45000',
    });

    expect(validated).toEqual(
      expect.objectContaining({
        NODE_ENV: 'production',
        PORT: 8080,
        API_INSTANCE_COUNT: 1,
        TRUST_PROXY: 'loopback, 10.0.0.0/8',
        HTTP_RATE_LIMIT_MAX: 50,
        HTTP_RATE_LIMIT_TTL_MS: 30_000,
        HTTP_RATE_LIMIT_BLOCK_DURATION_MS: 45_000,
      }),
    );
  });

  it('fornece somente defaults inofensivos quando NODE_ENV=test', () => {
    const validated = validateEnvironment({ NODE_ENV: 'test' });

    expect(validated.DATABASE_URL).toBe(
      'postgresql://test:test@127.0.0.1:5432/tsea_test',
    );
    expect(validated.PORT).toBe(3000);
    expect(validated.API_INSTANCE_COUNT).toBe(1);
    expect(validated.HTTP_RATE_LIMIT_MAX).toBe(120);
  });

  it('recusa multiplas instancias enquanto o rate limiter usar memoria local', () => {
    expect(() =>
      validateEnvironment({
        ...makeRequiredEnvironment(),
        NODE_ENV: 'production',
        CORS_ALLOWED_ORIGINS: 'https://app.example.com',
        API_INSTANCE_COUNT: '2',
      }),
    ).toThrow(/ThrottlerStorage compartilhado/);
  });

  it('recusa trust proxy amplo que permitiria forjar o IP do cliente', () => {
    expect(() => parseTrustProxySetting('true')).toThrow(/TRUST_PROXY/);
    expect(() => parseTrustProxySetting('*')).toThrow(/TRUST_PROXY/);
    expect(parseTrustProxySetting(undefined)).toBe(false);
  });

  function makeRequiredEnvironment(): Record<string, string> {
    return {
      DATABASE_URL: 'postgresql://user:password@localhost:5432/tsea',
      MONGODB_URI: 'mongodb://localhost:27017/tsea',
      JWT_SECRET: 'production-jwt-secret-with-more-than-32-characters',
      JWT_EXPIRES_IN: '1d',
      MAIL_HOST: 'smtp.example.com',
      MAIL_PORT: '587',
      MAIL_USER: 'mailer',
      MAIL_PASS: 'secret',
      MAIL_FROM: 'noreply@example.com',
      FRONTEND_RESET_PASSWORD_URL: 'https://app.example.com/reset-password',
    };
  }
});
