import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { statusconexaomqtt } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMqttConfigDTO } from '../dto/create-mqtt-config.dto';
import { UpdateMqttConfigDTO } from '../dto/update-mqtt-config.dto';
import { TopicValidator } from '../topics/topic-validator';
import { ActiveMqttConfig } from '../interfaces/active-mqtt-config.interface';

@Injectable()
export class MqttConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(): Promise<ActiveMqttConfig> {
    const config = await this.prisma.mqttconfiguracoes.findUnique({
      where: {
        chave_configuracao: 'MQTT_PRINCIPAL',
      },
    });

    if (!config) {
      throw new NotFoundException('Nenhuma configuração mqtt foi encontrada.');
    }

    this.validateConfig(config);
    return config;
  }

  async createConfig(
    dto: CreateMqttConfigDTO,
    idUsuarioAlteracao?: number,
  ): Promise<ActiveMqttConfig> {
    await this.ensureConfigDoesMotExist();

    this.validateDtoTopics(dto);

    const createdConfig = await this.prisma.$transaction(async (tx) => {
      const config = await tx.mqttconfiguracoes.create({
        data: {
          id_usuario_alteracao: idUsuarioAlteracao ?? null,
          broker_url: dto.broker_url,
          porta: dto.porta,
          usuario_mqtt: dto.usuario_mqtt ?? null,
          senha_mqtt_hash: null,
          topico_leituras: dto.topico_leituras,
          topico_comandos: dto.topico_comandos,
          topico_status: dto.topico_status,
          topico_alarmes: dto.topico_alarmes,
          topico_heartbeat: dto.topico_heartbeat,
          reconexao_automatica: dto.reconexao_automatica,
          timeout_comunicacao: dto.timeout_comunicacao,
          status_conexao: statusconexaomqtt.DESCONECTADO,
          criado_em: new Date(),
          ultima_conexao: null,
          ultima_sincronizacao: null,
          ultima_falha: null,
          ativo: true,
        },
      });

      await this.createHistorySnapshot(tx, config);

      return config;
    });

    this.validateConfig(createdConfig);
    return createdConfig;
  }

  async updateConfig(
    dto: UpdateMqttConfigDTO,
    idUsuarioAlteracao: number,
  ): Promise<ActiveMqttConfig> {
    const currentConfig = await this.getConfig();
    this.validateDtoTopics(dto);

    const updatedConfig = await this.prisma.$transaction(async (tx) => {
      const config = await tx.mqttconfiguracoes.update({
        where: {
          chave_configuracao: currentConfig.chave_configuracao,
        },
        data: {
          id_usuario_alteracao: idUsuarioAlteracao,
          broker_url: dto.broker_url,
          porta: dto.porta,
          senha_mqtt_hash: dto.senha_mqtt,
          usuario_mqtt: dto.usuario_mqtt,
          topico_alarmes: dto.topico_alarmes,
          topico_comandos: dto.topico_comandos,
          topico_heartbeat: dto.topico_heartbeat,
          topico_leituras: dto.topico_leituras,
          topico_status: dto.topico_status,
          reconexao_automatica: dto.reconexao_automatica,
          timeout_comunicacao: dto.timeout_comunicacao,
          status_conexao: statusconexaomqtt.DESCONECTADO,
          ultima_conexao: null,
          ultima_falha: null,
          ultima_sincronizacao: null,
          atualizado_em: new Date(),
        },
      });

      this.validateConfig(config);

      await this.createHistorySnapshot(tx, config);
      return config;
    });

    return updatedConfig;
  }

  async updateConnectionStatus(
    status: statusconexaomqtt,
    ultima_falha?: string | null,
  ): Promise<void> {
    const config = await this.getConfig();

    await this.prisma.mqttconfiguracoes.update({
      where: {
        chave_configuracao: config.chave_configuracao,
      },
      data: {
        status_conexao: status,
        ultima_conexao:
          status === statusconexaomqtt.CONECTADO ? new Date() : undefined,
        ultima_falha: ultima_falha ?? null,
        atualizado_em: new Date(),
      },
    });
  }

  async updateLastSync(): Promise<void> {
    const config = await this.getConfig();

    await this.prisma.mqttconfiguracoes.update({
      where: {
        chave_configuracao: config.chave_configuracao,
      },
      data: {
        ultima_sincronizacao: new Date(),
        atualizado_em: new Date(),
      },
    });
  }

  async getConfigHitory(limit = 20) {
    return await this.prisma.mqttconfiguracoeshistorico.findMany({
      orderBy: {
        registrado_em: 'desc',
      },
      take: limit,
    });
  }

  async registerProcessConfigUsage(idProcesso: number): Promise<void> {
    const config = await this.getConfig();

    await this.prisma.$transaction(async (tx) => {
      const history = await this.createHistorySnapshot(tx, config);

      await tx.processosmqttconfiguracoeshistorico.create({
        data: {
          id_processo: idProcesso,
          id_mqtt_configuracao_historico:
            history.id_mqtt_configuracao_historico,
          usado_de: new Date(),
          usado_ate: null,
        },
      });

      return history;
    });
  }

  async finishProcessConfigUsage(idProcesso: number): Promise<void> {
    const activeUsage =
      await this.prisma.processosmqttconfiguracoeshistorico.findFirst({
        where: {
          id_processo: idProcesso,
          usado_ate: null,
        },
        orderBy: {
          usado_ate: 'desc',
        },
      });

    if (!activeUsage) {
      throw new NotFoundException(
        'Configuração MQTT do processo informado não foi achada.',
      );
    }

    await this.prisma.processosmqttconfiguracoeshistorico.update({
      where: {
        id_processo_mqtt_configuracao_historico:
          activeUsage.id_processo_mqtt_configuracao_historico,
      },
      data: {
        usado_ate: new Date(),
      },
    });
  }

  private validateConfig(config: ActiveMqttConfig): void {
    if (!config.broker_url || config.broker_url.trim().length === 0) {
      throw new BadRequestException('Broker MQTT não configurado');
    }

    if (
      !Number.isInteger(config.porta) ||
      config.porta < 1 ||
      config.porta > 65535
    ) {
      throw new BadRequestException('Porta Mqtt inválida.');
    }

    TopicValidator.validateTopics(config.topico_alarmes, 'topico_alarmes');
    TopicValidator.validateTopics(config.topico_comandos, 'topico_comandos');
    TopicValidator.validateTopics(config.topico_heartbeat, 'topico_heartbeat');
    TopicValidator.validateTopics(config.topico_leituras, 'topico_leituras');
    TopicValidator.validateTopics(config.topico_status, 'topico_status');

    if (
      !Number.isInteger(config.timeout_comunicacao) ||
      config.timeout_comunicacao < 1000
    ) {
      throw new BadRequestException(
        'timeout_comunicacao deve ser um inteiro igual ou maior a 1000 ms',
      );
    }
  }

  private async ensureConfigDoesMotExist(): Promise<void> {
    const count = await this.prisma.mqttconfiguracoes.count();

    if (count > 0) {
      throw new ConflictException(
        'Já existe uma configuração MQTT cadastrada. Utilize atualização em vez de criação.',
      );
    }
  }

  private validateDtoTopics(
    dto: Partial<CreateMqttConfigDTO | UpdateMqttConfigDTO>,
  ): void {
    if (dto.topico_leituras) {
      TopicValidator.validateTopics(dto.topico_leituras, 'topico_leituras');
    }

    if (dto.topico_comandos) {
      TopicValidator.validateTopics(dto.topico_comandos, 'topico_comandos');
    }

    if (dto.topico_status) {
      TopicValidator.validateTopics(dto.topico_status, 'topico_status');
    }

    if (dto.topico_alarmes) {
      TopicValidator.validateTopics(dto.topico_alarmes, 'topico_alarmes');
    }

    if (dto.topico_heartbeat) {
      TopicValidator.validateTopics(dto.topico_heartbeat, 'topico_heartbeat');
    }
  }

  private async createHistorySnapshot(
    tx: Prisma.TransactionClient,
    config: ActiveMqttConfig,
  ) {
    return await tx.mqttconfiguracoeshistorico.create({
      data: {
        id_mqtt_configuracao: config.id_mqtt_configuracao,
        id_usuario_alteracao: config.id_usuario_alteracao ?? null,
        broker_url: config.broker_url,
        porta: config.porta,
        usuario_mqtt: config.usuario_mqtt ?? null,
        senha_mqtt_hash: config.senha_mqtt_hash ?? null,
        topico_leituras: config.topico_leituras,
        topico_comandos: config.topico_comandos,
        topico_status: config.topico_status,
        topico_alarmes: config.topico_alarmes,
        topico_heartbeat: config.topico_heartbeat,
        reconexao_automatica: config.reconexao_automatica,
        timeout_comunicacao: config.timeout_comunicacao,
        status_conexao: config.status_conexao,
        ultima_conexao: config.ultima_conexao ?? null,
        ultima_sincronizacao: config.ultima_sincronizacao ?? null,
        ultima_falha: config.ultima_falha ?? null,
        criado_em: config.criado_em,
        atualizado_em: config.atualizado_em ?? null,
        registrado_em: new Date(),
      },
    });
  }
}
