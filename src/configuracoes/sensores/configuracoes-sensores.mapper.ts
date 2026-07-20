import { Prisma, statusintegridadesensor } from '@prisma/client';
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
  offset_calibracao: true,
  status_integridade: true,
  ultimo_valor_bruto: true,
  calibrado_em: true,
  calibracao_valida_ate: true,
  calibracao_referencia: true,
  calibracao_incerteza: true,
  calibracao_observacoes: true,
  id_usuario_calibracao: true,
  liberado_em: true,
  id_usuario_liberacao: true,
  integridade_validada_em: true,
  integridade_ultimo_erro: true,
  modo_calibracao_ativo: true,
  calibracao_iniciada_em: true,
  limite_minimo_operacional: true,
  limite_maximo_operacional: true,
  variacao_maxima_por_segundo: true,
  oscilacao_maxima: true,
  tempo_travado_segundos: true,
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
      fator_calibracao: record.fator_calibracao?.toNumber() ?? 1,
      offset_calibracao: record.offset_calibracao?.toNumber() ?? 0,
      status_integridade:
        record.status_integridade ??
        statusintegridadesensor.PENDENTE_CALIBRACAO,
      ultimo_valor_bruto: record.ultimo_valor_bruto?.toNumber() ?? null,
      calibrado_em: record.calibrado_em,
      calibracao_valida_ate: record.calibracao_valida_ate,
      calibracao_referencia: record.calibracao_referencia,
      calibracao_incerteza: record.calibracao_incerteza?.toNumber() ?? null,
      calibracao_observacoes: record.calibracao_observacoes,
      id_usuario_calibracao: record.id_usuario_calibracao,
      liberado_em: record.liberado_em,
      id_usuario_liberacao: record.id_usuario_liberacao,
      integridade_validada_em: record.integridade_validada_em,
      integridade_ultimo_erro: record.integridade_ultimo_erro,
      modo_calibracao_ativo: record.modo_calibracao_ativo ?? false,
      calibracao_iniciada_em: record.calibracao_iniciada_em,
      limite_minimo_operacional:
        record.limite_minimo_operacional?.toNumber() ?? null,
      limite_maximo_operacional:
        record.limite_maximo_operacional?.toNumber() ?? null,
      variacao_maxima_por_segundo:
        record.variacao_maxima_por_segundo?.toNumber() ?? null,
      oscilacao_maxima: record.oscilacao_maxima?.toNumber() ?? null,
      tempo_travado_segundos: record.tempo_travado_segundos ?? 60,
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
      status_integridade: record.status_integridade,
      unidade_medida: record.unidade_medida,
    };
  }
}
