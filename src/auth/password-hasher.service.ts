import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import * as bcrypt from 'bcrypt';

const SCRYPT_PREFIX = 'scrypt';
const SCRYPT_COST = 2 ** 15;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 3;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MINIMUM_MAX_MEMORY = 64 * 1024 * 1024;
const SCRYPT_MAXIMUM_MAX_MEMORY = 256 * 1024 * 1024;
const SCRYPT_SALT_LENGTH = 16;

export interface PasswordVerificationResult {
  valid: boolean;
  needsUpgrade: boolean;
}

@Injectable()
export class PasswordHasherService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(SCRYPT_SALT_LENGTH);
    const derivedKey = await this.deriveKey(
      this.normalize(password),
      salt,
      SCRYPT_COST,
      SCRYPT_BLOCK_SIZE,
      SCRYPT_PARALLELIZATION,
    );

    return [
      SCRYPT_PREFIX,
      SCRYPT_COST,
      SCRYPT_BLOCK_SIZE,
      SCRYPT_PARALLELIZATION,
      salt.toString('base64url'),
      derivedKey.toString('base64url'),
    ].join('$');
  }

  async verify(
    password: string,
    storedHash: string,
  ): Promise<PasswordVerificationResult> {
    if (!storedHash.startsWith(`${SCRYPT_PREFIX}$`)) {
      try {
        const valid = await bcrypt.compare(password, storedHash);
        return {
          valid,
          needsUpgrade: valid,
        };
      } catch {
        return { valid: false, needsUpgrade: false };
      }
    }

    const parsed = this.parseScryptHash(storedHash);
    if (!parsed) {
      return { valid: false, needsUpgrade: false };
    }

    try {
      const actualKey = await this.deriveKey(
        this.normalize(password),
        parsed.salt,
        parsed.cost,
        parsed.blockSize,
        parsed.parallelization,
      );
      const valid = timingSafeEqual(actualKey, parsed.expectedKey);

      return {
        valid,
        needsUpgrade:
          valid &&
          (parsed.cost !== SCRYPT_COST ||
            parsed.blockSize !== SCRYPT_BLOCK_SIZE ||
            parsed.parallelization !== SCRYPT_PARALLELIZATION),
      };
    } catch {
      return { valid: false, needsUpgrade: false };
    }
  }

  normalize(password: string): string {
    return password.normalize('NFC');
  }

  private parseScryptHash(storedHash: string): {
    cost: number;
    blockSize: number;
    parallelization: number;
    salt: Buffer;
    expectedKey: Buffer;
  } | null {
    const parts = storedHash.split('$');
    if (parts.length !== 6) {
      return null;
    }

    const [prefix, rawCost, rawBlockSize, rawParallelization, rawSalt, rawKey] =
      parts;
    const cost = Number(rawCost);
    const blockSize = Number(rawBlockSize);
    const parallelization = Number(rawParallelization);

    if (
      prefix !== SCRYPT_PREFIX ||
      !Number.isInteger(cost) ||
      cost < 2 ** 13 ||
      cost > 2 ** 17 ||
      (cost & (cost - 1)) !== 0 ||
      !Number.isInteger(blockSize) ||
      blockSize < 1 ||
      blockSize > 16 ||
      !Number.isInteger(parallelization) ||
      parallelization < 1 ||
      parallelization > 10 ||
      !rawSalt ||
      !rawKey
    ) {
      return null;
    }

    const salt = Buffer.from(rawSalt, 'base64url');
    const expectedKey = Buffer.from(rawKey, 'base64url');
    if (
      salt.length < SCRYPT_SALT_LENGTH ||
      expectedKey.length !== SCRYPT_KEY_LENGTH
    ) {
      return null;
    }

    return { cost, blockSize, parallelization, salt, expectedKey };
  }

  private deriveKey(
    password: string,
    salt: Buffer,
    cost: number,
    blockSize: number,
    parallelization: number,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      scrypt(
        password,
        salt,
        SCRYPT_KEY_LENGTH,
        {
          N: cost,
          r: blockSize,
          p: parallelization,
          maxmem: Math.min(
            SCRYPT_MAXIMUM_MAX_MEMORY,
            Math.max(
              SCRYPT_MINIMUM_MAX_MEMORY,
              128 * cost * blockSize + 2 * 1024 * 1024,
            ),
          ),
        },
        (error, derivedKey) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(derivedKey);
        },
      );
    });
  }
}
