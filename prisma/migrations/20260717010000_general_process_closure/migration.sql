CREATE TYPE "statusencerramentoprocesso" AS ENUM (
  'INATIVO',
  'AGUARDANDO_TANQUES',
  'AGUARDANDO_ACAO_MANUAL',
  'ENCERRANDO',
  'CONFIRMANDO_HARDWARE',
  'CONCLUIDO',
  'FALHA'
);

CREATE TYPE "etapaencerramentoprocesso" AS ENUM (
  'NENHUMA',
  'VALIDANDO_ISOLAMENTO',
  'CONFIRMANDO_ISOLAMENTO',
  'DESLIGANDO_BOMBAS',
  'RECONFIRMANDO_VALVULAS',
  'AGUARDANDO_TELEMETRIA',
  'CONCLUIDA',
  'FALHA'
);

ALTER TABLE "processos"
  ADD COLUMN "status_encerramento_geral" "statusencerramentoprocesso" NOT NULL DEFAULT 'INATIVO',
  ADD COLUMN "etapa_encerramento_geral" "etapaencerramentoprocesso" NOT NULL DEFAULT 'NENHUMA',
  ADD COLUMN "encerramento_geral_iniciado_em" TIMESTAMP(6),
  ADD COLUMN "encerramento_geral_finalizado_em" TIMESTAMP(6),
  ADD COLUMN "encerramento_geral_confirmacao_iniciada_em" TIMESTAMP(6),
  ADD COLUMN "encerramento_geral_proxima_tentativa_em" TIMESTAMP(6),
  ADD COLUMN "encerramento_geral_tentativa" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "encerramento_geral_comando_tentativas" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "encerramento_geral_ultimo_erro" TEXT,
  ADD COLUMN "encerramento_geral_id_usuario" INTEGER;

ALTER TABLE "processos"
  ADD CONSTRAINT "chk_proc_enc_geral_tentativa" CHECK ("encerramento_geral_tentativa" >= 0),
  ADD CONSTRAINT "chk_proc_enc_geral_comando_tentativas" CHECK ("encerramento_geral_comando_tentativas" >= 0),
  ADD CONSTRAINT "chk_proc_enc_geral_ordem" CHECK (
    "encerramento_geral_finalizado_em" IS NULL OR
    "encerramento_geral_iniciado_em" IS NULL OR
    "encerramento_geral_finalizado_em" >= "encerramento_geral_iniciado_em"
  );

CREATE INDEX "idx_processos_encerramento_geral"
  ON "processos"(
    "status_encerramento_geral",
    "etapa_encerramento_geral",
    "encerramento_geral_proxima_tentativa_em"
  );
