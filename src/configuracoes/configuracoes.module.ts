import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BackupModule } from './backup/backup.module';
import { ConfiguracoesBombasController } from './bombas/configuracoes-bombas.controller';
import { ConfiguracoesBombasService } from './bombas/configuracoes-bombas.service';
import { ConfiguracoesSensoresController } from './sensores/configuracoes-sensores.controller';
import { ConfiguracoesSensoresService } from './sensores/configuracoes-sensores.service';
import { ConfiguracoesSistemaController } from './sistema/configuracoes-sistema.controller';
import { ConfiguracoesSistemaService } from './sistema/configuracoes-sistema.service';
import { ConfiguracoesTanquesController } from './tanques/configuracoes-tanques.controller';
import { ConfiguracoesTanquesService } from './tanques/configuracoes-tanques.service';

@Module({
  imports: [PrismaModule, BackupModule],
  controllers: [
    ConfiguracoesSistemaController,
    ConfiguracoesTanquesController,
    ConfiguracoesBombasController,
    ConfiguracoesSensoresController,
  ],
  providers: [
    ConfiguracoesSistemaService,
    ConfiguracoesTanquesService,
    ConfiguracoesBombasService,
    ConfiguracoesSensoresService,
  ],
})
export class ConfiguracoesModule {}
