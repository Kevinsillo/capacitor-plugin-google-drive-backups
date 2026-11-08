import { describe, expect, it } from 'vitest';

import type { EventMap, EventName } from '../../application/events';
import type { LogLevel } from '../../domain/models';

import { EventEmitter } from './EventEmitter';

function harness(logLevel: LogLevel = 'silent') {
  let now = 0;
  const sent: { event: EventName; data: unknown }[] = [];
  const emitter = new EventEmitter(
    (event, data) => {
      sent.push({ event, data });
    },
    () => logLevel,
    () => now,
  );
  return { emitter, sent, setNow: (ms: number) => (now = ms) };
}

const progress = (bytes: number, total = 1000) => ({ operationId: 'op', bytes, total });

describe('EventEmitter: progress throttle', () => {
  it('emits the first progress and drops the ones inside the 250 ms window', () => {
    const { emitter, sent, setNow } = harness();
    setNow(0);
    emitter.emit('progress', progress(10));
    setNow(100);
    emitter.emit('progress', progress(20));
    setNow(250);
    emitter.emit('progress', progress(30));

    expect(sent.map((s) => (s.data as { bytes: number }).bytes)).toEqual([10, 30]);
  });

  it('always emits the final progress, even inside the window', () => {
    const { emitter, sent, setNow } = harness();
    setNow(0);
    emitter.emit('progress', progress(10));
    setNow(10);
    emitter.emit('progress', progress(1000, 1000));
    expect(sent).toHaveLength(2);
  });

  it('throttles each operation separately', () => {
    const { emitter, sent, setNow } = harness();
    setNow(0);
    emitter.emit('progress', { operationId: 'a', bytes: 1, total: 10 });
    emitter.emit('progress', { operationId: 'b', bytes: 1, total: 10 });
    expect(sent).toHaveLength(2);
  });

  it('forgets the throttle state when an operation ends, so the next one starts fresh', () => {
    const { emitter, sent, setNow } = harness();
    setNow(0);
    emitter.emit('progress', progress(10));
    emitter.emit('state', { operationId: 'op', phase: 'done' });
    setNow(10);
    emitter.emit('progress', progress(10));
    expect(sent.filter((s) => s.event === 'progress')).toHaveLength(2);
  });
});

describe('EventEmitter: log level', () => {
  it('silent emits no log events', () => {
    const { emitter, sent } = harness('silent');
    emitter.log('error', 'test', 'boom');
    expect(sent).toEqual([]);
  });

  it('info emits info, warn and error but not debug', () => {
    const { emitter, sent } = harness('info');
    emitter.log('debug', 'test', 'd');
    emitter.log('info', 'test', 'i');
    emitter.log('warn', 'test', 'w');
    emitter.log('error', 'test', 'e');
    expect(sent.map((s) => (s.data as { level: string }).level)).toEqual(['info', 'warn', 'error']);
  });

  it('debug emits everything', () => {
    const { emitter, sent } = harness('debug');
    emitter.log('debug', 'test', 'd');
    expect(sent).toHaveLength(1);
  });
});

describe('EventEmitter: passthrough', () => {
  it('forwards other events unchanged', () => {
    const { emitter, sent } = harness();
    const data: EventMap['warning'] = { operationId: 'op', code: 'space.010', parameters: { limit: 1, free: 0 } };
    emitter.emit('warning', data);
    expect(sent).toEqual([{ event: 'warning', data }]);
  });
});
