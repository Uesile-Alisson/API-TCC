import { Module } from '@nestjs/common';
import { SqlInjectionDetectorService } from './sql-injection';

@Module({
  providers: [SqlInjectionDetectorService],
  exports: [SqlInjectionDetectorService],
})
export class SecurityModule {}
