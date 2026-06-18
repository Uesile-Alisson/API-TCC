import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from './user/user.module';
import { PrismaModule } from './prisma/prisma.module';
import { MongoDbModule } from './mongodb/mongodb.module';
import { MqttModule } from './mqtt-hardware/mqtt.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    UserModule,
    MongoDbModule,
    MqttModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
