import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from './user/user.module';
import { PrismaModule } from './prisma/prisma.module';
import { MongoDbModule } from './mongodb/mongodb.module';
import { MqttModule } from './mqtt-hardware/mqtt.module';
import { ProcessosModule } from './processos/processos.module';
import { AlarmesModule } from './alarmes/alarmes.module';
import { LeiturasEventosModule } from './leituras-eventos/leituras-eventos.module';
import { HistoricoModule } from './historico/historico.module';
import { RelatoriosModule } from './relatorios/relatorios.module';
import { ConfiguracoesModule } from './configuracoes/configuracoes.module';
import { Module } from '@nestjs/common';
import { SecurityModule } from './security/security.module';
import { ScheduleModule } from '@nestjs/schedule';
import { validateEnvironment } from './security/http-security';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    MongoDbModule,
    SecurityModule,
    AuthModule,
    UserModule,
    MqttModule,
    ProcessosModule,
    AlarmesModule,
    LeiturasEventosModule,
    HistoricoModule,
    RelatoriosModule,
    ConfiguracoesModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
