import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, lstat, open, readFile, rename, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { MqttConfigService } from './mqtt-config.service';

const CREDENTIALS_FILE_VERSION = 1;
const MAX_CREDENTIALS_FILE_SIZE = 16 * 1024;
const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIRECTORY_MASK = 0o077;

export type MqttCredentials = Readonly<{
  username: string;
  password: string;
}>;

export type MqttCredentialsWriteInput = Readonly<{
  usuario_mqtt: string;
  senha_mqtt: string;
}>;

export type MqttCredentialReadiness = Readonly<{
  usuarioConfigurado: boolean;
  senhaConfigurada: boolean;
  credenciaisConfiguradas: boolean;
  credenciaisVerificadas: boolean;
  verificadasEm: Date | null;
  ultimaFalha: string | null;
  atualizadoEm: Date;
}>;

type CredentialsFile = {
  versao: number;
  usuario_mqtt: string;
  senha_mqtt: string;
  atualizado_em: string;
};

type CredentialsInspection = {
  credentials: MqttCredentials | null;
  usuarioConfigurado: boolean;
  senhaConfigurada: boolean;
  failure: string | null;
  fingerprint: string | null;
};

type SyncOptions = {
  resetVerification: boolean;
  idUsuarioAlteracao?: number;
  recordHistory?: boolean;
  force?: boolean;
};

@Injectable()
export class MqttCredentialsService implements OnModuleInit {
  private readonly logger = new Logger(MqttCredentialsService.name);
  private writeQueue: Promise<void> = Promise.resolve();
  private credentialsFingerprint: string | null = null;
  private credentialReadiness: MqttCredentialReadiness = {
    usuarioConfigurado: false,
    senhaConfigurada: false,
    credenciaisConfiguradas: false,
    credenciaisVerificadas: false,
    verificadasEm: null,
    ultimaFalha:
      'As credenciais MQTT externas ainda nao foram inspecionadas pela API.',
    atualizadoEm: new Date(),
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly mqttConfigService: MqttConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const inspection = await this.inspectCredentialsFile();
      this.applyInspectionToRuntimeState(inspection, true);
      await this.synchronizeInspection(inspection, {
        resetVerification: true,
        recordHistory: true,
      });

      if (inspection.credentials) {
        this.logger.log(
          'Arquivo externo de credenciais MQTT detectado e aguardando verificacao pelo broker.',
        );
      } else {
        this.logger.warn(
          inspection.failure ??
            'Credenciais MQTT externas ainda nao foram configuradas.',
        );
      }
    } catch {
      this.logger.warn(
        'Nao foi possivel sincronizar o estado inicial das credenciais MQTT. A API continuara inicializando.',
      );
    }
  }

  async readCredentials(): Promise<MqttCredentials> {
    const inspection = await this.inspectCredentialsFile();
    this.applyInspectionToRuntimeState(inspection, false);

    if (!inspection.credentials) {
      await this.trySynchronizeInspection(inspection, {
        resetVerification: true,
        recordHistory: true,
      });
      throw new ServiceUnavailableException(
        inspection.failure ??
          'Credenciais MQTT externas ainda nao foram configuradas.',
      );
    }

    await this.trySynchronizeInspection(inspection, {
      resetVerification: false,
      recordHistory: true,
    });
    return inspection.credentials;
  }

  async configureCredentials(
    input: MqttCredentialsWriteInput,
    idUsuarioAlteracao: number,
  ): Promise<void> {
    const normalizedInput = this.validateAndNormalizeCredentials(input);
    const username = normalizedInput.usuario_mqtt;
    const password = normalizedInput.senha_mqtt;

    await this.withWriteLock(async () => {
      await this.writeCredentialsFile({
        versao: CREDENTIALS_FILE_VERSION,
        usuario_mqtt: username,
        senha_mqtt: password,
        atualizado_em: new Date().toISOString(),
      });

      this.applyInspectionToRuntimeState(
        {
          credentials: { username, password },
          usuarioConfigurado: true,
          senhaConfigurada: true,
          failure: null,
          fingerprint: this.buildCredentialsFingerprint(username, password),
        },
        true,
      );

      await this.mqttConfigService.updateCredentialState(
        {
          usuario_mqtt_configurado: true,
          senha_mqtt_configurada: true,
          credenciais_verificadas_em: null,
          ultima_falha_credenciais: null,
        },
        {
          idUsuarioAlteracao,
          recordHistory: true,
          force: true,
        },
      );
    });
  }

  validateAndNormalizeCredentials(
    input: MqttCredentialsWriteInput,
  ): MqttCredentialsWriteInput {
    const username = this.normalizeUsername(input.usuario_mqtt);
    const password = this.normalizePassword(input.senha_mqtt);

    if (!username || !password) {
      throw new BadRequestException(
        'Usuario ou senha MQTT possui formato invalido.',
      );
    }

    return {
      usuario_mqtt: username,
      senha_mqtt: password,
    };
  }

  async markCredentialsVerified(): Promise<void> {
    if (this.credentialReadiness.credenciaisConfiguradas) {
      const verifiedAt = new Date();
      this.credentialReadiness = {
        ...this.credentialReadiness,
        credenciaisVerificadas: true,
        verificadasEm: verifiedAt,
        ultimaFalha: null,
        atualizadoEm: verifiedAt,
      };
    }

    await this.mqttConfigService.updateCredentialState(
      {
        usuario_mqtt_configurado: true,
        senha_mqtt_configurada: true,
        credenciais_verificadas_em: new Date(),
        ultima_falha_credenciais: null,
      },
      { recordHistory: false },
    );
  }

  async markAuthenticationFailure(message: string): Promise<void> {
    const sanitizedMessage = this.sanitizeFailure(message);
    this.credentialReadiness = {
      ...this.credentialReadiness,
      credenciaisVerificadas: false,
      verificadasEm: null,
      ultimaFalha: sanitizedMessage,
      atualizadoEm: new Date(),
    };
    const current = await this.mqttConfigService.getConfig();

    await this.mqttConfigService.updateCredentialState(
      {
        usuario_mqtt_configurado: current.usuario_mqtt_configurado,
        senha_mqtt_configurada: current.senha_mqtt_configurada,
        credenciais_verificadas_em: null,
        ultima_falha_credenciais: sanitizedMessage,
      },
      { recordHistory: false },
    );
  }

  getCredentialReadiness(): MqttCredentialReadiness {
    return {
      ...this.credentialReadiness,
      verificadasEm: this.credentialReadiness.verificadasEm
        ? new Date(this.credentialReadiness.verificadasEm)
        : null,
      atualizadoEm: new Date(this.credentialReadiness.atualizadoEm),
    };
  }

  private async inspectCredentialsFile(): Promise<CredentialsInspection> {
    let credentialsPath: string;

    try {
      credentialsPath = this.getCredentialsPath();
    } catch (error) {
      return this.failedInspection(this.getSafeConfigurationError(error));
    }

    try {
      const fileStats = await lstat(credentialsPath);

      if (fileStats.isSymbolicLink() || !fileStats.isFile()) {
        return this.failedInspection(
          'O caminho de credenciais MQTT nao aponta para um arquivo regular seguro.',
        );
      }

      if (fileStats.size > MAX_CREDENTIALS_FILE_SIZE) {
        return this.failedInspection(
          'O arquivo de credenciais MQTT excede o tamanho permitido.',
        );
      }

      if (
        process.platform !== 'win32' &&
        (fileStats.mode & PRIVATE_DIRECTORY_MASK) !== 0
      ) {
        return this.failedInspection(
          'O arquivo de credenciais MQTT possui permissoes excessivas.',
        );
      }

      const rawFile = await readFile(credentialsPath, 'utf8');
      const parsed = JSON.parse(rawFile) as unknown;

      if (
        !this.isRecord(parsed) ||
        parsed.versao !== CREDENTIALS_FILE_VERSION
      ) {
        return this.failedInspection(
          'O arquivo de credenciais MQTT possui formato ou versao invalida.',
        );
      }

      const username = this.normalizeUsername(parsed.usuario_mqtt);
      const password = this.normalizePassword(parsed.senha_mqtt);
      const usuarioConfigurado = username !== null;
      const senhaConfigurada = password !== null;

      if (!username || !password) {
        return {
          credentials: null,
          usuarioConfigurado,
          senhaConfigurada,
          failure:
            'O arquivo de credenciais MQTT esta incompleto ou contem valores invalidos.',
          fingerprint: null,
        };
      }

      return {
        credentials: { username, password },
        usuarioConfigurado: true,
        senhaConfigurada: true,
        failure: null,
        fingerprint: this.buildCredentialsFingerprint(username, password),
      };
    } catch (error) {
      return this.failedInspection(this.mapReadError(error));
    }
  }

  private async writeCredentialsFile(file: CredentialsFile): Promise<void> {
    const credentialsPath = this.getCredentialsPath();
    const credentialsDirectory = dirname(credentialsPath);
    const temporaryPath = resolve(
      credentialsDirectory,
      `.${basename(credentialsPath)}.${process.pid}.${randomUUID()}.tmp`,
    );
    let fileHandle: Awaited<ReturnType<typeof open>> | null = null;

    try {
      const directoryStats = await lstat(credentialsDirectory);

      if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
        throw new ServiceUnavailableException(
          'O diretorio externo de credenciais MQTT nao e seguro.',
        );
      }

      if (
        process.platform !== 'win32' &&
        (directoryStats.mode & PRIVATE_DIRECTORY_MASK) !== 0
      ) {
        throw new ServiceUnavailableException(
          'O diretorio externo de credenciais MQTT possui permissoes excessivas.',
        );
      }

      await this.assertSafeExistingTarget(credentialsPath);

      fileHandle = await open(temporaryPath, 'wx', PRIVATE_FILE_MODE);
      await fileHandle.writeFile(`${JSON.stringify(file, null, 2)}\n`, 'utf8');
      await fileHandle.sync();
      await fileHandle.close();
      fileHandle = null;

      await rename(temporaryPath, credentialsPath);
      await chmod(credentialsPath, PRIVATE_FILE_MODE);
    } catch (error) {
      throw this.mapWriteError(error);
    } finally {
      if (fileHandle) {
        await fileHandle.close().catch(() => undefined);
      }
      await unlink(temporaryPath).catch(() => undefined);
    }
  }

  private async assertSafeExistingTarget(path: string): Promise<void> {
    try {
      const targetStats = await lstat(path);

      if (targetStats.isSymbolicLink() || !targetStats.isFile()) {
        throw new ServiceUnavailableException(
          'O caminho de credenciais MQTT existente nao e um arquivo regular seguro.',
        );
      }
    } catch (error) {
      if (this.hasErrorCode(error, 'ENOENT')) {
        return;
      }

      throw error;
    }
  }

  private async synchronizeInspection(
    inspection: CredentialsInspection,
    options: SyncOptions,
  ): Promise<void> {
    const current = await this.mqttConfigService.getConfig();
    const configurationChanged =
      current.usuario_mqtt_configurado !== inspection.usuarioConfigurado ||
      current.senha_mqtt_configurada !== inspection.senhaConfigurada;
    const resetVerification =
      options.resetVerification ||
      configurationChanged ||
      !inspection.credentials;

    await this.mqttConfigService.updateCredentialState(
      {
        usuario_mqtt_configurado: inspection.usuarioConfigurado,
        senha_mqtt_configurada: inspection.senhaConfigurada,
        credenciais_verificadas_em: resetVerification
          ? null
          : current.credenciais_verificadas_em,
        ultima_falha_credenciais: inspection.failure,
      },
      {
        idUsuarioAlteracao: options.idUsuarioAlteracao,
        recordHistory: options.recordHistory,
        force: options.force,
      },
    );
  }

  private applyInspectionToRuntimeState(
    inspection: CredentialsInspection,
    forceResetVerification: boolean,
  ): void {
    const fingerprintChanged =
      inspection.fingerprint !== this.credentialsFingerprint;
    const credentialsConfigured =
      inspection.usuarioConfigurado && inspection.senhaConfigurada;
    const resetVerification =
      forceResetVerification || fingerprintChanged || !credentialsConfigured;

    this.credentialsFingerprint = inspection.fingerprint;
    this.credentialReadiness = {
      usuarioConfigurado: inspection.usuarioConfigurado,
      senhaConfigurada: inspection.senhaConfigurada,
      credenciaisConfiguradas: credentialsConfigured,
      credenciaisVerificadas: resetVerification
        ? false
        : this.credentialReadiness.credenciaisVerificadas,
      verificadasEm: resetVerification
        ? null
        : this.credentialReadiness.verificadasEm,
      ultimaFalha: inspection.failure,
      atualizadoEm: new Date(),
    };
  }

  private buildCredentialsFingerprint(
    username: string,
    password: string,
  ): string {
    return createHash('sha256')
      .update(username, 'utf8')
      .update('\0', 'utf8')
      .update(password, 'utf8')
      .digest('hex');
  }

  private async trySynchronizeInspection(
    inspection: CredentialsInspection,
    options: SyncOptions,
  ): Promise<void> {
    try {
      await this.synchronizeInspection(inspection, options);
    } catch {
      this.logger.warn(
        'Nao foi possivel sincronizar no banco o estado das credenciais MQTT externas.',
      );
    }
  }

  private getCredentialsPath(): string {
    const configuredPath = this.configService
      .get<string>('MQTT_CREDENTIALS_FILE_PATH')
      ?.trim();

    if (!configuredPath) {
      throw new ServiceUnavailableException(
        'MQTT_CREDENTIALS_FILE_PATH nao foi configurada no ambiente.',
      );
    }

    if (!isAbsolute(configuredPath)) {
      throw new ServiceUnavailableException(
        'MQTT_CREDENTIALS_FILE_PATH deve usar um caminho absoluto.',
      );
    }

    const normalizedPath = resolve(configuredPath);
    const workspaceRelativePath = relative(process.cwd(), normalizedPath);
    const isInsideWorkspace =
      workspaceRelativePath === '' ||
      (!workspaceRelativePath.startsWith('..') &&
        !isAbsolute(workspaceRelativePath));

    if (isInsideWorkspace) {
      throw new ServiceUnavailableException(
        'O arquivo de credenciais MQTT deve ficar fora do diretorio do projeto.',
      );
    }

    return normalizedPath;
  }

  private withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
    const execution = this.writeQueue.then(operation, operation);
    this.writeQueue = execution.then(
      () => undefined,
      () => undefined,
    );
    return execution;
  }

  private normalizeUsername(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length >= 1 &&
      normalized.length <= 256 &&
      !/\p{Cc}/u.test(normalized)
      ? normalized
      : null;
  }

  private normalizePassword(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    return value.length >= 1 && value.length <= 512 && !/\p{Cc}/u.test(value)
      ? value
      : null;
  }

  private failedInspection(failure: string): CredentialsInspection {
    return {
      credentials: null,
      usuarioConfigurado: false,
      senhaConfigurada: false,
      failure,
      fingerprint: null,
    };
  }

  private sanitizeFailure(message: string): string {
    const normalized = message.replace(/\p{Cc}/gu, ' ').trim();
    return (normalized || 'Falha de autenticacao MQTT.').slice(0, 1000);
  }

  private getSafeConfigurationError(error: unknown): string {
    if (error instanceof ServiceUnavailableException) {
      return error.message;
    }

    return 'A configuracao do caminho externo de credenciais MQTT e invalida.';
  }

  private mapReadError(error: unknown): string {
    if (this.hasErrorCode(error, 'ENOENT')) {
      return 'O arquivo externo de credenciais MQTT ainda nao existe.';
    }

    if (
      this.hasErrorCode(error, 'EACCES') ||
      this.hasErrorCode(error, 'EPERM')
    ) {
      return 'A API nao possui permissao para ler o arquivo de credenciais MQTT.';
    }

    if (error instanceof SyntaxError) {
      return 'O arquivo de credenciais MQTT nao contem JSON valido.';
    }

    return 'Nao foi possivel ler o arquivo externo de credenciais MQTT.';
  }

  private mapWriteError(error: unknown): ServiceUnavailableException {
    if (error instanceof ServiceUnavailableException) {
      return error;
    }

    if (this.hasErrorCode(error, 'ENOENT')) {
      return new ServiceUnavailableException(
        'O diretorio externo de credenciais MQTT nao existe.',
      );
    }

    if (
      this.hasErrorCode(error, 'EACCES') ||
      this.hasErrorCode(error, 'EPERM')
    ) {
      return new ServiceUnavailableException(
        'A API nao possui permissao para gravar o arquivo de credenciais MQTT.',
      );
    }

    return new ServiceUnavailableException(
      'Nao foi possivel gravar o arquivo externo de credenciais MQTT.',
    );
  }

  private hasErrorCode(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === code
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
