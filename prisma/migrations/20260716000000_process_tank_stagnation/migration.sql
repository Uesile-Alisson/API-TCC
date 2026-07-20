-- Configurable stagnation detector parameters.
ALTER TABLE "configuracoessistema"
  ADD COLUMN IF NOT EXISTS "estagnacao_janela_segundos" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS "estagnacao_variacao_minima" DECIMAL(10, 3) NOT NULL DEFAULT 2.000,
  ADD COLUMN IF NOT EXISTS "estagnacao_leituras_minimas" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "estagnacao_janelas_consecutivas" INTEGER NOT NULL DEFAULT 2;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statusestagnacao') THEN
    CREATE TYPE "statusestagnacao" AS ENUM ('NORMAL', 'SUSPEITA', 'DETECTADA');
  END IF;
END
$$;

ALTER TABLE "processostanques"
  ADD COLUMN IF NOT EXISTS "status_estagnacao" "statusestagnacao" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS "estagnacao_iniciada_em" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "estagnacao_detectada_em" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "estagnacao_ultima_avaliacao_em" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "estagnacao_variacao_vacuo" DECIMAL(10, 3),
  ADD COLUMN IF NOT EXISTS "estagnacao_leituras_janela" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "estagnacao_janelas_sem_progresso" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "idx_processostanques_status_estagnacao"
  ON "processostanques"("status_estagnacao");

ALTER TYPE "tipoalarme" ADD VALUE IF NOT EXISTS 'ESTAGNACAO';
ALTER TYPE "tipoeventoprocesso" ADD VALUE IF NOT EXISTS 'ESTAGNACAO_SUSPEITA';
ALTER TYPE "tipoeventoprocesso" ADD VALUE IF NOT EXISTS 'ESTAGNACAO_DETECTADA';
ALTER TYPE "tipoeventoprocesso" ADD VALUE IF NOT EXISTS 'ESTAGNACAO_NORMALIZADA';
