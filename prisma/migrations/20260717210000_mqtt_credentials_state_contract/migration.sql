-- As credenciais MQTT deixam de pertencer ao banco de dados.
-- A exclusao dos valores legados e intencional: a fonte segura sera externa
-- e nenhum usuario, senha ou hash deve sobreviver neste contrato.

-- DropIndex
DROP INDEX "idx_mqtt_config_usuario_mqtt";

-- DropIndex
DROP INDEX "idx_mqtt_config_hist_usuario_mqtt";

-- AlterTable
ALTER TABLE "mqttconfiguracoes"
DROP COLUMN "usuario_mqtt",
DROP COLUMN "senha_mqtt_hash",
ADD COLUMN "usuario_mqtt_configurado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "senha_mqtt_configurada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "credenciais_verificadas_em" TIMESTAMP(6),
ADD COLUMN "ultima_falha_credenciais" TEXT;

-- AlterTable
ALTER TABLE "mqttconfiguracoeshistorico"
DROP COLUMN "usuario_mqtt",
DROP COLUMN "senha_mqtt_hash",
ADD COLUMN "usuario_mqtt_configurado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "senha_mqtt_configurada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "credenciais_verificadas_em" TIMESTAMP(6),
ADD COLUMN "ultima_falha_credenciais" TEXT;
