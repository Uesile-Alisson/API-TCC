CREATE TYPE "etapaencerramentotanque" AS ENUM (
  'NENHUMA',
  'AGUARDANDO_AUXILIAR_SEGURO',
  'FECHANDO_VALVULA_PRINCIPAL',
  'AGUARDANDO_LEITURA_ISOLAMENTO',
  'RETENDO',
  'REABRINDO_VALVULA_PRINCIPAL',
  'CONCLUIDA',
  'FALHA'
);

ALTER TABLE "processostanques"
  ADD COLUMN "etapa_encerramento" "etapaencerramentotanque" NOT NULL DEFAULT 'NENHUMA',
  ADD COLUMN "encerramento_tentativa" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "encerramento_comando_tentativas" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "encerramento_proxima_tentativa_em" TIMESTAMP(6);

ALTER TABLE "processostanques"
  ADD CONSTRAINT "chk_pt_enc_tentativa" CHECK ("encerramento_tentativa" >= 0),
  ADD CONSTRAINT "chk_pt_enc_comando_tentativas" CHECK ("encerramento_comando_tentativas" >= 0);

CREATE INDEX "idx_processostanques_etapa_encerramento"
  ON "processostanques"("etapa_encerramento", "encerramento_proxima_tentativa_em");
