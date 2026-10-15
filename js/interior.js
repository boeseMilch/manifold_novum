// The lived-in part of the ship: kitchen, bunk beds, a toilet, a couch, a treadmill,
// warm ceiling lights and signs. Pure art (FURNITURE in ship.js makes it solid).
// Also the green corner brackets that mark everything you can click.

function plaque(x, y, w, h, lines, bg = '#e8e4d4', fg = '#2a2d35') {   // a screwed-on sign, centered at x, y
  ctx.save(); ctx.translate(x, y);
  shadowEllipse(2, 4, w * 0.5, h * 0.5, 0.25);
  rr(-w / 2, -h / 2, w, h, 4); ctx.fillStyle = bg; ctx.fill(); stroke(2);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ctx.beginPath(); ctx.arc(sx * (w / 2 - 5), sy * (h / 2 - 5), 1.8, 0, TAU); ctx.fillStyle = '#8a8f99'; ctx.fill();
  }
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const step = h / (lines.length + 0.4);
  lines.forEach(([text, size, weight = 800], i) => {
    ctx.font = `${weight} ${T * size}px system-ui, sans-serif`;
    ctx.fillText(text, 0, -h / 2 + step * (i + 0.7));
  });
  ctx.restore();
}

// Sprites (js/decor.js spr): each piece of furniture has its origin at the centre of its FURNITURE
// rect (models/props/interior.py); wall signs hang on the back wall's front face at WALL_SIGN_Z.
const fc = (r) => [r.x + r.w / 2, r.y + r.h / 2];
const WALL_SIGN_Z = 1.12;
function wallSign(name, x, wallY, z = WALL_SIGN_Z) {
  return spr(name, 0, x, wallY, z, { layer: 'wall', sortY: wallY + 0.02, depthBias: 0.05 });
}
function kitchenSprites(t) {
  if (!sprReady('props/kitchen_counter', 'props/fridge', 'props/table_kitchen', 'props/stool')) return false;
  spr('props/kitchen_counter', 0, ...fc(FURNITURE.counter));
  spr('props/fridge', 0, ...fc(FURNITURE.fridge));
  const [tx, ty] = fc(FURNITURE.table);
  for (const [ox, oy] of [[-0.85, 0.25], [0.7, -0.55]]) spr('props/stool', 0, tx + ox, ty + oy);
  spr('props/table_kitchen', 0, tx, ty);
  return true;
}
// --- kitchen -----------------------------------------------------------------
function kitchen(t) {
  if (kitchenSprites(t)) return;
  const c = FURNITURE.counter, x = U(c.x), y = U(c.y), w = U(c.w), h = U(c.h);
  shadowEllipse(x + w / 2 + 4, y + h / 2 + 4, w * 0.52, h * 0.6, 0.3);
  rr(x, y, w, h, 3); ctx.fillStyle = '#a3abb8'; ctx.fill(); stroke(2.5);
  ctx.fillStyle = '#7d8593'; ctx.fillRect(x + 2, y + h - 7, w - 4, 5);              // backsplash against the wall
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x + 3, y + 3, w - 6, 3);
  // sink with dirty dishes
  const sx = U(6.85), sy = y + h * 0.45;
  rr(sx - U(0.45), sy - U(0.25), U(0.9), U(0.5), 7); ctx.fillStyle = '#3e4552'; ctx.fill(); stroke(1.8);
  for (const [dx, dy, r] of [[-7, -2, 8], [-3, 1, 8], [8, 0, 6]]) {
    ctx.beginPath(); ctx.arc(sx + dx, sy + dy, r, 0, TAU); ctx.fillStyle = '#e8e4dc'; ctx.fill(); stroke(1.2);
    ctx.beginPath(); ctx.arc(sx + dx, sy + dy, r * 0.55, 0, TAU); ctx.strokeStyle = 'rgba(160,110,60,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  ctx.fillStyle = '#c9ced8'; ctx.fillRect(sx - 2, y + h - 12, 4, 9); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.strokeRect(sx - 2, y + h - 12, 4, 9);   // tap
  // stove: two rings, one on low, a pot of something
  const kx = U(8.3), ky = y + h * 0.45;
  rr(kx - U(0.55), ky - U(0.28), U(1.1), U(0.56), 4); ctx.fillStyle = '#2b303a'; ctx.fill(); stroke(1.8);
  ctx.beginPath(); ctx.arc(kx + U(0.25), ky, U(0.17), 0, TAU); ctx.strokeStyle = `rgba(255,120,50,${0.75 + 0.1 * Math.sin(t * 1.3)})`; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.arc(kx - U(0.25), ky, U(0.2), 0, TAU); ctx.fillStyle = '#5a6170'; ctx.fill(); stroke(1.5);   // the pot
  ctx.beginPath(); ctx.arc(kx - U(0.25), ky, U(0.14), 0, TAU); ctx.fillStyle = '#9b6a3a'; ctx.fill();               // mystery stew
  ctx.fillStyle = '#3a3f4a'; ctx.fillRect(kx - U(0.25) + U(0.18), ky - 2, 12, 4);
  steamPlume(ctx, kx - U(0.25), ky - 2, 1, t, STEAM_KINDS.pot);   // steam off the stew
  // cutting board, hot sauce, mug
  ctx.save(); ctx.translate(U(9.35), ky); ctx.rotate(0.12);
  rr(-U(0.3), -U(0.2), U(0.6), U(0.4), 4); ctx.fillStyle = '#b8874f'; ctx.fill(); stroke(1.4);
  ctx.fillStyle = '#e8c34f'; ctx.fillRect(-6, -3, 9, 6); ctx.fillStyle = '#5fa84a'; ctx.fillRect(4, -5, 6, 4);
  ctx.restore();
  ctx.beginPath(); ctx.arc(U(9.85), ky - 6, 4.5, 0, TAU); ctx.fillStyle = '#c0392b'; ctx.fill(); stroke(1.2);   // hot sauce
  ctx.beginPath(); ctx.arc(U(9.85), ky + 8, 5.5, 0, TAU); ctx.fillStyle = '#2e7dc9'; ctx.fill(); stroke(1.2);   // mug
  // microwave, forever reading 12:00
  const mx = U(10.5), my = y + h * 0.42;
  rr(mx - U(0.4), my - U(0.27), U(0.8), U(0.54), 4); ctx.fillStyle = '#d9dde3'; ctx.fill(); stroke(1.8);
  rr(mx - U(0.32), my - U(0.18), U(0.42), U(0.36), 3); ctx.fillStyle = '#2b3340'; ctx.fill();
  ctx.fillStyle = '#47e07a'; ctx.font = `700 ${T * 0.11}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('12:00', mx + U(0.22), my - U(0.08)); ctx.textAlign = 'left';
  // fridge with a note
  const f = FURNITURE.fridge, fx = U(f.x), fy = U(f.y), fw = U(f.w), fh = U(f.h);
  shadowEllipse(fx + fw / 2 + 5, fy + fh / 2 + 6, fw * 0.55, fh * 0.5, 0.3);
  rr(fx, fy, fw, fh, 5); ctx.fillStyle = '#e4e7ec'; ctx.fill(); stroke(2.5);
  ctx.fillStyle = '#b9bfc9'; ctx.fillRect(fx + 3, fy + 3, fw - 6, 6);                  // door edge with the handle
  ctx.fillStyle = '#6b7486'; ctx.fillRect(fx + fw * 0.6, fy + 1, fw * 0.3, 4);
  for (const [dx, dy, col] of [[0.2, 0.55, '#e2574c'], [0.75, 0.7, '#e8c34f'], [0.4, 0.85, '#5fd6a0']]) {
    ctx.beginPath(); ctx.arc(fx + fw * dx, fy + fh * dy, 3.5, 0, TAU); ctx.fillStyle = col; ctx.fill(); stroke(1);
  }
  ctx.save(); ctx.translate(fx + fw * 0.5, fy + fh * 0.48); ctx.rotate(-0.08);
  ctx.fillStyle = '#f2df6b'; ctx.fillRect(-U(0.42), -U(0.17), U(0.84), U(0.34)); stroke(1);
  ctx.fillStyle = '#3a2f20'; ctx.font = `700 ${T * 0.085}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('WHO ATE MY', 0, -4); ctx.fillText('PUDDING??', 0, 5);
  ctx.restore();
  // round table, two stools, the pizza
  const tb = FURNITURE.table, tx = U(tb.x + tb.w / 2), ty = U(tb.y + tb.h / 2);
  for (const [ox, oy] of [[-0.85, 0.25], [0.7, -0.55]]) {
    shadowEllipse(tx + U(ox) + 3, ty + U(oy) + 4, U(0.24), U(0.2), 0.3);
    ctx.beginPath(); ctx.arc(tx + U(ox), ty + U(oy), U(0.22), 0, TAU); ctx.fillStyle = '#c0392b'; ctx.fill(); stroke(1.8);
    ctx.beginPath(); ctx.arc(tx + U(ox), ty + U(oy), U(0.12), 0, TAU); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2; ctx.stroke();
  }
  shadowEllipse(tx + 5, ty + 7, U(0.6), U(0.5), 0.35);
  ctx.beginPath(); ctx.arc(tx, ty, U(0.55), 0, TAU); ctx.fillStyle = '#9a7a52'; ctx.fill(); stroke(2.2);
  ctx.beginPath(); ctx.arc(tx + 9, ty + 7, 6, 0, TAU); ctx.strokeStyle = 'rgba(70,40,20,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();   // mug ring
  ctx.save(); ctx.translate(tx - 3, ty + 4); ctx.scale(0.62, 0.62); pizza(0, 0, 0.3); ctx.restore();
}

// --- bunks and lockers ---------------------------------------------------------
function bunk(x, y, w, h, blanket, messy, t) {
  shadowEllipse(x + w / 2 + 5, y + h / 2 + 6, w * 0.55, h * 0.5, 0.35);
  // the lower bunk's blanket hangs out underneath
  rr(x + 3, y + h - 6, w * 0.7, 10, 3); ctx.fillStyle = shade(blanket, -0.25); ctx.fill(); stroke(1.2);
  rr(x, y, w, h, 3); ctx.fillStyle = '#4b5263'; ctx.fill(); stroke(2.5);                 // frame
  rr(x + 4, y + 4, w - 8, h - 8, 5); ctx.fillStyle = '#d9d4c7'; ctx.fill(); stroke(1.3);  // mattress
  rr(x + 7, y + 6, w - 14, h * 0.15, 6); ctx.fillStyle = '#f2efe6'; ctx.fill(); stroke(1.2);   // pillow
  ctx.save(); ctx.translate(x + w / 2, y + h * 0.62); ctx.rotate(messy ? 0.12 : 0);
  rr(-w / 2 + 5, -h * 0.3, w - 10, h * 0.6, 6); ctx.fillStyle = blanket; ctx.fill(); stroke(1.5);
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(-w / 2 + 6, -h * 0.3 + 2, w - 12, 5);      // folded edge
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-w / 2 + 10 + i * 9, -h * 0.1 + i * 12); ctx.quadraticCurveTo(0, -h * 0.05 + i * 12, w / 2 - 10, -h * 0.12 + i * 12); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = '#2b303a';
  for (const [cx, cy] of [[x, y], [x + w - 5, y], [x, y + h - 5], [x + w - 5, y + h - 5]]) ctx.fillRect(cx, cy, 5, 5);   // posts
  ctx.strokeStyle = '#8a8f99'; ctx.lineWidth = 2;                                          // ladder rungs on the side
  for (let i = 0; i < 4; i++) { const ry = y + h * 0.3 + i * h * 0.15; ctx.beginPath(); ctx.moveTo(x + w - 2, ry); ctx.lineTo(x + w + 5, ry); ctx.stroke(); }
}
function bunkRoom(t) {
  if (sprReady('props/bunks', 'props/lockers', 'props/plaque_hang_in_there')) {
    spr('props/bunks', 0, ...fc(FURNITURE.bunks));
    spr('props/lockers', 0, ...fc(FURNITURE.lockers));
    wallSign('props/plaque_hang_in_there', 34.4, 2.6);
    return;
  }
  const b = FURNITURE.bunks, half = (b.w - 0.4) / 2;
  bunk(U(b.x), U(b.y), U(half), U(b.h), '#3a6ea8', false, t);
  bunk(U(b.x + half + 0.4), U(b.y), U(half), U(b.h), '#a8553a', true, t);
  // a teddy bear on the messy one, a comic on the tidy one
  const bx = U(b.x + half + 0.4 + half / 2), by = U(b.y + 0.6);
  ctx.fillStyle = '#a8763a';
  for (const [dx, dy, r] of [[0, 6, 8], [0, -5, 6], [-5, -10, 2.8], [5, -10, 2.8], [-8, 4, 3], [8, 4, 3]]) { ctx.beginPath(); ctx.arc(bx + dx, by + dy, r, 0, TAU); ctx.fill(); stroke(1); }
  ctx.save(); ctx.translate(U(b.x + half / 2), U(b.y + 1.6)); ctx.rotate(-0.25);
  ctx.fillStyle = '#e8c34f'; ctx.fillRect(-9, -6, 18, 12); stroke(1); ctx.fillStyle = '#c0392b'; ctx.fillRect(-7, -4, 7, 5);
  ctx.restore();
  // a curtain half drawn on the messy bunk
  ctx.fillStyle = 'rgba(70,90,70,0.85)';
  const cx = U(b.x + b.w) - 6;
  for (let i = 0; i < 5; i++) { rr(cx - 3, U(b.y) + 4 + i * 9, 6, 9, 2); ctx.fill(); stroke(0.8); }
  // lockers, one ajar with a sleeve hanging out
  const L = FURNITURE.lockers, lx = U(L.x), ly = U(L.y), lw = U(L.w) / 2, lh = U(L.h);
  shadowEllipse(lx + lw + 4, ly + lh / 2 + 5, lw * 1.1, lh * 0.5, 0.3);
  for (let i = 0; i < 2; i++) {
    rr(lx + i * lw, ly, lw, lh, 2); ctx.fillStyle = i ? '#5f7aa0' : '#56709a'; ctx.fill(); stroke(2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; for (let k = 0; k < 3; k++) ctx.fillRect(lx + i * lw + 6, ly + 5 + k * 4, lw - 12, 1.5);
  }
  ctx.save(); ctx.translate(lx + lw * 2, ly + lh); ctx.rotate(0.6);                      // the open door
  ctx.fillStyle = '#4a6288'; ctx.fillRect(-lw, 0, lw, 4); ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.strokeRect(-lw, 0, lw, 4);
  ctx.restore();
  plaque(U(34.4), U(2.25), U(1.5), U(0.5), [['HANG IN THERE', 0.12]], '#2d5f82', '#e8f4ff');
}

// --- the toilet ----------------------------------------------------------------
function toiletStall(t) {
  if (sprReady('props/toilet_stall', 'props/toilet', 'props/plunger', 'props/magazine')) {
    spr('props/toilet_stall', 0, 11.625, 16.0);
    spr('props/toilet', 0, ...fc(FURNITURE.toilet));
    spr('props/plunger', 0, 13.25, 16.6);
    spr('props/magazine', 0, 12.05, 16.4, 0, { layer: 'decal' });
    stencil(U(12.95), U(17.8), 'WC', 0, 0.22, 'rgba(232,236,244,0.35)');   // (clear of the open door's swing)
    return;
  }
  const w1 = FURNITURE.stallWall, w2 = FURNITURE.stallFront;
  for (const s of [w1, w2]) { ctx.fillStyle = '#8f98a8'; ctx.fillRect(U(s.x), U(s.y), U(s.w), U(s.h)); ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.strokeRect(U(s.x), U(s.y), U(s.w), U(s.h)); }
  ctx.save(); ctx.translate(U(w2.x + w2.w), U(w2.y + w2.h)); ctx.rotate(0.9);              // door, swung open
  ctx.fillStyle = '#a3abb8'; ctx.fillRect(0, -3, U(0.95), 6); ctx.strokeStyle = OUT; ctx.lineWidth = 1.8; ctx.strokeRect(0, -3, U(0.95), 6);
  ctx.fillStyle = '#47e07a'; ctx.fillRect(U(0.7), -2, 6, 4);                              // VACANT
  ctx.restore();
  // the toilet, from above: tank against the wall, lid up (of course), seat and bowl
  const tl = FURNITURE.toilet, x = U(tl.x + tl.w / 2), y0 = U(tl.y);
  shadowEllipse(x + 4, y0 + U(0.6), U(0.4), U(0.48), 0.3);
  rr(x - U(0.36), y0 + 2, U(0.72), U(0.26), 5); ctx.fillStyle = '#e9ecef'; ctx.fill(); stroke(2);                  // tank
  ctx.beginPath(); ctx.arc(x, y0 + U(0.15), 3, 0, TAU); ctx.fillStyle = '#b9bfc9'; ctx.fill();                     // flush button
  rr(x - U(0.27), y0 + U(0.27), U(0.54), U(0.12), 4); ctx.fillStyle = '#f7f8f9'; ctx.fill(); stroke(1.5);         // the raised lid, seen edge-on
  ctx.beginPath(); ctx.ellipse(x, y0 + U(0.66), U(0.27), U(0.33), 0, 0, TAU); ctx.fillStyle = '#f7f8f9'; ctx.fill(); stroke(2.2);   // seat
  ctx.beginPath(); ctx.ellipse(x, y0 + U(0.68), U(0.16), U(0.22), 0, 0, TAU); ctx.fillStyle = '#c9d6df'; ctx.fill(); stroke(1.2);   // bowl
  ctx.beginPath(); ctx.ellipse(x, y0 + U(0.72), U(0.09), U(0.12), 0, 0, TAU); ctx.fillStyle = 'rgba(120,170,200,0.55)'; ctx.fill(); // a little water
  for (let i = 0; i < 4; i++) {                                                           // …and dust drifting into it
    const k = (t * 0.35 + i / 4) % 1, a = i * 1.6 + k * 4, r = U(0.6) * (1 - k);
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * r, y0 + U(0.7) + Math.sin(a) * r * 0.8, 1.4, 0, TAU);
    ctx.fillStyle = `rgba(230,230,220,${0.6 * (1 - k)})`; ctx.fill();
  }
  // toilet paper on the wall, a plunger, a magazine
  ctx.beginPath(); ctx.arc(U(11.6), U(15.85), 6, 0, TAU); ctx.fillStyle = '#f4f5f6'; ctx.fill(); stroke(1.2);
  ctx.beginPath(); ctx.arc(U(11.6), U(15.85), 2.2, 0, TAU); ctx.fillStyle = '#b9a07a'; ctx.fill();
  ctx.beginPath(); ctx.arc(U(13.25), U(16.6), 6, 0, TAU); ctx.fillStyle = '#b8402e'; ctx.fill(); stroke(1.2);
  ctx.fillStyle = '#b8874f'; ctx.fillRect(U(13.25) - 2, U(16.6) - 14, 4, 12);
  ctx.save(); ctx.translate(U(12.05), U(16.4)); ctx.rotate(-0.4);
  ctx.fillStyle = '#e8e4dc'; ctx.fillRect(-10, -7, 20, 14); stroke(1); ctx.fillStyle = '#7b5fd6'; ctx.fillRect(-8, -5, 16, 5);
  ctx.restore();
  stencil(U(12.75), U(17.4), 'WC', 0, 0.22, 'rgba(232,236,244,0.35)');
}
// The sign on the wall above it (drawn with the spine, on the wall itself).
function toiletSign() {
  if (wallSign('props/plaque_toilet', 12.45, SPINE_Y1, 1.35) || GFX.on) return;   // above the toilet's tank (sprite view: nothing until it's loaded;
                                                                                   // the 2D plaque goes on top of everything, crew included)
  plaque(U(12.45), U(14.55), U(2.05), U(0.72),
    [['PLEASE CLOSE THE LID', 0.14], ['OR THE AIR RUNS OUT', 0.12], ['— the management', 0.085, 600]]);
}

// --- bridge couch, treadmill, the incident board ---------------------------
function couch() {
  if (spr('props/couch', 0, ...fc(FURNITURE.couch))) return;
  const c = FURNITURE.couch, x = U(c.x), y = U(c.y), w = U(c.w), h = U(c.h);
  shadowEllipse(x + w / 2 + 4, y + h / 2 + 6, w * 0.6, h * 0.52, 0.35);
  rr(x, y, w, h, 7); ctx.fillStyle = '#6a5a8a'; ctx.fill(); stroke(2.5);
  rr(x + w * 0.55, y + 2, w * 0.45 - 2, h - 4, 6); ctx.fillStyle = '#5a4b78'; ctx.fill(); stroke(1.2);   // backrest against the wall
  for (let i = 0; i < 2; i++) { rr(x + 4, y + 6 + i * (h - 12) / 2, w * 0.52, (h - 12) / 2 - 2, 5); ctx.fillStyle = '#7a6a9a'; ctx.fill(); stroke(1.3); }
  tapeStrip(x + w * 0.3, y + h * 0.65, U(0.4), 0.7, 141);
  ctx.save(); ctx.translate(x + w * 0.3, y + h * 0.25); ctx.rotate(0.3);                  // a blanket thrown over it
  rr(-U(0.35), -U(0.25), U(0.7), U(0.5), 5); ctx.fillStyle = '#d9a54a'; ctx.fill(); stroke(1.3);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1.5; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-U(0.3), i * 7); ctx.lineTo(U(0.3), i * 7 + 3); ctx.stroke(); }
  ctx.restore();
}
function exerciseBike(t) {                             // the treadmill (it works: see TREADMILL in ship.js)
  const P = 0.1875, f = Math.floor((((t * WALK_SPEED * BELT_K) % P) / P) * 6);   // the belt loop (models/systems/props.py)
  if (spr('systems/treadmill', f, 39.8, 21.45)) { stencil(U(40.6), U(22.6), 'JOG FOR BONE DENSITY', 0, 0.17, 'rgba(232,236,244,0.3)'); return; }
  const b = FURNITURE.treadBar, B = TREADMILL, x = U(b.x), y = U(b.y), w = U(b.w), h = U(B.y + B.h - b.y);
  shadowEllipse(x + w / 2 + 4, y + h / 2 + 5, w * 0.6, h * 0.55, 0.3);
  rr(x, y, w, h, 5); ctx.fillStyle = '#3a3f4a'; ctx.fill(); stroke(2);                                   // frame and rails
  rr(U(B.x), U(B.y), U(B.w), U(B.h) + 2, 2); ctx.fillStyle = '#1c2028'; ctx.fill(); stroke(1.2);           // the belt
  ctx.save(); ctx.beginPath(); ctx.rect(U(B.x), U(B.y), U(B.w), U(B.h)); ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 2;
  const gap = 9, off = (t * U(WALK_SPEED * BELT_K)) % gap;                                                     // slats running towards the back
  for (let yy = U(B.y) - gap + off; yy < U(B.y + B.h); yy += gap) { ctx.beginPath(); ctx.moveTo(U(B.x), yy); ctx.lineTo(U(B.x + B.w), yy); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = '#c0392b'; ctx.fillRect(x - 3, y + 1, w + 6, 7); ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.strokeRect(x - 3, y + 1, w + 6, 7);   // handlebar
  ctx.fillStyle = '#47e07a'; ctx.fillRect(x + w / 2 - 6, y + 2, 12, 5);                                // display
  stencil(U(40.6), U(22.6), 'JOG FOR BONE DENSITY', 0, 0.17, 'rgba(232,236,244,0.3)');
}
function incidentBoard() {
  if (wallSign('props/plaque_incident', 16.1, 0.6) || GFX.on) return;
  plaque(U(16.1), U(0.32), U(2.6), U(0.5), [['DAYS SINCE LAST INCIDENT:  0', 0.13]], '#2b303a', '#ffcf6b');
}

// Warm ceiling lights, so the rooms don't look like an operating theatre.
const LIGHTS = [[5.5, 7.0], [10.5, 9.0], [18.5, 4.5], [26.0, 4.5], [22.2, 9.5], [35.5, 6.5], [40.0, 8.5],
                [5.0, 19.0], [10.5, 20.5], [17.0, 18.5], [27.5, 18.5], [35.0, 19.5], [40.5, 18.5]];
function drawLightPools() {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const [lx, ly] of LIGHTS) {
    const x = U(lx), y = U(ly), r = U(4.2);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,196,130,0.13)'); g.addColorStop(0.5, 'rgba(255,170,100,0.05)'); g.addColorStop(1, 'rgba(255,160,90,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
}

// The ceiling lights (LIGHTS) have no visible fixture in the cutaway view (the ceiling is what the camera
// looks through); what you see are bulkhead lamps on the back walls (interior/lamp_wall_*, origin = the
// wall's foot at its front face, lamp 1.15 up), on and off with the zone's power. js/lights.js lights
// both: the ceiling lights from above, a small warm glow at each wall lamp.
const WALL_LAMPS = [[5.6, 3.4], [9.4, 3.4],                    // left cannon (back wall y 3.4)
                    [19.4, -2.4], [27.1, 0.6], [23.8, -2.4],    // bridge (nose, clear of the front ladder, and right back wall)
                    [36.0, 2.6], [42.7, 2.6],                    // right cannon
                    [1.5, SPINE_Y1], [10.9, SPINE_Y1],           // left airlock (the spine is its back wall)
                    [24.9, SPINE_Y1], [29.1, SPINE_Y1],          // reactor
                    [31.6, SPINE_Y1], [42.7, SPINE_Y1]];         // right airlock
const WALL_LAMP_Z = 1.15;
function drawLampSprites() {
  for (const [lx, wy] of WALL_LAMPS) {
    const col = lx < COLS[1].x ? 0 : lx < COLS[2].x ? 1 : 2, on = lightFx.lamp[col] > 0.5;   // (flickers with the light: js/lights.js)
    spr(on ? 'interior/lamp_wall_on' : 'interior/lamp_wall_off', 0, lx, wy, 0, { layer: 'wall', sortY: wy + 0.02, depthBias: 0.05, emissive: on ? 1 : 0.2 });
  }
}
function drawInteriorWalls() { toiletSign(); incidentBoard(); flushLater(); }
function drawInterior(t) {
  kitchen(t); kitchenSteam(t); kitchenMug(t); bunkRoom(t); toiletStall(t); couch(); exerciseBike(t);
  if (GFX.on) drawLampSprites();
}
// The coffee mug on the counter (js/hazards.js COFFEE_MUG), drawn flat when its sprite isn't there:
// after the counter, so it sits on top (the sprite version: js/decor.js drawPropDecor).
function kitchenMug(t) {
  if (typeof COFFEE_MUG === 'undefined' || (GFX.on && GFX.ready('systems/mug_full'))) return;
  if (typeof hz === 'undefined' || hz.coffee >= 1) coffee(U(COFFEE_MUG.x), U(COFFEE_MUG.y), t);
  else { ctx.beginPath(); ctx.arc(U(COFFEE_MUG.x), U(COFFEE_MUG.y), 8, 0, TAU); ctx.fillStyle = '#e8e4dc'; ctx.fill(); stroke(2);
         ctx.beginPath(); ctx.arc(U(COFFEE_MUG.x), U(COFFEE_MUG.y), 5.5, 0, TAU); ctx.fillStyle = '#3a2a1a'; ctx.fill(); }   // empty: just dregs
}
// Steam from the pot on the kitchen stove (its sprite: props/kitchen_counter; the classic drawing has its own).
function kitchenSteam(t) { if (GFX.on && GFX.ready('props/kitchen_counter')) steamWisps('pot', 8.05, 11.0, 1.05, t, 1, 11.2); }

// ---------------------------------------------------------------------------
// Everything clickable (drawn by drawUseMarks, js/systems.js: a thin dashed white ring, faint in your room,
// brighter in reach; what a click / E would do a thick solid one). Decoration never gets one.
// ---------------------------------------------------------------------------
function interactSpots() {
  const out = [
    ...stationSpots().map(s => ({ x: s.x, y: s.y, r: s.r })),
    { x: LEVER.x, y: LEVER.y, r: 0.6 },
    { x: REACTOR.x, y: REACTOR.y, w: REACTOR.w, h: REACTOR.h },
    ...SHIELD_BUTTONS.map(b => ({ x: b.x, y: b.y, r: 0.55 })),
    ...GUNS.map(g => ({ x: g.hatch[0], y: g.hatch[1], r: 0.55 })),
    ...HATCHES.map(h => ({ x: h.x - h.dir * 0.45, y: h.y, r: 0.7, probe: h.inside })),
    ...DECK_LOCKS.map(L => ({ x: L.x + L.w / 2, y: (SPINE_Y0 + SPINE_Y1) / 2, w: L.w + 0.2, h: SPINE - 0.2, both: true })),
    ...hazardSpots(), ...minigameSpots(), ...dockSpots(),
    ...DOORWAYS.filter(d => d.locked || d.blast).map(d => ({ x: d.x + d.w / 2, y: d.y + d.h / 2, w: d.w + 0.3, h: d.h, both: true })),
  ];
  return out;
}
