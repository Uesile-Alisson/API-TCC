import { statusconexaomqtt } from '@prisma/client';

export interface ActiveMqttConfig {
  id_mqtt_configuracao: number;
  chave_configuracao: string;
  id_usuario_alteracao: number | null;
  broker_url: string;
  porta: number;
  usuario_mqtt?: string | null;
  senha_mqtt_hash?: string | null;
  topico_leituras: string;
  topico_comandos: string;
  topico_alarmes: string;
  topico_heartbeat: string;
  topico_status: string;
  topico_acoplamentos: string;
  reconexao_automatica: boolean;
  timeout_comunicacao: number;
  status_conexao: statusconexaomqtt;
  ultima_conexao: Date | null;
  ultima_sincronizacao: Date | null;
  ultima_falha: string | null;
  criado_em: Date;
  atualizado_em: Date;
  ativo: boolean;
}
