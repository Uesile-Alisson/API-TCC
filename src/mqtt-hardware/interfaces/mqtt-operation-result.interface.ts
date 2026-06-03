export interface MqttOperationResult {
    sucess: boolean;
    message: string;
    error?: string;
    timestamp: Date;
}