-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "criticidadepermissao" AS ENUM ('BAIXA', 'MEDIA', 'CRITICA');

-- CreateEnum
CREATE TYPE "direcaomqtt" AS ENUM ('ENVIADA', 'RECEBIDA');

-- CreateEnum
CREATE TYPE "formatorelatorio" AS ENUM ('PDF', 'XLSX');

-- CreateEnum
CREATE TYPE "origembackup" AS ENUM ('MANUAL', 'AUTOMATICO', 'SISTEMA');

-- CreateEnum
CREATE TYPE "statusbackup" AS ENUM ('GERADO', 'RESTAURADO', 'FALHA_GERACAO', 'FALHA_RESTAURACAO', 'INVALIDO');

-- CreateEnum
CREATE TYPE "tipobackup" AS ENUM ('SISTEMA', 'MQTT', 'COMPLETO');

-- CreateEnum
CREATE TYPE "modulosistema" AS ENUM ('DASHBOARD', 'PROCESSOS', 'HISTORICO', 'ALARMES', 'RELATORIOS', 'CONFIGURACOES', 'USUARIOS', 'MQTT', 'HARDWARE', 'BACKUPS', 'SISTEMA');

-- CreateEnum
CREATE TYPE "nivelacesso" AS ENUM ('OPERADOR', 'TECNICO', 'ADMINISTRADOR');

-- CreateEnum
CREATE TYPE "origemalarme" AS ENUM ('SENSOR', 'ESP32', 'MQTT', 'BACKEND', 'SISTEMA', 'USUARIO');

-- CreateEnum
CREATE TYPE "origemevento" AS ENUM ('USUARIO', 'SISTEMA', 'BACKEND', 'ESP32', 'MQTT', 'SENSOR', 'SOCKET');

-- CreateEnum
CREATE TYPE "origemlogoperacional" AS ENUM ('USUARIO', 'SISTEMA', 'BACKEND', 'ESP32', 'MQTT', 'SOCKET');

-- CreateEnum
CREATE TYPE "origemmqtt" AS ENUM ('BACKEND', 'ESP32', 'BROKER', 'SISTEMA');

-- CreateEnum
CREATE TYPE "protocolosensor" AS ENUM ('I2C', 'ANALOGICO', 'DIGITAL', 'SPI', 'UART');

-- CreateEnum
CREATE TYPE "resultadooperacao" AS ENUM ('SUCESSO', 'FALHA', 'CANCELADO');

-- CreateEnum
CREATE TYPE "severidadealarme" AS ENUM ('INFO', 'MEDIO', 'CRITICO');

-- CreateEnum
CREATE TYPE "severidadeevento" AS ENUM ('INFO', 'AVISO', 'CRITICO');

-- CreateEnum
CREATE TYPE "statusalarme" AS ENUM ('ATIVO', 'RESOLVIDO');

-- CreateEnum
CREATE TYPE "statusbomba" AS ENUM ('ATIVA', 'INATIVA', 'MANUTENCAO', 'FALHA');

-- CreateEnum
CREATE TYPE "statusconexaomqtt" AS ENUM ('CONECTADO', 'DESCONECTADO', 'RECONECTANDO', 'FALHA');

-- CreateEnum
CREATE TYPE "statusgeralsistema" AS ENUM ('OPERACIONAL', 'MANUTENCAO', 'ALERTA', 'FALHA', 'BLOQUEADO');

-- CreateEnum
CREATE TYPE "statusprocesso" AS ENUM ('CONFIGURADO', 'EM_EXECUCAO', 'PAUSADO', 'CONCLUIDO', 'INTERROMPIDO', 'FALHA');

-- CreateEnum
CREATE TYPE "statussensor" AS ENUM ('ATIVO', 'INATIVO', 'FALHA', 'DESCONECTADO');

-- CreateEnum
CREATE TYPE "statustanque" AS ENUM ('ATIVO', 'INATIVO', 'MANUTENCAO', 'FALHA');

-- CreateEnum
CREATE TYPE "statustanqueprocesso" AS ENUM ('CONFIGURADO', 'EM_EXECUCAO', 'CONCLUIDO', 'FALHA', 'INTERROMPIDO', 'AGUARDANDO', 'GERANDO_VACUO', 'VACUO_ATINGIDO', 'VACUO_ESTABILIZADO', 'ALIMENTANDO', 'CHEIO');

-- CreateEnum
CREATE TYPE "tipoalarme" AS ENUM ('SENSOR', 'BOMBA', 'MQTT', 'ESP32', 'PROCESSO', 'SEGURANCA', 'SISTEMA', 'TANQUE', 'FLUXO', 'NIVEL', 'VALVULA', 'MANGUEIRA');

-- CreateEnum
CREATE TYPE "tipobomba" AS ENUM ('AUXILIAR', 'PRINCIPAL', 'TRANSFERENCIA_FLUIDO');

-- CreateEnum
CREATE TYPE "tipoeventoprocesso" AS ENUM ('PROCESSO_CRIADO', 'PROCESSO_INICIADO', 'PROCESSO_PAUSADO', 'PROCESSO_RETOMADO', 'PROCESSO_CONCLUIDO', 'PROCESSO_INTERROMPIDO', 'PROCESSO_FALHA', 'BOMBA_PRINCIPAL_ATIVADA', 'BOMBA_AUXILIAR_ATIVADA', 'BOMBA_DESATIVADA', 'VACUO_ALVO_ATINGIDO', 'VACUO_FORA_LIMITE', 'TANQUE_ESTABILIZADO', 'VALVULA_ABERTA', 'VALVULA_FECHADA', 'SENSOR_ATIVO', 'SENSOR_DESCONECTADO', 'SENSOR_OSCILANDO', 'PARADA_EMERGENCIA', 'MQTT_CONECTADO', 'MQTT_DESCONECTADO', 'ESP32_SINCRONIZADO', 'ESP32_DESCONECTADO', 'BOMBA_VACUO_ATIVADA', 'BOMBA_VACUO_DESATIVADA', 'BOMBA_TRANSFERENCIA_ATIVADA', 'BOMBA_TRANSFERENCIA_DESATIVADA', 'TRANSFERENCIA_FLUIDO_INICIADA', 'TRANSFERENCIA_FLUIDO_FINALIZADA', 'VAZAO_DETECTADA', 'AUSENCIA_DE_FLUXO', 'VOLUME_ALVO_ATINGIDO', 'NIVEL_MAXIMO_ATINGIDO', 'MANGUEIRA_ACOPLADA', 'MANGUEIRA_DESACOPLADA');

-- CreateEnum
CREATE TYPE "tipologoperacional" AS ENUM ('AUTENTICACAO', 'PROCESSO', 'ALARME', 'RELATORIO', 'CONFIGURACAO', 'MQTT', 'HARDWARE', 'BACKUP', 'USUARIO', 'SISTEMA', 'SEGURANCA');

-- CreateEnum
CREATE TYPE "tiporelatorio" AS ENUM ('PROCESSO', 'ALARME');

-- CreateEnum
CREATE TYPE "StatusValvula" AS ENUM ('DESCONHECIDA', 'ABERTA', 'FECHADA', 'FALHA');

-- CreateEnum
CREATE TYPE "TipoValvula" AS ENUM ('SOLENOIDE', 'VAZAO');

-- CreateEnum
CREATE TYPE "StatusAcoplamentoMangueira" AS ENUM ('ACOPLADA', 'DESACOPLADA', 'DESCONHECIDA', 'FALHA');

-- CreateEnum
CREATE TYPE "faseprocesso" AS ENUM ('CONFIGURACAO', 'PRE_CHECAGEM', 'GERANDO_VACUO', 'VACUO_ESTABILIZADO', 'ALIMENTANDO_FLUIDO', 'FINALIZANDO', 'FINALIZADO');

-- CreateEnum
CREATE TYPE "funcaovalvula" AS ENUM ('FLUIDO', 'VACUO', 'SEGURANCA', 'RESERVA');

-- CreateEnum
CREATE TYPE "tipoleiturasensor" AS ENUM ('VACUO', 'VAZAO', 'NIVEL');

-- CreateEnum
CREATE TYPE "tiposensor" AS ENUM ('VACUO', 'VAZAO', 'NIVEL', 'ACOPLAMENTO', 'GENERICO');

-- CreateEnum
CREATE TYPE "tiposensorprocesso" AS ENUM ('VACUO', 'VAZAO', 'NIVEL', 'ACOPLAMENTO');

-- CreateTable
CREATE TABLE "alarmes" (
    "id_alarme" SERIAL NOT NULL,
    "id_mqtt_mensagem" INTEGER,
    "id_usuario_responsavel" INTEGER,
    "titulo" VARCHAR(120) NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo_alarme" "tipoalarme" NOT NULL,
    "severidade" "severidadealarme" NOT NULL,
    "status_alarme" "statusalarme" NOT NULL,
    "origem_alarme" "origemalarme" NOT NULL,
    "valor_detectado" DECIMAL(10,3),
    "unidade" VARCHAR(20),
    "ocorrido_em" TIMESTAMP(6) NOT NULL,
    "resolvido_em" TIMESTAMP(6),
    "excluido_em" TIMESTAMP(6),
    "id_processo_tanque_sensor" INTEGER,
    "id_processo" INTEGER,
    "id_processo_tanque" INTEGER,

    CONSTRAINT "alarmes_pkey" PRIMARY KEY ("id_alarme")
);

-- CreateTable
CREATE TABLE "backups" (
    "id_backup" SERIAL NOT NULL,
    "id_usuario" INTEGER,
    "id_usuario_restauracao" INTEGER,
    "id_configuracao_sistema" INTEGER,
    "id_mqtt_configuracao" INTEGER,
    "id_mqtt_configuracao_historico" INTEGER,
    "tipo_backup" "tipobackup" NOT NULL,
    "origem_backup" "origembackup" NOT NULL DEFAULT 'MANUAL',
    "status_backup" "statusbackup" NOT NULL DEFAULT 'GERADO',
    "nome_arquivo" VARCHAR(180) NOT NULL,
    "caminho_arquivo" TEXT,
    "snapshot" JSONB NOT NULL,
    "hash_arquivo" VARCHAR(128),
    "tamanho_bytes" BIGINT,
    "content_type" VARCHAR(120),
    "storage_provider" VARCHAR(30) NOT NULL DEFAULT 'POSTGRES_JSON',
    "metadados" JSONB,
    "erro" TEXT,
    "restaurado_em" TIMESTAMP(6),
    "criado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backups_pkey" PRIMARY KEY ("id_backup")
);

-- CreateTable
CREATE TABLE "bombas" (
    "id_bomba" SERIAL NOT NULL,
    "id_configuracao_sistema" INTEGER NOT NULL,
    "id_usuario_alteracao" INTEGER,
    "nome" VARCHAR(80) NOT NULL,
    "tipo_bomba" "tipobomba" NOT NULL,
    "status_padrao" "statusbomba" NOT NULL,
    "entrada_por_pressao" BOOLEAN NOT NULL DEFAULT false,
    "entrada_por_tempo" BOOLEAN NOT NULL DEFAULT false,
    "encerramento_automatico" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bombas_pkey" PRIMARY KEY ("id_bomba")
);

-- CreateTable
CREATE TABLE "configuracoessistema" (
    "id_configuracao_sistema" SERIAL NOT NULL,
    "id_usuario_alteracao" INTEGER,
    "tempo_maximo_padrao" INTEGER NOT NULL,
    "encerramento_automatico" BOOLEAN NOT NULL,
    "limite_seguranca_vacuo" DECIMAL(10,3) NOT NULL,
    "vacuo_padrao" DECIMAL(10,3) NOT NULL,
    "quantidade_maxima_tanques" INTEGER NOT NULL,
    "status_geral_sistema" "statusgeralsistema" NOT NULL,
    "versao_sistema" VARCHAR(30) NOT NULL,
    "criado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tolerancia_vacuo_percentual" DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    "limite_nivel_maximo_percentual" DECIMAL(5,2) NOT NULL DEFAULT 95.00,
    "tolerancia_volume_percentual" DECIMAL(5,2) NOT NULL DEFAULT 5.00,
    "vazao_minima_l_min" DECIMAL(10,3) NOT NULL DEFAULT 0.100,
    "vazao_maxima_l_min" DECIMAL(10,3) NOT NULL DEFAULT 5.000,

    CONSTRAINT "configuracoessistema_pkey" PRIMARY KEY ("id_configuracao_sistema")
);

-- CreateTable
CREATE TABLE "eventos" (
    "id_evento_processo" SERIAL NOT NULL,
    "id_processo" INTEGER NOT NULL,
    "tipo_evento" "tipoeventoprocesso" NOT NULL,
    "origem_evento" "origemevento" NOT NULL,
    "severidade_evento" "severidadeevento" NOT NULL,
    "ocorrido_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_processo_tanque_sensor" INTEGER,

    CONSTRAINT "eventos_pkey" PRIMARY KEY ("id_evento_processo")
);

-- CreateTable
CREATE TABLE "leiturasensores" (
    "id_leitura_sensor" SERIAL NOT NULL,
    "valor_vacuo" DECIMAL(10,3),
    "leitura_em" TIMESTAMP(6) NOT NULL,
    "recebido_em" TIMESTAMP(6) NOT NULL,
    "id_processo_tanque_sensor" INTEGER NOT NULL,
    "tipo_leitura" "tipoleiturasensor" NOT NULL,
    "valor" DECIMAL(10,3) NOT NULL,
    "unidade_medida" VARCHAR(20) NOT NULL,
    "volume_acumulado_ml" DECIMAL(10,3),
    "percentual_nivel" DECIMAL(5,2),

    CONSTRAINT "leiturasensores_pkey" PRIMARY KEY ("id_leitura_sensor")
);

-- CreateTable
CREATE TABLE "logsoperacionais" (
    "id_log_operacional" SERIAL NOT NULL,
    "id_usuario" INTEGER,
    "id_processo" INTEGER,
    "tipo_log" "tipologoperacional" NOT NULL,
    "acao" VARCHAR(120) NOT NULL,
    "descricao" TEXT,
    "origem" "origemlogoperacional" NOT NULL,
    "resultado" "resultadooperacao" NOT NULL,
    "criado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logsoperacionais_pkey" PRIMARY KEY ("id_log_operacional")
);

-- CreateTable
CREATE TABLE "mqttconfiguracoes" (
    "id_mqtt_configuracao" SERIAL NOT NULL,
    "id_usuario_alteracao" INTEGER,
    "broker_url" VARCHAR(150) NOT NULL,
    "porta" INTEGER NOT NULL,
    "senha_mqtt_hash" TEXT,
    "topico_leituras" VARCHAR(180) NOT NULL,
    "topico_comandos" VARCHAR(180) NOT NULL,
    "topico_status" VARCHAR(180) NOT NULL,
    "topico_alarmes" VARCHAR(180) NOT NULL,
    "reconexao_automatica" BOOLEAN NOT NULL,
    "timeout_comunicacao" INTEGER NOT NULL,
    "status_conexao" "statusconexaomqtt" NOT NULL,
    "ultima_conexao" TIMESTAMP(6),
    "ultima_sincronizacao" TIMESTAMP(6),
    "ultima_falha" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "topico_heartbeat" VARCHAR(180) NOT NULL,
    "chave_configuracao" VARCHAR(50) NOT NULL DEFAULT 'MQTT_PRINCIPAL',
    "usuario_mqtt" VARCHAR(120),
    "topico_acoplamentos" VARCHAR(150) NOT NULL DEFAULT 'tsea/acoplamentos',

    CONSTRAINT "mqttconfiguracoes_pkey" PRIMARY KEY ("id_mqtt_configuracao")
);

-- CreateTable
CREATE TABLE "mqttmensagens" (
    "id_mqtt_mensagem" SERIAL NOT NULL,
    "id_mqtt_configuracao" INTEGER,
    "topico" VARCHAR(180) NOT NULL,
    "payload" JSONB NOT NULL,
    "direcao" "direcaomqtt" NOT NULL,
    "origem" "origemmqtt" NOT NULL,
    "erro" TEXT,
    "recebido_em" TIMESTAMP(6),
    "enviado_em" TIMESTAMP(6),
    "criado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_processo_tanque_sensor" INTEGER,

    CONSTRAINT "mqttmensagens_pkey" PRIMARY KEY ("id_mqtt_mensagem")
);

-- CreateTable
CREATE TABLE "niveisacessos" (
    "id_nivel_acesso" SERIAL NOT NULL,
    "nome" "nivelacesso" NOT NULL,
    "descricao" TEXT,
    "prioridade" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "niveisacessos_pkey" PRIMARY KEY ("id_nivel_acesso")
);

-- CreateTable
CREATE TABLE "niveispermissoes" (
    "id_nivel_permissao" SERIAL NOT NULL,
    "id_nivel_acesso" INTEGER NOT NULL,
    "id_permissao" INTEGER NOT NULL,
    "permitido" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "niveispermissoes_pkey" PRIMARY KEY ("id_nivel_permissao")
);

-- CreateTable
CREATE TABLE "permissoes" (
    "id_permissao" SERIAL NOT NULL,
    "modulo" "modulosistema" NOT NULL,
    "acao" VARCHAR(100) NOT NULL,
    "descricao" TEXT,
    "nivel_criticidade" "criticidadepermissao" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissoes_pkey" PRIMARY KEY ("id_permissao")
);

-- CreateTable
CREATE TABLE "processos" (
    "id_processo" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "nome_processo" VARCHAR(120),
    "status_processo" "statusprocesso" NOT NULL,
    "vacuo_alvo" DECIMAL(10,3) NOT NULL,
    "vacuo_inicial" DECIMAL(10,3),
    "vacuo_final" DECIMAL(10,3),
    "vacuo_medio" DECIMAL(10,3),
    "eficiencia" DECIMAL(5,2),
    "tempo_maximo" INTEGER NOT NULL,
    "tempo_execucao" INTEGER,
    "iniciado_em" TIMESTAMP(6),
    "pausado_em" TIMESTAMP(6),
    "retomado_em" TIMESTAMP(6),
    "finalizado_em" TIMESTAMP(6),
    "parada_emergencia" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fase_processo" "faseprocesso" NOT NULL DEFAULT 'CONFIGURACAO',
    "id_processo_tanque_atual" INTEGER,

    CONSTRAINT "processos_pkey" PRIMARY KEY ("id_processo")
);

-- CreateTable
CREATE TABLE "processostanques" (
    "id_processo_tanque" SERIAL NOT NULL,
    "id_processo" INTEGER NOT NULL,
    "id_tanque" INTEGER NOT NULL,
    "vacuo_alvo" DECIMAL(10,3) NOT NULL,
    "vacuo_inicial" DECIMAL(10,3),
    "vacuo_final" DECIMAL(10,3),
    "vacuo_medio" DECIMAL(10,3),
    "eficiencia" DECIMAL(5,2),
    "status_tanque_processo" "statustanqueprocesso" NOT NULL,
    "iniciado_em" TIMESTAMP(6),
    "finalizado_em" TIMESTAMP(6),
    "criado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "volume_alvo_ml" DECIMAL(10,3),
    "volume_enviado_ml" DECIMAL(10,3) NOT NULL DEFAULT 0.000,
    "vazao_atual_l_min" DECIMAL(10,3),
    "nivel_atual_percentual" DECIMAL(5,2),
    "vacuo_atingido" BOOLEAN NOT NULL DEFAULT false,
    "vacuo_estabilizado" BOOLEAN NOT NULL DEFAULT false,
    "alimentacao_iniciada_em" TIMESTAMP(6),
    "alimentacao_finalizada_em" TIMESTAMP(6),

    CONSTRAINT "processostanques_pkey" PRIMARY KEY ("id_processo_tanque")
);

-- CreateTable
CREATE TABLE "processostanquessensores" (
    "id_processo_tanque_sensor" SERIAL NOT NULL,
    "id_processo_tanque" INTEGER NOT NULL,
    "id_sensor" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "removido_em" TIMESTAMP(6),
    "observacoes" TEXT,
    "tipo_sensor_processo" "tiposensorprocesso" NOT NULL DEFAULT 'VACUO',

    CONSTRAINT "processostanquessensores_pkey" PRIMARY KEY ("id_processo_tanque_sensor")
);

-- CreateTable
CREATE TABLE "relatorios" (
    "id_relatorio" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "id_processo" INTEGER,
    "id_alarme" INTEGER,
    "tipo_relatorio" "tiporelatorio" NOT NULL,
    "formato_relatorio" "formatorelatorio" NOT NULL,
    "titulo" VARCHAR(150) NOT NULL,
    "descricao" TEXT,
    "nome_arquivo" VARCHAR(180) NOT NULL,
    "hash_arquivo" TEXT,
    "tamanho_bytes" BIGINT,
    "gerado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gridfs_file_id" VARCHAR(50),
    "content_type" VARCHAR(120),
    "bucket_name" VARCHAR(80) DEFAULT 'relatorios',
    "storage_provider" VARCHAR(30) DEFAULT 'GRIDFS',

    CONSTRAINT "relatorios_pkey" PRIMARY KEY ("id_relatorio")
);

-- CreateTable
CREATE TABLE "sensores" (
    "id_sensor" SERIAL NOT NULL,
    "nome" VARCHAR(80) NOT NULL,
    "modelo" VARCHAR(100) NOT NULL,
    "protocolo" "protocolosensor" NOT NULL,
    "unidade_medida" VARCHAR(20) NOT NULL,
    "precisao" DECIMAL(10,3),
    "status_sensor" "statussensor" NOT NULL,
    "ultima_leitura" TIMESTAMP(6),
    "ultimo_valor_lido" DECIMAL(10,3),
    "criado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "excluido_em" TIMESTAMP(6),
    "tipo_sensor" "tiposensor" NOT NULL DEFAULT 'VACUO',
    "fator_calibracao" DECIMAL(10,4),

    CONSTRAINT "sensores_pkey" PRIMARY KEY ("id_sensor")
);

-- CreateTable
CREATE TABLE "tanques" (
    "id_tanque" SERIAL NOT NULL,
    "nome" VARCHAR(80) NOT NULL,
    "volume" DECIMAL(10,2) NOT NULL,
    "unidade_volume" VARCHAR(20) NOT NULL,
    "vacuo_padrao" DECIMAL(10,3) NOT NULL,
    "status_tanque" "statustanque" NOT NULL,
    "criado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "excluido_em" TIMESTAMP(6),

    CONSTRAINT "tanques_pkey" PRIMARY KEY ("id_tanque")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id_usuario" SERIAL NOT NULL,
    "id_nivel_acesso" INTEGER NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "login" VARCHAR(60) NOT NULL,
    "email" VARCHAR(120),
    "senha_hash" TEXT NOT NULL,
    "primeiro_acesso" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_acesso" TIMESTAMP(6),
    "criado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(6),

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id_usuario")
);

-- CreateTable
CREATE TABLE "mqttconfiguracoeshistorico" (
    "id_mqtt_configuracao_historico" SERIAL NOT NULL,
    "id_mqtt_configuracao" INTEGER NOT NULL,
    "id_usuario_alteracao" INTEGER,
    "broker_url" VARCHAR(150) NOT NULL,
    "porta" INTEGER NOT NULL,
    "usuario_mqtt" VARCHAR(120),
    "senha_mqtt_hash" TEXT,
    "topico_leituras" VARCHAR(180) NOT NULL,
    "topico_comandos" VARCHAR(180) NOT NULL,
    "topico_status" VARCHAR(180) NOT NULL,
    "topico_alarmes" VARCHAR(180) NOT NULL,
    "topico_heartbeat" VARCHAR(180) NOT NULL,
    "reconexao_automatica" BOOLEAN NOT NULL,
    "timeout_comunicacao" INTEGER NOT NULL,
    "status_conexao" "statusconexaomqtt" NOT NULL,
    "ultima_conexao" TIMESTAMP(6),
    "ultima_sincronizacao" TIMESTAMP(6),
    "ultima_falha" TEXT,
    "criado_em" TIMESTAMP(6) NOT NULL,
    "atualizado_em" TIMESTAMP(6),
    "registrado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "topico_acoplamentos" VARCHAR(150) NOT NULL DEFAULT 'tsea/acoplamentos',

    CONSTRAINT "MqttConfiguracoesHistorico_pkey" PRIMARY KEY ("id_mqtt_configuracao_historico")
);

-- CreateTable
CREATE TABLE "processosmqttconfiguracoeshistorico" (
    "id_processo_mqtt_configuracao_historico" SERIAL NOT NULL,
    "id_processo" INTEGER NOT NULL,
    "id_mqtt_configuracao_historico" INTEGER NOT NULL,
    "usado_de" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usado_ate" TIMESTAMP(6),
    "criado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessosMqttConfiguracoesHistorico_pkey" PRIMARY KEY ("id_processo_mqtt_configuracao_historico")
);

-- CreateTable
CREATE TABLE "valvulas" (
    "id_valvula" SERIAL NOT NULL,
    "id_bomba" INTEGER NOT NULL,
    "numero_saida_manifold" SMALLINT NOT NULL,
    "nome_valvula" VARCHAR(80) NOT NULL,
    "tipo_valvula" "TipoValvula" NOT NULL DEFAULT 'SOLENOIDE',
    "status_valvula" "StatusValvula" NOT NULL DEFAULT 'DESCONHECIDA',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_acionamento" TIMESTAMP(6),
    "criado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(6),
    "funcao_valvula" "funcaovalvula" NOT NULL DEFAULT 'FLUIDO',
    "id_tanque" INTEGER,

    CONSTRAINT "Valvulas_pkey" PRIMARY KEY ("id_valvula")
);

-- CreateTable
CREATE TABLE "sensoresacoplamentomangueiras" (
    "id_sensor" INTEGER NOT NULL,
    "id_tanque" INTEGER NOT NULL,
    "status_acoplamento" "StatusAcoplamentoMangueira" NOT NULL DEFAULT 'DESCONHECIDA',
    "sinal_detectado" BOOLEAN NOT NULL DEFAULT false,
    "ultima_verificacao" TIMESTAMP(6),
    "ultimo_evento_em" TIMESTAMP(6),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(6),

    CONSTRAINT "sensoresacoplamentomangueiras_pkey" PRIMARY KEY ("id_sensor")
);

-- CreateIndex
CREATE INDEX "idx_alarmes_processo_tanque_sensor" ON "alarmes"("id_processo_tanque_sensor");

-- CreateIndex
CREATE INDEX "idx_alarmes_id_processo" ON "alarmes"("id_processo");

-- CreateIndex
CREATE INDEX "idx_alarmes_id_processo_tanque" ON "alarmes"("id_processo_tanque");

-- CreateIndex
CREATE INDEX "idx_alarmes_id_processo_tanque_sensor" ON "alarmes"("id_processo_tanque_sensor");

-- CreateIndex
CREATE INDEX "idx_backups_tipo_backup" ON "backups"("tipo_backup");

-- CreateIndex
CREATE INDEX "idx_backups_origem_backup" ON "backups"("origem_backup");

-- CreateIndex
CREATE INDEX "idx_backups_status_backup" ON "backups"("status_backup");

-- CreateIndex
CREATE INDEX "idx_backups_criado_em" ON "backups"("criado_em");

-- CreateIndex
CREATE INDEX "idx_backups_id_usuario" ON "backups"("id_usuario");

-- CreateIndex
CREATE INDEX "idx_backups_id_usuario_restauracao" ON "backups"("id_usuario_restauracao");

-- CreateIndex
CREATE INDEX "idx_backups_id_configuracao_sistema" ON "backups"("id_configuracao_sistema");

-- CreateIndex
CREATE INDEX "idx_backups_id_mqtt_configuracao" ON "backups"("id_mqtt_configuracao");

-- CreateIndex
CREATE INDEX "idx_backups_id_mqtt_configuracao_historico" ON "backups"("id_mqtt_configuracao_historico");

-- CreateIndex
CREATE UNIQUE INDEX "bombas_nome_key" ON "bombas"("nome");

-- CreateIndex
CREATE INDEX "idx_eventos_processo_tanque_sensor" ON "eventos"("id_processo_tanque_sensor");

-- CreateIndex
CREATE INDEX "idx_leituras_processo_tanque_sensor" ON "leiturasensores"("id_processo_tanque_sensor");

-- CreateIndex
CREATE INDEX "idx_leiturasensores_leitura_em" ON "leiturasensores"("leitura_em");

-- CreateIndex
CREATE INDEX "idx_leiturasensores_pts_tipo_data" ON "leiturasensores"("id_processo_tanque_sensor", "tipo_leitura", "leitura_em" DESC);

-- CreateIndex
CREATE INDEX "idx_leiturasensores_tipo_leitura" ON "leiturasensores"("tipo_leitura");

-- CreateIndex
CREATE UNIQUE INDEX "uq_mqtt_config_chave_configuracao" ON "mqttconfiguracoes"("chave_configuracao");

-- CreateIndex
CREATE INDEX "idx_mqtt_config_usuario_mqtt" ON "mqttconfiguracoes"("usuario_mqtt");

-- CreateIndex
CREATE INDEX "idx_mqtt_mensagens_processo_tanque_sensor" ON "mqttmensagens"("id_processo_tanque_sensor");

-- CreateIndex
CREATE UNIQUE INDEX "niveisacessos_nome_key" ON "niveisacessos"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "niveisacessos_prioridade_key" ON "niveisacessos"("prioridade");

-- CreateIndex
CREATE UNIQUE INDEX "uq_nivel_permissao" ON "niveispermissoes"("id_nivel_acesso", "id_permissao");

-- CreateIndex
CREATE UNIQUE INDEX "uq_permissao_modulo_acao" ON "permissoes"("modulo", "acao");

-- CreateIndex
CREATE INDEX "idx_processos_fase_processo" ON "processos"("fase_processo");

-- CreateIndex
CREATE INDEX "idx_processos_status_fase" ON "processos"("status_processo", "fase_processo");

-- CreateIndex
CREATE INDEX "idx_processos_tanque_atual" ON "processos"("id_processo_tanque_atual");

-- CreateIndex
CREATE INDEX "idx_processostanques_alimentacao" ON "processostanques"("alimentacao_iniciada_em", "alimentacao_finalizada_em");

-- CreateIndex
CREATE INDEX "idx_processostanques_nivel_atual" ON "processostanques"("nivel_atual_percentual");

-- CreateIndex
CREATE INDEX "idx_processostanques_status_tanque_processo" ON "processostanques"("status_tanque_processo");

-- CreateIndex
CREATE INDEX "idx_processostanques_volume" ON "processostanques"("volume_alvo_ml", "volume_enviado_ml");

-- CreateIndex
CREATE INDEX "idx_processostanques_volume_enviado" ON "processostanques"("volume_enviado_ml");

-- CreateIndex
CREATE UNIQUE INDEX "uq_processo_tanque" ON "processostanques"("id_processo", "id_tanque");

-- CreateIndex
CREATE INDEX "idx_pts_tanque_tipo_sensor" ON "processostanquessensores"("id_processo_tanque", "tipo_sensor_processo");

-- CreateIndex
CREATE INDEX "idx_pts_tipo_sensor_processo" ON "processostanquessensores"("tipo_sensor_processo");

-- CreateIndex
CREATE UNIQUE INDEX "uq_processo_tanque_sensor" ON "processostanquessensores"("id_processo_tanque", "id_sensor");

-- CreateIndex
CREATE UNIQUE INDEX "uq_pts_processo_tanque_sensor" ON "processostanquessensores"("id_processo_tanque", "id_sensor");

-- CreateIndex
CREATE INDEX "idx_relatorios_bucket_name" ON "relatorios"("bucket_name");

-- CreateIndex
CREATE INDEX "idx_relatorios_gridfs_file_id" ON "relatorios"("gridfs_file_id");

-- CreateIndex
CREATE INDEX "idx_relatorios_storage_provider" ON "relatorios"("storage_provider");

-- CreateIndex
CREATE UNIQUE INDEX "sensores_nome_key" ON "sensores"("nome");

-- CreateIndex
CREATE INDEX "idx_sensores_tipo_sensor_status" ON "sensores"("tipo_sensor", "status_sensor");

-- CreateIndex
CREATE UNIQUE INDEX "tanques_nome_key" ON "tanques"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_login_key" ON "usuarios"("login");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "idx_mqtt_config_hist_config" ON "mqttconfiguracoeshistorico"("id_mqtt_configuracao");

-- CreateIndex
CREATE INDEX "idx_mqtt_config_hist_registrado" ON "mqttconfiguracoeshistorico"("registrado_em");

-- CreateIndex
CREATE INDEX "idx_mqtt_config_hist_usuario_mqtt" ON "mqttconfiguracoeshistorico"("usuario_mqtt");

-- CreateIndex
CREATE UNIQUE INDEX "uq_proc_mqtt_hist_config_atual" ON "processosmqttconfiguracoeshistorico"("id_processo") WHERE (usado_ate IS NULL);

-- CreateIndex
CREATE INDEX "idx_proc_mqtt_hist_config" ON "processosmqttconfiguracoeshistorico"("id_mqtt_configuracao_historico");

-- CreateIndex
CREATE INDEX "idx_proc_mqtt_hist_processo" ON "processosmqttconfiguracoeshistorico"("id_processo");

-- CreateIndex
CREATE UNIQUE INDEX "uq_proc_mqtt_hist_processo_config" ON "processosmqttconfiguracoeshistorico"("id_processo", "id_mqtt_configuracao_historico");

-- CreateIndex
CREATE INDEX "idx_valvulas_ativo" ON "valvulas"("ativo");

-- CreateIndex
CREATE INDEX "idx_valvulas_bomba_ativo" ON "valvulas"("id_bomba", "ativo");

-- CreateIndex
CREATE INDEX "idx_valvulas_id_bomba" ON "valvulas"("id_bomba");

-- CreateIndex
CREATE INDEX "idx_valvulas_status_valvula" ON "valvulas"("status_valvula");

-- CreateIndex
CREATE INDEX "idx_valvulas_tipo_valvula" ON "valvulas"("tipo_valvula");

-- CreateIndex
CREATE INDEX "idx_valvulas_funcao_valvula" ON "valvulas"("funcao_valvula");

-- CreateIndex
CREATE INDEX "idx_valvulas_id_tanque" ON "valvulas"("id_tanque");

-- CreateIndex
CREATE INDEX "idx_valvulas_tanque_funcao_ativo" ON "valvulas"("id_tanque", "funcao_valvula", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "uq_valvulas_bomba_saida_manifold" ON "valvulas"("id_bomba", "numero_saida_manifold");

-- CreateIndex
CREATE UNIQUE INDEX "uq_sensores_acoplamento_mangueiras_id_tanque" ON "sensoresacoplamentomangueiras"("id_tanque");

-- CreateIndex
CREATE INDEX "idx_sensores_acoplamento_ativo" ON "sensoresacoplamentomangueiras"("ativo");

-- CreateIndex
CREATE INDEX "idx_sensores_acoplamento_status_acoplamento" ON "sensoresacoplamentomangueiras"("status_acoplamento");

-- AddForeignKey
ALTER TABLE "alarmes" ADD CONSTRAINT "fk_alarme_mqtt_mensagem" FOREIGN KEY ("id_mqtt_mensagem") REFERENCES "mqttmensagens"("id_mqtt_mensagem") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarmes" ADD CONSTRAINT "fk_alarme_processo" FOREIGN KEY ("id_processo") REFERENCES "processos"("id_processo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarmes" ADD CONSTRAINT "fk_alarme_processo_tanque" FOREIGN KEY ("id_processo_tanque") REFERENCES "processostanques"("id_processo_tanque") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarmes" ADD CONSTRAINT "fk_alarme_processo_tanque_sensor" FOREIGN KEY ("id_processo_tanque_sensor") REFERENCES "processostanquessensores"("id_processo_tanque_sensor") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarmes" ADD CONSTRAINT "fk_alarme_usuario_responsavel" FOREIGN KEY ("id_usuario_responsavel") REFERENCES "usuarios"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backups" ADD CONSTRAINT "fk_backup_configuracao_sistema" FOREIGN KEY ("id_configuracao_sistema") REFERENCES "configuracoessistema"("id_configuracao_sistema") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backups" ADD CONSTRAINT "fk_backup_mqtt_configuracao" FOREIGN KEY ("id_mqtt_configuracao") REFERENCES "mqttconfiguracoes"("id_mqtt_configuracao") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backups" ADD CONSTRAINT "fk_backup_mqtt_configuracao_historico" FOREIGN KEY ("id_mqtt_configuracao_historico") REFERENCES "mqttconfiguracoeshistorico"("id_mqtt_configuracao_historico") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backups" ADD CONSTRAINT "fk_backup_usuario" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backups" ADD CONSTRAINT "fk_backup_usuario_restauracao" FOREIGN KEY ("id_usuario_restauracao") REFERENCES "usuarios"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bombas" ADD CONSTRAINT "fk_bomba_config" FOREIGN KEY ("id_configuracao_sistema") REFERENCES "configuracoessistema"("id_configuracao_sistema") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bombas" ADD CONSTRAINT "fk_bomba_usuario" FOREIGN KEY ("id_usuario_alteracao") REFERENCES "usuarios"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracoessistema" ADD CONSTRAINT "fk_config_usuario" FOREIGN KEY ("id_usuario_alteracao") REFERENCES "usuarios"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos" ADD CONSTRAINT "fk_evento_processo" FOREIGN KEY ("id_processo") REFERENCES "processos"("id_processo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos" ADD CONSTRAINT "fk_evento_processo_tanque_sensor" FOREIGN KEY ("id_processo_tanque_sensor") REFERENCES "processostanquessensores"("id_processo_tanque_sensor") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leiturasensores" ADD CONSTRAINT "fk_leitura_processo_tanque_sensor" FOREIGN KEY ("id_processo_tanque_sensor") REFERENCES "processostanquessensores"("id_processo_tanque_sensor") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logsoperacionais" ADD CONSTRAINT "fk_log_processo" FOREIGN KEY ("id_processo") REFERENCES "processos"("id_processo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logsoperacionais" ADD CONSTRAINT "fk_log_usuario" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mqttconfiguracoes" ADD CONSTRAINT "fk_mqtt_config_usuario" FOREIGN KEY ("id_usuario_alteracao") REFERENCES "usuarios"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mqttmensagens" ADD CONSTRAINT "fk_mqtt_mensagem_config" FOREIGN KEY ("id_mqtt_configuracao") REFERENCES "mqttconfiguracoes"("id_mqtt_configuracao") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mqttmensagens" ADD CONSTRAINT "fk_mqtt_mensagem_processo_tanque_sensor" FOREIGN KEY ("id_processo_tanque_sensor") REFERENCES "processostanquessensores"("id_processo_tanque_sensor") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "niveispermissoes" ADD CONSTRAINT "fk_nivel_permissao_nivel" FOREIGN KEY ("id_nivel_acesso") REFERENCES "niveisacessos"("id_nivel_acesso") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "niveispermissoes" ADD CONSTRAINT "fk_nivel_permissao_permissao" FOREIGN KEY ("id_permissao") REFERENCES "permissoes"("id_permissao") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processos" ADD CONSTRAINT "fk_processo_usuario" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processos" ADD CONSTRAINT "fk_processos_processo_tanque_atual" FOREIGN KEY ("id_processo_tanque_atual") REFERENCES "processostanques"("id_processo_tanque") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processostanques" ADD CONSTRAINT "fk_processo_tanque_processo" FOREIGN KEY ("id_processo") REFERENCES "processos"("id_processo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processostanques" ADD CONSTRAINT "fk_processo_tanque_tanque" FOREIGN KEY ("id_tanque") REFERENCES "tanques"("id_tanque") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processostanquessensores" ADD CONSTRAINT "fk_processo_tanque_sensor_processo_tanque" FOREIGN KEY ("id_processo_tanque") REFERENCES "processostanques"("id_processo_tanque") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processostanquessensores" ADD CONSTRAINT "fk_processo_tanque_sensor_sensor" FOREIGN KEY ("id_sensor") REFERENCES "sensores"("id_sensor") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relatorios" ADD CONSTRAINT "fk_relatorio_alarme" FOREIGN KEY ("id_alarme") REFERENCES "alarmes"("id_alarme") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relatorios" ADD CONSTRAINT "fk_relatorio_processo" FOREIGN KEY ("id_processo") REFERENCES "processos"("id_processo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relatorios" ADD CONSTRAINT "fk_relatorio_usuario" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "fk_usuario_nivel_acesso" FOREIGN KEY ("id_nivel_acesso") REFERENCES "niveisacessos"("id_nivel_acesso") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mqttconfiguracoeshistorico" ADD CONSTRAINT "fk_mqtt_config_historico_config" FOREIGN KEY ("id_mqtt_configuracao") REFERENCES "mqttconfiguracoes"("id_mqtt_configuracao") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mqttconfiguracoeshistorico" ADD CONSTRAINT "fk_mqtt_config_historico_usuario" FOREIGN KEY ("id_usuario_alteracao") REFERENCES "usuarios"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processosmqttconfiguracoeshistorico" ADD CONSTRAINT "fk_proc_mqtt_hist_config_historico" FOREIGN KEY ("id_mqtt_configuracao_historico") REFERENCES "mqttconfiguracoeshistorico"("id_mqtt_configuracao_historico") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processosmqttconfiguracoeshistorico" ADD CONSTRAINT "fk_proc_mqtt_hist_processo" FOREIGN KEY ("id_processo") REFERENCES "processos"("id_processo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valvulas" ADD CONSTRAINT "fk_valvulas_bombas" FOREIGN KEY ("id_bomba") REFERENCES "bombas"("id_bomba") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valvulas" ADD CONSTRAINT "fk_valvulas_tanque" FOREIGN KEY ("id_tanque") REFERENCES "tanques"("id_tanque") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensoresacoplamentomangueiras" ADD CONSTRAINT "fk_sensores_acoplamento_mangueiras_sensor" FOREIGN KEY ("id_sensor") REFERENCES "sensores"("id_sensor") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensoresacoplamentomangueiras" ADD CONSTRAINT "fk_sensores_acoplamento_mangueiras_tanque" FOREIGN KEY ("id_tanque") REFERENCES "tanques"("id_tanque") ON DELETE RESTRICT ON UPDATE CASCADE;
