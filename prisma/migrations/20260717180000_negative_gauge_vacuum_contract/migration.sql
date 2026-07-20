-- O contrato do TSEA usa pressao manometrica em kPa: vacuo e negativo.
-- Registros positivos foram produzidos pelo validador legado com a regra invertida.
UPDATE "processos"
SET "vacuo_alvo" = -ABS("vacuo_alvo")
WHERE "vacuo_alvo" > 0;

UPDATE "processostanques"
SET "vacuo_alvo" = -ABS("vacuo_alvo")
WHERE "vacuo_alvo" > 0;

UPDATE "tanques"
SET "vacuo_padrao" = -ABS("vacuo_padrao")
WHERE "vacuo_padrao" > 0;

UPDATE "configuracoessistema"
SET
  "vacuo_padrao" = -ABS("vacuo_padrao"),
  "limite_seguranca_vacuo" = -ABS("limite_seguranca_vacuo")
WHERE "vacuo_padrao" > 0 OR "limite_seguranca_vacuo" > 0;

UPDATE "processos"
SET "encerramento_limite_seguranca_vacuo" = -ABS("encerramento_limite_seguranca_vacuo")
WHERE "encerramento_limite_seguranca_vacuo" > 0;

ALTER TABLE "processos"
  ADD CONSTRAINT "ck_processos_vacuo_alvo_negativo"
    CHECK ("vacuo_alvo" < 0),
  ADD CONSTRAINT "ck_processos_limite_seguranca_vacuo_negativo"
    CHECK ("encerramento_limite_seguranca_vacuo" < 0);

ALTER TABLE "processostanques"
  ADD CONSTRAINT "ck_processostanques_vacuo_alvo_negativo"
    CHECK ("vacuo_alvo" < 0);

ALTER TABLE "tanques"
  ADD CONSTRAINT "ck_tanques_vacuo_padrao_negativo"
    CHECK ("vacuo_padrao" < 0);

ALTER TABLE "configuracoessistema"
  ADD CONSTRAINT "ck_configuracoessistema_vacuo_padrao_negativo"
    CHECK ("vacuo_padrao" < 0),
  ADD CONSTRAINT "ck_configuracoessistema_limite_seguranca_vacuo_negativo"
    CHECK ("limite_seguranca_vacuo" < 0);
