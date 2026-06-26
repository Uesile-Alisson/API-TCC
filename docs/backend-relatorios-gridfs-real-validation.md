# Relatorios: validacao real com MongoDB/GridFS

## Escopo

O modulo de relatorios deve gerar arquivos reais em memoria, persistir o arquivo no MongoDB GridFS e salvar apenas metadados no Postgres via Prisma. A API nao deve gravar PDF/XLSX permanente no filesystem local e nao deve expor `gridfs_file_id`, bucket interno ou URI do Mongo na resposta publica.

## Fluxo esperado

1. `POST /relatorios/processos/:id_processo` gera PDF e/ou XLSX de um processo finalizado.
2. `POST /relatorios/alarmes/:id_alarme` gera PDF de um alarme real.
3. O buffer gerado e validado com tamanho maior que zero, content-type compativel e nome seguro.
4. O arquivo e salvo no bucket GridFS configurado para relatorios.
5. A tabela `relatorios` recebe metadados: nome, formato, content-type, tamanho, bucket, provider e id interno do arquivo.
6. `GET /relatorios/:id_relatorio/preview` recupera apenas PDF como `inline`.
7. `GET /relatorios/:id_relatorio/download` recupera PDF/XLSX como `attachment`.

## Script de validacao real

Execute com API, Postgres e MongoDB reais:

```powershell
cd api
npm run build
npm test -- relatorios
node scripts/validate-real-gridfs.cjs
```

O script usa `REAL_GRIDFS_API_BASE_URL`, `REAL_GRIDFS_LOGIN`, `REAL_GRIDFS_PASSWORD` e `MONGODB_DATABASE` quando informados. Caso contrario, usa `http://localhost:3000/api`, login `admin`, `DEV_ADMIN_PASSWORD` ou `Admin@123`, e banco Mongo `tsea`.

Confirmacoes obrigatorias:

- A resposta de geracao retorna relatorios publicos sem `gridfs_file_id`.
- `tmp-preview.pdf` inicia com assinatura `%PDF`.
- `tmp-download.xlsx` inicia como ZIP/OpenXML e abre em planilha.
- `Content-Type` do preview PDF e `application/pdf`.
- `Content-Disposition` do preview contem `inline`.
- `Content-Disposition` do download contem `attachment`.
- `content-length` ou tamanho do arquivo baixado e maior que zero.
- O MongoDB contem documento em `<bucket>.files` com `_id` equivalente ao metadado interno salvo.
- A Fase 8.2 tambem gera ou reaproveita um PDF real de Alarme, valida o metadado no Postgres, baixa o binario do GridFS e testa preview/download pela API.
- Arquivos temporarios de validacao ficam em `api/tmp/real-gridfs-validation`, ignorados pelo Git.

## Limites e seguranca

- CSV continua bloqueado.
- Preview e exclusivo para PDF.
- XLSX pode ser baixado, mas nao renderizado no modal de preview.
- O rollback remove somente arquivo recem-enviado quando a persistencia de metadados falha.
- Falhas de MongoDB/GridFS retornam erro normalizado e nao imprimem URI do Mongo.
