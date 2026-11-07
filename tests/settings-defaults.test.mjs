import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const main = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');

test('settings default to the requested cue, cloth, and vertical right-side controls', () => {
  for (const [setting, value] of [
    ['cueStyle', 'Carbon Black', undefined],
    ['tableStyle', 'Club Green', undefined],
    ['controlLayout', 'Vertical · Side', 'vertical'],
    ['controlSide', 'Shot controls right · Zoom/aim left', 'right'],
  ]) {
    const select = html.match(new RegExp(`<select[^>]*id="${setting}"[^>]*>([\\s\\S]*?)<\\/select>`))?.[1];
    assert.ok(select, `missing ${setting} setting`);
    const selected = select.match(/<option([^>]*)\bselected([^>]*)>([\s\S]*?)<\/option>/);
    assert.ok(selected, `${setting} should have a selected default`);
    assert.equal(selected[3], value);
    if (selected[1].includes('value=') || selected[2].includes('value=')) {
      assert.match(selected[1] + selected[2], new RegExp(`\\bvalue="${setting === 'controlLayout' ? 'vertical' : 'right'}"`));
    }
  }
});

test('saved horizontal shot controls remain respected while the fresh default is vertical', () => {
  assert.match(main, /localStorage\.getItem\('billiard-control-layout'\) === 'horizontal' \? 'horizontal' : 'vertical'/);
});
