-- Reforca a integridade referencial dos comandos e dos responsaveis pelas
-- transicoes do processo. A migracao preserva o ledger e o historico ao
-- excluir entidades relacionadas por meio de ON DELETE SET NULL.
--
-- Nenhum dado existente e corrigido ou apagado automaticamente. Caso existam
-- referencias orfas ou relatorios duplicados, a migracao e abortada com um
-- diagnostico para que a inconsistencia seja analisada explicitamente.

BEGIN;

DO $migration_preflight$
DECLARE
  orphan_command_processes INTEGER;
  orphan_command_tanks INTEGER;
  orphan_command_users INTEGER;
  orphan_start_users INTEGER;
  orphan_closure_users INTEGER;
BEGIN
  SELECT count(*)
    INTO orphan_command_processes
    FROM "comandosmqtt" AS command
    LEFT JOIN "processos" AS process
      ON process."id_processo" = command."id_processo"
   WHERE command."id_processo" IS NOT NULL
     AND process."id_processo" IS NULL;

  SELECT count(*)
    INTO orphan_command_tanks
    FROM "comandosmqtt" AS command
    LEFT JOIN "processostanques" AS process_tank
      ON process_tank."id_processo_tanque" = command."id_processo_tanque"
   WHERE command."id_processo_tanque" IS NOT NULL
     AND process_tank."id_processo_tanque" IS NULL;

  SELECT count(*)
    INTO orphan_command_users
    FROM "comandosmqtt" AS command
    LEFT JOIN "usuarios" AS app_user
      ON app_user."id_usuario" = command."id_usuario"
   WHERE command."id_usuario" IS NOT NULL
     AND app_user."id_usuario" IS NULL;

  SELECT count(*)
    INTO orphan_start_users
    FROM "processos" AS process
    LEFT JOIN "usuarios" AS app_user
      ON app_user."id_usuario" = process."partida_id_usuario"
   WHERE process."partida_id_usuario" IS NOT NULL
     AND app_user."id_usuario" IS NULL;

  SELECT count(*)
    INTO orphan_closure_users
    FROM "processos" AS process
    LEFT JOIN "usuarios" AS app_user
      ON app_user."id_usuario" = process."encerramento_geral_id_usuario"
   WHERE process."encerramento_geral_id_usuario" IS NOT NULL
     AND app_user."id_usuario" IS NULL;

  IF orphan_command_processes > 0
     OR orphan_command_tanks > 0
     OR orphan_command_users > 0
     OR orphan_start_users > 0
     OR orphan_closure_users > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'Migracao abortada: foram encontradas referencias orfas nos campos que receberao foreign keys.',
      DETAIL = format(
        'comandosmqtt.id_processo=%s; comandosmqtt.id_processo_tanque=%s; comandosmqtt.id_usuario=%s; processos.partida_id_usuario=%s; processos.encerramento_geral_id_usuario=%s',
        orphan_command_processes,
        orphan_command_tanks,
        orphan_command_users,
        orphan_start_users,
        orphan_closure_users
      ),
      HINT = 'Investigue e corrija explicitamente as referencias listadas; a migracao nao altera nem remove dados existentes.';
  END IF;
END
$migration_preflight$;

DO $report_preflight$
DECLARE
  duplicate_process_groups INTEGER;
  duplicate_alarm_groups INTEGER;
BEGIN
  SELECT count(*)
    INTO duplicate_process_groups
    FROM (
      SELECT report."id_processo", report."formato_relatorio"
        FROM "relatorios" AS report
       WHERE report."tipo_relatorio" = 'PROCESSO'
         AND report."id_processo" IS NOT NULL
       GROUP BY report."id_processo", report."formato_relatorio"
      HAVING count(*) > 1
    ) AS duplicates;

  SELECT count(*)
    INTO duplicate_alarm_groups
    FROM (
      SELECT report."id_alarme", report."formato_relatorio"
        FROM "relatorios" AS report
       WHERE report."tipo_relatorio" = 'ALARME'
         AND report."id_alarme" IS NOT NULL
       GROUP BY report."id_alarme", report."formato_relatorio"
      HAVING count(*) > 1
    ) AS duplicates;

  IF duplicate_process_groups > 0 OR duplicate_alarm_groups > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'Migracao abortada: existem relatorios duplicados para as novas chaves de idempotencia.',
      DETAIL = format(
        'grupos PROCESSO duplicados=%s; grupos ALARME duplicados=%s',
        duplicate_process_groups,
        duplicate_alarm_groups
      ),
      HINT = 'Revise os grupos duplicados e escolha conscientemente qual registro preservar; a migracao nao apaga relatorios nem arquivos GridFS.';
  END IF;
END
$report_preflight$;

-- A constraint uq_processo_tanque_sensor permanece como a unica garantia da
-- associacao sensor/tanque. Este segundo indice possuia colunas e semantica
-- identicas e apenas aumentava o custo de escrita.
DROP INDEX IF EXISTS "uq_pts_processo_tanque_sensor";

DO $foreign_keys$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = '"comandosmqtt"'::regclass
       AND conname = 'fk_comandosmqtt_processo'
  ) THEN
    ALTER TABLE "comandosmqtt"
      ADD CONSTRAINT "fk_comandosmqtt_processo"
      FOREIGN KEY ("id_processo") REFERENCES "processos"("id_processo")
      ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = '"comandosmqtt"'::regclass
       AND conname = 'fk_comandosmqtt_processo_tanque'
  ) THEN
    ALTER TABLE "comandosmqtt"
      ADD CONSTRAINT "fk_comandosmqtt_processo_tanque"
      FOREIGN KEY ("id_processo_tanque") REFERENCES "processostanques"("id_processo_tanque")
      ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = '"comandosmqtt"'::regclass
       AND conname = 'fk_comandosmqtt_usuario'
  ) THEN
    ALTER TABLE "comandosmqtt"
      ADD CONSTRAINT "fk_comandosmqtt_usuario"
      FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id_usuario")
      ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = '"processos"'::regclass
       AND conname = 'fk_processos_usuario_partida'
  ) THEN
    ALTER TABLE "processos"
      ADD CONSTRAINT "fk_processos_usuario_partida"
      FOREIGN KEY ("partida_id_usuario") REFERENCES "usuarios"("id_usuario")
      ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = '"processos"'::regclass
       AND conname = 'fk_processos_usuario_encerramento_geral'
  ) THEN
    ALTER TABLE "processos"
      ADD CONSTRAINT "fk_processos_usuario_encerramento_geral"
      FOREIGN KEY ("encerramento_geral_id_usuario") REFERENCES "usuarios"("id_usuario")
      ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
  END IF;
END
$foreign_keys$;

-- NOT VALID reduz o trabalho sob o lock inicial e ja protege novas escritas.
-- O preflight conservador permite validar o historico logo em seguida.
ALTER TABLE "comandosmqtt"
  VALIDATE CONSTRAINT "fk_comandosmqtt_processo";
ALTER TABLE "comandosmqtt"
  VALIDATE CONSTRAINT "fk_comandosmqtt_processo_tanque";
ALTER TABLE "comandosmqtt"
  VALIDATE CONSTRAINT "fk_comandosmqtt_usuario";
ALTER TABLE "processos"
  VALIDATE CONSTRAINT "fk_processos_usuario_partida";
ALTER TABLE "processos"
  VALIDATE CONSTRAINT "fk_processos_usuario_encerramento_geral";

CREATE INDEX IF NOT EXISTS "idx_comandosmqtt_usuario_criado"
  ON "comandosmqtt"("id_usuario", "criado_em");

CREATE INDEX IF NOT EXISTS "idx_processos_usuario_partida"
  ON "processos"("partida_id_usuario");

CREATE INDEX IF NOT EXISTS "idx_processos_usuario_encerramento_geral"
  ON "processos"("encerramento_geral_id_usuario");

-- Chaves de idempotencia por tipo. Os predicados evitam restringir linhas de
-- outro tipo e preservam a semantica de NULL do PostgreSQL.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_relatorios_processo_formato"
  ON "relatorios"("id_processo", "formato_relatorio")
  WHERE "tipo_relatorio" = 'PROCESSO' AND "id_processo" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_relatorios_alarme_formato"
  ON "relatorios"("id_alarme", "formato_relatorio")
  WHERE "tipo_relatorio" = 'ALARME' AND "id_alarme" IS NOT NULL;

COMMIT;
