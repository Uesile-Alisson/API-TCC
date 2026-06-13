import { statusbomba, statusgeralsistema, StatusValvula } from '@prisma/client';

export interface HardwareStatusEventInput {
  id_mqtt_mensagem?: number | null;
  status_geral_sistema: statusgeralsistema;
  esp32_online: boolean;
  status_bomba_principal?: statusbomba | null;
  status_bomba_auxiliar?: statusbomba | null;
  status_valvulas?: HardwareValveStatusInput[];
  processo_em_execucao?: boolean;
  mensagem?: string | null;
  erro?: string | null;
  recebido_em: Date;
}

export interface HardwareValveStatusInput {
  id_valvula?: number | null;
  numero_saida_manifold?: number | null;
  nome_valvula?: string | null;
  status_valvula: StatusValvula;
}
