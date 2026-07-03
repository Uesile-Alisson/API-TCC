-- Safe alarm acknowledgement/normalization migration.
-- This migration preserves existing alarm data and separates:
-- ATIVO/NORMALIZADO/RESOLVIDO status, human acknowledgement, and automatic recovery attempts.

ALTER TYPE "statusalarme" ADD VALUE IF NOT EXISTS 'NORMALIZADO';

DO $$
BEGIN
  CREATE TYPE "motivoresolucaoalarme" AS ENUM (
    'VALIDADO_PELO_SISTEMA',
    'AUTO_RECUPERADO',
    'FECHAMENTO_POS_PROCESSO',
    'NORMALIZADO_CONFIRMADO_PELO_USUARIO'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "resultadotentativarecuperacaoalarme" AS ENUM (
    'SUCESSO',
    'FALHA',
    'IGNORADA'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "alarmes"
  ADD COLUMN IF NOT EXISTS "normalizado_em" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "motivo_resolucao" "motivoresolucaoalarme",
  ADD COLUMN IF NOT EXISTS "tentativas_recuperacao" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ultima_tentativa_recuperacao_em" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "ultima_validacao_em" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "bloqueante" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "requer_intervencao" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "recuperacao_automatica" BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN "alarmes"."normalizado_em" IS
  'Timestamp em que o sistema validou que a causa tecnica do alarme desapareceu.';
COMMENT ON COLUMN "alarmes"."motivo_resolucao" IS
  'Motivo rastreavel usado para normalizar ou resolver tecnicamente o alarme.';
COMMENT ON COLUMN "alarmes"."tentativas_recuperacao" IS
  'Contador de tentativas automaticas de recuperacao associadas ao alarme.';
COMMENT ON COLUMN "alarmes"."ultima_tentativa_recuperacao_em" IS
  'Ultimo horario em que o backend tentou recuperar automaticamente a causa do alarme.';
COMMENT ON COLUMN "alarmes"."ultima_validacao_em" IS
  'Ultimo horario em que o backend validou o estado tecnico da causa do alarme.';
COMMENT ON COLUMN "alarmes"."bloqueante" IS
  'Indica que o alarme bloqueia operacao enquanto permanecer ativo.';
COMMENT ON COLUMN "alarmes"."requer_intervencao" IS
  'Indica que o alarme exige acao humana antes do fechamento seguro.';
COMMENT ON COLUMN "alarmes"."recuperacao_automatica" IS
  'Indica que o backend pode tentar recuperar automaticamente a causa tecnica do alarme.';

CREATE TABLE IF NOT EXISTS "alarmesreconhecimentos" (
  "id_alarme_reconhecimento" SERIAL NOT NULL,
  "id_alarme" INTEGER NOT NULL,
  "id_usuario" INTEGER NOT NULL,
  "reconhecido_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "observacao" TEXT,
  "status_processo_snapshot" VARCHAR(40),
  "fase_processo_snapshot" VARCHAR(40),

  CONSTRAINT "alarmesreconhecimentos_pkey" PRIMARY KEY ("id_alarme_reconhecimento"),
  CONSTRAINT "fk_alarme_reconhecimento_alarme"
    FOREIGN KEY ("id_alarme") REFERENCES "alarmes"("id_alarme") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_alarme_reconhecimento_usuario"
    FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE
);

COMMENT ON TABLE "alarmesreconhecimentos" IS
  'Registra reconhecimento humano de alarmes sem marcar o evento como resolvido.';
COMMENT ON COLUMN "alarmesreconhecimentos"."status_processo_snapshot" IS
  'Status do processo no momento do reconhecimento humano do alarme.';
COMMENT ON COLUMN "alarmesreconhecimentos"."fase_processo_snapshot" IS
  'Fase operacional do processo no momento do reconhecimento humano do alarme.';

CREATE TABLE IF NOT EXISTS "alarmesrecuperacoestentativas" (
  "id_alarme_recuperacao_tentativa" SERIAL NOT NULL,
  "id_alarme" INTEGER NOT NULL,
  "tipo_recuperacao" VARCHAR(80) NOT NULL,
  "resultado" "resultadotentativarecuperacaoalarme" NOT NULL,
  "descricao" TEXT,
  "executado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "origem" "origemlogoperacional" NOT NULL DEFAULT 'SISTEMA',

  CONSTRAINT "alarmesrecuperacoestentativas_pkey" PRIMARY KEY ("id_alarme_recuperacao_tentativa"),
  CONSTRAINT "fk_alarme_recuperacao_tentativa_alarme"
    FOREIGN KEY ("id_alarme") REFERENCES "alarmes"("id_alarme") ON DELETE CASCADE ON UPDATE CASCADE
);

COMMENT ON TABLE "alarmesrecuperacoestentativas" IS
  'Registra cada tentativa automatica de recuperacao tecnica associada a um alarme.';
COMMENT ON COLUMN "alarmesrecuperacoestentativas"."tipo_recuperacao" IS
  'Tipo de acao automatica executada para tentar normalizar a causa do alarme.';
COMMENT ON COLUMN "alarmesrecuperacoestentativas"."resultado" IS
  'Resultado da tentativa automatica de recuperacao do alarme.';

CREATE INDEX IF NOT EXISTS "idx_alarmes_status_severidade"
  ON "alarmes"("status_alarme", "severidade");
CREATE INDEX IF NOT EXISTS "idx_alarmes_bloqueante_status"
  ON "alarmes"("bloqueante", "status_alarme");
CREATE INDEX IF NOT EXISTS "idx_alarmes_recuperacao_status"
  ON "alarmes"("recuperacao_automatica", "status_alarme");
CREATE INDEX IF NOT EXISTS "idx_alarmes_normalizado_em"
  ON "alarmes"("normalizado_em");
CREATE INDEX IF NOT EXISTS "idx_alarmes_ultima_validacao"
  ON "alarmes"("ultima_validacao_em");

CREATE INDEX IF NOT EXISTS "idx_alarmes_reconhecimentos_alarme"
  ON "alarmesreconhecimentos"("id_alarme");
CREATE INDEX IF NOT EXISTS "idx_alarmes_reconhecimentos_usuario"
  ON "alarmesreconhecimentos"("id_usuario");
CREATE INDEX IF NOT EXISTS "idx_alarmes_reconhecimentos_data"
  ON "alarmesreconhecimentos"("reconhecido_em");

CREATE INDEX IF NOT EXISTS "idx_alarmes_recuperacoes_alarme"
  ON "alarmesrecuperacoestentativas"("id_alarme");
CREATE INDEX IF NOT EXISTS "idx_alarmes_recuperacoes_resultado"
  ON "alarmesrecuperacoestentativas"("resultado");
CREATE INDEX IF NOT EXISTS "idx_alarmes_recuperacoes_data"
  ON "alarmesrecuperacoestentativas"("executado_em");
