CREATE TYPE "statusencerramentotanque" AS ENUM (
  'INATIVO',
  'MONITORANDO',
  'AGUARDANDO_ESTABILIZACAO',
  'PRONTO_PARA_ENCERRAR',
  'AGUARDANDO_ACAO_MANUAL',
  'ISOLANDO',
  'VERIFICANDO_RETENCAO',
  'RETENCAO_APROVADA',
  'CONCLUIDO',
  'BLOQUEADO',
  'FALHA'
);

ALTER TABLE "configuracoessistema"
  ADD COLUMN "tempo_estabilizacao_vacuo_segundos" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "estabilizacao_cobertura_minima_percentual" DECIMAL(5,2) NOT NULL DEFAULT 80.00,
  ADD COLUMN "intervalo_leitura_esperado_ms" INTEGER NOT NULL DEFAULT 1000,
  ADD COLUMN "timeout_leitura_sensor_ms" INTEGER NOT NULL DEFAULT 2500,
  ADD COLUMN "tempo_retencao_vacuo_segundos" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "perda_vacuo_maxima_retencao" DECIMAL(10,3) NOT NULL DEFAULT 2.000;

ALTER TABLE "configuracoessistema"
  ADD CONSTRAINT "chk_cfg_enc_estabilizacao_tempo" CHECK ("tempo_estabilizacao_vacuo_segundos" BETWEEN 5 AND 3600),
  ADD CONSTRAINT "chk_cfg_enc_estabilizacao_cobertura" CHECK ("estabilizacao_cobertura_minima_percentual" > 0 AND "estabilizacao_cobertura_minima_percentual" <= 100),
  ADD CONSTRAINT "chk_cfg_enc_intervalo_leitura" CHECK ("intervalo_leitura_esperado_ms" BETWEEN 100 AND 60000),
  ADD CONSTRAINT "chk_cfg_enc_timeout_leitura" CHECK ("timeout_leitura_sensor_ms" BETWEEN "intervalo_leitura_esperado_ms" AND 120000),
  ADD CONSTRAINT "chk_cfg_enc_retencao_tempo" CHECK ("tempo_retencao_vacuo_segundos" BETWEEN 5 AND 3600),
  ADD CONSTRAINT "chk_cfg_enc_retencao_perda" CHECK ("perda_vacuo_maxima_retencao" >= 0);

ALTER TABLE "processos"
  ADD COLUMN "encerramento_automatico" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "encerramento_tolerancia_vacuo_percentual" DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  ADD COLUMN "encerramento_limite_seguranca_vacuo" DECIMAL(10,3) NOT NULL DEFAULT -95.000,
  ADD COLUMN "encerramento_tempo_estabilizacao_segundos" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "encerramento_estabilizacao_cobertura_minima_percentual" DECIMAL(5,2) NOT NULL DEFAULT 80.00,
  ADD COLUMN "encerramento_intervalo_leitura_esperado_ms" INTEGER NOT NULL DEFAULT 1000,
  ADD COLUMN "encerramento_timeout_leitura_sensor_ms" INTEGER NOT NULL DEFAULT 2500,
  ADD COLUMN "encerramento_tempo_retencao_segundos" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "encerramento_perda_vacuo_maxima_retencao" DECIMAL(10,3) NOT NULL DEFAULT 2.000,
  ADD COLUMN "encerramento_versao" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "processos"
  ADD CONSTRAINT "chk_proc_enc_tolerancia" CHECK ("encerramento_tolerancia_vacuo_percentual" >= 0 AND "encerramento_tolerancia_vacuo_percentual" <= 100),
  ADD CONSTRAINT "chk_proc_enc_estabilizacao_tempo" CHECK ("encerramento_tempo_estabilizacao_segundos" BETWEEN 5 AND 3600),
  ADD CONSTRAINT "chk_proc_enc_estabilizacao_cobertura" CHECK ("encerramento_estabilizacao_cobertura_minima_percentual" > 0 AND "encerramento_estabilizacao_cobertura_minima_percentual" <= 100),
  ADD CONSTRAINT "chk_proc_enc_intervalo_leitura" CHECK ("encerramento_intervalo_leitura_esperado_ms" BETWEEN 100 AND 60000),
  ADD CONSTRAINT "chk_proc_enc_timeout_leitura" CHECK ("encerramento_timeout_leitura_sensor_ms" BETWEEN "encerramento_intervalo_leitura_esperado_ms" AND 120000),
  ADD CONSTRAINT "chk_proc_enc_retencao_tempo" CHECK ("encerramento_tempo_retencao_segundos" BETWEEN 5 AND 3600),
  ADD CONSTRAINT "chk_proc_enc_retencao_perda" CHECK ("encerramento_perda_vacuo_maxima_retencao" >= 0),
  ADD CONSTRAINT "chk_proc_enc_versao" CHECK ("encerramento_versao" >= 0);

ALTER TABLE "processostanques"
  ADD COLUMN "status_encerramento" "statusencerramentotanque" NOT NULL DEFAULT 'INATIVO',
  ADD COLUMN "encerramento_iniciado_em" TIMESTAMP(6),
  ADD COLUMN "isolado_em" TIMESTAMP(6),
  ADD COLUMN "retencao_iniciada_em" TIMESTAMP(6),
  ADD COLUMN "retencao_finalizada_em" TIMESTAMP(6),
  ADD COLUMN "vacuo_isolamento" DECIMAL(10,3),
  ADD COLUMN "perda_vacuo_retencao" DECIMAL(10,3),
  ADD COLUMN "motivo_bloqueio_encerramento" TEXT,
  ADD COLUMN "encerramento_versao" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "estabilizacao_leituras_esperadas" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "estabilizacao_leituras_observadas" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "estabilizacao_cobertura_percentual" DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN "estabilizacao_maior_intervalo_ms" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "processostanques"
  ADD CONSTRAINT "chk_pt_enc_perda_vacuo" CHECK ("perda_vacuo_retencao" IS NULL OR "perda_vacuo_retencao" >= 0),
  ADD CONSTRAINT "chk_pt_enc_versao" CHECK ("encerramento_versao" >= 0),
  ADD CONSTRAINT "chk_pt_enc_estab_leituras" CHECK ("estabilizacao_leituras_esperadas" >= 0 AND "estabilizacao_leituras_observadas" >= 0),
  ADD CONSTRAINT "chk_pt_enc_estab_cobertura" CHECK ("estabilizacao_cobertura_percentual" >= 0 AND "estabilizacao_cobertura_percentual" <= 100),
  ADD CONSTRAINT "chk_pt_enc_estab_intervalo" CHECK ("estabilizacao_maior_intervalo_ms" >= 0),
  ADD CONSTRAINT "chk_pt_enc_ordem_isolamento" CHECK ("isolado_em" IS NULL OR "encerramento_iniciado_em" IS NULL OR "isolado_em" >= "encerramento_iniciado_em"),
  ADD CONSTRAINT "chk_pt_enc_ordem_retencao" CHECK ("retencao_iniciada_em" IS NULL OR "isolado_em" IS NULL OR "retencao_iniciada_em" >= "isolado_em"),
  ADD CONSTRAINT "chk_pt_enc_ordem_final" CHECK ("retencao_finalizada_em" IS NULL OR "retencao_iniciada_em" IS NULL OR "retencao_finalizada_em" >= "retencao_iniciada_em");

CREATE INDEX "idx_processostanques_status_encerramento"
  ON "processostanques"("status_encerramento");
