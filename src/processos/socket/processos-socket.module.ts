import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { ProcessosSocketGateway } from './processos-socket.gateway';

@Module({
  imports: [AuthModule],
  providers: [ProcessosSocketGateway],
  exports: [ProcessosSocketGateway],
})
export class ProcessosSocketModule {}
