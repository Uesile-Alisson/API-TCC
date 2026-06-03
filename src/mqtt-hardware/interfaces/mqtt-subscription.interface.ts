export interface MqttSubscriptions {
    topic: string;
    qos: 0 | 1 | 2;
}