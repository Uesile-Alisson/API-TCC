import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GridFsService } from './gridfs.service';
import { MongoDbService } from './mongodb.service';

@Module({
  imports: [ConfigModule],
  providers: [MongoDbService, GridFsService],
  exports: [MongoDbService, GridFsService],
})
export class MongoDbModule {}
