import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { statusprocesso } from '@prisma/client';
import { HISTORICO_MESSAGES } from '../constants';

export interface HistoricoProcessoValidationInput {
  id_processo: number;
  status_processo: statusprocesso;
}

@Injectable()
export class HistoricoProcessoValidator {
  validateProcessId(id_processo: number): void {
    if (!Number.isInteger(id_processo) || id_processo <= 0) {
      throw new BadRequestException(
        'id_processo deve ser um inteiro positivo.',
      );
    }
  }

  validateExists<T>(
    processo: T | null | undefined,
    id_processo: number,
  ): asserts processo is NonNullable<T> {
    if (processo === null || processo === undefined) {
      throw new NotFoundException(
        `${HISTORICO_MESSAGES.PROCESS_NOT_FOUND} id_processo=${id_processo}`,
      );
    }
  }

  validateIsHistoricalProcess(
    processo: HistoricoProcessoValidationInput,
  ): void {
    if (!processo.status_processo) {
      throw new ConflictException(HISTORICO_MESSAGES.PROCESS_NOT_HISTORICAL);
    }
  }

  validateHistoricalProcess<
    T extends HistoricoProcessoValidationInput | null | undefined,
  >(processo: T, id_processo: number): asserts processo is NonNullable<T> {
    this.validateProcessId(id_processo);
    this.validateExists(processo, id_processo);
    this.validateIsHistoricalProcess(processo);
  }

  validateCanAccessHistoricalProcess(
    processo: HistoricoProcessoValidationInput | null | undefined,
    id_processo: number,
  ): asserts processo is HistoricoProcessoValidationInput {
    // Regras de autorização por perfil/filtro ficam em HistoricoPermissionValidator e no service/controller.
    this.validateHistoricalProcess(processo, id_processo);
  }
}
