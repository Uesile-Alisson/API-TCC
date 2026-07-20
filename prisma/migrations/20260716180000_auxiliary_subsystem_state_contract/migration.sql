DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'modooperacaoauxiliar') THEN
    CREATE TYPE "modooperacaoauxiliar" AS ENUM ('AUTOMATICO', 'ASSISTIDO', 'MANUAL');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statussubsistemaauxiliar') THEN
    CREATE TYPE "statussubsistemaauxiliar" AS ENUM (
      'INATIVO',
      'DISPONIVEL',
      'AGUARDANDO',
      'PREPARANDO',
      'OPERANDO',
      'TROCANDO_TANQUE',
      'CONTROLE_MANUAL',
      'BLOQUEADO',
      'FALHA'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statusauxiliotanque') THEN
    CREATE TYPE "statusauxiliotanque" AS ENUM (
      'INATIVO',
      'MONITORANDO',
      'ELEGIVEL',
      'AGUARDANDO',
      'EM_ATENDIMENTO',
      'ATENDIDO',
      'BLOQUEADO',
      'FALHA'
    );
  END IF;
END
$$;

ALTER TABLE "processos"
  ADD COLUMN IF NOT EXISTS "modo_operacao_auxiliar" "modooperacaoauxiliar" NOT NULL DEFAULT 'AUTOMATICO';

ALTER TABLE "bombas"
  ADD COLUMN IF NOT EXISTS "ligada_hardware" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "disponivel_hardware" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "ultimo_status_hardware_em" TIMESTAMP(6);

CREATE TABLE IF NOT EXISTS "processosauxiliares" (
  "id_processo_auxiliar" SERIAL NOT NULL,
  "id_processo" INTEGER NOT NULL,
  "status_subsistema" "statussubsistemaauxiliar" NOT NULL DEFAULT 'INATIVO',
  "id_processo_tanque_atual" INTEGER,
  "id_usuario_controle_bomba" INTEGER,
  "controle_bomba_assumido_em" TIMESTAMP(6),
  "controle_bomba_expira_em" TIMESTAMP(6),
  "versao" INTEGER NOT NULL DEFAULT 0,
  "motivo_bloqueio" TEXT,
  "ultimo_erro" TEXT,
  "criado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "processosauxiliares_pkey" PRIMARY KEY ("id_processo_auxiliar"),
  CONSTRAINT "uq_processosauxiliares_processo" UNIQUE ("id_processo"),
  CONSTRAINT "uq_processosauxiliares_tanque_atual" UNIQUE ("id_processo_tanque_atual"),
  CONSTRAINT "fk_processosauxiliares_processo"
    FOREIGN KEY ("id_processo") REFERENCES "processos"("id_processo")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_processosauxiliares_tanque_atual"
    FOREIGN KEY ("id_processo_tanque_atual") REFERENCES "processostanques"("id_processo_tanque")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "fk_processosauxiliares_usuario_controle_bomba"
    FOREIGN KEY ("id_usuario_controle_bomba") REFERENCES "usuarios"("id_usuario")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ck_processosauxiliares_versao_nao_negativa" CHECK ("versao" >= 0),
  CONSTRAINT "ck_processosauxiliares_controle_bomba_periodo" CHECK (
    "controle_bomba_expira_em" IS NULL
    OR "controle_bomba_assumido_em" IS NULL
    OR "controle_bomba_expira_em" > "controle_bomba_assumido_em"
  )
);

CREATE TABLE IF NOT EXISTS "processostanquesauxiliares" (
  "id_processo_tanque_auxiliar" SERIAL NOT NULL,
  "id_processo_tanque" INTEGER NOT NULL,
  "status_auxilio" "statusauxiliotanque" NOT NULL DEFAULT 'INATIVO',
  "prioridade" INTEGER NOT NULL DEFAULT 0,
  "solicitado_em" TIMESTAMP(6),
  "iniciado_em" TIMESTAMP(6),
  "finalizado_em" TIMESTAMP(6),
  "id_usuario_controle_valvula" INTEGER,
  "controle_valvula_assumido_em" TIMESTAMP(6),
  "controle_valvula_expira_em" TIMESTAMP(6),
  "versao" INTEGER NOT NULL DEFAULT 0,
  "motivo_bloqueio" TEXT,
  "ultimo_erro" TEXT,
  "criado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "processostanquesauxiliares_pkey" PRIMARY KEY ("id_processo_tanque_auxiliar"),
  CONSTRAINT "uq_processostanquesauxiliares_processo_tanque" UNIQUE ("id_processo_tanque"),
  CONSTRAINT "fk_processostanquesauxiliares_processo_tanque"
    FOREIGN KEY ("id_processo_tanque") REFERENCES "processostanques"("id_processo_tanque")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fk_processostanquesauxiliares_usuario_controle_valvula"
    FOREIGN KEY ("id_usuario_controle_valvula") REFERENCES "usuarios"("id_usuario")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ck_processostanquesauxiliares_prioridade_nao_negativa" CHECK ("prioridade" >= 0),
  CONSTRAINT "ck_processostanquesauxiliares_versao_nao_negativa" CHECK ("versao" >= 0),
  CONSTRAINT "ck_processostanquesauxiliares_periodo_atendimento" CHECK (
    "finalizado_em" IS NULL OR "iniciado_em" IS NULL OR "finalizado_em" >= "iniciado_em"
  ),
  CONSTRAINT "ck_processostanquesauxiliares_controle_valvula_periodo" CHECK (
    "controle_valvula_expira_em" IS NULL
    OR "controle_valvula_assumido_em" IS NULL
    OR "controle_valvula_expira_em" > "controle_valvula_assumido_em"
  )
);

CREATE INDEX IF NOT EXISTS "idx_processosauxiliares_status"
  ON "processosauxiliares"("status_subsistema");
CREATE INDEX IF NOT EXISTS "idx_processosauxiliares_usuario_controle_bomba"
  ON "processosauxiliares"("id_usuario_controle_bomba");
CREATE INDEX IF NOT EXISTS "idx_processosauxiliares_controle_bomba_expira"
  ON "processosauxiliares"("controle_bomba_expira_em");
CREATE INDEX IF NOT EXISTS "idx_processostanquesauxiliares_fila"
  ON "processostanquesauxiliares"("status_auxilio", "prioridade", "solicitado_em");
CREATE INDEX IF NOT EXISTS "idx_processostanquesauxiliares_usuario_controle_valvula"
  ON "processostanquesauxiliares"("id_usuario_controle_valvula");
CREATE INDEX IF NOT EXISTS "idx_processostanquesauxiliares_controle_valvula_expira"
  ON "processostanquesauxiliares"("controle_valvula_expira_em");

INSERT INTO "processosauxiliares" ("id_processo")
SELECT "id_processo" FROM "processos"
ON CONFLICT ("id_processo") DO NOTHING;

INSERT INTO "processostanquesauxiliares" ("id_processo_tanque")
SELECT "id_processo_tanque" FROM "processostanques"
ON CONFLICT ("id_processo_tanque") DO NOTHING;
