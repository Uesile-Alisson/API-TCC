import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from './user/user.module';
import { PrismaModule } from './prisma/prisma.module';
import { MongoDbModule } from './mongodb/mongodb.module';
import { MqttModule } from './mqtt-hardware/mqtt.module';
import { ProcessosModule } from './processos/processos.module';
import { AlarmesModule } from './alarmes/alarmes.module';
import { LeiturasEventosModule } from './leituras-eventos/leituras-eventos.module';
import { DynamicModule, Module, Type } from '@nestjs/common';

const optionalModules: Array<Type<unknown> | DynamicModule> = [];

if (process.env.MONGODB_ENABLED === 'true') {
  optionalModules.push(MongoDbModule);
}
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    UserModule,
    MqttModule,
    ProcessosModule,
    AlarmesModule,
    LeiturasEventosModule,
    ...optionalModules,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
