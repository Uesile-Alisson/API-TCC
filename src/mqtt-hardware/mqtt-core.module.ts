import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { CommandLedgerService } from './commands/command-ledger.service';
import { CommandService } from './commands/command.service';
import { Esp32SyncConfigService } from './config/esp32-sync-config.service';
import { MqttConfigService } from './config/mqtt-config.service';
import { MqttCredentialsService } from './config/mqtt-credentials.service';
import { MqttClientService } from './connection/mqtt-client.service';
import { MqttHealthService } from './connection/mqtt-health.service';
import { CommandAckHandler } from './handlers/command-ack.handler';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    MqttConfigService,
    MqttCredentialsService,
    MqttClientService,
    MqttHealthService,
    CommandLedgerService,
    CommandAckHandler,
    Esp32SyncConfigService,
    CommandService,
  ],
  exports: [
    MqttConfigService,
    MqttCredentialsService,
    MqttClientService,
    MqttHealthService,
    CommandLedgerService,
    CommandAckHandler,
    Esp32SyncConfigService,
    CommandService,
  ],
})
export class MqttCoreModule {}
