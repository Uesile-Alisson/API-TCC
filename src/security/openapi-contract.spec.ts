import { Test } from '@nestjs/testing';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../app.module';

type OperationObject = {
  operationId?: string;
  responses: Record<string, ResponseObject | ReferenceObject | undefined>;
  security?: Record<string, string[]>[];
};

type ReferenceObject = { $ref: string };

type ResponseObject = {
  content?: Record<string, { schema?: unknown }>;
};

describe('Contrato OpenAPI', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');

    const config = new DocumentBuilder()
      .setTitle('TSEA API')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        'access-token',
      )
      .build();

    document = SwaggerModule.createDocument(app, config);
  });

  afterAll(async () => {
    await app.close();
  });

  it('documenta toda operacao HTTP com identificador e resposta de sucesso', () => {
    const missing: string[] = [];

    for (const [path, pathItem] of Object.entries(document.paths)) {
      for (const [method, candidate] of Object.entries(pathItem ?? {})) {
        if (!isOperation(candidate)) {
          continue;
        }

        if (!candidate.operationId) {
          missing.push(`${method.toUpperCase()} ${path}: operationId`);
        }

        const hasSuccessResponse = Object.keys(candidate.responses ?? {}).some(
          (status) => /^2\d\d$/.test(status),
        );
        if (!hasSuccessResponse) {
          missing.push(`${method.toUpperCase()} ${path}: resposta 2xx`);
          continue;
        }

        const successResponses = Object.entries(candidate.responses).filter(
          ([status]) => /^2\d\d$/.test(status),
        );
        const hasDocumentedPayload = successResponses.some(
          ([status, response]) =>
            status === '204' ||
            (response !== undefined &&
              ('$ref' in response ? true : hasResponseSchema(response))),
        );
        if (!hasDocumentedPayload) {
          missing.push(`${method.toUpperCase()} ${path}: schema da resposta`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it('nao anuncia autenticacao nas rotas publicas de autenticacao', () => {
    const publicOperations = [
      document.paths['/api/auth/signin']?.post,
      document.paths['/api/auth/forgot-password']?.post,
      document.paths['/api/auth/reset-password']?.post,
    ];

    for (const operation of publicOperations) {
      expect(operation).toBeDefined();
      expect(operation?.security ?? []).toEqual([]);
    }
  });

  it('referencia somente o esquema Bearer configurado nas rotas protegidas', () => {
    const schemes = document.components?.securitySchemes ?? {};
    const invalid: string[] = [];

    expect(schemes).toHaveProperty('access-token');

    for (const [path, pathItem] of Object.entries(document.paths)) {
      for (const [method, candidate] of Object.entries(pathItem ?? {})) {
        if (!isOperation(candidate)) {
          continue;
        }

        for (const requirement of candidate.security ?? []) {
          for (const schemeName of Object.keys(requirement)) {
            if (!(schemeName in schemes)) {
              invalid.push(`${method.toUpperCase()} ${path}: ${schemeName}`);
            }
          }
        }

        if (!path.startsWith('/api/auth/') && !candidate.security?.length) {
          invalid.push(`${method.toUpperCase()} ${path}: sem Bearer`);
        }
      }
    }

    expect(invalid).toEqual([]);
  });
});

function isOperation(value: unknown): value is OperationObject {
  return typeof value === 'object' && value !== null && 'responses' in value;
}

function hasResponseSchema(response: ResponseObject): boolean {
  return Object.values(response.content ?? {}).some(
    (mediaType) => mediaType.schema !== undefined,
  );
}
