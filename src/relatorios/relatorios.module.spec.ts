import { Test } from '@nestjs/testing';
import { describe, expect, it } from '@jest/globals';
import { GridFsService } from '../mongodb/gridfs.service';
import { MongoDbService } from '../mongodb/mongodb.service';
import { PrismaService } from '../prisma/prisma.service';
import { RelatoriosController } from './relatorios.controller';
import { RelatoriosModule } from './relatorios.module';
import { RelatoriosService } from './relatorios.service';

describe('RelatoriosModule', () => {
  it('compila com providers de infraestrutura mockados', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [RelatoriosModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(MongoDbService)
      .useValue({})
      .overrideProvider(GridFsService)
      .useValue({})
      .compile();

    expect(moduleRef.get(RelatoriosService)).toBeDefined();
    expect(moduleRef.get(RelatoriosController)).toBeDefined();
  });
});
