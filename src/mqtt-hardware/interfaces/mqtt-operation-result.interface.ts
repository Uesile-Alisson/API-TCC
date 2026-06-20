export interface MqttOperationResult {
  success: boolean;
  message: string;
  error?: string;
  timestamp: Date;
}
