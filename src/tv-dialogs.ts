// Older TV browsers support Canvas 2D but may predate native modal dialogs.
export function installDialogFallback() {
  const dialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog')];
  if (!dialogs.length || typeof dialogs[0].showModal === 'function') return;
  const previousFocus = new WeakMap<HTMLDialogElement, HTMLElement>();
  for (const dialog of dialogs) {
    dialog.classList.add('dialog-fallback');
    dialog.showModal = () => {
      if (dialog.open) return;
      previousFocus.set(dialog, document.activeElement as HTMLElement);
      dialog.setAttribute('open', '');
      // Some TV browsers expose <dialog> as an unknown element.
      if (!dialog.open) Object.defineProperty(dialog, 'open', { configurable: true, get: () => dialog.hasAttribute('open') });
      dialog.querySelector<HTMLElement>('[autofocus], button, input, select')?.focus();
    };
    dialog.close = (value?: string) => {
      if (!dialog.hasAttribute('open')) return;
      if (value !== undefined) dialog.returnValue = value;
      dialog.removeAttribute('open');
      previousFocus.get(dialog)?.focus();
      // Native close events are queued; match that ordering for nested menus.
      setTimeout(() => dialog.dispatchEvent(new Event('close')), 0);
    };
    dialog.addEventListener('click', event => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button');
      if (!button || button.type === 'button' || button.form?.getAttribute('method') !== 'dialog') return;
      event.preventDefault();
      dialog.close(button.value);
    });
  }
  document.addEventListener('keydown', event => {
    const open = dialogs.filter(dialog => dialog.open);
    const dialog = open[open.length - 1];
    if (event.key !== 'Escape' || !dialog) return;
    event.preventDefault();
    if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close();
  });
}
