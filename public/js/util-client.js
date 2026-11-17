export const newId = () => 'i_' + Math.random().toString(36).slice(2, 11);

export function saver(saveFn, indicator, delay = 900) {
  let timer;
  let pending = false;
  let inflight = Promise.resolve();
  const set = (state, text) => {
    indicator.className = `save-state ${state}`;
    indicator.replaceChildren(Object.assign(document.createElement('span'), { className: 'dot' }), text);
  };
  const run = () => {
    pending = false;
    set('saving', 'Saving…');
    inflight = inflight.then(() => saveFn()).then(() => set('', pending ? 'Saving…' : 'All changes saved'), (e) => set('error', 'Not saved: ' + (e.message || 'error')));
    return inflight;
  };
  const trigger = () => {
    pending = true;
    set('saving', 'Unsaved changes…');
    clearTimeout(timer);
    timer = setTimeout(run, delay);
  };
  trigger.flush = () => {
    clearTimeout(timer);
    return pending ? run() : inflight;
  };
  set('', 'All changes saved');
  return trigger;
}
