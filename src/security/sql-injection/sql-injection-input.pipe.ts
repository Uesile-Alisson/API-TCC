import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { SqlInjectionDetectorService } from './sql-injection-detector.service';

const SQL_INJECTION_REJECTION_MESSAGE =
  'Entrada recusada por conter padrao potencialmente inseguro.';

@Injectable()
export class SqlInjectionInputPipe implements PipeTransform<unknown, unknown> {
  constructor(private readonly detector: SqlInjectionDetectorService) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (!this.shouldInspect(metadata)) {
      return value;
    }

    const result = this.detector.detect(value);

    if (result.highestSeverity === 'HIGH') {
      throw new BadRequestException(SQL_INJECTION_REJECTION_MESSAGE);
    }

    return value;
  }

  private shouldInspect(metadata: ArgumentMetadata): boolean {
    return (
      metadata.type === 'body' ||
      metadata.type === 'query' ||
      metadata.type === 'param'
    );
  }
}

export { SQL_INJECTION_REJECTION_MESSAGE };
