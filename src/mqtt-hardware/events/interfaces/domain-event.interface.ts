import { EventDomain, EventType } from '../enums';
import { EventContext } from './event-context.interface';

export interface DomainEvent<TInput = unknown> {
  type: EventType;
  domain: EventDomain;
  input: TInput;
  context?: EventContext;
  occurredAt: Date;
}
