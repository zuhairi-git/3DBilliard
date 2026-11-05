import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from './load-source.mjs';
const { fullscreenActive, fullscreenSupported, toggleFullscreen } = await loadSource('fullscreen');

test('fullscreen toggles the whole game and requests hidden browser navigation', async () => {
  const doc = { fullscreenElement: null, async exitFullscreen() { assert.equal(this, doc); this.fullscreenElement = null; } };
  const root = { async requestFullscreen(options) {
    assert.equal(this, root);
    assert.deepEqual(options, { navigationUI: 'hide' });
    doc.fullscreenElement = root;
  } };
  assert.equal(fullscreenSupported(doc, root), true);
  await toggleFullscreen(doc, root);
  assert.equal(fullscreenActive(doc), true);
  await toggleFullscreen(doc, root);
  assert.equal(fullscreenActive(doc), false);
});

test('older WebKit TV browsers can enter and exit fullscreen without promises', async () => {
  for (const legacy of [false, true]) {
    const doc = { webkitFullscreenElement: null, webkitIsFullScreen: false };
    const root = {};
    doc[legacy ? 'webkitCancelFullScreen' : 'webkitExitFullscreen'] = function () {
      assert.equal(this, doc);
      this.webkitFullscreenElement = null;
      this.webkitIsFullScreen = false;
    };
    root[legacy ? 'webkitRequestFullScreen' : 'webkitRequestFullscreen'] = function () {
      assert.equal(this, root);
      if (legacy) doc.webkitIsFullScreen = true;
      else doc.webkitFullscreenElement = root;
    };
    assert.equal(fullscreenSupported(doc, root), true);
    await toggleFullscreen(doc, root);
    assert.equal(fullscreenActive(doc), true);
    await toggleFullscreen(doc, root);
    assert.equal(fullscreenActive(doc), false);
  }
});

test('rejected requests and missing APIs report failure without inventing fullscreen state', async () => {
  const doc = { fullscreenElement: null, exitFullscreen() {} };
  await assert.rejects(toggleFullscreen(doc, { async requestFullscreen() { throw new Error('Denied'); } }), /Denied/);
  assert.equal(fullscreenActive(doc), false);
  assert.equal(fullscreenSupported({}, {}), false);
  assert.equal(fullscreenSupported({}, { requestFullscreen() {} }), false);
  await assert.rejects(toggleFullscreen({}, {}), /unavailable/);
});
