-- CreateEnum
CREATE TYPE "tipobackup" AS ENUM ('SISTEMA', 'MQTT', 'COMPLETO');

-- CreateEnum
CREATE TYPE "origembackup" AS ENUM ('MANUAL', 'AUTOMATICO', 'SISTEMA');

-- CreateEnum
CREATE TYPE "statusbackup" AS ENUM ('GERADO', 'RESTAURADO', 'FALHA_GERACAO', 'FALHA_RESTAURACAO', 'INVALIDO');

-- AlterTable
ALTER TABLE "backups"
  ADD COLUMN "id_usuario_restauracao" INTEGER,
  ADD COLUMN "id_configuracao_sistema" INTEGER,
  ADD COLUMN "id_mqtt_configuracao" INTEGER,
  ADD COLUMN "id_mqtt_configuracao_historico" INTEGER,
  ADD COLUMN "tipo_backup" "tipobackup" NOT NULL DEFAULT 'COMPLETO',
  ADD COLUMN "origem_backup" "origembackup" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "status_backup" "statusbackup" NOT NULL DEFAULT 'GERADO',
  ADD COLUMN "snapshot" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "hash_arquivo" VARCHAR(128),
  ADD COLUMN "tamanho_bytes" BIGINT,
  ADD COLUMN "content_type" VARCHAR(120),
  ADD COLUMN "storage_provider" VARCHAR(30) NOT NULL DEFAULT 'POSTGRES_JSON',
  ADD COLUMN "metadados" JSONB,
  ADD COLUMN "erro" TEXT,
  ALTER COLUMN "caminho_arquivo" DROP NOT NULL;

-- Keep compatibility defaults for origem/status/storage_provider, but require future writes to choose tipo/snapshot intentionally.
ALTER TABLE "backups"
  ALTER COLUMN "tipo_backup" DROP DEFAULT,
  ALTER COLUMN "snapshot" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "idx_backups_tipo_backup" ON "backups"("tipo_backup");

-- CreateIndex
CREATE INDEX "idx_backups_origem_backup" ON "backups"("origem_backup");

-- CreateIndex
CREATE INDEX "idx_backups_status_backup" ON "backups"("status_backup");

-- CreateIndex
CREATE INDEX "idx_backups_criado_em" ON "backups"("criado_em");

-- CreateIndex
CREATE INDEX "idx_backups_id_usuario" ON "backups"("id_usuario");

-- CreateIndex
CREATE INDEX "idx_backups_id_usuario_restauracao" ON "backups"("id_usuario_restauracao");

-- CreateIndex
CREATE INDEX "idx_backups_id_configuracao_sistema" ON "backups"("id_configuracao_sistema");

-- CreateIndex
CREATE INDEX "idx_backups_id_mqtt_configuracao" ON "backups"("id_mqtt_configuracao");

-- CreateIndex
CREATE INDEX "idx_backups_id_mqtt_configuracao_historico" ON "backups"("id_mqtt_configuracao_historico");

-- AddForeignKey
ALTER TABLE "backups"
  ADD CONSTRAINT "fk_backup_usuario_restauracao"
  FOREIGN KEY ("id_usuario_restauracao") REFERENCES "usuarios"("id_usuario")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backups"
  ADD CONSTRAINT "fk_backup_configuracao_sistema"
  FOREIGN KEY ("id_configuracao_sistema") REFERENCES "configuracoessistema"("id_configuracao_sistema")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backups"
  ADD CONSTRAINT "fk_backup_mqtt_configuracao"
  FOREIGN KEY ("id_mqtt_configuracao") REFERENCES "mqttconfiguracoes"("id_mqtt_configuracao")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backups"
  ADD CONSTRAINT "fk_backup_mqtt_configuracao_historico"
  FOREIGN KEY ("id_mqtt_configuracao_historico") REFERENCES "mqttconfiguracoeshistorico"("id_mqtt_configuracao_historico")
  ON DELETE SET NULL ON UPDATE CASCADE;
