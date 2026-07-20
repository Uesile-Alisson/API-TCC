import {
  etapaencerramentotanque,
  etapaencerramentoprocesso,
  severidadealarme,
  faseprocesso,
  statusencerramentotanque,
  statusencerramentoprocesso,
  statusestagnacao,
  statusprocesso,
  statustanqueprocesso,
} from '@prisma/client';
import { ProcessoAuxiliarState } from './processo-auxiliar-state.interface';

export interface ProcessoTanqueStagnationState {
  status: statusestagnacao;
  suspeita: boolean;
  detectada: boolean;
  iniciada_em: Date | null;
  detectada_em: Date | null;
  ultima_avaliacao_em: Date | null;
  duracao_segundos: number;
  variacao_vacuo: number | null;
  janela_segundos: number;
  variacao_minima_esperada: number;
  variacao_minima_base: number;
  leituras_janela: number;
  leituras_minimas: number;
  janelas_sem_progresso: number;
  janelas_consecutivas_necessarias: number;
  id_alarme_ativo: number | null;
  mensagem: string;
  evidencias: {
    fator_volume: number | null;
    fator_tanques_ativos: number | null;
    fator_proximidade_alvo: number | null;
    volume_tanque: number | null;
    volume_medio_tanques_ativos: number | null;
    tanques_ativos: number;
    vacuo_atual: number | null;
    distancia_alvo: number | null;
    tempo_bomba_principal_segundos: number;
    motivo_decisao: string | null;
  };
}

export interface ProcessoDashboardReadingPoint {
  id_leitura_sensor: number;
  id_processo_tanque_sensor: number;
  id_tanque: number;
  id_sensor: number;
  valor_vacuo: number;
  leitura_em: Date;
  recebido_em: Date;
}

export interface ProcessoTanqueEncerramentoState {
  status: statusencerramentotanque;
  etapa: etapaencerramentotanque;
  automatico: boolean;
  pronto_para_encerrar: boolean;
  aguardando_acao_manual: boolean;
  pode_desacoplar: boolean;
  mangueira_acoplada: boolean | null;
  iniciado_em: Date | null;
  isolado_em: Date | null;
  retencao_iniciada_em: Date | null;
  retencao_finalizada_em: Date | null;
  vacuo_isolamento: number | null;
  perda_vacuo_retencao: number | null;
  motivo_bloqueio: string | null;
  versao: number;
  tentativa: number;
  comando_tentativas: number;
  proxima_tentativa_em: Date | null;
  estabilizacao: {
    tempo_necessario_segundos: number;
    cobertura_minima_percentual: number;
    leituras_esperadas: number;
    leituras_observadas: number;
    cobertura_atual_percentual: number;
    maior_intervalo_ms: number;
    timeout_leitura_ms: number;
    continuidade_aprovada: boolean;
  };
  retencao: {
    tempo_necessario_segundos: number;
    perda_maxima_permitida: number;
  };
  seguranca: {
    limite_vacuo: number;
    limite_excedido: boolean;
  };
}

export interface ProcessoEncerramentoState {
  habilitado: boolean;
  fase_processo: faseprocesso;
  pode_desacoplar: boolean;
  geral: ProcessoEncerramentoGeralState;
  total_tanques: number;
  tanques_concluidos: number;
  tanques_prontos: number;
  tanques_aguardando_acao_manual: number;
  tanques_pendentes: number;
  versao: number;
  parametros: {
    tolerancia_vacuo_percentual: number;
    limite_seguranca_vacuo: number;
    tempo_estabilizacao_segundos: number;
    cobertura_minima_percentual: number;
    intervalo_leitura_esperado_ms: number;
    timeout_leitura_sensor_ms: number;
    tempo_retencao_segundos: number;
    perda_vacuo_maxima_retencao: number;
  };
}

export interface ProcessoEncerramentoGeralState {
  status: statusencerramentoprocesso;
  etapa: etapaencerramentoprocesso;
  automatico: boolean;
  pronto_para_iniciar: boolean;
  aguardando_acao_manual: boolean;
  hardware_confirmado: boolean;
  iniciado_em: Date | null;
  finalizado_em: Date | null;
  confirmacao_iniciada_em: Date | null;
  proxima_tentativa_em: Date | null;
  tentativa: number;
  comando_tentativas: number;
  ultimo_erro: string | null;
  versao: number;
}

export type ProcessoParadaEmergenciaStatus =
  | 'INATIVA'
  | 'ACIONANDO'
  | 'AGUARDANDO_CONFIRMACAO'
  | 'CONFIRMADA'
  | 'FALHA';

export type ProcessoParadaEmergenciaNivelConfirmacao =
  | 'NAO_CONFIRMADO'
  | 'CONTROLADOR_CONFIRMADO';

/**
 * Estado da parada de emergência observado pelo controlador.
 *
 * `status_processo = INTERROMPIDO` bloqueia a automação, mas não comprova as
 * saídas. `hardware_confirmado` é mantido por compatibilidade e significa
 * confirmação por um snapshot íntegro do ESP32 (latch ativo e saídas lógicas
 * seguras), não feedback mecânico de bomba/posição de válvula.
 */
export interface ProcessoParadaEmergenciaState {
  ativa: boolean;
  status: ProcessoParadaEmergenciaStatus;
  etapa: etapaencerramentoprocesso;
  hardware_confirmado: boolean;
  nivel_confirmacao: ProcessoParadaEmergenciaNivelConfirmacao;
  latch_emergencia_confirmado: boolean;
  saidas_controlador_confirmadas: boolean;
  feedback_mecanico_disponivel: boolean;
  requer_intervencao: boolean;
  solicitada_em: Date | null;
  confirmada_em: Date | null;
  proxima_tentativa_em: Date | null;
  tentativa: number;
  comando_tentativas: number;
  ultimo_erro: string | null;
  versao: number;
}

export interface ProcessoTanqueRealtimeState {
  id_processo_tanque: number;
  id_tanque: number;
  nome_tanque: string;
  status_tanque_processo: statustanqueprocesso;
  vacuo_atingido: boolean;
  vacuo_estabilizado: boolean;
  vacuo_alvo: number;
  vacuo_atual: number | null;
  vacuo_inicial: number | null;
  vacuo_final: number | null;
  vacuo_medio: number | null;
  eficiencia: number | null;
  iniciado_em: Date | null;
  finalizado_em: Date | null;
  ultima_leitura_em: Date | null;
  ultima_leitura_recebida_em: Date | null;
  total_sensores: number;
  total_leituras: number;
  encerramento: ProcessoTanqueEncerramentoState;
  estagnacao: ProcessoTanqueStagnationState;
}

export interface ProcessoDashboardTanque extends ProcessoTanqueRealtimeState {
  leituras: ProcessoDashboardReadingPoint[];
}

export interface ProcessoDashboardAlarmSummary {
  total: number;
  criticos: number;
  medios: number;
  infos: number;
  ultima_severidade: severidadealarme | null;
}

export interface ProcessoDashboardData {
  id_processo: number;
  snapshot_at: Date;
  nome_processo: string | null;
  status_processo: statusprocesso;
  vacuo_alvo: number;
  vacuo_atual: number | null;
  tempo_maximo: number;
  tempo_execucao: number | null;
  iniciado_em: Date | null;
  finalizado_em: Date | null;
  progresso_percentual: number;
  parada_emergencia: ProcessoParadaEmergenciaState;
  encerramento: ProcessoEncerramentoState;
  subsistema_auxiliar: ProcessoAuxiliarState;
  tanques: ProcessoDashboardTanque[];
  alarmes: ProcessoDashboardAlarmSummary;
}
