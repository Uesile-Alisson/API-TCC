import { BadRequestException, Injectable } from '@nestjs/common';
import { statusprocesso } from '@prisma/client';
import {
  isProcessoFinalStatus,
  PROCESSO_ALLOWED_TRANSITIONS,
} from '../lifecycle/processo-transition.map';

@Injectable()
export class ProcessoStateValidator {
  validateExists<T>(processo: T | null | undefined): asserts processo is T {
    if (!processo) {
      throw new BadRequestException('Processo não encontrado.');
    }
  }

  validateNotFinalStatus(status: statusprocesso): void {
    if (isProcessoFinalStatus(status)) {
      throw new BadRequestException(
        `Não é possível alterar um processo com status ${status}.`,
      );
    }
  }

  validateTransition(
    currentStatus: statusprocesso,
    nextStatus: statusprocesso,
  ): void {
    const allowedTransitions =
      PROCESSO_ALLOWED_TRANSITIONS[currentStatus] ?? [];

    if (!allowedTransitions.includes(nextStatus)) {
      throw new BadRequestException(
        `Transição inválida ${currentStatus} para ${nextStatus}.`,
      );
    }
  }

  validateCanStart(status: statusprocesso): void {
    if (status !== statusprocesso.CONFIGURADO) {
      throw new BadRequestException(
        'Somente processos configurados podem ser iniciados.',
      );
    }
  }

  validateCanPause(status: statusprocesso): void {
    if (status !== statusprocesso.EM_EXECUCAO) {
      throw new BadRequestException(
        'Somente processos em execução podem ser pausados.',
      );
    }
  }

  validateCanResume(status: statusprocesso): void {
    if (status !== statusprocesso.PAUSADO) {
      throw new BadRequestException(
        'Somente processos pausados podem ser retomedos.',
      );
    }
  }

  validateCanFinish(status: statusprocesso): void {
    if (status !== statusprocesso.EM_EXECUCAO) {
      throw new BadRequestException(
        'Somente processos em execução podem ser finalizados.',
      );
    }
  }

  validaeCanInterrupt(status: statusprocesso): void {
    if (
      status !== statusprocesso.CONFIGURADO &&
      status !== statusprocesso.EM_EXECUCAO &&
      status !== statusprocesso.PAUSADO
    ) {
      throw new BadRequestException(
        'Somente processos configurados, em execução ou pausados podem ser interrompidos.',
      );
    }
  }

  validateCanFail(status: statusprocesso): void {
    if (status !== statusprocesso.EM_EXECUCAO) {
      throw new BadRequestException(
        'Somente processos em execução podem ser marcados com falha.',
      );
    }
  }

  validaCanConfigure(status: statusprocesso): void {
    if (status !== statusprocesso.CONFIGURADO) {
      throw new BadRequestException(
        'A configuração só pode ser alterada enquanto o processo estiver configurado.',
      );
    }
  }
}
