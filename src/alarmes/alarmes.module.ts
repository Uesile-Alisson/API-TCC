import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AlarmesController } from './alarmes.controller';
import { AlarmesService } from './alarmes.service';
import { AlarmeLogService } from './logs';
import { AlarmeMapper } from './mappers';
import { AlarmesRepository } from './repositories';
import {
  AlarmAcknowledgementService,
  AlarmNormalizationService,
  AlarmRecoveryService,
  AlarmResolutionPolicyService,
} from './services';
import { AlarmesSocketGateway } from './socket';
import { AlarmeStateValidator } from './validators';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AlarmesController],
  providers: [
    AlarmesService,
    AlarmesRepository,
    AlarmeMapper,
    AlarmeStateValidator,
    AlarmeLogService,
    AlarmAcknowledgementService,
    AlarmResolutionPolicyService,
    AlarmNormalizationService,
    AlarmRecoveryService,
    AlarmesSocketGateway,
  ],
  exports: [AlarmesService, AlarmesRepository],
})
export class AlarmesModule {}
