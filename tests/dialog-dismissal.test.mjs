import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from './load-source.mjs';
const { dismissDialog, installDialogDismissal } = await loadSource('tv-dialogs');

class Dialog extends EventTarget {
  open = false;
  returnValue = 'rerack';
  children = new Set();
  showModal() { this.open = true; }
  close(value) { this.returnValue = value; this.open = false; this.dispatchEvent(new Event('close')); }
  contains(node) { return this.children.has(node); }
  getBoundingClientRect() { return { left: 100, right: 400, top: 100, bottom: 400 }; }
}

test('dismissal cancels confirmations and honors custom cancellation handlers', () => {
  const dialog = new Dialog();
  dialog.showModal();
  dismissDialog(dialog);
  assert.equal(dialog.open, false);
  assert.equal(dialog.returnValue, '');
  dialog.addEventListener('cancel', event => event.preventDefault());
  dialog.showModal();
  dismissDialog(dialog);
  assert.equal(dialog.open, true);
});

test('outside clicks dismiss only the top dialog and do not click through', t => {
  const previousDocument = globalThis.document;
  const parent = new Dialog(), child = new Dialog();
  const document = new EventTarget();
  document.querySelectorAll = () => [parent, child];
  globalThis.document = document;
  t.after(() => { globalThis.document = previousDocument; });
  installDialogDismissal();
  parent.showModal();
  child.showModal();
  let underlyingClicks = 0;
  document.addEventListener('click', () => underlyingClicks++);
  const emit = (type, target, x, y) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, { target: { value: target }, clientX: { value: x }, clientY: { value: y } });
    document.dispatchEvent(event);
    return event;
  };
  const childControl = {};
  child.children.add(childControl);
  emit('pointerdown', childControl, 200, 200);
  emit('click', childControl, 200, 200);
  assert.equal(child.open, true);
  assert.equal(underlyingClicks, 1);
  // A drag started inside is not a backdrop dismissal.
  emit('pointerdown', child, 200, 200);
  emit('click', child, 20, 20);
  assert.equal(child.open, true);
  assert.equal(underlyingClicks, 1);
  emit('pointerdown', child, 20, 20);
  const outsideClick = emit('click', child, 20, 20);
  assert.equal(outsideClick.defaultPrevented, true);
  assert.equal(child.open, false);
  assert.equal(parent.open, true);
  assert.equal(child.returnValue, '');
  assert.equal(underlyingClicks, 1);
  // Older browsers can deliver a mouse click without a pointer event first.
  emit('click', {}, 20, 20);
  assert.equal(parent.open, false);
});
