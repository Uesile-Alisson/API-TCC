import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ALARME_MESSAGES, ALARME_NOTIFICATION_POLICIES } from '../constants';
import type {
  AlarmeDashboard,
  AlarmeDetails,
  AlarmeListResponse,
  AlarmeNotificationPayload,
  AlarmeOrigin,
  AlarmePaginationMeta,
  AlarmeResponse,
  AlarmeSeverity,
  AlarmeStatus,
  AlarmeType,
  ResolveAlarmeResult,
} from '../interfaces';

type DecimalLike = Prisma.Decimal | number | string | null | undefined;

interface RawAlarmeRecord {
  id_alarme: number;
  id_mqtt_mensagem: number | null;
  id_usuario_responsavel: number | null;
  titulo: string;
  descricao: string;
  tipo_alarme: string;
  severidade: string;
  status_alarme: string;
  origem_alarme: string;
  valor_detectado: DecimalLike;
  unidade: string | null;
  ocorrido_em: Date;
  normalizado_em?: Date | null;
  resolvido_em: Date | null;
  motivo_resolucao?: string | null;
  tentativas_recuperacao?: number;
  ultima_tentativa_recuperacao_em?: Date | null;
  ultima_validacao_em?: Date | null;
  bloqueante?: boolean;
  requer_intervencao?: boolean;
  recuperacao_automatica?: boolean;
  excluido_em: Date | null;
  id_processo: number | null;
  id_processo_tanque: number | null;
  id_processo_tanque_sensor: number | null;
  reconhecimentos?: Array<{
    id_alarme_reconhecimento: number;
    id_usuario: number;
    reconhecido_em: Date;
    observacao: string | null;
    status_processo_snapshot: string | null;
    fase_processo_snapshot: string | null;
  }>;
}

interface RawAlarmeDetailsRecord extends RawAlarmeRecord {
  processos?: {
    id_processo: number;
    nome_processo: string | null;
    status_processo: string;
    fase_processo?: string | null;
    vacuo_alvo?: DecimalLike;
    iniciado_em?: Date | null;
    finalizado_em?: Date | null;
  } | null;
  processostanques?: {
    id_processo_tanque: number;
    id_tanque: number;
    vacuo_alvo?: DecimalLike;
    status_tanque_processo?: string | null;
    tanques?: {
      nome: string | null;
    } | null;
  } | null;
  processostanquessensores?: {
    id_processo_tanque_sensor: number;
    id_sensor: number;
    sensores?: {
      nome: string | null;
      modelo: string | null;
      unidade_medida: string | null;
      status_sensor: string | null;
    } | null;
  } | null;
  mqttmensagens?: {
    id_mqtt_mensagem: number;
    topico: string;
    direcao: string;
    origem: string;
    criado_em: Date;
  } | null;
  usuarios?: {
    id_usuario: number;
    nome: string;
  } | null;
}

interface RawAlarmeDashboardInput {
  total: number;
  ativos: number;
  resolvidos: number;
  criticos: number;
  medios: number;
  infos: number;
  por_severidade: Array<{ severidade: string; total: number }>;
  por_status: Array<{ status_alarme: string; total: number }>;
  por_tipo: Array<{ tipo_alarme: string; total: number }>;
  por_origem: Array<{ origem_alarme: string; total: number }>;
  ultimos_criticos: RawAlarmeRecord[];
  ultimos_ativos: RawAlarmeRecord[];
}

@Injectable()
export class AlarmeMapper {
  decimalToNumber(value: DecimalLike): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);

      return Number.isFinite(parsed) ? parsed : null;
    }

    const parsed = value.toNumber();

    return Number.isFinite(parsed) ? parsed : null;
  }

  toResponse(alarme: RawAlarmeRecord): AlarmeResponse {
    return {
      id_alarme: alarme.id_alarme,
      titulo: alarme.titulo,
      descricao: alarme.descricao,
      tipo_alarme: this.toAlarmeType(alarme.tipo_alarme),
      severidade: this.toAlarmeSeverity(alarme.severidade),
      status_alarme: this.toAlarmeStatus(alarme.status_alarme),
      origem_alarme: this.toAlarmeOrigin(alarme.origem_alarme),
      valor_detectado: this.decimalToNumber(alarme.valor_detectado),
      unidade: alarme.unidade,
      ocorrido_em: alarme.ocorrido_em,
      normalizado_em: alarme.normalizado_em ?? null,
      resolvido_em: alarme.resolvido_em,
      motivo_resolucao: alarme.motivo_resolucao ?? null,
      bloqueante: alarme.bloqueante ?? false,
      requer_intervencao: alarme.requer_intervencao ?? false,
      recuperacao_automatica: alarme.recuperacao_automatica ?? false,
      tentativas_recuperacao: alarme.tentativas_recuperacao ?? 0,
      ultima_tentativa_recuperacao_em:
        alarme.ultima_tentativa_recuperacao_em ?? null,
      ultima_validacao_em: alarme.ultima_validacao_em ?? null,
      reconhecido: (alarme.reconhecimentos?.length ?? 0) > 0,
      ultimo_reconhecimento_em:
        alarme.reconhecimentos?.[0]?.reconhecido_em ?? null,
      excluido_em: alarme.excluido_em,
      id_processo: alarme.id_processo,
      id_processo_tanque: alarme.id_processo_tanque,
      id_processo_tanque_sensor: alarme.id_processo_tanque_sensor,
      id_mqtt_mensagem: alarme.id_mqtt_mensagem,
      id_usuario_responsavel: alarme.id_usuario_responsavel,
    };
  }

  toDetails(alarme: RawAlarmeDetailsRecord): AlarmeDetails {
    return {
      ...this.toResponse(alarme),
      processo: alarme.processos
        ? {
            id_processo: alarme.processos.id_processo,
            nome_processo: alarme.processos.nome_processo,
            status_processo: alarme.processos.status_processo,
            fase_processo: alarme.processos.fase_processo ?? null,
            vacuo_alvo: this.decimalToNumber(alarme.processos.vacuo_alvo),
            iniciado_em: alarme.processos.iniciado_em ?? null,
            finalizado_em: alarme.processos.finalizado_em ?? null,
          }
        : null,
      processo_tanque: alarme.processostanques
        ? {
            id_processo_tanque: alarme.processostanques.id_processo_tanque,
            id_tanque: alarme.processostanques.id_tanque,
            nome_tanque: alarme.processostanques.tanques?.nome ?? null,
            status_tanque_processo:
              alarme.processostanques.status_tanque_processo ?? null,
            vacuo_alvo: this.decimalToNumber(
              alarme.processostanques.vacuo_alvo,
            ),
          }
        : null,
      processo_tanque_sensor: alarme.processostanquessensores
        ? {
            id_processo_tanque_sensor:
              alarme.processostanquessensores.id_processo_tanque_sensor,
            id_sensor: alarme.processostanquessensores.id_sensor,
            nome_sensor: alarme.processostanquessensores.sensores?.nome ?? null,
            modelo_sensor:
              alarme.processostanquessensores.sensores?.modelo ?? null,
            unidade_medida:
              alarme.processostanquessensores.sensores?.unidade_medida ?? null,
            status_sensor:
              alarme.processostanquessensores.sensores?.status_sensor ?? null,
          }
        : null,
      mqtt_mensagem: alarme.mqttmensagens
        ? {
            id_mqtt_mensagem: alarme.mqttmensagens.id_mqtt_mensagem,
            topico: alarme.mqttmensagens.topico,
            direcao: alarme.mqttmensagens.direcao,
            origem: alarme.mqttmensagens.origem,
            criado_em: alarme.mqttmensagens.criado_em,
          }
        : null,
      usuario_responsavel: alarme.usuarios
        ? {
            id_usuario: alarme.usuarios.id_usuario,
            nome: alarme.usuarios.nome,
          }
        : null,
    };
  }

  toListResponse(
    alarmes: RawAlarmeRecord[],
    total: number,
    page: number,
    limit: number,
  ): AlarmeListResponse {
    const safeLimit = Number.isFinite(limit) && limit >= 1 ? limit : 1;
    const safePage = Number.isFinite(page) && page >= 1 ? page : 1;
    const safeTotal = Number.isFinite(total) && total >= 0 ? total : 0;
    const totalPages = safeTotal === 0 ? 0 : Math.ceil(safeTotal / safeLimit);
    const meta: AlarmePaginationMeta = {
      page: safePage,
      limit: safeLimit,
      total: safeTotal,
      total_pages: totalPages,
      has_next_page: safePage < totalPages,
      has_previous_page: safePage > 1,
    };

    return {
      data: alarmes.map((alarme) => this.toResponse(alarme)),
      meta,
    };
  }

  toNotificationPayload(alarme: RawAlarmeRecord): AlarmeNotificationPayload {
    const severidade = this.toAlarmeSeverity(alarme.severidade);

    return {
      id_alarme: alarme.id_alarme,
      titulo: alarme.titulo,
      descricao: alarme.descricao,
      severidade,
      status_alarme: this.toAlarmeStatus(alarme.status_alarme),
      ocorrido_em: alarme.ocorrido_em,
      policy:
        ALARME_NOTIFICATION_POLICIES[severidade] ??
        ALARME_NOTIFICATION_POLICIES.INFO,
      emitted_at: new Date(),
    };
  }

  toResolveResult(
    alarme: RawAlarmeRecord,
    id_usuario_responsavel: number,
  ): ResolveAlarmeResult {
    const occurredAt = new Date();

    return {
      success: true,
      id_alarme: alarme.id_alarme,
      action: 'RESOLVED',
      message: ALARME_MESSAGES.RESOLVED,
      occurred_at: occurredAt,
      status_alarme: 'RESOLVIDO',
      resolvido_em: alarme.resolvido_em ?? occurredAt,
      id_usuario_responsavel,
    };
  }

  toDashboard(input: RawAlarmeDashboardInput): AlarmeDashboard {
    return {
      total: input.total,
      ativos: input.ativos,
      resolvidos: input.resolvidos,
      criticos: input.criticos,
      medios: input.medios,
      infos: input.infos,
      por_severidade: input.por_severidade.map((item) => ({
        severidade: this.toAlarmeSeverity(item.severidade),
        total: item.total,
      })),
      por_status: input.por_status.map((item) => ({
        status_alarme: this.toAlarmeStatus(item.status_alarme),
        total: item.total,
      })),
      por_tipo: input.por_tipo.map((item) => ({
        tipo_alarme: this.toAlarmeType(item.tipo_alarme),
        total: item.total,
      })),
      por_origem: input.por_origem.map((item) => ({
        origem_alarme: this.toAlarmeOrigin(item.origem_alarme),
        total: item.total,
      })),
      ultimos_criticos: input.ultimos_criticos.map((alarme) =>
        this.toResponse(alarme),
      ),
      ultimos_ativos: input.ultimos_ativos.map((alarme) =>
        this.toResponse(alarme),
      ),
      generated_at: new Date(),
    };
  }

  private toAlarmeSeverity(value: string): AlarmeSeverity {
    switch (value) {
      case 'MEDIO':
      case 'CRITICO':
      case 'INFO':
        return value;
      default:
        return 'INFO';
    }
  }

  private toAlarmeStatus(value: string): AlarmeStatus {
    switch (value) {
      case 'RESOLVIDO':
        return 'RESOLVIDO';
      case 'NORMALIZADO':
        return 'NORMALIZADO';
      case 'ATIVO':
      default:
        return 'ATIVO';
    }
  }

  private toAlarmeType(value: string): AlarmeType {
    switch (value) {
      case 'SENSOR':
      case 'BOMBA':
      case 'MQTT':
      case 'ESP32':
      case 'PROCESSO':
      case 'SEGURANCA':
      case 'TANQUE':
      case 'FLUXO':
      case 'NIVEL':
      case 'VALVULA':
      case 'MANGUEIRA':
        return value;
      case 'SISTEMA':
      default:
        return 'SISTEMA';
    }
  }

  private toAlarmeOrigin(value: string): AlarmeOrigin {
    switch (value) {
      case 'SENSOR':
      case 'ESP32':
      case 'MQTT':
      case 'BACKEND':
      case 'USUARIO':
        return value;
      case 'SISTEMA':
      default:
        return 'SISTEMA';
    }
  }
}
