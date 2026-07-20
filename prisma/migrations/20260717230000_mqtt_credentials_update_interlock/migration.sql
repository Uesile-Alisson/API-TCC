-- Impede a troca de credenciais MQTT durante uma operacao fisica e impede
-- que uma nova partida comece enquanto a troca ainda esta em andamento.
ALTER TABLE "mqttconfiguracoes"
  ADD COLUMN "credenciais_atualizacao_token" VARCHAR(64),
  ADD COLUMN "credenciais_atualizacao_bloqueada_ate" TIMESTAMP(6);

ALTER TABLE "mqttconfiguracoes"
  ADD CONSTRAINT "ck_mqtt_credenciais_atualizacao_lease_completo"
  CHECK (
    ("credenciais_atualizacao_token" IS NULL AND "credenciais_atualizacao_bloqueada_ate" IS NULL)
    OR
    ("credenciais_atualizacao_token" IS NOT NULL AND "credenciais_atualizacao_bloqueada_ate" IS NOT NULL)
  );
