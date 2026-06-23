import type { statusprocesso } from '@prisma/client';

export interface HistoricoUsuarioResumo {
  id_usuario: number;
  nome: string;
}

export interface HistoricoProcessoListItem {
  id_processo: number;
  nome_processo: string | null;
  status_processo: statusprocesso;
  usuario_responsavel: HistoricoUsuarioResumo | null;
  quantidade_tanques: number;
  vacuo_alvo: number;
  vacuo_inicial: number | null;
  vacuo_final: number | null;
  vacuo_medio: number | null;
  eficiencia: number | null;
  tempo_maximo: number;
  tempo_execucao: number | null;
  iniciado_em: Date | null;
  finalizado_em: Date | null;
  criado_em: Date;
  parada_emergencia: boolean;
  total_alarmes: number;
  total_alarmes_criticos: number;
  total_eventos: number;
  possui_relatorio: boolean;
}
