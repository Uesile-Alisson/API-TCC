export interface MqttPublishOptions {
    qos: 0 | 1 | 2;
    retain: boolean;
}