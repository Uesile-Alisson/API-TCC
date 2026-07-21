import { BadRequestException, Injectable } from '@nestjs/common';
import { modooperacaoauxiliar } from '@prisma/client';
import {
  CreateProcessoDTO,
  CreateProcessoTanqueDTO,
  UpdateProcessoConfigDTO,
  UpdateProcessoTanqueDTO,
} from '../dto';

type ProcessoConfigDTO = CreateProcessoDTO | UpdateProcessoConfigDTO;

@Injectable()
export class ProcessoConfigValidator {
  private readonly minTanques = 1;
  private readonly maxTanques = 3;

  validateCreate(dto: CreateProcessoDTO) {
    this.validateTempoMaximo(dto.tempo_maximo);
    this.validateVacuoAlvo(dto.vacuo_alvo, 'vacuo_alvo');
    this.validateAuxiliaryMode(dto.modo_operacao_auxiliar, true);
    this.validateAutomaticClosure(dto.encerramento_automatico, true);
    this.validateOperationalParameters(dto);
    this.validateTanques(dto.tanques, true);
  }

  validateUpdate(dto: UpdateProcessoConfigDTO): void {
    if (dto.tempo_maximo !== undefined) {
      this.validateTempoMaximo(dto.tempo_maximo);
    }

    if (dto.vacuo_alvo !== undefined) {
      this.validateVacuoAlvo(dto.vacuo_alvo, 'vacuo_alvo');
    }

    this.validateAuxiliaryMode(dto.modo_operacao_auxiliar, false);
    this.validateAutomaticClosure(dto.encerramento_automatico, false);
    this.validateOperationalParameters(dto);

    if (dto.tanques !== undefined) {
      this.validateTanques(dto.tanques, true);
    }

    this.vaildateAtLeastOneField(dto);
  }

  private vaildateAtLeastOneField(dto: ProcessoConfigDTO): void {
    const hasAsyncField =
      dto.nome_processo !== undefined ||
      dto.tempo_maximo !== undefined ||
      dto.vacuo_alvo !== undefined ||
      dto.modo_operacao_auxiliar !== undefined ||
      dto.encerramento_automatico !== undefined ||
      dto.estagnacao_janela_segundos !== undefined ||
      dto.estagnacao_variacao_minima !== undefined ||
      dto.estagnacao_leituras_minimas !== undefined ||
      dto.estagnacao_janelas_consecutivas !== undefined ||
      dto.estagnacao_tempo_minimo_bomba_principal_segundos !== undefined ||
      dto.estagnacao_tempo_maximo_sem_progresso_segundos !== undefined ||
      dto.estagnacao_fator_minimo_proximidade_alvo !== undefined ||
      dto.auxilio_janela_avaliacao_segundos !== undefined ||
      dto.auxilio_melhoria_minima !== undefined ||
      dto.auxilio_timeout_segundos !== undefined ||
      dto.tanques !== undefined;

    if (!hasAsyncField) {
      throw new BadRequestException(
        'Informe pelo menos um campo para atualizar a configuração do processo.',
      );
    }
  }

  private validateTempoMaximo(tempoMaximo: number | undefined): void {
    if (tempoMaximo === undefined || tempoMaximo === null) {
      throw new BadRequestException('O tempo máximo é obrigatório.');
    }

    if (!Number.isInteger(tempoMaximo)) {
      throw new BadRequestException(
        'O tempo máximo deve ser um número inteiro.',
      );
    }

    if (tempoMaximo <= 0) {
      throw new BadRequestException(
        'O tempo máximo deve ser maior do que zero.',
      );
    }
  }

  private validateAuxiliaryMode(
    mode: modooperacaoauxiliar | undefined,
    required: boolean,
  ): void {
    if (mode === undefined || mode === null) {
      if (required) {
        throw new BadRequestException(
          'O modo de operacao do subsistema auxiliar e obrigatorio.',
        );
      }

      return;
    }

    if (!Object.values(modooperacaoauxiliar).includes(mode)) {
      throw new BadRequestException(
        'Modo de operacao auxiliar invalido. Use AUTOMATICO, ASSISTIDO ou MANUAL.',
      );
    }
  }

  private validateAutomaticClosure(
    enabled: boolean | undefined,
    required: boolean,
  ): void {
    if (enabled === undefined || enabled === null) {
      if (required) {
        throw new BadRequestException(
          'A configuracao de encerramento automatico e obrigatoria.',
        );
      }

      return;
    }

    if (typeof enabled !== 'boolean') {
      throw new BadRequestException(
        'encerramento_automatico deve ser booleano.',
      );
    }
  }

  private validateOperationalParameters(dto: ProcessoConfigDTO): void {
    const positiveIntegers: Array<[string, number | undefined, number]> = [
      ['estagnacao_janela_segundos', dto.estagnacao_janela_segundos, 10],
      ['estagnacao_leituras_minimas', dto.estagnacao_leituras_minimas, 3],
      [
        'estagnacao_janelas_consecutivas',
        dto.estagnacao_janelas_consecutivas,
        1,
      ],
      [
        'estagnacao_tempo_minimo_bomba_principal_segundos',
        dto.estagnacao_tempo_minimo_bomba_principal_segundos,
        0,
      ],
      [
        'estagnacao_tempo_maximo_sem_progresso_segundos',
        dto.estagnacao_tempo_maximo_sem_progresso_segundos,
        10,
      ],
      [
        'auxilio_janela_avaliacao_segundos',
        dto.auxilio_janela_avaliacao_segundos,
        5,
      ],
      ['auxilio_timeout_segundos', dto.auxilio_timeout_segundos, 10],
    ];

    for (const [field, value, minimum] of positiveIntegers) {
      if (
        value !== undefined &&
        (!Number.isInteger(value) || value < minimum)
      ) {
        throw new BadRequestException(
          `${field} deve ser inteiro e maior ou igual a ${minimum}.`,
        );
      }
    }

    const decimals: Array<[string, number | undefined, number, number]> = [
      ['estagnacao_variacao_minima', dto.estagnacao_variacao_minima, 0, 1000],
      [
        'estagnacao_fator_minimo_proximidade_alvo',
        dto.estagnacao_fator_minimo_proximidade_alvo,
        0.05,
        1,
      ],
      ['auxilio_melhoria_minima', dto.auxilio_melhoria_minima, 0.001, 1000],
    ];

    for (const [field, value, minimum, maximum] of decimals) {
      if (
        value !== undefined &&
        (!Number.isFinite(value) || value < minimum || value > maximum)
      ) {
        throw new BadRequestException(
          `${field} deve estar entre ${minimum} e ${maximum}.`,
        );
      }
    }

    if (
      dto.auxilio_timeout_segundos !== undefined &&
      dto.auxilio_janela_avaliacao_segundos !== undefined &&
      dto.auxilio_timeout_segundos < dto.auxilio_janela_avaliacao_segundos
    ) {
      throw new BadRequestException(
        'auxilio_timeout_segundos deve ser maior ou igual a auxilio_janela_avaliacao_segundos.',
      );
    }
  }

  private validateVacuoAlvo(
    vacuo_alvo: number | undefined,
    fieldname: string,
  ): void {
    if (vacuo_alvo === undefined || vacuo_alvo === null) {
      return;
    }

    if (!Number.isFinite(vacuo_alvo)) {
      throw new BadRequestException(`${fieldname} deve ser um número válido.`);
    }

    if (vacuo_alvo >= 0) {
      throw new BadRequestException(
        `${fieldname} deve ser menor que zero (pressao manometrica em kPa).`,
      );
    }
  }

  private validateTanques(
    tanques: Array<CreateProcessoTanqueDTO | UpdateProcessoTanqueDTO>,
    required: boolean,
  ): void {
    if (!tanques || tanques.length === 0) {
      if (required) {
        throw new BadRequestException(
          `O processo deve possuir pelo menos ${this.minTanques} tanque(s).`,
        );
      }

      return;
    }

    if (tanques.length < this.minTanques) {
      throw new BadRequestException(
        `O processo deve possuir pelo menos ${this.minTanques} tanque(s).`,
      );
    }

    if (tanques.length > this.maxTanques) {
      throw new BadRequestException(
        `O processo pode possuir no máximo ${this.maxTanques} tanques.`,
      );
    }

    this.validateTanquesDuplicados(tanques);
    this.validatePrioridades(tanques);
    this.validateSensoresPorTanque(tanques);
    this.validateSensoresDuplicadosNoProcesso(tanques);
  }

  private validatePrioridades(
    tanques: Array<CreateProcessoTanqueDTO | UpdateProcessoTanqueDTO>,
  ): void {
    const prioridadesInformadas = tanques.filter(
      (tanque) => tanque.prioridade !== undefined,
    );

    if (tanques.length === 1) {
      if (prioridadesInformadas.length > 0) {
        throw new BadRequestException(
          'Nao informe prioridade quando o processo possuir apenas um tanque.',
        );
      }

      return;
    }

    // Mantem compatibilidade com clientes anteriores. Quando o front optar
    // pela priorizacao, a ordem precisa ser completa para nao haver empate
    // acidental nem tanque com semantica indefinida.
    if (prioridadesInformadas.length === 0) {
      return;
    }

    if (prioridadesInformadas.length !== tanques.length) {
      throw new BadRequestException(
        'Ao configurar prioridades, informe a prioridade de todos os tanques do processo.',
      );
    }

    const prioridades = prioridadesInformadas.map(
      (tanque) => tanque.prioridade as number,
    );
    const quantidadeTanques = tanques.length;

    if (
      prioridades.some(
        (prioridade) =>
          !Number.isInteger(prioridade) ||
          prioridade < 1 ||
          prioridade > quantidadeTanques,
      )
    ) {
      throw new BadRequestException(
        `As prioridades devem ser numeros inteiros de 1 a ${quantidadeTanques}.`,
      );
    }

    if (new Set(prioridades).size !== prioridades.length) {
      throw new BadRequestException(
        'Cada tanque deve possuir uma prioridade diferente.',
      );
    }
  }

  private validateTanquesDuplicados(
    tanques: Array<CreateProcessoTanqueDTO | UpdateProcessoTanqueDTO>,
  ): void {
    const tanqueIds = new Set<number>();

    for (const tanque of tanques) {
      if (!tanque.id_tanque) {
        throw new BadRequestException(
          'Todos os tanques devem possuir id_tanque.',
        );
      }

      if (tanqueIds.has(tanque.id_tanque)) {
        throw new BadRequestException(
          `O tanque ${tanque.id_tanque} foi informado mais de uma vez.`,
        );
      }

      tanqueIds.add(tanque.id_tanque);

      this.validateVacuoAlvo(
        tanque.vacuo_alvo,
        `Vácuo alvo do tanque ${tanque.id_tanque}.`,
      );
    }
  }

  private validateSensoresPorTanque(
    tanques: Array<CreateProcessoTanqueDTO | UpdateProcessoTanqueDTO>,
  ): void {
    for (const tanque of tanques) {
      if (!tanque.sensores || tanque.sensores.length === 0) {
        throw new BadRequestException(
          `O tanque ${tanque.id_tanque} deve possuir pelo menos um sensor.`,
        );
      }

      const sensoresDoTanque = new Set<number>();

      for (const sensor of tanque.sensores) {
        if (!sensor.id_sensor) {
          throw new BadRequestException(
            `Todos os sensores do tanque ${tanque.id_tanque} devem possuir id_sensor.`,
          );
        }

        if (sensoresDoTanque.has(sensor.id_sensor)) {
          throw new BadRequestException(
            `O sensor ${sensor.id_sensor} foi informado mais de uma vez no tanque ${tanque.id_tanque}`,
          );
        }

        sensoresDoTanque.add(sensor.id_sensor);
      }
    }
  }

  private validateSensoresDuplicadosNoProcesso(
    tanques: Array<CreateProcessoTanqueDTO | UpdateProcessoTanqueDTO>,
  ): void {
    const sensorToTanqueMap = new Map<number, number>();

    for (const tanque of tanques) {
      for (const sensor of tanque.sensores ?? []) {
        const tanqueAnterior = sensorToTanqueMap.get(sensor.id_sensor);

        if (tanqueAnterior && tanqueAnterior !== tanque.id_tanque) {
          throw new BadRequestException(
            `O sensor ${sensor.id_sensor} foi associado aos tanques ${tanqueAnterior} e ${tanque.id_tanque}. Um sensor não pode operar em dois tanques no mesmo tempo.`,
          );
        }

        sensorToTanqueMap.set(sensor.id_sensor, tanque.id_tanque as number);
      }
    }
  }
}
