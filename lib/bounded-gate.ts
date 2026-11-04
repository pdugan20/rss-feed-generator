/** A bounded, abortable queue; a timed-out waiter cannot start work later. */
export class BoundedGate {
  private active = 0;
  private waiting: { start: () => void; abort: () => void; signal: AbortSignal }[] = [];
  constructor(
    private readonly limit: number,
    private readonly maxWaiting: number
  ) {}

  async run<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    if (this.active >= this.limit) {
      if (this.waiting.length >= this.maxWaiting) throw new Error('Work queue is full');
      await new Promise<void>((resolve, reject) => {
        const entry = {
          signal,
          start: resolve,
          abort: () => {
            const index = this.waiting.indexOf(entry);
            if (index >= 0) this.waiting.splice(index, 1);
            reject(signal.reason);
          },
        };
        this.waiting.push(entry);
        signal.addEventListener('abort', entry.abort, { once: true });
      });
    } else {
      this.active++;
    }
    try {
      signal.throwIfAborted();
      return await work();
    } finally {
      const next = this.waiting.shift();
      if (next) {
        next.signal.removeEventListener('abort', next.abort);
        next.start();
      } else this.active--;
    }
  }
}
