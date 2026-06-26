import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export const VALIDATION_PREFIX = 'TSEA_VAL_';

export function assertValidationSeedAllowed(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed de validacao bloqueado: NODE_ENV=production.');
  }

  if (process.env.ALLOW_VALIDATION_SEED !== 'true') {
    throw new Error(
      'Seed de validacao bloqueado: defina ALLOW_VALIDATION_SEED=true.',
    );
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('Seed de validacao bloqueado: DATABASE_URL ausente.');
  }
}

export function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });

  return new PrismaClient({
    adapter,
  });
}

export interface SeedRecordResult {
  model: string;
  label: string;
  id: number;
  action: 'created' | 'updated';
}

export function printSeedSummary(results: SeedRecordResult[]): void {
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        total: results.length,
        results,
      },
      null,
      2,
    )}\n`,
  );
}
