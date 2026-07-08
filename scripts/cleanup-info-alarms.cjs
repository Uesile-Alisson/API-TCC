require('dotenv').config();

if (process.env.NODE_ENV === 'production') {
  throw new Error('Cleanup de alarmes INFO bloqueado em production.');
}

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { motivoresolucaoalarme, severidadealarme, statusalarme } = require('@prisma/client');

const args = new Set(process.argv.slice(2));
const confirm = args.has('--confirm');

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

const where = {
  severidade: severidadealarme.INFO,
  status_alarme: statusalarme.ATIVO,
  resolvido_em: null,
  excluido_em: null,
};

async function main() {
  const total = await prisma.alarmes.count({ where });
  const sample = await prisma.alarmes.findMany({
    where,
    orderBy: { id_alarme: 'asc' },
    take: 20,
    select: {
      id_alarme: true,
      titulo: true,
      ocorrido_em: true,
      id_processo: true,
    },
  });

  console.log(`[cleanup-info-alarms] INFO ativos encontrados: ${total}`);
  console.table(sample);

  if (!confirm) {
    console.log(
      '[cleanup-info-alarms] Dry run concluido. Rode com --confirm para marcar esses INFO como RESOLVIDO.',
    );
    return;
  }

  const resolvedAt = new Date();
  const result = await prisma.alarmes.updateMany({
    where,
    data: {
      status_alarme: statusalarme.RESOLVIDO,
      resolvido_em: resolvedAt,
      motivo_resolucao: motivoresolucaoalarme.VALIDADO_PELO_SISTEMA,
    },
  });

  console.log(
    `[cleanup-info-alarms] INFO marcados como RESOLVIDO: ${result.count}`,
  );
}

main()
  .catch((error) => {
    console.error(`[cleanup-info-alarms] Falha: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
