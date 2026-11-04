import { BoundedGate } from '../../lib/bounded-gate';
it('caps running and queued work, and removes aborted waiters', async () => {
  const gate = new BoundedGate(1, 1);
  const ctrl = new AbortController();
  const live = new AbortController();
  let finish!: () => void;
  const active = gate.run(
    live.signal,
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const work = jest.fn(async () => {});
  const queued = gate.run(ctrl.signal, work);
  await expect(gate.run(live.signal, work)).rejects.toThrow(/full/);
  ctrl.abort(new Error('cancelled'));
  await expect(queued).rejects.toThrow('cancelled');
  finish();
  await active;
  expect(work).not.toHaveBeenCalled();
  await gate.run(live.signal, work);
  expect(work).toHaveBeenCalledTimes(1);
});
