import { Prisma } from '@prisma/client';
import { SensorConfiguracaoResponseDto } from './dto/sensor-configuracao-response.dto';
import { SensorProcessoOptionResponseDto } from './dto/sensor-processo-option-response.dto';

export const sensorConfiguracaoSelect = {
  id_sensor: true,
  nome: true,
  modelo: true,
  protocolo: true,
  unidade_medida: true,
  precisao: true,
  status_sensor: true,
  tipo_sensor: true,
  fator_calibracao: true,
  criado_em: true,
} satisfies Prisma.sensoresSelect;

export type SensorConfiguracaoRecord = Prisma.sensoresGetPayload<{
  select: typeof sensorConfiguracaoSelect;
}>;

export class ConfiguracoesSensoresMapper {
  static toResponse(
    record: SensorConfiguracaoRecord,
  ): SensorConfiguracaoResponseDto {
    return {
      id_sensor: record.id_sensor,
      nome: record.nome,
      modelo: record.modelo,
      protocolo: record.protocolo,
      unidade_medida: record.unidade_medida,
      precisao: record.precisao?.toNumber() ?? null,
      status_sensor: record.status_sensor,
      tipo_sensor: record.tipo_sensor,
      fator_calibracao: record.fator_calibracao?.toNumber() ?? null,
      criado_em: record.criado_em,
    };
  }

  static toProcessoOption(
    record: SensorConfiguracaoRecord,
    id_tanque: number,
  ): SensorProcessoOptionResponseDto {
    return {
      id_sensor: record.id_sensor,
      id_tanque,
      label: `${record.nome} - ${record.modelo}`,
      nome: record.nome,
      modelo: record.modelo,
      tipo_sensor: record.tipo_sensor,
      status_sensor: record.status_sensor,
      unidade_medida: record.unidade_medida,
    };
  }
}
