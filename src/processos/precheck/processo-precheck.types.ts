import {
  StatusValvula,
  funcaovalvula,
  nivelacesso,
  statusbomba,
  tipobomba,
} from '@prisma/client';

export type ProcessoPrecheckStatusGeral = 'APROVADO' | 'REPROVADO';

export type ProcessoPrecheckItemStatus =
  | 'APROVADO'
  | 'REPROVADO'
  | 'PENDENTE'
  | 'FALHA'
  | 'NAO_SUPORTADO'
  | 'NAO_CONFIRMADO'
  | 'IGNORADO';

export type ProcessoPrecheckGrupo =
  | 'USUARIO'
  | 'PROCESSO'
  | 'TANQUES'
  | 'ACOPLAMENTO'
  | 'SENSORES'
  | 'VALVULAS'
  | 'BOMBAS'
  | 'MQTT'
  | 'ESP32'
  | 'SOCKET'
  | 'LOGS';

export type ProcessoPrecheckTipoRecurso =
  | 'USUARIO'
  | 'PROCESSO'
  | 'TANQUE'
  | 'ACOPLAMENTO'
  | 'SENSOR'
  | 'VALVULA'
  | 'BOMBA'
  | 'MQTT'
  | 'ESP32'
  | 'SOCKET'
  | 'LOG';

export interface ProcessoPrecheckItem {
  codigo: string;
  titulo: string;
  grupo: ProcessoPrecheckGrupo;
  status: ProcessoPrecheckItemStatus;
  obrigatorio: boolean;
  bloqueante: boolean;
  mensagem: string;
  evidencia: string | null;
  detalhes: Record<string, unknown> | null;
  id_recurso: number | null;
  tipo_recurso: ProcessoPrecheckTipoRecurso | null;
  timestamp: Date;
}

export interface ProcessoPrecheckGrupoResultado {
  grupo: ProcessoPrecheckGrupo;
  status: ProcessoPrecheckStatusGeral;
  aprovado: boolean;
  total_itens: number;
  total_bloqueantes: number;
}

export interface ProcessoPrecheckResultado {
  id_processo: number;
  status_geral: ProcessoPrecheckStatusGeral;
  aprovado: boolean;
  bloqueado: boolean;
  executado_em: Date;
  validade_segundos: number;
  grupos: ProcessoPrecheckGrupoResultado[];
  itens: ProcessoPrecheckItem[];
  falhas_bloqueantes: string[];
  avisos: string[];
  recomendacoes: string[];
}

export interface ProcessoPrecheckUser {
  sub: number;
  login: string;
  id_nivel_acesso: number;
  nivel_acesso: nivelacesso;
}

export interface ProcessoPrecheckOptions {
  exigirPermissaoTecnica: boolean;
  executarHardware: boolean;
  registrarLog: boolean;
  emitirSocket: boolean;
}

export interface ProcessoPrecheckValve {
  id_valvula: number;
  codigo_hardware: string | null;
  id_bomba: number;
  id_tanque: number | null;
  numero_saida_manifold: number;
  nome_valvula: string;
  status_valvula: StatusValvula;
  ativo: boolean;
  funcao_valvula: funcaovalvula;
  ultimo_acionamento: Date | null;
  bomba: {
    id_bomba: number;
    codigo_hardware: string | null;
    nome: string;
    status_padrao: statusbomba;
    tipo_bomba: tipobomba;
  };
  tanque: {
    id_tanque: number;
    nome: string;
  } | null;
}

export interface ProcessoPrecheckSensorReading {
  id_leitura_sensor: number;
  id_processo_tanque_sensor: number;
  leitura_em: Date;
  recebido_em: Date;
  tipo_leitura: string;
  valor: unknown;
  valor_vacuo: unknown;
}

export interface ProcessoValveActionResult {
  id_processo: number;
  id_valvula: number;
  acao: 'VALIDAR' | 'ABRIR' | 'FECHAR';
  status: ProcessoPrecheckItemStatus;
  aprovado: boolean;
  mensagem: string;
  evidencia: string | null;
  detalhes: Record<string, unknown> | null;
  executado_em: Date;
}
