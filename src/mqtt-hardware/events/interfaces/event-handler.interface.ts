import { DomainEvent } from './domain-event.interface';
import { EventResult } from './event-result.interface';

export interface EventHandler<TInput = unknown> {
  handle(event: DomainEvent<TInput>): Promise<EventResult>;
}
