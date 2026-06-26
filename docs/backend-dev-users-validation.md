# Usuarios de Desenvolvimento para Validacao

## Objetivo

Permitir login real com os tres perfis usados na validacao de permissoes:

- `admin` com perfil `ADMINISTRADOR`;
- `tecnico` com perfil `TECNICO`;
- `operador` com perfil `OPERADOR`.

## Senhas

As senhas sao configuradas por variaveis de ambiente:

- `DEV_ADMIN_PASSWORD`;
- `DEV_TECNICO_PASSWORD`;
- `DEV_OPERADOR_PASSWORD`.

Quando as variaveis nao existem, o seed usa fallbacks apenas em `NODE_ENV=development`. O seed e bloqueado fora de desenvolvimento e nunca grava senha em claro, apenas hash bcrypt em `senha_hash`.

## Primeiro acesso

Os usuarios de validacao sao mantidos com `primeiro_acesso=false` para permitir teste direto de login, `/auth/me`, `401` e `403` por perfil.

## Comandos

```bash
npm run seed:dev-users
npm run validate:dev-users
```

O script de validacao nao imprime JWT, hash ou senha. Ele verifica:

- login de `admin`, `tecnico` e `operador`;
- `/auth/me` com perfil correto;
- `/auth/me` sem token retorna `401`;
- `OPERADOR` em configuracoes retorna `403`;
- `TECNICO` em configuracoes nao retorna `401` ou `403`;
- `OPERADOR` ao resolver alarme retorna `403`.
