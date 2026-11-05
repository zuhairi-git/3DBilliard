import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSource } from './load-source.mjs';
const { SvgTable, svgViewport } = await loadSource('svg-table');
const { width, length, pockets } = await loadSource('physics');

test('SVG table framing fits the complete rails between the controls', () => {
  for (const [w,h,top,bottom] of [[390,844,80,760],[1440,900,100,810],[844,390,70,310]]) {
    const v = svgViewport(w,h,top,bottom);
    const wide = (v.landscape ? length : width) + .30;
    const tall = (v.landscape ? width : length) + .30;
    assert.ok(wide * v.scale <= w - 20 + 1e-8);
    assert.ok(tall * v.scale <= bottom - top + 1e-8);
  }
});
test('SVG picking matches projected ball and pocket positions across orientation and zoom', () => {
  const renderer = Object.create(SvgTable.prototype);
  for (const [w,h] of [[390,844],[1440,900]]) for (const zoom of [.65,1,2.5]) {
    renderer.view = svgViewport(w,h,90,h-90,zoom);
    for (const p of [{x:0,z:0},{x:.22,z:-.74},...pockets]) {
      const screen = renderer.project(p.x,p.z);
      const hit = renderer.pick(screen.x,screen.y,true);
      assert.ok(hit);
      assert.ok(Math.abs(hit.x-p.x)<1e-10 && Math.abs(hit.z-p.z)<1e-10);
    }
    assert.equal(renderer.pick(-10000,-10000,true),undefined);
  }
});
