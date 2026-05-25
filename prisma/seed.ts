import 'dotenv/config';
import { PrismaClient, nivelacesso } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  await prisma.niveisacessos.upsert({
    where: { id_nivel_acesso: 1 },
    update: {},
    create: {
      id_nivel_acesso: 1,
      nome: nivelacesso.OPERADOR,
      descricao: 'Usuário com acesso básico ao monitoramento.',
      prioridade: 1,
      ativo: true,
    },
  });

  await prisma.niveisacessos.upsert({
    where: { id_nivel_acesso: 2 },
    update: {},
    create: {
      id_nivel_acesso: 2,
      nome: nivelacesso.TECNICO,
      descricao: 'Usuário com permissão para operação técnica.',
      prioridade: 2,
      ativo: true,
    },
  });

  await prisma.niveisacessos.upsert({
    where: { id_nivel_acesso: 3 },
    update: {},
    create: {
      id_nivel_acesso: 3,
      nome: nivelacesso.ADMINISTRADOR,
      descricao: 'Usuário com controle total do sistema.',
      prioridade: 3,
      ativo: true,
    },
  });

  const senhaHash = await bcrypt.hash('Admin@123', 10);

  await prisma.usuarios.upsert({
    where: { login: 'admin' },
    update: {},
    create: {
      nome: 'Administrador',
      login: 'admin',
      email: 'admin@tsea.com',
      senha_hash: senhaHash,
      primeiro_acesso: false,
      id_nivel_acesso: 3,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
