import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Db, MongoClient } from 'mongodb';

@Injectable()
export class MongoDbService implements OnModuleInit, OnModuleDestroy {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private readonly logger = new Logger(MongoDbService.name);

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const uri = this.configService.get<string>('MONGODB_URI')?.trim();
    if (!uri) {
      throw new Error(
        'MONGODB_URI e obrigatoria. Configure a conexao antes de iniciar a API.',
      );
    }

    const candidate = new MongoClient(uri, { appName: 'TSEA-API' });
    try {
      await candidate.connect();
      this.db = candidate.db('tsea');
      this.client = candidate;
    } catch (error) {
      await this.closeClientSafely(candidate, 'apos falha de conexao');
      throw error;
    }

    this.logger.log('MongoDB conectado');
  }

  async onModuleDestroy(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.db = null;

    if (!client) {
      return;
    }

    await this.closeClientSafely(client, 'durante encerramento da API');
  }

  getDatabase(): Db {
    if (!this.db) {
      throw new InternalServerErrorException(
        'MongoDB ainda nao foi inicializado ou ja foi encerrado.',
      );
    }

    return this.db;
  }

  private async closeClientSafely(
    client: MongoClient,
    context: string,
  ): Promise<void> {
    try {
      await client.close();
      this.logger.log(`MongoDB desconectado ${context}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Falha ao fechar o MongoDB ${context}: ${message}`);
    }
  }
}
