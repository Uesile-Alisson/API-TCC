import { statusgeralsistema } from '@prisma/client';

export interface HardwareState {
  mqttConnected: boolean;
  esp32Online: boolean;
  lastHeartbeatAt: Date | null;
  lastStatusAt: Date | null;
  lastReadingAt: Date | null;
  currentStatus: statusgeralsistema | null;
  lastError: string | null;
  updatedAt: Date;
  enviado_em?: Date;
}
