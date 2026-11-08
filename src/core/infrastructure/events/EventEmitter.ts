import type { EventMap, EventName, ProgressEvent } from '../../application/events';
import type { IEventEmitter } from '../../application/ports/IEventEmitter';
import type { LogLevel } from '../../domain/models';
import { shouldEmitProgress } from '../../domain/progress';

/** Delivers events to the bridge. Applies the progress throttle and the log level. */
export class EventEmitter implements IEventEmitter {
  private readonly lastProgress = new Map<string, number>();

  constructor(
    private readonly notify: <E extends EventName>(event: E, data: EventMap[E]) => void,
    private readonly logLevel: () => LogLevel,
    private readonly now: () => number = Date.now,
  ) {}

  emit<E extends EventName>(event: E, data: EventMap[E]): void {
    if (event === 'progress') {
      const progress = data as ProgressEvent;
      const last = this.lastProgress.get(progress.operationId);
      const isFinal = progress.bytes >= progress.total;
      // The final value always passes, so the app never ends a transfer stuck below 100 %.
      if (!isFinal && !shouldEmitProgress(last, this.now())) return;
      this.lastProgress.set(progress.operationId, this.now());
    }

    if (event === 'state') {
      const { operationId, phase } = data as EventMap['state'];
      if (phase === 'done' || phase === 'cancelled') this.lastProgress.delete(operationId);
    }

    this.notify(event, data);
  }

  /**
   * Emits a `log` event if the configured level allows it. `silent` emits nothing;
   * `info` emits info, warn and error; `debug` emits everything.
   */
  log(level: 'debug' | 'info' | 'warn' | 'error', origin: string, message: string): void {
    const configured = this.logLevel();
    if (configured === 'silent') return;
    if (level === 'debug' && configured !== 'debug') return;
    this.notify('log', { level, origin, message });
  }
}
