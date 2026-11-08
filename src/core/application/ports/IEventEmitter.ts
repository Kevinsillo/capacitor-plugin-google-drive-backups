import type { EventMap, EventName } from '../events';

/** Output port towards the bridge. The real implementation calls `notifyListeners`. */
export interface IEventEmitter {
  emit<E extends EventName>(event: E, data: EventMap[E]): void;
}
