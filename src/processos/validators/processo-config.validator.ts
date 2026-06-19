import { BadRequestException, Injectable } from '@nestjs/common';
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
    this.validateTempoMaximo(dto.tempo_maximo)
    this.validateVacuoAlvo(dto.vacuo_alvo, 'vacuo_alvo')
    this.validateTanques(dto.tanques, true)
  }

  validateUpdate(dto: UpdateProcessoConfigDTO): void {
    if (dto.tempo_maximo !== undefined) {
      this.validateTempoMaximo(dto.tempo_maximo);
    }

    if (dto.vacuo_alvo !== undefined) {
      this.validateVacuoAlvo(dto.vacuo_alvo, 'vacuo_alvo');
    }

    if (dto.tanques !== undefined) {
      this.validateTanques(dto.tanques, true)
    }

    this.vaildateAtLeastOneField(dto)
  }

  private vaildateAtLeastOneField(dto: ProcessoConfigDTO): void {
    const hasAsyncField = dto.nome_processo !== undefined || dto.tempo_maximo !== undefined || dto.vacuo_alvo !== undefined || dto.tanques !== undefined;

    if (!hasAsyncField) {
      throw new BadRequestException('Informe pelo menos um campo para atualizar a configuração do processo.')
    }
  }

  private validateTempoMaximo(tempoMaximo: number | undefined): void {
    if (tempoMaximo === undefined || tempoMaximo === null) {
        throw new BadRequestException('O tempo máximo é obrigatório.')
    }

    if (!Number.isInteger(tempoMaximo)) {
      throw new BadRequestException('O tempo máximo deve ser um número inteiro.')
    }

    if (tempoMaximo <= 0) {
      throw new BadRequestException('O tempo máximo deve ser maior do que zero.')
    }
  }

  private validateVacuoAlvo(vacuo_alvo: number | undefined, fieldname: string): void {
    if (vacuo_alvo === undefined || vacuo_alvo === null) {
      return;
    }

    if (!Number.isFinite(vacuo_alvo)) {
      throw new BadRequestException(`${fieldname} deve ser um número válido.`);
    }
  }

  private validateTanques(tanques: Array<CreateProcessoTanqueDTO | UpdateProcessoTanqueDTO>, required: boolean): void {
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
    this.validateSensoresPorTanque(tanques);
    this.validateSensoresDuplicadosNoProcesso(tanques);
  }

  private validateTanquesDuplicados(tanques: Array<CreateProcessoTanqueDTO | UpdateProcessoTanqueDTO>): void {
    const tanqueIds = new Set<number>();

    for (const tanque of tanques) {
      if (!tanque.id_tanque) {
        throw new BadRequestException('Todos os tanques devem possuir id_tanque.');
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
