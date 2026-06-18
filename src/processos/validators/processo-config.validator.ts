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
