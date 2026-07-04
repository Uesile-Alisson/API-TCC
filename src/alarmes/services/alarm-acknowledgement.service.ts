import { Injectable } from '@nestjs/common';
import type { AcknowledgeAlarmeDto } from '../dto';
import type { AcknowledgeAlarmeResult } from '../interfaces';
import { AlarmeLogService } from '../logs';
import { AlarmesRepository } from '../repositories';
import { AlarmesSocketGateway } from '../socket';
import { AlarmeStateValidator } from '../validators';

@Injectable()
export class AlarmAcknowledgementService {
  constructor(
    private readonly alarmesRepository: AlarmesRepository,
    private readonly alarmeStateValidator: AlarmeStateValidator,
    private readonly alarmeLogService: AlarmeLogService,
    private readonly alarmesSocketGateway: AlarmesSocketGateway,
  ) {}

  async acknowledge(
    id_alarme: number,
    dto: AcknowledgeAlarmeDto,
    id_usuario: number,
  ): Promise<AcknowledgeAlarmeResult> {
    const alarme = await this.alarmesRepository.findDetailsById(id_alarme);

    this.alarmeStateValidator.validateExists(alarme);
    this.alarmeStateValidator.validateNotDeleted(alarme);

    const observacao = this.sanitizeObservation(dto.observacao);
    const acknowledged = await this.alarmesRepository.acknowledge(id_alarme, {
      id_usuario,
      observacao,
      status_processo_snapshot: alarme.processos?.status_processo ?? null,
      fase_processo_snapshot: alarme.processos?.fase_processo ?? null,
    });

    this.alarmeStateValidator.validateExists(acknowledged);

    const reconhecidoEm =
      acknowledged.reconhecimentos[0]?.reconhecido_em ?? new Date();

    await this.alarmeLogService.logAcknowledged({
      id_alarme,
      id_usuario,
      id_processo: acknowledged.id_processo,
      titulo: acknowledged.titulo,
      observacao,
      reconhecido_em: reconhecidoEm,
    });

    const result: AcknowledgeAlarmeResult = {
      success: true,
      id_alarme,
      action: 'ACKNOWLEDGED',
      message:
        'Reconhecimento registrado. O alarme continuara ativo ate normalizacao tecnica.',
      occurred_at: reconhecidoEm,
      status_alarme: acknowledged.status_alarme,
      reconhecido_em: reconhecidoEm,
      id_usuario,
    };

    this.alarmesSocketGateway.emitAlarmAcknowledged(result);
    this.alarmesSocketGateway.emitAlarmUpdated({ id_alarme });

    return result;
  }

  private sanitizeObservation(value?: string): string | null {
    const observacao = value?.trim();

    return observacao ? observacao : null;
  }
}
