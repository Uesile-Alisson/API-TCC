ALTER TABLE "usuarios"
ADD COLUMN "versao_token_autenticacao" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "tentativas_login_falhas" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "login_bloqueado_ate" TIMESTAMP(6),
ADD COLUMN "token_redefinicao_senha_hash" VARCHAR(64),
ADD COLUMN "token_redefinicao_senha_expira_em" TIMESTAMP(6);

CREATE UNIQUE INDEX "usuarios_token_redefinicao_senha_hash_key"
ON "usuarios"("token_redefinicao_senha_hash");

ALTER TABLE "usuarios"
ADD CONSTRAINT "usuarios_tentativas_login_falhas_check"
CHECK ("tentativas_login_falhas" >= 0),
ADD CONSTRAINT "usuarios_token_redefinicao_senha_consistente_check"
CHECK (
  ("token_redefinicao_senha_hash" IS NULL AND "token_redefinicao_senha_expira_em" IS NULL)
  OR
  ("token_redefinicao_senha_hash" IS NOT NULL AND "token_redefinicao_senha_expira_em" IS NOT NULL)
);
