import { ballArtwork } from './svg-ball';
import { traceShot } from './aim-guide';
import { cushions, width, length, radius, pockets } from './physics';
import type { TableState } from './tv-table';

const ns = 'http://www.w3.org/2000/svg';
// A large, deterministic tile gives the cloth fine fibres without a dot grid.
function feltFibres() {
  let seed = 7319;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  let light = '', dark = '';
  for (let i = 0; i < 700; i++) {
    const x = (random() * 127).toFixed(2), y = (random() * 131).toFixed(2);
    const fibre = 'M' + x + ' ' + y + 'l.3 ' + (.5 + random() * 1.3).toFixed(2);
    if (i % 2) light += fibre; else dark += fibre;
  }
  return '<path d="'+light+'" stroke="#fff" stroke-opacity=".055" stroke-width=".65"/><path d="'+dark+'" stroke="#02131b" stroke-opacity=".07" stroke-width=".65"/>';
}

export function svgViewport(w: number, h: number, top: number, bottom: number, zoom = 1) {
  const landscape = w > h;
  const scale = Math.min(Math.max(1, w - 20) / ((landscape ? length : width) + .30), Math.max(1, bottom - top) / ((landscape ? width : length) + .30)) * zoom;
  return { landscape, scale, cx: w / 2, cy: (top + bottom) / 2 };
}
export class SvgTable {
  private view = svgViewport(1280, 720, 100, 620);
  private root: SVGGElement;
  private table: SVGGElement;
  private guides: SVGGElement;
  private cue: SVGGElement;
  private balls: SVGGElement[];
  private previous: {x: number; z: number}[] = [];
  private angles: number[] = [];
  private finish = '';
  constructor(private svg: SVGSVGElement) {
    svg.innerHTML = `<defs>
      <linearGradient id="sv-rail" x2="1" y2="1"><stop stop-color="#34465d"/><stop offset=".45" stop-color="#17283d"/><stop offset="1" stop-color="#0b1424"/></linearGradient>
      <linearGradient id="sv-cushion" x2="1" y2="1"><stop stop-color="#ffffff" stop-opacity=".22"/><stop offset=".4" stop-color="#fff" stop-opacity=".03"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>
      <radialGradient id="sv-felt" cx=".43" cy=".38" r=".78"><stop stop-color="#e9f6ee" stop-opacity=".12"/><stop offset=".48" stop-color="#e9f6ee" stop-opacity=".025"/><stop offset=".8" stop-color="#00121c" stop-opacity=".10"/><stop offset="1" stop-color="#00121c" stop-opacity=".30"/></radialGradient>
      <linearGradient id="sv-nap" x1="0" y1="0" x2=".35" y2="1"><stop stop-color="#fff" stop-opacity=".045"/><stop offset=".42" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#00111c" stop-opacity=".07"/></linearGradient>
      <radialGradient id="sv-pocket" cx=".5" cy=".2"><stop stop-color="#241b25"/><stop offset=".55" stop-color="#03050a"/><stop offset="1" stop-color="#000"/></radialGradient>
      <radialGradient id="sv-resin" cx=".3" cy=".23" r=".85"><stop stop-color="#fff" stop-opacity=".54"/><stop offset=".38" stop-color="#fff" stop-opacity=".03"/><stop offset=".7" stop-color="#000" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".65"/></radialGradient>
      <radialGradient id="sv-contact"><stop stop-color="#000" stop-opacity=".65"/><stop offset=".65" stop-color="#000" stop-opacity=".25"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
      <linearGradient id="sv-maple" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffeab6"/><stop offset=".35" stop-color="#e5b86e"/><stop offset=".65" stop-color="#fff0c5"/><stop offset="1" stop-color="#99682e"/></linearGradient>
      <pattern id="sv-fibre" width="127" height="131" patternUnits="userSpaceOnUse">${feltFibres()}</pattern>
      <clipPath id="sv-ball-clip"><circle r="35"/></clipPath>
    </defs><g class="sv-world"><g class="sv-table"></g><g class="sv-guides"></g><g class="sv-cue"></g><g class="sv-balls"></g></g>`;
    this.root = svg.querySelector('.sv-world')!;
    this.table = svg.querySelector('.sv-table')!;
    this.guides = svg.querySelector('.sv-guides')!;
    this.cue = svg.querySelector('.sv-cue')!;
    const layer = svg.querySelector('.sv-balls')!;
    this.balls = Array.from({length: 22}, () => {
      const g = document.createElementNS(ns, 'g'); layer.append(g); return g;
    });
  }
  resize(w: number, h: number, top: number, bottom: number, zoom = 1) {
    this.svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    this.view = svgViewport(w, h, top, bottom, zoom);
    const v = this.view;
    this.root.setAttribute('transform', 'translate(' + v.cx + ' ' + v.cy + ') scale(' + v.scale / 1000 + ') rotate(' + (v.landscape ? 90 : 0) + ')');
  }
  project(x: number, z: number) {
    const v = this.view;
    return { x: v.cx + (v.landscape ? z : x) * v.scale, y: v.cy + (v.landscape ? x : -z) * v.scale };
  }
  pick(sx: number, sy: number, rails = false) {
    const v = this.view;
    const x = (v.landscape ? sy - v.cy : sx - v.cx) / v.scale;
    const z = (v.landscape ? sx - v.cx : v.cy - sy) / v.scale;
    const margin = rails ? .16 : 0;
    if (Math.abs(x) > width / 2 + margin || Math.abs(z) > length / 2 + margin) return;
    return {x, z};
  }
  private artwork(state: TableState) {
    const felt = state.snooker ? '#90213e' : state.tableStyle === 'Club Green' ? '#138875' : state.tableStyle === 'Burgundy Lounge' ? '#922e59' : '#197eb4';
    let s = `<rect x="-784" y="-1419" width="1568" height="2838" rx="112" fill="#000" opacity=".4" transform="translate(0 12)"/>
      <rect x="-775" y="-1410" width="1550" height="2820" rx="105" fill="url(#sv-rail)" stroke="#c4aa77" stroke-width="4"/>
      <rect x="-760" y="-1395" width="1520" height="2790" rx="94" fill="none" stroke="#ffffff" stroke-opacity=".13" stroke-width="2"/>
      <rect x="-659" y="-1294" width="1318" height="2588" fill="${felt}"/>
      <rect x="-635" y="-1270" width="1270" height="2540" fill="url(#sv-felt)"/>
      <rect x="-635" y="-1270" width="1270" height="2540" fill="url(#sv-nap)"/>
      <rect x="-635" y="-1270" width="1270" height="2540" fill="url(#sv-fibre)"/>
      <rect x="-629" y="-1264" width="1258" height="2528" fill="none" stroke="#00131c" stroke-width="12" opacity=".035"/>`;
    const cushion = (d: string) => { s += '<path d="' + d + '" fill="' + felt + '"/><path d="' + d + '" fill="url(#sv-cushion)" stroke="#ffffff" stroke-opacity=".12" stroke-width="1.5"/>'; };
    for (const p of pockets) {
      const r = p.z === 0 ? 67 : 85;
      s += '<circle cx="'+p.x*1000+'" cy="'+(-p.z*1000)+'" r="'+(r+5)+'" fill="#342b2b" stroke="#b7a27e" stroke-width="2"/><circle cx="'+p.x*1000+'" cy="'+(-p.z*1000)+'" r="'+r+'" fill="url(#sv-pocket)"/>';
    }
    // Each jaw follows the collision approach, then curves along the pocket lip.
    for (const c of cushions.filter(c => !c.jaw)) {
      const a = {x:c.ax*1000,y:-c.az*1000}, b = {x:c.bx*1000,y:-c.bz*1000};
      const distance = Math.hypot(b.x-a.x,b.y-a.y);
      const t = {x:(b.x-a.x)/distance,y:(b.y-a.y)/distance};
      const n = c.ax === c.bx ? {x:Math.sign(c.ax),y:0} : {x:0,y:-Math.sign(c.az)};
      const end = (v: typeof a, first: boolean) => {
        const jaw = cushions.find(j => j.jaw && Math.abs(j.ax*1000-v.x)<.01 && Math.abs(-j.az*1000-v.y)<.01)!;
        const p = pockets.reduce((best,p) => Math.hypot(p.x-jaw.bx,p.z-jaw.bz)<Math.hypot(best.x-jaw.bx,best.z-jaw.bz)?p:best);
        const center = {x:p.x*1000,y:-p.z*1000}, r = (p.z===0?67:85)+3;
        const sideRail = c.ax === c.bx;
        const inwardX = -Math.sign(p.x);
        const inwardY = p.z === 0 ? Math.sign(v.y) : Math.sign(p.z);
        // Extend the nose around the rim, rather than ending at its first tangent.
        const angle = p.z === 0 ? Math.acos(.4) : sideRail ? Math.PI / 2 : Math.PI / 5;
        const tip={x:center.x+inwardX*r*Math.cos(angle),y:center.y+inwardY*r*Math.sin(angle)};
        const control=sideRail ? {x:v.x,y:tip.y} : {x:tip.x,y:v.y};
        const q={x:v.x+n.x*65,y:v.y+n.y*65};
        const px=q.x-center.x,py=q.y-center.y;
        const dot=px*t.x+py*t.y;
        const root=Math.sqrt(Math.max(0,dot*dot-px*px-py*py+r*r));
        const u=-dot+(first?root:-root);
        return {tip,control,outer:{x:q.x+t.x*u,y:q.y+t.y*u},r};
      };
      const start=end(a,true), finish=end(b,false);
      const sweep=t.x*n.y-t.y*n.x<0?1:0;
      cushion('M'+start.tip.x+' '+start.tip.y+' Q'+start.control.x+' '+start.control.y+' '+a.x+' '+a.y+' L'+b.x+' '+b.y+' Q'+finish.control.x+' '+finish.control.y+' '+finish.tip.x+' '+finish.tip.y+
        ' A'+finish.r+' '+finish.r+' 0 0 '+sweep+' '+finish.outer.x+' '+finish.outer.y+
        ' L'+start.outer.x+' '+start.outer.y+' A'+start.r+' '+start.r+' 0 0 '+sweep+' '+start.tip.x+' '+start.tip.y+' Z');
    }
    for (const side of [-1, 1]) {
      for (const z of [-920,-630,-340,340,630,920]) s += '<path d="M'+side*731+' '+(z-6)+' l5 6 -5 6 -5 -6Z" fill="#d9c797"/>';
      for (const x of [-310,0,310]) s += '<path d="M'+x+' '+(side*1362-6)+' l5 6 -5 6 -5 -6Z" fill="#d9c797"/>';
    }
    if (state.snooker) s += '<path d="M-635 740H635 M-220 740 A220 220 0 0 0 220 740" fill="none" stroke="#f6dfcd" stroke-opacity=".45" stroke-width="2"/>';
    else s += '<path d="M-635 635H635" stroke="#fff" stroke-opacity=".12" stroke-width="2"/>';
    this.table.innerHTML = s;
    state.balls.forEach((_, i) => {
      this.balls[i].innerHTML = ballArtwork(i, state.snooker);
    });
  }
  draw(state: TableState) {
    const key = state.snooker + state.tableStyle + state.balls.length;
    if (key !== this.finish) { this.artwork(state); this.finish = key; }
    state.balls.forEach((b, i) => {
      const g = this.balls[i];
      g.style.display = b.pocketed ? 'none' : '';
      g.setAttribute('transform', 'translate('+b.x*1000+' '+(-b.z*1000)+')');
      const prev = this.previous[i];
      if (prev && state.rolling) this.angles[i] = (this.angles[i] || 0) + Math.hypot(b.x-prev.x,b.z-prev.z) / radius * 30;
      this.previous[i] = { x: b.x, z: b.z };
      g.querySelector('.sv-ball-art')?.setAttribute('transform', 'rotate('+(this.angles[i] || 0)+')');
    });
    this.balls.forEach((g, i) => { if (i >= state.balls.length) g.style.display = 'none'; });
    const b = state.balls[0];
    let guides = '';
    const line = (a: {x:number;z:number}, b: {x:number;z:number}, color: string) => '<path d="M'+a.x*1000+' '+(-a.z*1000)+' L'+b.x*1000+' '+(-b.z*1000)+'" stroke="'+color+'" stroke-width="2.5" stroke-dasharray="10 9" fill="none"/>';
    if (!state.rolling && !state.finished && state.guides) {
      const g = traceShot(state.balls,state.aim.x,state.aim.z);
      guides += line(b,g.impact,'#fff4df');
      if (g.objectStart && g.objectEnd) guides += line(g.objectStart,g.objectEnd,'#f8d28b') + '<circle cx="'+g.impact.x*1000+'" cy="'+(-g.impact.z*1000)+'" r="35" fill="#ffffff0c" stroke="#fff8" stroke-width="2"/>';
    }
    if (state.callEligible) pockets.forEach((p,i) => { guides += '<circle cx="'+p.x*1000+'" cy="'+(-p.z*1000)+'" r="'+(p.z === 0 ? 70 : 88)+'" fill="none" stroke="'+(state.calledPocket === i ? '#ffe2a2' : '#ffffff66')+'" stroke-width="4"/>'; });
    this.guides.innerHTML = guides;
    this.cue.style.display = state.rolling || state.finished ? 'none' : '';
    this.cue.setAttribute('transform','translate('+b.x*1000+' '+(-b.z*1000)+') rotate('+Math.atan2(-state.aim.z,state.aim.x)*180/Math.PI+') translate('+(-(radius+.018+state.pull*.12)*1000)+' 0)');
    const cueKey = state.cueStyle;
    if (this.cue.dataset.finish !== cueKey) {
      this.cue.dataset.finish = cueKey;
      const butt = cueKey === 'Carbon Black' ? '#151c28' : cueKey === 'Rosewood' ? '#652d32' : '#653d29';
      this.cue.innerHTML = '<path d="M-1250 -10L0 -3V3L-1250 10Z" fill="#000" opacity=".25" transform="translate(2 8)"/><path d="M-1250 -10L0 -3V3L-1250 10Z" fill="url(#sv-maple)"/><path d="M-1250 -10L-850 -7.8V7.8L-1250 10Z" fill="'+butt+'"/><path d="M-1000 -8.5V8.5 M-860 -7.8V7.8" stroke="#d9c18c" stroke-width="6"/><path d="M-842 -7.6L-700 0L-842 7.6Z" fill="'+butt+'"/><path d="M-18 -3.1H-4V3.1H-18Z" fill="#fff4d6"/><path d="M-4 -3H0V3H-4Z" fill="#48a1ba"/>';
    }
  }
}
