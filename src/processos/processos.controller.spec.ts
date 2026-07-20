import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { modooperacaoauxiliar, nivelacesso } from '@prisma/client';
import { ProcessosController } from './processos.controller';
import {
  ProcessoGeneralClosureService,
  ProcessoTanqueClosureService,
} from './lifecycle';
import { ProcessosService } from './processos.service';

type ProcessosServiceMock = {
  create: jest.Mock;
  list: jest.Mock;
  findActive: jest.Mock;
  findById: jest.Mock;
  getDashboard: jest.Mock;
  getAuxiliaryState: jest.Mock;
  acquireAuxiliaryPumpControl: jest.Mock;
  releaseAuxiliaryPumpControl: jest.Mock;
  acquireAuxiliaryValveControl: jest.Mock;
  releaseAuxiliaryValveControl: jest.Mock;
  turnOnAuxiliaryPump: jest.Mock;
  turnOffAuxiliaryPump: jest.Mock;
  openAuxiliaryValve: jest.Mock;
  closeAuxiliaryValve: jest.Mock;
  updateConfig: jest.Mock;
  start: jest.Mock;
  pause: jest.Mock;
  resume: jest.Mock;
  finish: jest.Mock;
  interrupt: jest.Mock;
  emergencyStop: jest.Mock;
};

describe('ProcessosController', () => {
  let controller: ProcessosController;
  let service: ProcessosServiceMock;
  let closureService: { startManual: jest.Mock };
  let generalClosureService: {
    getState: jest.Mock;
    getEmergencyState: jest.Mock;
    startManual: jest.Mock;
  };

  const user = {
    id_usuario: 7,
    login: 'tecnico',
    id_nivel_acesso: 2,
    nivel_acesso: {
      nome: nivelacesso.TECNICO,
    },
  };

  beforeEach(() => {
    service = {
      create: jest.fn(),
      list: jest.fn(),
      findActive: jest.fn(),
      findById: jest.fn(),
      getDashboard: jest.fn(),
      getAuxiliaryState: jest.fn(),
      acquireAuxiliaryPumpControl: jest.fn(),
      releaseAuxiliaryPumpControl: jest.fn(),
      acquireAuxiliaryValveControl: jest.fn(),
      releaseAuxiliaryValveControl: jest.fn(),
      turnOnAuxiliaryPump: jest.fn(),
      turnOffAuxiliaryPump: jest.fn(),
      openAuxiliaryValve: jest.fn(),
      closeAuxiliaryValve: jest.fn(),
      updateConfig: jest.fn(),
      start: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      finish: jest.fn(),
      interrupt: jest.fn(),
      emergencyStop: jest.fn(),
    };
    closureService = { startManual: jest.fn() };
    generalClosureService = {
      getState: jest.fn().mockResolvedValue({ versao: 9 }),
      getEmergencyState: jest.fn().mockResolvedValue({
        ativa: true,
        status: 'AGUARDANDO_CONFIRMACAO',
        hardware_confirmado: false,
      }),
      startManual: jest.fn(),
    };
    controller = new ProcessosController(
      service as unknown as ProcessosService,
      closureService as unknown as ProcessoTanqueClosureService,
      generalClosureService as unknown as ProcessoGeneralClosureService,
    );
  });

  it('startTankClosure encaminha versao, motivo e usuario autenticado', async () => {
    const dto = { expected_version: 4, motivo: 'Tanque estabilizado.' };

    await controller.startTankClosure(10, 20, dto, user);

    expect(closureService.startManual).toHaveBeenCalledWith({
      id_processo: 10,
      id_processo_tanque: 20,
      dto,
      user: expect.objectContaining({ sub: 7 }),
    });
  });

  it('controller definido', () => {
    expect(controller).toBeDefined();
  });

  it('getEmergencyStopState consulta o snapshot fisico recuperavel', async () => {
    await controller.getEmergencyStopState(10);

    expect(generalClosureService.getEmergencyState).toHaveBeenCalledWith(10);
  });

  it('create chama service.create', async () => {
    const dto = {
      tempo_maximo: 60,
      vacuo_alvo: -80,
      modo_operacao_auxiliar: modooperacaoauxiliar.AUTOMATICO,
      encerramento_automatico: true,
      tanques: [
        {
          id_tanque: 1,
          sensores: [{ id_sensor: 1 }],
        },
      ],
    };

    await controller.create(dto, user);

    expect(service.create).toHaveBeenCalledWith(
      dto,
      expect.objectContaining({
        sub: 7,
        nivel_acesso: nivelacesso.TECNICO,
      }),
    );
  });

  it('list chama service.list', async () => {
    const query = { page: 1, limit: 10 };

    await controller.list(query);

    expect(service.list).toHaveBeenCalledWith(query);
  });

  it('findActive chama service.findActive', async () => {
    await controller.findActive();

    expect(service.findActive).toHaveBeenCalledWith();
  });

  it('findById chama service.findById', async () => {
    await controller.findById(10);

    expect(service.findById).toHaveBeenCalledWith(10);
  });

  it('getDashboard chama service.getDashboard', async () => {
    await controller.getDashboard(10);

    expect(service.getDashboard).toHaveBeenCalledWith(10);
  });

  it('getGeneralClosure consulta o estado HTTP recuperavel', async () => {
    await controller.getGeneralClosure(10);

    expect(generalClosureService.getState).toHaveBeenCalledWith(10);
  });

  it('getAuxiliaryState chama service.getAuxiliaryState', async () => {
    await controller.getAuxiliaryState(10);

    expect(service.getAuxiliaryState).toHaveBeenCalledWith(10);
  });

  it('openAuxiliaryValve encaminha versoes e usuario autenticado', async () => {
    const dto = {
      expected_subsystem_version: 5,
      expected_tank_version: 3,
      motivo: 'Intervencao supervisionada.',
    };

    await controller.openAuxiliaryValve(10, 20, dto, user);

    expect(service.openAuxiliaryValve).toHaveBeenCalledWith(
      10,
      20,
      dto,
      expect.objectContaining({
        sub: 7,
        nivel_acesso: nivelacesso.TECNICO,
      }),
    );
  });

  it('updateConfig chama service.updateConfig', async () => {
    const dto = { tempo_maximo: 120 };

    await controller.updateConfig(10, dto, user);

    expect(service.updateConfig).toHaveBeenCalledWith(
      10,
      dto,
      expect.objectContaining({
        sub: 7,
      }),
    );
  });

  it('start chama service.start', async () => {
    await controller.start(10, user);

    expect(service.start).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        sub: 7,
      }),
    );
  });

  it('pause chama service.pause', async () => {
    await controller.pause(10, user);

    expect(service.pause).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        sub: 7,
      }),
    );
  });

  it('resume chama service.resume', async () => {
    await controller.resume(10, user);

    expect(service.resume).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        sub: 7,
      }),
    );
  });

  it('finish redireciona a rota legada para o encerramento geral seguro', async () => {
    const dto = { observacao: 'Processo finalizado sem falhas.' };

    await controller.finish(10, dto, user);

    expect(generalClosureService.getState).toHaveBeenCalledWith(10);
    expect(generalClosureService.startManual).toHaveBeenCalledWith({
      id_processo: 10,
      dto: {
        expected_version: 9,
        motivo: dto.observacao,
      },
      user: expect.objectContaining({ sub: 7 }),
    });
  });

  it('startGeneralClosure encaminha versao, motivo e usuario', async () => {
    const dto = { expected_version: 5, motivo: 'Finalizar com seguranca.' };

    await controller.startGeneralClosure(10, dto, user);

    expect(generalClosureService.startManual).toHaveBeenCalledWith({
      id_processo: 10,
      dto,
      user: expect.objectContaining({ sub: 7 }),
    });
  });

  it('interrupt chama service.interrupt', async () => {
    const dto = { motivo: 'Interrupcao operacional.' };

    await controller.interrupt(10, dto, user);

    expect(service.interrupt).toHaveBeenCalledWith(
      10,
      dto,
      expect.objectContaining({
        sub: 7,
      }),
    );
  });

  it('emergencyStop chama service.emergencyStop', async () => {
    const dto = { motivo: 'Falha critica' };

    await controller.emergencyStop(10, dto, user);

    expect(service.emergencyStop).toHaveBeenCalledWith(
      10,
      dto,
      expect.objectContaining({
        sub: 7,
      }),
    );
  });
});
