import type {
  AlarmeOrigin,
  AlarmeResponse,
  AlarmeSeverity,
  AlarmeStatus,
  AlarmeType,
} from './alarme-response.interface';

export interface AlarmeCountBySeverity {
  severidade: AlarmeSeverity;
  total: number;
}

export interface AlarmeCountByStatus {
  status_alarme: AlarmeStatus;
  total: number;
}

export interface AlarmeCountByType {
  tipo_alarme: AlarmeType;
  total: number;
}

export interface AlarmeCountByOrigin {
  origem_alarme: AlarmeOrigin;
  total: number;
}

export interface AlarmeDashboard {
  total: number;
  ativos: number;
  resolvidos: number;
  criticos: number;
  medios: number;
  infos: number;
  por_severidade: AlarmeCountBySeverity[];
  por_status: AlarmeCountByStatus[];
  por_tipo: AlarmeCountByType[];
  por_origem: AlarmeCountByOrigin[];
  ultimos_criticos: AlarmeResponse[];
  ultimos_ativos: AlarmeResponse[];
  generated_at: Date;
}
