import { mqtt_topic_prefix } from './mqtt-topics';
import { TopicValidator } from './topic-validator';

export const TopicBuilder = {
    leituraTanque(id_tanque: number, id_sensor: number): string {
        TopicValidator.validatePositiveInteger(id_sensor, 'id_sensor');
        TopicValidator.validatePositiveInteger(id_tanque, 'id_tanque');

        const topic = `${mqtt_topic_prefix}/tanques/${id_tanque}/sensores/${id_sensor}/leituras`;
        TopicValidator.validateTopics(topic, 'topicoLeituraTanque');

        return topic;
    },

    statusTanque(id_tanque: number): string {
        TopicValidator.validatePositiveInteger(id_tanque, 'id_tanque');

        const topic = `${mqtt_topic_prefix}/tanques/${id_tanque}/status`;
        TopicValidator.validateTopics(topic, 'topicoStatusTanque');

        return topic;
    },

    alarmeTanque(id_tanque: number): string {
        TopicValidator.validatePositiveInteger(id_tanque, 'id_tanque');

        const topic = `${mqtt_topic_prefix}/tanques/${id_tanque}/alarmes`;
        TopicValidator.validateTopics(topic, 'topicoAlarmeTanque');

        return topic;
    },

    comandoTanque(id_tanque: number): string {
        TopicValidator.validatePositiveInteger(id_tanque, 'id_tanque');

        const topic = `${mqtt_topic_prefix}/tanques/${id_tanque}/comandos`;
        TopicValidator.validateTopics(topic, 'topicoComandoTanque');

        return topic;
    },

    comandoBomba(id_bomba: number): string {
        TopicValidator.validatePositiveInteger(id_bomba, 'id_bomba');

        const topic = `${mqtt_topic_prefix}/bombas/${id_bomba}/comandos`;
        TopicValidator.validateTopics(topic, 'topicoComandoBomba');

        return topic;
    },

    statusBomba(id_bomba: number): string {
        TopicValidator.validatePositiveInteger(id_bomba, 'id_bomba');

        const topic = `${mqtt_topic_prefix}/bombas/${id_bomba}/status`;
        TopicValidator.validateTopics(topic, 'topicoStatusBomba');

        return topic;
    },

    alarmeBomba(id_bomba: number): string {
        TopicValidator.validatePositiveInteger(id_bomba, 'id_bomba');

        const topic = `${mqtt_topic_prefix}/bombas/${id_bomba}/alarmes`;
        TopicValidator.validateTopics(topic, 'topicoAlarmeBomba');

        return topic;
    },

    emergencia(): string {
        const topic = `${mqtt_topic_prefix}/emergencias`;
        TopicValidator.validateTopics(topic, 'topicoEmergencia');

        return topic;
    },

    comandoProcesso(id_processo: number): string {
        TopicValidator.validatePositiveInteger(id_processo, 'id_processo');

        const topic = `${mqtt_topic_prefix}/processos/${id_processo}/comandos`;
        TopicValidator.validateTopics(topic, 'topicoComandoProcesso');

        return topic;
    },

    Processo(id_processo: number): string {
        TopicValidator.validatePositiveInteger(id_processo, 'id_processo');

        const topic = `${mqtt_topic_prefix}/processos/${id_processo}`;
        TopicValidator.validateTopics(topic, 'topicoProcesso');

        return topic;
    },
} as const;