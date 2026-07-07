import { BadRequestException, Injectable } from '@nestjs/common';
import { MQTT_COMMANDS } from '../commands/interfaces/command-name.interface';
import { CommandOptions } from '../commands/interfaces/command-options.interface';
import { CommandPayloadBuilder } from '../commands/command-payload.builder';
import { CommandResult } from '../commands/interfaces/command-result.interface';
import { MqttClientService } from '../connection/mqtt-client.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MqttConfigService } from './mqtt-config.service';
import { Esp32SyncConfigPayload } from '../interfaces/esp32-contracts.interface';

@Injectable()
export class Esp32SyncConfigService {
  private readonly SCHEMA_VERSION = 1;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mqttClientService: MqttClientService,
    private readonly mqttConfigService: MqttConfigService,
  ) {}

  async publishSyncConfig(options: CommandOptions): Promise<CommandResult> {
    const mqttConfig = await this.mqttConfigService.getConfig();
    const commandPayload = CommandPayloadBuilder.build(
      MQTT_COMMANDS.SINCRONIZAR_HARDWARE,
      {},
      options,
    );
    const payload = await this.buildPayload(commandPayload.correlation_id);

    await this.mqttClientService.publish(
      mqttConfig.topico_configuracoes,
      payload,
      {
        qos: options.qos ?? 1,
        retain: true,
      },
    );

    await this.mqttConfigService.updateLastSync();

    return {
      comando: MQTT_COMMANDS.SINCRONIZAR_HARDWARE,
      topic: mqttConfig.topico_configuracoes,
      qos: options.qos ?? 1,
      retain: true,
      correlation_id: payload.correlation_id,
      published_at: new Date(),
    };
  }

  private async buildPayload(
    correlationId: string,
  ): Promise<Esp32SyncConfigPayload> {
    const [sistema, mqttConfig, bombas, tanques, valvulas, sensores] =
      await Promise.all([
        this.prisma.configuracoessistema.findFirst({
          orderBy: { id_configuracao_sistema: 'asc' },
        }),
        this.mqttConfigService.getConfig(),
        this.prisma.bombas.findMany({ orderBy: { id_bomba: 'asc' } }),
        this.prisma.tanques.findMany({
          where: { excluido_em: null },
          orderBy: { id_tanque: 'asc' },
        }),
        this.prisma.valvulas.findMany({
          where: { ativo: true },
          orderBy: { id_valvula: 'asc' },
        }),
        this.prisma.sensores.findMany({
          where: { excluido_em: null },
          include: { sensoresacoplamentomangueiras: true },
          orderBy: { id_sensor: 'asc' },
        }),
      ]);

    if (!sistema) {
      throw new BadRequestException(
        'Configuracao do sistema nao encontrada para sincronizar ESP32.',
      );
    }

    return {
      tipo: 'SYNC_CONFIG',
      schema_version: this.SCHEMA_VERSION,
      correlation_id: correlationId,
      enviado_em: new Date().toISOString(),
      sistema: {
        vacuo_padrao: Number(sistema.vacuo_padrao),
        limite_seguranca_vacuo: Number(sistema.limite_seguranca_vacuo),
        tolerancia_vacuo_percentual: Number(
          sistema.tolerancia_vacuo_percentual,
        ),
        unidade: 'kPa',
      },
      mqtt: {
        topico_comandos: mqttConfig.topico_comandos,
        topico_leituras: mqttConfig.topico_leituras,
        topico_status: mqttConfig.topico_status,
        topico_heartbeat: mqttConfig.topico_heartbeat,
        topico_alarmes: mqttConfig.topico_alarmes,
        topico_acoplamentos: mqttConfig.topico_acoplamentos,
        topico_configuracoes: mqttConfig.topico_configuracoes,
        topico_acks: mqttConfig.topico_acks,
      },
      hardware: {
        bombas: bombas.map((bomba) => ({
          id_bomba: bomba.id_bomba,
          codigo_hardware: this.requireCode(
            bomba.codigo_hardware,
            `bomba ${bomba.nome}`,
          ),
          nome: bomba.nome,
          tipo_bomba: bomba.tipo_bomba,
          status_padrao: bomba.status_padrao,
          disponivel: true,
        })),
        tanques: tanques.map((tanque) => ({
          id_tanque: tanque.id_tanque,
          codigo_hardware: this.requireCode(
            tanque.codigo_hardware,
            `tanque ${tanque.nome}`,
          ),
          nome: tanque.nome,
          volume: Number(tanque.volume),
          unidade_volume: tanque.unidade_volume,
          vacuo_padrao: Number(tanque.vacuo_padrao),
        })),
        valvulas: valvulas.map((valvula) => ({
          id_valvula: valvula.id_valvula,
          codigo_hardware: this.requireCode(
            valvula.codigo_hardware,
            `valvula ${valvula.nome_valvula}`,
          ),
          id_tanque: valvula.id_tanque,
          id_bomba: valvula.id_bomba,
          nome: valvula.nome_valvula,
          numero_saida_manifold: valvula.numero_saida_manifold,
          funcao_valvula: valvula.funcao_valvula,
          status_valvula: valvula.status_valvula,
          disponivel: valvula.ativo,
        })),
        sensores_vacuo: sensores
          .filter((sensor) => sensor.tipo_sensor === 'VACUO')
          .map((sensor) => ({
            id_sensor: sensor.id_sensor,
            codigo_hardware: this.requireCode(
              sensor.codigo_hardware,
              `sensor ${sensor.nome}`,
            ),
            nome: sensor.nome,
            tipo_sensor: sensor.tipo_sensor,
            unidade_medida: sensor.unidade_medida,
            disponivel: sensor.status_sensor === 'ATIVO',
          })),
        sensores_acoplamento: sensores
          .filter((sensor) => sensor.tipo_sensor === 'ACOPLAMENTO')
          .map((sensor) => ({
            id_sensor: sensor.id_sensor,
            codigo_hardware: this.requireCode(
              sensor.codigo_hardware,
              `sensor ${sensor.nome}`,
            ),
            id_tanque: sensor.sensoresacoplamentomangueiras?.id_tanque ?? null,
            nome: sensor.nome,
            tipo_sensor: sensor.tipo_sensor,
            unidade_medida: sensor.unidade_medida,
            disponivel: sensor.status_sensor === 'ATIVO',
          })),
      },
      seguranca: {
        parar_se_desacoplar: true,
        parada_emergencia_habilitada: true,
        timeout_heartbeat_ms: mqttConfig.timeout_comunicacao,
      },
    };
  }

  private requireCode(value: string | null, label: string): string {
    const code = value?.trim();

    if (!code) {
      throw new BadRequestException(
        `codigo_hardware ausente para ${label}. Sincronizacao ESP32 bloqueada.`,
      );
    }

    return code;
  }
}
