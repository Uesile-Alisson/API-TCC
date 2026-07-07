-- Stable hardware identifiers for ESP32 integration.
ALTER TABLE "bombas" ADD COLUMN IF NOT EXISTS "codigo_hardware" VARCHAR(80);
ALTER TABLE "sensores" ADD COLUMN IF NOT EXISTS "codigo_hardware" VARCHAR(80);
ALTER TABLE "tanques" ADD COLUMN IF NOT EXISTS "codigo_hardware" VARCHAR(80);
ALTER TABLE "valvulas" ADD COLUMN IF NOT EXISTS "codigo_hardware" VARCHAR(80);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_bombas_codigo_hardware" ON "bombas"("codigo_hardware");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_sensores_codigo_hardware" ON "sensores"("codigo_hardware");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_tanques_codigo_hardware" ON "tanques"("codigo_hardware");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_valvulas_codigo_hardware" ON "valvulas"("codigo_hardware");

-- Formal MQTT topics for ESP32 configuration sync and command acknowledgements.
ALTER TABLE "mqttconfiguracoes"
  ADD COLUMN IF NOT EXISTS "topico_configuracoes" VARCHAR(180) NOT NULL DEFAULT 'tsea/config',
  ADD COLUMN IF NOT EXISTS "topico_acks" VARCHAR(180) NOT NULL DEFAULT 'tsea/acks';

ALTER TABLE "mqttconfiguracoeshistorico"
  ADD COLUMN IF NOT EXISTS "topico_configuracoes" VARCHAR(180) NOT NULL DEFAULT 'tsea/config',
  ADD COLUMN IF NOT EXISTS "topico_acks" VARCHAR(180) NOT NULL DEFAULT 'tsea/acks';
