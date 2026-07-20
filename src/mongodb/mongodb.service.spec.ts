import { InternalServerErrorException, Logger } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Db, MongoClient } from 'mongodb';
import { MongoDbService } from './mongodb.service';
import { MongoDbModule } from './mongodb.module';
import { AppModule } from '../app.module';

describe('MongoDbService', () => {
  const config = { get: jest.fn<(key: string) => string | undefined>() };
  let service: MongoDbService;

  beforeEach(() => {
    jest.restoreAllMocks();
    config.get.mockReset();
    service = new MongoDbService(config as unknown as ConfigService);
  });

  it.each([undefined, '', '   '])(
    'recusa inicializacao sem MONGODB_URI valida (%p)',
    async (uri) => {
      config.get.mockReturnValue(uri);

      await expect(service.onModuleInit()).rejects.toThrow(
        'MONGODB_URI e obrigatoria',
      );
    },
  );

  it('conecta uma vez, disponibiliza o banco e fecha o pool de forma idempotente', async () => {
    const database = {} as Db;
    const connect = jest
      .spyOn(MongoClient.prototype, 'connect')
      .mockResolvedValue({} as MongoClient);
    const db = jest
      .spyOn(MongoClient.prototype, 'db')
      .mockReturnValue(database);
    const close = jest
      .spyOn(MongoClient.prototype, 'close')
      .mockResolvedValue(undefined);
    config.get.mockReturnValue('mongodb://localhost:27017');

    await service.onModuleInit();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(db).toHaveBeenCalledWith('tsea');
    expect(service.getDatabase()).toBe(database);

    await service.onModuleDestroy();
    await service.onModuleDestroy();

    expect(close).toHaveBeenCalledTimes(1);
    expect(() => service.getDatabase()).toThrow(InternalServerErrorException);
  });

  it('fecha o cliente candidato quando a conexao falha e preserva o erro original', async () => {
    const connectionError = new Error('Servidor indisponivel');
    jest
      .spyOn(MongoClient.prototype, 'connect')
      .mockRejectedValue(connectionError);
    const close = jest
      .spyOn(MongoClient.prototype, 'close')
      .mockResolvedValue(undefined);
    config.get.mockReturnValue('mongodb://localhost:27017');

    await expect(service.onModuleInit()).rejects.toBe(connectionError);
    expect(close).toHaveBeenCalledTimes(1);
    expect(() => service.getDatabase()).toThrow(InternalServerErrorException);
  });

  it('permite encerramento antes da inicializacao sem tentar fechar cliente inexistente', async () => {
    const close = jest.spyOn(MongoClient.prototype, 'close');

    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    expect(close).not.toHaveBeenCalled();
  });

  it('limpa o estado e nao bloqueia o shutdown quando o fechamento falha', async () => {
    const database = {} as Db;
    jest
      .spyOn(MongoClient.prototype, 'connect')
      .mockResolvedValue({} as MongoClient);
    jest.spyOn(MongoClient.prototype, 'db').mockReturnValue(database);
    const close = jest
      .spyOn(MongoClient.prototype, 'close')
      .mockRejectedValue(new Error('Falha ao liberar sockets'));
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    config.get.mockReturnValue('mongodb://localhost:27017');

    await service.onModuleInit();
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();

    expect(close).toHaveBeenCalledTimes(1);
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('Falha ao fechar o MongoDB'),
    );
    expect(() => service.getDatabase()).toThrow(InternalServerErrorException);
  });
});

describe('MongoDB obrigatorio no AppModule', () => {
  it('mantem MongoDbModule no grafo raiz independentemente de flag', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      AppModule,
    ) as unknown[];

    expect(imports).toContain(MongoDbModule);
  });
});
