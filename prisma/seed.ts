import 'dotenv/config';
import { PrismaClient, nivelacesso } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';

type DevUserSeed = {
  nome: string;
  login: string;
  email: string;
  id_nivel_acesso: number;
  password: string;
};

if (process.env.NODE_ENV !== 'development') {
  console.log('Seed ignorado: ambiente não é development.');
  process.exit(0);
}

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

  const devUsers: DevUserSeed[] = [
    {
      nome: 'Administrador',
      login: 'admin',
      email: 'admin@tsea.com',
      id_nivel_acesso: 3,
      password: process.env.DEV_ADMIN_PASSWORD ?? 'Admin@123',
    },
    {
      nome: 'Tecnico',
      login: 'tecnico',
      email: 'tecnico@tsea.com',
      id_nivel_acesso: 2,
      password: process.env.DEV_TECNICO_PASSWORD ?? 'Tecnico@123',
    },
    {
      nome: 'Operador',
      login: 'operador',
      email: 'operador@tsea.com',
      id_nivel_acesso: 1,
      password: process.env.DEV_OPERADOR_PASSWORD ?? 'Operador@123',
    },
  ];

  for (const user of devUsers) {
    const senha_hash = await bcrypt.hash(user.password, 10);

    await prisma.usuarios.upsert({
      where: { login: user.login },
      update: {
        nome: user.nome,
        email: user.email,
        senha_hash,
        primeiro_acesso: false,
        id_nivel_acesso: user.id_nivel_acesso,
        atualizado_em: new Date(),
      },
      create: {
        nome: user.nome,
        login: user.login,
        email: user.email,
        senha_hash,
        primeiro_acesso: false,
        id_nivel_acesso: user.id_nivel_acesso,
      },
    });
  }
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
