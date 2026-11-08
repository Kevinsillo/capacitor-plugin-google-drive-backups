import type { ErrorCode } from '../domain/errors';
import type { OperationPhase, Parameters } from '../domain/models';

/** Emitted when an operation changes phase. */
export interface StateEvent {
  operationId: string;
  phase: OperationPhase;
}

/** Bytes transferred by an upload or download. Emitted at most every 250 ms. */
export interface ProgressEvent {
  operationId: string;
  bytes: number;
  total: number;
}

/** Non-fatal situation: the operation keeps going. */
export interface WarningEvent {
  operationId?: string;
  code: ErrorCode;
  parameters: Parameters;
}

/** Failure. Emitted before the matching promise is rejected. */
export interface ErrorEvent {
  operationId?: string;
  code: ErrorCode;
  parameters: Parameters;
  message: string;
  recoverable: boolean;
}

/** Debug message. Only emitted when `configure` asks for a log level. */
export interface LogEvent {
  level: 'debug' | 'info' | 'warn' | 'error';
  origin: string;
  message: string;
}

/** Event names and their payloads. Used by `addListener` and by the use cases. */
export interface EventMap {
  state: StateEvent;
  progress: ProgressEvent;
  warning: WarningEvent;
  error: ErrorEvent;
  log: LogEvent;
}

export type EventName = keyof EventMap;
