import { BadRequestException, Injectable } from '@nestjs/common';
import { ProcessoOperationalContext } from '../interfaces';
import { ProcessoSafetyValidator } from './processo-safety.validator';
import { ProcessoStateValidator } from './processo-state.validator';

@Injectable()
export class ProcessoStartValidator {
  constructor(
    private readonly stateValidator: ProcessoStateValidator,
    private readonly safetyValidator: ProcessoSafetyValidator,
  ) {}

  validateCanStart(input: {
    context: ProcessoOperationalContext;
    activeProcessId?: number | null;
  }): void {
    const { context, activeProcessId } = input;

    this.stateValidator.validateCanStart(context.status_processo);
    this.validateNoOtherActiveProcess(context.id_processo, activeProcessId);
    this.validateMinimumOperationalStructure(context);
    this.safetyValidator.validateSafeToStart(context);
  }

  validateCanResume(input: {
    context: ProcessoOperationalContext;
    activeProcessId?: number | null;
  }): void {
    const { context, activeProcessId } = input;

    this.stateValidator.validateCanResume(context.status_processo);
    this.validateNoOtherActiveProcess(context.id_processo, activeProcessId);
    this.validateMinimumOperationalStructure(context);
    this.safetyValidator.validateSafeToResume(context);
  }

  private validateNoOtherActiveProcess(
    currentProcessId: number,
    activeProcessId?: number | null,
  ): void {
    if (!activeProcessId) {
      return;
    }

    if (activeProcessId !== currentProcessId) {
      throw new BadRequestException(
        `Já existe outro processo ativo no sistema. Processo ativo atual: ${activeProcessId}.`,
      );
    }
  }

  private validateMinimumOperationalStructure(
    context: ProcessoOperationalContext,
  ): void {
    if (!context.tanques || context.tanques.length === 0) {
      throw new BadRequestException(
        'O processo não pode ser iniciado sem tanques associados.',
      );
    }

    const totalSensores = context.tanques.reduce((total, tanque) => {
      return total + (tanque.sensores?.length ?? 0);
    }, 0);

    if (totalSensores === 0) {
      throw new BadRequestException(
        'O processo não pode ser iniciado sem sensores associados.',
      );
    }

    const tanquesSemSensor = context.tanques.filter(
      (tanque) => !tanque.sensores || tanque.sensores.length === 0,
    );

    if (tanquesSemSensor.length > 0) {
      const nomes = tanquesSemSensor
        .map((tanque) => tanque.nome_tanque)
        .join(', ');

      throw new BadRequestException(
        `Os seguintes tanques não possuem sensores associados: ${nomes}.`,
      );
    }
  }
}
