import {
  Injectable,
  OnModuleInit,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MongoClient, Db } from 'mongodb';

@Injectable()
export class MongoDbService implements OnModuleInit {
  private client: MongoClient;
  private db: Db;
  private readonly logger = new Logger(MongoDbService.name);

  async onModuleInit() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new NotFoundException('MONGODB_URI não encontrada');
    }

    this.client = new MongoClient(uri);
    await this.client.connect();
    this.db = this.client.db('tsea');

    this.logger.log('MongoDB conectado');
  }

  getDatabase(): Db {
    return this.db;
  }
}
