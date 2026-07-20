import { ConflictException, Injectable, Logger } from '@nestjs/common';
import {
  origemevento,
  resultadooperacao,
  severidadeevento,
  tipoeventoprocesso,
} from '@prisma/client';
import { CommandService } from '../../mqtt-hardware/commands/command.service';
import { CommandOptions } from '../../mqtt-hardware/commands/interfaces/command-options.interface';
import { CommandResult } from '../../mqtt-hardware/commands/interfaces/command-result.interface';
import {
  ProcessoAuxiliarCommandDTO,
  ProcessoAuxiliarLeaseDTO,
  ProcessoAuxiliarReleaseDTO,
} from '../dto';
import { ProcessoEventService } from '../events';
import {
  CurrentUserPayload,
  ProcessoAuxiliarSafetyAction,
  ProcessoAuxiliarSafetyOrigin,
  ProcessoAuxiliarSafetyResult,
} from '../interfaces';
import { ProcessoLogService } from '../logs';
import { ProcessoAuxiliarSafetyValidator } from '../validators';
import {
  ProcessoAuxiliarCommandStateResult,
  ProcessoAuxiliarLeaseMutationResult,
  ProcessoAuxiliarRepository,
} from './processo-auxiliar.repository';

const DEFAULT_LEASE_DURATION_SECONDS = 120;

export interface ProcessoAuxiliarLeaseResult {
  success: true;
  message: string;
  resource: 'BOMBA_AUXILIAR' | 'VALVULA_AUXILIAR';
  operation: 'ASSUMIR' | 'LIBERAR';
  lease: ProcessoAuxiliarLeaseMutationResult;
}

export interface ProcessoAuxiliarCommandResult {
  success: true;
  message: string;
  action: ProcessoAuxiliarSafetyAction;
  id_processo: number;
  id_processo_tanque: number | null;
  id_bomba_auxiliar: number | null;
  id_valvula_auxiliar: number | null;
  subsystem_version: number;
  tank_version: number | null;
  command: CommandResult;
}

export interface ProcessoAuxiliarAutomaticCommandInput {
  id_processo: number;
  id_processo_tanque?: number;
  action: ProcessoAuxiliarSafetyAction;
  expected_subsystem_version: number;
  expected_tank_version?: number;
  motivo: string;
  correlation_id?: string;
}

interface ProcessoAuxiliarCommandExecutionInput {
  id_processo: number;
  id_processo_tanque?: number;
  action: ProcessoAuxiliarSafetyAction;
  origin: ProcessoAuxiliarSafetyOrigin;
  id_usuario?: number;
  dto: ProcessoAuxiliarCommandDTO;
}

@Injectable()
export class ProcessoAuxiliarCommandService {
  private readonly logger = new Logger(ProcessoAuxiliarCommandService.name);

  constructor(
    private readonly repository: ProcessoAuxiliarRepository,
    private readonly safetyValidator: ProcessoAuxiliarSafetyValidator,
    private readonly commandService: CommandService,
    private readonly processoLogService: ProcessoLogService,
    private readonly processoEventService: ProcessoEventService,
  ) {}

  async acquirePumpControl(input: {
    id_processo: number;
    user: CurrentUserPayload;
    dto: ProcessoAuxiliarLeaseDTO;
  }): Promise<ProcessoAuxiliarLeaseResult> {
    const lease = await this.repository.acquirePumpControl({
      id_processo: input.id_processo,
      id_usuario: input.user.sub,
      expected_version: input.dto.expected_version,
      duration_seconds:
        input.dto.duration_seconds ?? DEFAULT_LEASE_DURATION_SECONDS,
    });

    await this.safeRegisterLog({
      id_processo: input.id_processo,
      id_usuario: input.user.sub,
      action: 'AUXILIAR_CONTROLE_BOMBA_ASSUMIDO',
      description:
        `Usuario assumiu o controle da bomba auxiliar ate ${lease.expira_em?.toISOString()}. ` +
        `Motivo: ${input.dto.motivo}`,
    });

    return {
      success: true,
      message: 'Controle da bomba auxiliar assumido com sucesso.',
      resource: 'BOMBA_AUXILIAR',
      operation: 'ASSUMIR',
      lease,
    };
  }

  async releasePumpControl(input: {
    id_processo: number;
    user: CurrentUserPayload;
    dto: ProcessoAuxiliarReleaseDTO;
  }): Promise<ProcessoAuxiliarLeaseResult> {
    const lease = await this.repository.releasePumpControl({
      id_processo: input.id_processo,
      id_usuario: input.user.sub,
      expected_version: input.dto.expected_version,
    });

    await this.safeRegisterLog({
      id_processo: input.id_processo,
      id_usuario: input.user.sub,
      action: 'AUXILIAR_CONTROLE_BOMBA_LIBERADO',
      description: `Usuario liberou o controle da bomba auxiliar. Motivo: ${input.dto.motivo}`,
    });

    return {
      success: true,
      message: 'Controle da bomba auxiliar liberado com sucesso.',
      resource: 'BOMBA_AUXILIAR',
      operation: 'LIBERAR',
      lease,
    };
  }

  async acquireValveControl(input: {
    id_processo: number;
    id_processo_tanque: number;
    user: CurrentUserPayload;
    dto: ProcessoAuxiliarLeaseDTO;
  }): Promise<ProcessoAuxiliarLeaseResult> {
    const lease = await this.repository.acquireValveControl({
      id_processo: input.id_processo,
      id_processo_tanque: input.id_processo_tanque,
      id_usuario: input.user.sub,
      expected_version: input.dto.expected_version,
      duration_seconds:
        input.dto.duration_seconds ?? DEFAULT_LEASE_DURATION_SECONDS,
    });

    await this.safeRegisterLog({
      id_processo: input.id_processo,
      id_usuario: input.user.sub,
      action: 'AUXILIAR_CONTROLE_VALVULA_ASSUMIDO',
      description:
        `Usuario assumiu o controle da valvula auxiliar do processo/tanque ${input.id_processo_tanque} ` +
        `ate ${lease.expira_em?.toISOString()}. Motivo: ${input.dto.motivo}`,
    });

    return {
      success: true,
      message: 'Controle da valvula auxiliar assumido com sucesso.',
      resource: 'VALVULA_AUXILIAR',
      operation: 'ASSUMIR',
      lease,
    };
  }

  async releaseValveControl(input: {
    id_processo: number;
    id_processo_tanque: number;
    user: CurrentUserPayload;
    dto: ProcessoAuxiliarReleaseDTO;
  }): Promise<ProcessoAuxiliarLeaseResult> {
    const lease = await this.repository.releaseValveControl({
      id_processo: input.id_processo,
      id_processo_tanque: input.id_processo_tanque,
      id_usuario: input.user.sub,
      expected_version: input.dto.expected_version,
    });

    await this.safeRegisterLog({
      id_processo: input.id_processo,
      id_usuario: input.user.sub,
      action: 'AUXILIAR_CONTROLE_VALVULA_LIBERADO',
      description:
        `Usuario liberou o controle da valvula auxiliar do processo/tanque ${input.id_processo_tanque}. ` +
        `Motivo: ${input.dto.motivo}`,
    });

    return {
      success: true,
      message: 'Controle da valvula auxiliar liberado com sucesso.',
      resource: 'VALVULA_AUXILIAR',
      operation: 'LIBERAR',
      lease,
    };
  }

  ligarBomba(input: {
    id_processo: number;
    id_processo_tanque: number;
    user: CurrentUserPayload;
    dto: ProcessoAuxiliarCommandDTO;
  }): Promise<ProcessoAuxiliarCommandResult> {
    return this.executeCommand({
      id_processo: input.id_processo,
      id_processo_tanque: input.id_processo_tanque,
      id_usuario: input.user.sub,
      dto: input.dto,
      origin: ProcessoAuxiliarSafetyOrigin.USUARIO,
      action: ProcessoAuxiliarSafetyAction.LIGAR_BOMBA_AUXILIAR,
    });
  }

  desligarBomba(input: {
    id_processo: number;
    user: CurrentUserPayload;
    dto: ProcessoAuxiliarCommandDTO;
  }): Promise<ProcessoAuxiliarCommandResult> {
    return this.executeCommand({
      id_processo: input.id_processo,
      id_usuario: input.user.sub,
      dto: input.dto,
      origin: ProcessoAuxiliarSafetyOrigin.USUARIO,
      action: ProcessoAuxiliarSafetyAction.DESLIGAR_BOMBA_AUXILIAR,
    });
  }

  abrirValvula(input: {
    id_processo: number;
    id_processo_tanque: number;
    user: CurrentUserPayload;
    dto: ProcessoAuxiliarCommandDTO;
  }): Promise<ProcessoAuxiliarCommandResult> {
    return this.executeCommand({
      id_processo: input.id_processo,
      id_processo_tanque: input.id_processo_tanque,
      id_usuario: input.user.sub,
      dto: input.dto,
      origin: ProcessoAuxiliarSafetyOrigin.USUARIO,
      action: ProcessoAuxiliarSafetyAction.ABRIR_VALVULA_AUXILIAR,
    });
  }

  fecharValvula(input: {
    id_processo: number;
    id_processo_tanque: number;
    user: CurrentUserPayload;
    dto: ProcessoAuxiliarCommandDTO;
  }): Promise<ProcessoAuxiliarCommandResult> {
    return this.executeCommand({
      id_processo: input.id_processo,
      id_processo_tanque: input.id_processo_tanque,
      id_usuario: input.user.sub,
      dto: input.dto,
      origin: ProcessoAuxiliarSafetyOrigin.USUARIO,
      action: ProcessoAuxiliarSafetyAction.FECHAR_VALVULA_AUXILIAR,
    });
  }

  executeAutomaticCommand(
    input: ProcessoAuxiliarAutomaticCommandInput,
  ): Promise<ProcessoAuxiliarCommandResult> {
    return this.executeCommand({
      id_processo: input.id_processo,
      id_processo_tanque: input.id_processo_tanque,
      action: input.action,
      origin: ProcessoAuxiliarSafetyOrigin.AUTOMACAO,
      dto: {
        expected_subsystem_version: input.expected_subsystem_version,
        expected_tank_version: input.expected_tank_version,
        motivo: input.motivo,
        correlation_id: input.correlation_id,
      },
    });
  }

  private async executeCommand(
    input: ProcessoAuxiliarCommandExecutionInput,
  ): Promise<ProcessoAuxiliarCommandResult> {
    this.assertTankVersion(input);
    const initialSafety = await this.safetyValidator.assertAllowed(
      this.buildSafetyRequest(input),
    );
    this.assertHardwareResource(initialSafety, input.action);

    const reservation = await this.repository.reserveCommand({
      id_processo: input.id_processo,
      id_processo_tanque: input.id_processo_tanque,
      id_usuario: input.id_usuario,
      origin: input.origin,
      action: input.action,
      expected_subsystem_version: input.dto.expected_subsystem_version,
      expected_tank_version: input.dto.expected_tank_version,
    });

    let command: CommandResult;
    try {
      const reservedSafety = await this.safetyValidator.assertAllowed({
        ...this.buildSafetyRequest(input),
        expected_subsystem_version: reservation.reserved_subsystem_version,
        expected_tank_version: reservation.reserved_tank_version ?? undefined,
      });
      this.assertHardwareResource(reservedSafety, input.action);
      command = await this.executeMqttCommand(input, reservedSafety);
    } catch (error) {
      const message = this.getErrorMessage(error);
      await this.repository.rollbackCommand(reservation, message);
      await this.registerCommandFailure(input, message);
      throw error;
    }

    let finalState: ProcessoAuxiliarCommandStateResult;
    try {
      finalState = await this.repository.finalizeCommand(reservation);
    } catch (error) {
      const message =
        `ACK ${command.correlation_id} confirmado, mas a consolidacao do estado falhou: ` +
        this.getErrorMessage(error);
      await this.repository.markInconsistentAfterAck(reservation, message);
      await this.registerCommandFailure(input, message);
      throw new ConflictException({
        message:
          'Hardware confirmou o comando, mas o estado persistido entrou em conflito e foi marcado como FALHA.',
        correlation_id: command.correlation_id,
        details: message,
      });
    }

    await this.registerCommandSuccess(input, command);

    return {
      success: true,
      message: this.resolveSuccessMessage(input.action),
      action: input.action,
      id_processo: input.id_processo,
      id_processo_tanque: input.id_processo_tanque ?? null,
      id_bomba_auxiliar: initialSafety.id_bomba_auxiliar,
      id_valvula_auxiliar: initialSafety.id_valvula_auxiliar,
      subsystem_version: finalState.subsystem_version,
      tank_version: finalState.tank_version,
      command,
    };
  }

  private async executeMqttCommand(
    input: ProcessoAuxiliarCommandExecutionInput,
    safety: ProcessoAuxiliarSafetyResult,
  ): Promise<CommandResult> {
    const options: CommandOptions = {
      id_processo: input.id_processo,
      solicitado_por: input.id_usuario,
      motivo: input.dto.motivo,
      correlation_id: input.dto.correlation_id,
    };

    if (input.action === ProcessoAuxiliarSafetyAction.LIGAR_BOMBA_AUXILIAR) {
      return this.commandService.ligarBomba(
        options,
        safety.id_bomba_auxiliar!,
        safety.codigo_bomba_auxiliar ?? undefined,
      );
    }
    if (input.action === ProcessoAuxiliarSafetyAction.DESLIGAR_BOMBA_AUXILIAR) {
      return this.commandService.desligarBomba(
        options,
        safety.id_bomba_auxiliar!,
        safety.codigo_bomba_auxiliar ?? undefined,
      );
    }

    const valveContext = {
      id_tanque: safety.id_tanque!,
      id_processo_tanque: input.id_processo_tanque!,
    };
    if (input.action === ProcessoAuxiliarSafetyAction.ABRIR_VALVULA_AUXILIAR) {
      return this.commandService.abrirValvula(
        options,
        safety.id_valvula_auxiliar!,
        safety.codigo_valvula_auxiliar ?? undefined,
        valveContext,
      );
    }
    return this.commandService.fecharValvula(
      options,
      safety.id_valvula_auxiliar!,
      safety.codigo_valvula_auxiliar ?? undefined,
      valveContext,
    );
  }

  private buildSafetyRequest(input: ProcessoAuxiliarCommandExecutionInput) {
    return {
      id_processo: input.id_processo,
      id_processo_tanque: input.id_processo_tanque,
      id_usuario: input.id_usuario,
      action: input.action,
      origin: input.origin,
      expected_subsystem_version: input.dto.expected_subsystem_version,
      expected_tank_version: input.dto.expected_tank_version,
    };
  }

  private assertTankVersion(input: {
    id_processo_tanque?: number;
    dto: ProcessoAuxiliarCommandDTO;
    action: ProcessoAuxiliarSafetyAction;
  }): void {
    if (
      input.id_processo_tanque &&
      input.dto.expected_tank_version === undefined
    ) {
      throw new ConflictException(
        'expected_tank_version e obrigatorio para este comando.',
      );
    }
  }

  private assertHardwareResource(
    safety: ProcessoAuxiliarSafetyResult,
    action: ProcessoAuxiliarSafetyAction,
  ): void {
    if (
      (action === ProcessoAuxiliarSafetyAction.LIGAR_BOMBA_AUXILIAR ||
        action === ProcessoAuxiliarSafetyAction.DESLIGAR_BOMBA_AUXILIAR) &&
      (!safety.id_bomba_auxiliar || !safety.codigo_bomba_auxiliar)
    ) {
      throw new ConflictException(
        'Bomba auxiliar sem identificacao de hardware valida.',
      );
    }
    if (
      (action === ProcessoAuxiliarSafetyAction.ABRIR_VALVULA_AUXILIAR ||
        action === ProcessoAuxiliarSafetyAction.FECHAR_VALVULA_AUXILIAR) &&
      (!safety.id_valvula_auxiliar ||
        !safety.codigo_valvula_auxiliar ||
        !safety.id_tanque)
    ) {
      throw new ConflictException(
        'Valvula auxiliar ou tanque sem identificacao de hardware valida.',
      );
    }
  }

  private async registerCommandSuccess(
    input: ProcessoAuxiliarCommandExecutionInput,
    command: CommandResult,
  ): Promise<void> {
    await Promise.all([
      this.safeRegisterLog({
        id_processo: input.id_processo,
        id_usuario: input.id_usuario,
        origin: input.origin,
        action: input.action,
        description:
          `${this.resolveSuccessMessage(input.action)} ` +
          `correlation_id=${command.correlation_id}; ack=${command.ack_status}. ` +
          `Motivo: ${input.dto.motivo}`,
      }),
      this.safeRegisterEvent(input.id_processo, input.action, input.origin),
    ]);
  }

  private async registerCommandFailure(
    input: {
      id_processo: number;
      id_usuario?: number;
      origin: ProcessoAuxiliarSafetyOrigin;
      action: ProcessoAuxiliarSafetyAction;
    },
    message: string,
  ): Promise<void> {
    await this.safeRegisterLog({
      id_processo: input.id_processo,
      id_usuario: input.id_usuario,
      origin: input.origin,
      action: input.action,
      description: `Comando auxiliar falhou. Erro: ${message}`,
      result: resultadooperacao.FALHA,
    });
  }

  private async safeRegisterLog(input: {
    id_processo: number;
    id_usuario?: number;
    origin?: ProcessoAuxiliarSafetyOrigin;
    action: string;
    description: string;
    result?: resultadooperacao;
  }): Promise<void> {
    try {
      if (
        input.origin === ProcessoAuxiliarSafetyOrigin.AUTOMACAO ||
        !input.id_usuario
      ) {
        await this.processoLogService.registerSystemAction({
          id_processo: input.id_processo,
          acao: input.action,
          descricao: input.description,
          resultado: input.result,
        });
      } else {
        await this.processoLogService.registerUserAction({
          id_processo: input.id_processo,
          id_usuario: input.id_usuario,
          acao: input.action,
          descricao: input.description,
          resultado: input.result,
        });
      }
    } catch (error) {
      this.logger.error(
        `Falha ao registrar auditoria da acao ${input.action}: ${this.getErrorMessage(error)}`,
      );
    }
  }

  private async safeRegisterEvent(
    id_processo: number,
    action: ProcessoAuxiliarSafetyAction,
    origin: ProcessoAuxiliarSafetyOrigin,
  ): Promise<void> {
    try {
      await this.processoEventService.create({
        id_processo,
        tipo_evento: this.resolveProcessEvent(action),
        origem_evento:
          origin === ProcessoAuxiliarSafetyOrigin.USUARIO
            ? origemevento.USUARIO
            : origemevento.BACKEND,
        severidade_evento: severidadeevento.INFO,
      });
    } catch (error) {
      this.logger.error(
        `Falha ao registrar evento da acao ${action}: ${this.getErrorMessage(error)}`,
      );
    }
  }

  private resolveProcessEvent(
    action: ProcessoAuxiliarSafetyAction,
  ): tipoeventoprocesso {
    if (action === ProcessoAuxiliarSafetyAction.LIGAR_BOMBA_AUXILIAR) {
      return tipoeventoprocesso.BOMBA_AUXILIAR_ATIVADA;
    }
    if (action === ProcessoAuxiliarSafetyAction.DESLIGAR_BOMBA_AUXILIAR) {
      return tipoeventoprocesso.BOMBA_DESATIVADA;
    }
    if (action === ProcessoAuxiliarSafetyAction.ABRIR_VALVULA_AUXILIAR) {
      return tipoeventoprocesso.VALVULA_ABERTA;
    }
    return tipoeventoprocesso.VALVULA_FECHADA;
  }

  private resolveSuccessMessage(action: ProcessoAuxiliarSafetyAction): string {
    if (action === ProcessoAuxiliarSafetyAction.LIGAR_BOMBA_AUXILIAR) {
      return 'Bomba auxiliar ligada com ACK confirmado.';
    }
    if (action === ProcessoAuxiliarSafetyAction.DESLIGAR_BOMBA_AUXILIAR) {
      return 'Bomba auxiliar desligada com ACK confirmado.';
    }
    if (action === ProcessoAuxiliarSafetyAction.ABRIR_VALVULA_AUXILIAR) {
      return 'Valvula auxiliar aberta com ACK confirmado.';
    }
    return 'Valvula auxiliar fechada com ACK confirmado.';
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Erro desconhecido.';
  }
}
