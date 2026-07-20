CREATE TYPE "statusintegridadesensor" AS ENUM (
  'PENDENTE_CALIBRACAO',
  'VALIDO',
  'LEITURA_IMPOSSIVEL',
  'FORA_FAIXA',
  'OSCILANDO',
  'TRAVADO',
  'TIMEOUT',
  'MUDANCA_ABRUPTA'
);

ALTER TABLE "configuracoessistema"
  ADD COLUMN "estagnacao_tempo_minimo_bomba_principal_segundos" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "estagnacao_tempo_maximo_sem_progresso_segundos" INTEGER NOT NULL DEFAULT 180,
  ADD COLUMN "estagnacao_fator_minimo_proximidade_alvo" DECIMAL(5,3) NOT NULL DEFAULT 0.350,
  ADD COLUMN "auxilio_janela_avaliacao_segundos" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "auxilio_melhoria_minima" DECIMAL(10,3) NOT NULL DEFAULT 1.000,
  ADD COLUMN "auxilio_timeout_segundos" INTEGER NOT NULL DEFAULT 180;

ALTER TABLE "processos"
  ADD COLUMN "estagnacao_janela_segundos" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "estagnacao_variacao_minima" DECIMAL(10,3) NOT NULL DEFAULT 2.000,
  ADD COLUMN "estagnacao_leituras_minimas" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "estagnacao_janelas_consecutivas" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "estagnacao_tempo_minimo_bomba_principal_segundos" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "estagnacao_tempo_maximo_sem_progresso_segundos" INTEGER NOT NULL DEFAULT 180,
  ADD COLUMN "estagnacao_fator_minimo_proximidade_alvo" DECIMAL(5,3) NOT NULL DEFAULT 0.350,
  ADD COLUMN "auxilio_janela_avaliacao_segundos" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "auxilio_melhoria_minima" DECIMAL(10,3) NOT NULL DEFAULT 1.000,
  ADD COLUMN "auxilio_timeout_segundos" INTEGER NOT NULL DEFAULT 180;

UPDATE "processos" p
SET
  "estagnacao_janela_segundos" = c."estagnacao_janela_segundos",
  "estagnacao_variacao_minima" = c."estagnacao_variacao_minima",
  "estagnacao_leituras_minimas" = c."estagnacao_leituras_minimas",
  "estagnacao_janelas_consecutivas" = c."estagnacao_janelas_consecutivas"
FROM (
  SELECT * FROM "configuracoessistema" ORDER BY "atualizado_em" DESC LIMIT 1
) c;

ALTER TABLE "processostanques"
  ADD COLUMN "estagnacao_variacao_minima_ajustada" DECIMAL(10,3),
  ADD COLUMN "estagnacao_fator_volume" DECIMAL(8,4),
  ADD COLUMN "estagnacao_fator_tanques_ativos" DECIMAL(8,4),
  ADD COLUMN "estagnacao_fator_proximidade_alvo" DECIMAL(8,4),
  ADD COLUMN "estagnacao_volume_tanque" DECIMAL(10,2),
  ADD COLUMN "estagnacao_volume_medio_tanques_ativos" DECIMAL(10,2),
  ADD COLUMN "estagnacao_tanques_ativos" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "estagnacao_vacuo_atual" DECIMAL(10,3),
  ADD COLUMN "estagnacao_distancia_alvo" DECIMAL(10,3),
  ADD COLUMN "estagnacao_tempo_bomba_principal_segundos" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "estagnacao_motivo_decisao" TEXT;

ALTER TABLE "processostanquesauxiliares"
  ADD COLUMN "avaliacao_iniciada_em" TIMESTAMP(6),
  ADD COLUMN "avaliacao_finalizada_em" TIMESTAMP(6),
  ADD COLUMN "vacuo_antes_auxilio" DECIMAL(10,3),
  ADD COLUMN "tendencia_antes_auxilio" DECIMAL(10,3),
  ADD COLUMN "vacuo_durante_auxilio" DECIMAL(10,3),
  ADD COLUMN "tendencia_durante_auxilio" DECIMAL(10,3),
  ADD COLUMN "vacuo_apos_auxilio" DECIMAL(10,3),
  ADD COLUMN "tendencia_apos_auxilio" DECIMAL(10,3),
  ADD COLUMN "melhoria_observada" DECIMAL(10,3),
  ADD COLUMN "melhoria_minima_esperada" DECIMAL(10,3),
  ADD COLUMN "eficacia_confirmada" BOOLEAN,
  ADD COLUMN "motivo_avaliacao" TEXT;

UPDATE "sensores" SET "fator_calibracao" = 1.0000 WHERE "fator_calibracao" IS NULL;

ALTER TABLE "sensores"
  ALTER COLUMN "fator_calibracao" SET DEFAULT 1.0000,
  ALTER COLUMN "fator_calibracao" SET NOT NULL,
  ADD COLUMN "offset_calibracao" DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
  ADD COLUMN "status_integridade" "statusintegridadesensor" NOT NULL DEFAULT 'PENDENTE_CALIBRACAO',
  ADD COLUMN "ultimo_valor_bruto" DECIMAL(10,3),
  ADD COLUMN "calibrado_em" TIMESTAMP(6),
  ADD COLUMN "calibracao_valida_ate" TIMESTAMP(6),
  ADD COLUMN "calibracao_referencia" TEXT,
  ADD COLUMN "calibracao_incerteza" DECIMAL(10,4),
  ADD COLUMN "calibracao_observacoes" TEXT,
  ADD COLUMN "modo_calibracao_ativo" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "calibracao_iniciada_em" TIMESTAMP(6),
  ADD COLUMN "id_usuario_calibracao" INTEGER,
  ADD COLUMN "liberado_em" TIMESTAMP(6),
  ADD COLUMN "id_usuario_liberacao" INTEGER,
  ADD COLUMN "integridade_validada_em" TIMESTAMP(6),
  ADD COLUMN "integridade_ultimo_erro" TEXT,
  ADD COLUMN "limite_minimo_operacional" DECIMAL(10,3),
  ADD COLUMN "limite_maximo_operacional" DECIMAL(10,3),
  ADD COLUMN "variacao_maxima_por_segundo" DECIMAL(10,3),
  ADD COLUMN "oscilacao_maxima" DECIMAL(10,3),
  ADD COLUMN "tempo_travado_segundos" INTEGER NOT NULL DEFAULT 60;

UPDATE "sensores"
SET "status_integridade" = 'VALIDO'
WHERE "tipo_sensor" <> 'VACUO';

UPDATE "sensores"
SET
  "status_sensor" = 'INATIVO',
  "status_integridade" = 'PENDENTE_CALIBRACAO',
  "integridade_ultimo_erro" = 'Calibracao e liberacao tecnica exigidas pela Fase 2.'
WHERE "tipo_sensor" = 'VACUO';

ALTER TABLE "sensores"
  ADD CONSTRAINT "fk_sensores_usuario_calibracao"
    FOREIGN KEY ("id_usuario_calibracao") REFERENCES "usuarios"("id_usuario") ON DELETE SET NULL,
  ADD CONSTRAINT "fk_sensores_usuario_liberacao"
    FOREIGN KEY ("id_usuario_liberacao") REFERENCES "usuarios"("id_usuario") ON DELETE SET NULL,
  ADD CONSTRAINT "ck_sensores_fator_calibracao_positivo" CHECK ("fator_calibracao" > 0),
  ADD CONSTRAINT "ck_sensores_limites_operacionais" CHECK (
    "limite_minimo_operacional" IS NULL OR
    "limite_maximo_operacional" IS NULL OR
    "limite_minimo_operacional" < "limite_maximo_operacional"
  );

ALTER TABLE "processos"
  ADD CONSTRAINT "ck_processos_auxilio_janela_timeout" CHECK (
    "auxilio_timeout_segundos" >= "auxilio_janela_avaliacao_segundos"
  ),
  ADD CONSTRAINT "ck_processos_estagnacao_fator_alvo" CHECK (
    "estagnacao_fator_minimo_proximidade_alvo" > 0 AND
    "estagnacao_fator_minimo_proximidade_alvo" <= 1
  );

CREATE INDEX "idx_sensores_status_integridade" ON "sensores"("status_integridade");
CREATE INDEX "idx_sensores_calibracao_validade" ON "sensores"("calibracao_valida_ate");
