import { describe, expect, it, jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import {
  modooperacaoauxiliar,
  statusauxiliotanque,
  statusbomba,
  statusencerramentoprocesso,
  statusprocesso,
  statussubsistemaauxiliar,
  statustanqueprocesso,
  StatusAcoplamentoMangueira,
  StatusValvula,
  tipobomba,
} from '@prisma/client';
import { MqttConfigService } from '../../mqtt-hardware/config/mqtt-config.service';
import {
  ProcessoAuxiliarSafetyAction,
  ProcessoAuxiliarSafetyOrigin,
} from '../interfaces';
import { ProcessoMqttOrchestratorService } from '../mqtt';
import { ProcessosRepository } from '../processos.repository';
import { ProcessoAuxiliarSafetyValidator } from './processo-auxiliar-safety.validator';

type AuxiliarySafetyContext = NonNullable<
  Awaited<
    ReturnType<ProcessosRepository['findAuxiliarySafetyContextByProcessId']>
  >
>;

const NOW = new Date('2026-07-16T12:00:00.000Z');
const FRESH_STATUS = new Date('2026-07-16T11:59:59.000Z');

const buildContext = (): AuxiliarySafetyContext => ({
  id_processo: 10,
  status_processo: statusprocesso.EM_EXECUCAO,
  status_encerramento_geral: statusencerramentoprocesso.INATIVO,
  modo_operacao_auxiliar: modooperacaoauxiliar.AUTOMATICO,
  parada_emergencia: false,
  alarmes: [],
  processosauxiliares: {
    status_subsistema: statussubsistemaauxiliar.OPERANDO,
    versao: 4,
    id_processo_tanque_atual: 101,
    id_usuario_controle_bomba: null,
    controle_bomba_expira_em: null,
  },
  processostanques: [
    {
      id_processo_tanque: 101,
      id_tanque: 1,
      status_tanque_processo: statustanqueprocesso.GERANDO_VACUO,
      processostanquesauxiliares: {
        status_auxilio: statusauxiliotanque.EM_ATENDIMENTO,
        versao: 3,
        id_usuario_controle_valvula: null,
        controle_valvula_expira_em: null,
      },
      tanques: {
        nome: 'Tanque 1',
        sensoresacoplamentomangueiras: {
          status_acoplamento: StatusAcoplamentoMangueira.ACOPLADA,
          sinal_detectado: true,
          ultima_verificacao: FRESH_STATUS,
          ativo: true,
        },
        valvulas: [
          {
            id_valvula: 11,
            codigo_hardware: 'VP_T1',
            status_valvula: StatusValvula.ABERTA,
            ativo: true,
            bombas: {
              id_bomba: 1,
              codigo_hardware: 'BOMBA_PRINCIPAL',
              tipo_bomba: tipobomba.PRINCIPAL,
              status_padrao: statusbomba.ATIVA,
              ligada_hardware: true,
              disponivel_hardware: true,
              ultimo_status_hardware_em: FRESH_STATUS,
            },
          },
          {
            id_valvula: 12,
            codigo_hardware: 'VA_T1',
            status_valvula: StatusValvula.ABERTA,
            ativo: true,
            bombas: {
              id_bomba: 2,
              codigo_hardware: 'BOMBA_AUXILIAR',
              tipo_bomba: tipobomba.AUXILIAR,
              status_padrao: statusbomba.ATIVA,
              ligada_hardware: false,
              disponivel_hardware: true,
              ultimo_status_hardware_em: FRESH_STATUS,
            },
          },
        ],
      },
    },
    {
      id_processo_tanque: 102,
      id_tanque: 2,
      status_tanque_processo: statustanqueprocesso.GERANDO_VACUO,
      processostanquesauxiliares: {
        status_auxilio: statusauxiliotanque.AGUARDANDO,
        versao: 2,
        id_usuario_controle_valvula: null,
        controle_valvula_expira_em: null,
      },
      tanques: {
        nome: 'Tanque 2',
        sensoresacoplamentomangueiras: {
          status_acoplamento: StatusAcoplamentoMangueira.ACOPLADA,
          sinal_detectado: true,
          ultima_verificacao: FRESH_STATUS,
          ativo: true,
        },
        valvulas: [
          {
            id_valvula: 21,
            codigo_hardware: 'VP_T2',
            status_valvula: StatusValvula.ABERTA,
            ativo: true,
            bombas: {
              id_bomba: 1,
              codigo_hardware: 'BOMBA_PRINCIPAL',
              tipo_bomba: tipobomba.PRINCIPAL,
              status_padrao: statusbomba.ATIVA,
              ligada_hardware: true,
              disponivel_hardware: true,
              ultimo_status_hardware_em: FRESH_STATUS,
            },
          },
          {
            id_valvula: 22,
            codigo_hardware: 'VA_T2',
            status_valvula: StatusValvula.FECHADA,
            ativo: true,
            bombas: {
              id_bomba: 2,
              codigo_hardware: 'BOMBA_AUXILIAR',
              tipo_bomba: tipobomba.AUXILIAR,
              status_padrao: statusbomba.ATIVA,
              ligada_hardware: false,
              disponivel_hardware: true,
              ultimo_status_hardware_em: FRESH_STATUS,
            },
          },
        ],
      },
    },
  ],
});

const createValidator = (context = buildContext()) => {
  const repository = {
    findAuxiliarySafetyContextByProcessId: jest
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValue(context),
  };
  const mqttOrchestrator = {
    getHardwareReadiness: jest.fn().mockReturnValue({
      credentialsConfigured: true,
      credentialsVerified: true,
      credentialsVerifiedAt: new Date(),
      credentialsFailure: null,
      communicationReady: true,
      mqttConnected: true,
      mqttOperational: true,
      esp32Online: true,
    }),
  };
  const mqttConfig = {
    getConfig: jest
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValue({ timeout_comunicacao: 10000 }),
  };

  return new ProcessoAuxiliarSafetyValidator(
    repository as unknown as ProcessosRepository,
    mqttOrchestrator as unknown as ProcessoMqttOrchestratorService,
    mqttConfig as unknown as MqttConfigService,
  );
};

describe('ProcessoAuxiliarSafetyValidator', () => {
  it('aprova automacao somente com tanque selecionado e uma valvula auxiliar aberta', async () => {
    const validator = createValidator();

    const result = await validator.evaluate({
      id_processo: 10,
      id_processo_tanque: 101,
      action: ProcessoAuxiliarSafetyAction.LIGAR_BOMBA_AUXILIAR,
      origin: ProcessoAuxiliarSafetyOrigin.AUTOMACAO,
      expected_subsystem_version: 4,
      expected_tank_version: 3,
      evaluated_at: NOW,
    });

    expect(result.approved).toBe(true);
    expect(result.id_bomba_auxiliar).toBe(2);
    expect(result.id_valvula_auxiliar).toBe(12);
    expect(result.checks.every((check) => check.permitted)).toBe(true);
  });

  it('bloqueia energizacao automatica no modo manual', async () => {
    const context = buildContext();
    context.modo_operacao_auxiliar = modooperacaoauxiliar.MANUAL;
    const validator = createValidator(context);

    const result = await validator.evaluate({
      id_processo: 10,
      id_processo_tanque: 101,
      action: ProcessoAuxiliarSafetyAction.LIGAR_BOMBA_AUXILIAR,
      origin: ProcessoAuxiliarSafetyOrigin.AUTOMACAO,
      evaluated_at: NOW,
    });

    expect(result.approved).toBe(false);
    expect(
      result.checks.find((check) => check.code === 'OPERATION_MODE')?.permitted,
    ).toBe(false);
  });

  it('aprova comando humano assistido quando o usuario possui lease ativo', async () => {
    const context = buildContext();
    context.modo_operacao_auxiliar = modooperacaoauxiliar.ASSISTIDO;
    context.processostanques[0].processostanquesauxiliares!.id_usuario_controle_valvula = 7;
    context.processostanques[0].processostanquesauxiliares!.controle_valvula_expira_em =
      new Date('2026-07-16T12:05:00.000Z');
    const validator = createValidator(context);

    const result = await validator.evaluate({
      id_processo: 10,
      id_processo_tanque: 101,
      id_usuario: 7,
      action: ProcessoAuxiliarSafetyAction.ABRIR_VALVULA_AUXILIAR,
      origin: ProcessoAuxiliarSafetyOrigin.USUARIO,
      evaluated_at: NOW,
    });

    expect(result.approved).toBe(true);
    expect(result.codigo_valvula_auxiliar).toBe('VA_T1');
  });

  it('bloqueia abertura quando outro tanque tem valvula aberta e existe lease alheio', async () => {
    const context = buildContext();
    context.modo_operacao_auxiliar = modooperacaoauxiliar.ASSISTIDO;
    context.processostanques[0].tanques.valvulas[1].status_valvula =
      StatusValvula.FECHADA;
    context.processostanques[0].processostanquesauxiliares!.id_usuario_controle_valvula = 99;
    context.processostanques[0].processostanquesauxiliares!.controle_valvula_expira_em =
      new Date('2026-07-16T12:05:00.000Z');
    context.processostanques[1].tanques.valvulas[1].status_valvula =
      StatusValvula.ABERTA;
    const validator = createValidator(context);

    const result = await validator.evaluate({
      id_processo: 10,
      id_processo_tanque: 101,
      id_usuario: 7,
      action: ProcessoAuxiliarSafetyAction.ABRIR_VALVULA_AUXILIAR,
      origin: ProcessoAuxiliarSafetyOrigin.USUARIO,
      evaluated_at: NOW,
    });

    expect(result.approved).toBe(false);
    expect(
      result.checks.find((check) => check.code === 'VALVULA_CONTROL_OWNERSHIP')
        ?.permitted,
    ).toBe(false);
    expect(
      result.checks.find(
        (check) => check.code === 'AUXILIARY_VALVE_EXCLUSIVITY',
      )?.permitted,
    ).toBe(false);
  });

  it('permite desligamento humano seguro mesmo com emergencia no modo automatico', async () => {
    const context = buildContext();
    context.parada_emergencia = true;
    context.alarmes = [{ id_alarme: 55 }];
    context.status_processo = statusprocesso.FALHA;
    context.processosauxiliares!.status_subsistema =
      statussubsistemaauxiliar.FALHA;
    const validator = createValidator(context);

    const result = await validator.evaluate({
      id_processo: 10,
      id_usuario: 7,
      action: ProcessoAuxiliarSafetyAction.DESLIGAR_BOMBA_AUXILIAR,
      origin: ProcessoAuxiliarSafetyOrigin.USUARIO,
      evaluated_at: NOW,
    });

    expect(result.approved).toBe(true);
  });

  it('bloqueia fechamento sem confirmacao recente de bomba desligada', async () => {
    const context = buildContext();
    context.modo_operacao_auxiliar = modooperacaoauxiliar.ASSISTIDO;
    context.processostanques[0].tanques.valvulas[1].bombas.ultimo_status_hardware_em =
      new Date('2026-07-16T11:00:00.000Z');
    context.processostanques[1].tanques.valvulas[1].bombas.ultimo_status_hardware_em =
      new Date('2026-07-16T11:00:00.000Z');
    const validator = createValidator(context);

    const result = await validator.evaluate({
      id_processo: 10,
      id_processo_tanque: 101,
      id_usuario: 7,
      action: ProcessoAuxiliarSafetyAction.FECHAR_VALVULA_AUXILIAR,
      origin: ProcessoAuxiliarSafetyOrigin.USUARIO,
      evaluated_at: NOW,
    });

    expect(result.approved).toBe(false);
    expect(
      result.checks.find((check) => check.code === 'AUXILIARY_PUMP_STOPPED')
        ?.permitted,
    ).toBe(false);
    await expect(
      validator.assertAllowed({
        id_processo: 10,
        id_processo_tanque: 101,
        id_usuario: 7,
        action: ProcessoAuxiliarSafetyAction.FECHAR_VALVULA_AUXILIAR,
        origin: ProcessoAuxiliarSafetyOrigin.USUARIO,
        evaluated_at: NOW,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
