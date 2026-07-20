-- A partida passa a ser uma operacao persistente e recuperavel.
CREATE TYPE "statuspartidaprocesso" AS ENUM (
  'INATIVA',
  'EM_ANDAMENTO',
  'CONCLUIDA',
  'FALHA'
);

CREATE TYPE "etapapartidaprocesso" AS ENUM (
  'NENHUMA',
  'PREPARANDO_ESTADO_SEGURO',
  'SINCRONIZANDO_HARDWARE',
  'CARREGANDO_PROCESSO',
  'ABRINDO_VALVULAS_PRINCIPAIS',
  'LIGANDO_BOMBA_PRINCIPAL',
  'CONFIRMANDO_TELEMETRIA',
  'EXECUTANDO_ROLLBACK',
  'CONCLUIDA',
  'FALHA'
);

CREATE TYPE "statuscomandomqtt" AS ENUM (
  'PENDENTE',
  'PUBLICADO',
  'RECEBIDO',
  'EXECUTADO',
  'RECUSADO',
  'ERRO',
  'TIMEOUT'
);

ALTER TABLE "processos"
  ADD COLUMN "status_partida" "statuspartidaprocesso" NOT NULL DEFAULT 'INATIVA',
  ADD COLUMN "etapa_partida" "etapapartidaprocesso" NOT NULL DEFAULT 'NENHUMA',
  ADD COLUMN "partida_iniciada_em" TIMESTAMP(6),
  ADD COLUMN "partida_finalizada_em" TIMESTAMP(6),
  ADD COLUMN "partida_confirmacao_iniciada_em" TIMESTAMP(6),
  ADD COLUMN "partida_execucao_bloqueada_ate" TIMESTAMP(6),
  ADD COLUMN "partida_tentativa" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "partida_comando_tentativas" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "partida_ultimo_erro" TEXT,
  ADD COLUMN "partida_id_usuario" INTEGER,
  ADD COLUMN "partida_versao" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "idx_processos_partida_pendente"
  ON "processos"("status_partida", "etapa_partida", "partida_execucao_bloqueada_ate");

-- Impede duas partidas/processos operacionais concorrentes inclusive entre replicas.
CREATE UNIQUE INDEX "uq_processos_operacao_unica"
  ON "processos" ((true))
  WHERE "status_partida" = 'EM_ANDAMENTO'
     OR "status_processo" IN ('EM_EXECUCAO', 'PAUSADO');

ALTER TABLE "processos"
  ADD CONSTRAINT "ck_processos_partida_tentativas"
    CHECK ("partida_tentativa" >= 0 AND "partida_comando_tentativas" >= 0);

CREATE TABLE "comandosmqtt" (
  "id_comando_mqtt" SERIAL NOT NULL,
  "correlation_id" VARCHAR(200) NOT NULL,
  "comando" VARCHAR(80) NOT NULL,
  "status" "statuscomandomqtt" NOT NULL DEFAULT 'PENDENTE',
  "id_processo" INTEGER,
  "id_processo_tanque" INTEGER,
  "id_usuario" INTEGER,
  "topico_publicacao" VARCHAR(180) NOT NULL,
  "topico_ack" VARCHAR(180),
  "payload" JSONB NOT NULL,
  "payload_ack" JSONB,
  "qos" SMALLINT NOT NULL,
  "retain" BOOLEAN NOT NULL DEFAULT false,
  "tentativas" INTEGER NOT NULL DEFAULT 0,
  "publicado_em" TIMESTAMP(6),
  "ack_recebido_em" TIMESTAMP(6),
  "finalizado_em" TIMESTAMP(6),
  "mensagem_ack" TEXT,
  "erro" TEXT,
  "criado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "comandosmqtt_pkey" PRIMARY KEY ("id_comando_mqtt"),
  CONSTRAINT "ck_comandosmqtt_qos" CHECK ("qos" BETWEEN 0 AND 2),
  CONSTRAINT "ck_comandosmqtt_tentativas" CHECK ("tentativas" >= 0)
);

CREATE UNIQUE INDEX "uq_comandosmqtt_correlation_id"
  ON "comandosmqtt"("correlation_id");

CREATE INDEX "idx_comandosmqtt_status_atualizado"
  ON "comandosmqtt"("status", "atualizado_em");

CREATE INDEX "idx_comandosmqtt_processo_criado"
  ON "comandosmqtt"("id_processo", "criado_em");

CREATE INDEX "idx_comandosmqtt_processo_tanque_criado"
  ON "comandosmqtt"("id_processo_tanque", "criado_em");
