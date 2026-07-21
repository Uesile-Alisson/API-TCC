import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  modooperacaoauxiliar,
  nivelacesso,
  statusauxiliotanque,
  statussubsistemaauxiliar,
} from '@prisma/client';
import { CommandService } from '../../mqtt-hardware/commands/command.service';
import { ProcessoEventService } from '../events';
import {
  CurrentUserPayload,
  ProcessoAuxiliarSafetyAction,
  ProcessoAuxiliarSafetyOrigin,
} from '../interfaces';
import { ProcessoLogService } from '../logs';
import { ProcessoAuxiliarSafetyValidator } from '../validators';
import { ProcessoAuxiliarCommandService } from './processo-auxiliar-command.service';
import { ProcessoAuxiliarRepository } from './processo-auxiliar.repository';

const asyncMock = () => jest.fn<(...args: unknown[]) => Promise<unknown>>();

describe('ProcessoAuxiliarCommandService', () => {
  const user: CurrentUserPayload = {
    sub: 7,
    login: 'tecnico',
    id_nivel_acesso: 2,
    nivel_acesso: nivelacesso.TECNICO,
  };
  const repository = {
    acquirePumpControl: asyncMock(),
    releasePumpControl: asyncMock(),
    acquireValveControl: asyncMock(),
    releaseValveControl: asyncMock(),
    reserveCommand: asyncMock(),
    finalizeCommand: asyncMock(),
    rollbackCommand: asyncMock(),
    markInconsistentAfterAck: asyncMock(),
  };
  const safety = { assertAllowed: asyncMock() };
  const commands = {
    ligarBomba: asyncMock(),
    desligarBomba: asyncMock(),
    abrirValvula: asyncMock(),
    fecharValvula: asyncMock(),
  };
  const logs = {
    registerUserAction: asyncMock(),
    registerSystemAction: asyncMock(),
  };
  const events = { create: asyncMock() };
  let service: ProcessoAuxiliarCommandService;

  beforeEach(() => {
    jest.clearAllMocks();
    repository.reserveCommand.mockResolvedValue({
      id_processo: 10,
      id_processo_tanque: 20,
      action: ProcessoAuxiliarSafetyAction.ABRIR_VALVULA_AUXILIAR,
      previous_subsystem_status: statussubsistemaauxiliar.CONTROLE_MANUAL,
      previous_current_tank_id: null,
      previous_tank_status: statusauxiliotanque.ELEGIVEL,
      reserved_subsystem_version: 6,
      reserved_tank_version: 4,
    });
    repository.finalizeCommand.mockResolvedValue({
      subsystem_version: 7,
      tank_version: 5,
    });
    repository.rollbackCommand.mockResolvedValue(undefined);
    repository.markInconsistentAfterAck.mockResolvedValue(undefined);
    safety.assertAllowed.mockResolvedValue(makeSafetyResult());
    commands.abrirValvula.mockResolvedValue(makeCommandResult());
    logs.registerUserAction.mockResolvedValue({
      created: true,
      id_log_operacional: 1,
    });
    logs.registerSystemAction.mockResolvedValue({
      created: true,
      id_log_operacional: 2,
    });
    events.create.mockResolvedValue({ id_evento_processo: 1 });

    service = new ProcessoAuxiliarCommandService(
      repository as unknown as ProcessoAuxiliarRepository,
      safety as unknown as ProcessoAuxiliarSafetyValidator,
      commands as unknown as CommandService,
      logs as unknown as ProcessoLogService,
      events as unknown as ProcessoEventService,
    );
  });

  it('adquire lease da bomba com duracao padrao e registra auditoria', async () => {
    repository.acquirePumpControl.mockResolvedValue({
      id_processo: 10,
      id_processo_tanque: null,
      id_usuario: 7,
      versao: 5,
      assumido_em: new Date(),
      expira_em: new Date(),
    });

    const result = await service.acquirePumpControl({
      id_processo: 10,
      user,
      dto: { expected_version: 4, motivo: 'Intervencao tecnica.' },
    });

    expect(repository.acquirePumpControl).toHaveBeenCalledWith({
      id_processo: 10,
      id_usuario: 7,
      expected_version: 4,
      duration_seconds: 120,
    });
    expect(logs.registerUserAction).toHaveBeenCalled();
    expect(result.operation).toBe('ASSUMIR');
  });

  it('reserva, revalida, aguarda ACK e consolida abertura da valvula', async () => {
    const result = await service.abrirValvula({
      id_processo: 10,
      id_processo_tanque: 20,
      user,
      dto: makeCommandDto(),
    });

    expect(safety.assertAllowed).toHaveBeenCalledTimes(2);
    expect(safety.assertAllowed).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        expected_subsystem_version: 6,
        expected_tank_version: 4,
      }),
    );
    expect(commands.abrirValvula).toHaveBeenCalledWith(
      expect.objectContaining({
        id_processo: 10,
        solicitado_por: 7,
        correlation_id: 'front-command-123',
      }),
      12,
      'VA_T1',
      { id_tanque: 1, id_processo_tanque: 20 },
    );
    expect(repository.finalizeCommand).toHaveBeenCalled();
    expect(repository.rollbackCommand).not.toHaveBeenCalled();
    expect(result.subsystem_version).toBe(7);
    expect(result.command.ack_status).toBe('EXECUTADO');
  });

  it('desfaz reserva quando o MQTT falha antes do ACK final', async () => {
    commands.abrirValvula.mockRejectedValueOnce(new Error('Timeout MQTT'));

    await expect(
      service.abrirValvula({
        id_processo: 10,
        id_processo_tanque: 20,
        user,
        dto: makeCommandDto(),
      }),
    ).rejects.toThrow('Timeout MQTT');

    expect(repository.rollbackCommand).toHaveBeenCalledWith(
      expect.any(Object),
      'Timeout MQTT',
    );
    expect(repository.finalizeCommand).not.toHaveBeenCalled();
    expect(logs.registerUserAction).toHaveBeenCalledWith(
      expect.objectContaining({ resultado: 'FALHA' }),
    );
  });

  it('marca estado inconsistente se o ACK chegou mas a consolidacao falha', async () => {
    repository.finalizeCommand.mockRejectedValueOnce(
      new ConflictException('Versao alterada.'),
    );

    await expect(
      service.abrirValvula({
        id_processo: 10,
        id_processo_tanque: 20,
        user,
        dto: makeCommandDto(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(repository.markInconsistentAfterAck).toHaveBeenCalledWith(
      expect.any(Object),
      expect.stringContaining('ACK front-command-123 confirmado'),
    );
    expect(repository.rollbackCommand).not.toHaveBeenCalled();
  });

  it('exige versao do tanque antes de avaliar comando associado', async () => {
    await expect(
      service.abrirValvula({
        id_processo: 10,
        id_processo_tanque: 20,
        user,
        dto: {
          expected_subsystem_version: 5,
          motivo: 'Teste sem versao.',
        },
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(safety.assertAllowed).not.toHaveBeenCalled();
    expect(repository.reserveCommand).not.toHaveBeenCalled();
  });

  it('executa comando da automacao sem usuario e registra auditoria do sistema', async () => {
    await service.executeAutomaticCommand({
      id_processo: 10,
      id_processo_tanque: 20,
      action: ProcessoAuxiliarSafetyAction.ABRIR_VALVULA_AUXILIAR,
      expected_subsystem_version: 5,
      expected_tank_version: 3,
      motivo: 'Selecao automatica por estagnacao.',
      correlation_id: 'auto-processo-10-tanque-20',
    });

    expect(repository.reserveCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: ProcessoAuxiliarSafetyOrigin.AUTOMACAO,
        id_usuario: undefined,
      }),
    );
    expect(logs.registerSystemAction).toHaveBeenCalled();
    expect(logs.registerUserAction).not.toHaveBeenCalled();
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({ origem_evento: 'BACKEND' }),
    );
  });

  function makeCommandDto() {
    return {
      expected_subsystem_version: 5,
      expected_tank_version: 3,
      correlation_id: 'front-command-123',
      motivo: 'Auxilio manual supervisionado.',
    };
  }

  function makeSafetyResult() {
    return {
      approved: true,
      id_processo: 10,
      id_processo_tanque: 20,
      action: ProcessoAuxiliarSafetyAction.ABRIR_VALVULA_AUXILIAR,
      origin: ProcessoAuxiliarSafetyOrigin.USUARIO,
      mode: modooperacaoauxiliar.ASSISTIDO,
      subsystem_version: 5,
      tank_version: 3,
      id_tanque: 1,
      id_bomba_auxiliar: 2,
      codigo_bomba_auxiliar: 'BOMBA_AUXILIAR',
      id_valvula_auxiliar: 12,
      codigo_valvula_auxiliar: 'VA_T1',
      checks: [],
      evaluated_at: new Date(),
    };
  }

  function makeCommandResult() {
    return {
      comando: 'ABRIR_VALVULA',
      topic: 'tsea/comandos',
      qos: 1,
      retain: false,
      correlation_id: 'front-command-123',
      published_at: new Date(),
      acknowledged: true,
      ack_status: 'EXECUTADO',
      ack_received_at: new Date(),
      ack_message: null,
      reused_ack: false,
    };
  }
});
