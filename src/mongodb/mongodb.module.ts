import { Module } from '@nestjs/common';
import { GridFsService } from './gridfs.service';
import { MongoDbService } from './mongodb.service';

@Module({
  providers: [MongoDbService, GridFsService],
  exports: [MongoDbService, GridFsService],
})
export class MongoDbModule {}
