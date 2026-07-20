import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { setServers } from 'node:dns';
import helmet from 'helmet';
import {
  SqlInjectionDetectorService,
  SqlInjectionInputPipe,
} from './security/sql-injection';
import {
  parseAllowedClientOrigins,
  SecureSocketIoAdapter,
} from './security/secure-socket-io.adapter';
import {
  createHelmetOptions,
  parseTrustProxySetting,
  shouldEnableSwagger,
} from './security/http-security';
import type { NestExpressApplication } from '@nestjs/platform-express';

setServers(['8.8.8.8', '1.1.1.1']);

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();
  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('NODE_ENV');
  const swaggerEnabled = shouldEnableSwagger(
    nodeEnv,
    configService.get<string | boolean>('SWAGGER_ENABLED'),
  );
  const trustProxy = parseTrustProxySetting(
    configService.get<string | false>('TRUST_PROXY'),
  );

  if (trustProxy !== false) {
    app.set('trust proxy', trustProxy);
  }

  app.use(helmet(createHelmetOptions(nodeEnv, swaggerEnabled)));

  const allowedClientOrigins = parseAllowedClientOrigins(
    configService.get<string>('CORS_ALLOWED_ORIGINS'),
  );

  app.enableCors({
    origin: allowedClientOrigins,
    credentials: true,
  });
  app.useWebSocketAdapter(new SecureSocketIoAdapter(app, allowedClientOrigins));

  app.setGlobalPrefix('api');

  const sqlInjectionDetector = app.get(SqlInjectionDetectorService);

  app.useGlobalPipes(
    new SqlInjectionInputPipe(sqlInjectionDetector),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('TSEA API')
      .setDescription('Documentação da API do sistema TSEA - Solução a Vácuo')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          in: 'header',
        },
        'access-token',
      )
      .build();

    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, swaggerDocument);
  }

  await app.listen(configService.getOrThrow<number>('PORT'));
}
void bootstrap();
