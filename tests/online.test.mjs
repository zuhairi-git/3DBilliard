import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { attachOnline } from '../server/online.mjs';

function inbox(socket) {
  const queue = [], waiting = [];
  socket.on('message', raw => {
    const value = JSON.parse(raw.toString());
    const listener = waiting.shift();
    if (listener) listener(value); else queue.push(value);
  });
  return async type => {
    const message = queue.length ? queue.shift() : await new Promise(resolve => waiting.push(resolve));
    assert.equal(message.type, type, JSON.stringify(message));
    return message;
  };
}
test('online IDs, host authority, profile names, and refresh reconnection', { timeout: 10000 }, async t => {
  const server = createServer();
  const sockets = attachOnline(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { for (const ws of sockets.clients) ws.terminate(); server.close(); });
  const url = 'ws://127.0.0.1:' + server.address().port + '/play';
  const connect = async (secret, name) => {
    const ws = new WebSocket(url);
    const next = inbox(ws);
    await once(ws, 'open');
    ws.send(JSON.stringify({type: 'register', secret, name}));
    const registration = await next('registered');
    return {ws, next, id: registration.playerId, send: data => ws.send(JSON.stringify(data))};
  };
  const host = await connect('a'.repeat(64), 'Alice');
  const guest = await connect('b'.repeat(64), 'Bob');
  assert.match(host.id, /^[A-F0-9]{12}$/);
  guest.send({type: 'join', playerId: '000000000000'});
  await guest.next('error');
  host.send({type: 'host'});
  await host.next('waiting');
  guest.send({type: 'join', playerId: host.id});
  assert.equal((await host.next('paired')).peerName, 'Bob');
  assert.equal((await guest.next('paired')).seat, 1);
  guest.send({type: 'state', state: {forged: true}});
  host.send({type: 'state', state: {turn: 1, sequence: 7}});
  assert.deepEqual((await guest.next('state')).state, {turn: 1, sequence: 7});
  guest.send({type: 'input', input: {action: 'shoot', strength: 0.5}});
  assert.equal((await host.next('input')).input.strength, 0.5);
  guest.send({type: 'profile', name: 'Bobby'});
  assert.equal((await host.next('profile')).name, 'Bobby');
  guest.ws.close();
  await host.next('ended');
  const rejoined = await connect('b'.repeat(64), 'Bobby');
  assert.equal(rejoined.id, guest.id);
  const hostResume = await host.next('paired');
  const guestResume = await rejoined.next('paired');
  assert.equal(hostResume.resume, true);
  assert.deepEqual(guestResume.state, {turn: 1, sequence: 7});
  rejoined.send({type: 'leave'});
  await host.next('ended');
});

test('profile QR codes round-trip through the same decoder used by the scanner', () => {
  const text = 'https://billiard.example/?join=ABCDEF123456';
  const qr = QRCode.create(text, {errorCorrectionLevel: 'M'});
  const scale = 8, margin = 4;
  const size = (qr.modules.size + margin * 2) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < qr.modules.size; y++) for (let x = 0; x < qr.modules.size; x++) {
    if (!qr.modules.get(y, x)) continue;
    for (let py = 0; py < scale; py++) for (let px = 0; px < scale; px++) {
      const i = (((y + margin) * scale + py) * size + (x + margin) * scale + px) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
    }
  }
  assert.equal(jsQR(pixels, size, size)?.data, text);
});
