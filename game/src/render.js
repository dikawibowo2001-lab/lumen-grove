// Everything the eye sees: the grove, the warden, the gloom, the HUD and the
// screens, all drawn on one canvas. Sprites are pre-rendered once (glow discs,
// soft blobs) and stamped with drawImage, so a crowded fight stays fast; the
// only per-frame gradients are the sky and the vignette. Buttons drawn here
// are recorded in `renderer.buttons` for the loop to hit-test clicks against.
// Shake offsets come from the time, never from Math.random, so a staged
// screenshot scene always paints the same frame.

import { ARENA, FINAL_WAVE, PALETTE, STAR_TIMES } from './config.js';
import { ENEMY_KINDS } from './entities.js';

/** The screens the loop moves between. */
export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_LEVELUP = 'levelup';
export const SCREEN_OVER = 'over';
export const SCREEN_VICTORY = 'victory';

const FONT = "system-ui, 'Segoe UI', sans-serif";

/** Make a soft radial glow disc of one colour, as an offscreen sprite. */
function makeGlowSprite(color, size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.35, color);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

/** A rounded rectangle path, for panels and buttons. */
function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Seconds as m:ss. */
export function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Stars for a victory, by run time. */
export function starsForTime(seconds) {
  if (seconds <= STAR_TIMES[0]) return 3;
  if (seconds <= STAR_TIMES[1]) return 2;
  return 1;
}

/** Make the renderer for a canvas; it sizes itself to the window. */
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const glowCache = new Map();
  let view = { width: 1280, height: 720, dpr: 1 };
  let skyGradient = null;

  function glow(color) {
    let sprite = glowCache.get(color);
    if (!sprite) {
      sprite = makeGlowSprite(color);
      glowCache.set(color, sprite);
    }
    return sprite;
  }

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    view = { width, height, dpr };
    skyGradient = null;
  }

  resize();
  window.addEventListener('resize', resize);

  const renderer = {
    buttons: [],
    camera: { x: 0, y: 0 },
    getView() {
      return view;
    },
    /** The camera's top-left in world units, from the last frame drawn. */
    getCamera() {
      return renderer.camera;
    },

    /** Draw one frame: the world, the HUD, and the screen over it. */
    draw(world, screen, best, time, mouse) {
      const { width, height, dpr } = view;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!skyGradient) {
        skyGradient = ctx.createLinearGradient(0, 0, 0, height);
        skyGradient.addColorStop(0, PALETTE.skyTop);
        skyGradient.addColorStop(1, PALETTE.skyBottom);
      }
      ctx.fillStyle = skyGradient;
      ctx.fillRect(0, 0, width, height);
      renderer.buttons = [];

      const player = world.player;
      const shakeX = world.shake > 0 ? Math.sin(time * 91) * world.shake * 0.6 : 0;
      const shakeY = world.shake > 0 ? Math.cos(time * 113) * world.shake * 0.6 : 0;
      const camX = clampCamera(player.x - width / 2, width, ARENA.width) + shakeX;
      const camY = clampCamera(player.y - height / 2, height, ARENA.height) + shakeY;
      renderer.camera = { x: camX, y: camY };

      ctx.save();
      ctx.translate(-camX, -camY);
      drawArena(world, time);
      drawFireflies(world, time);
      drawGems(world, time);
      drawOrbs(world, time);
      drawEnemies(world, time);
      drawPlayer(world, time);
      drawBolts(world);
      drawGloobs(world, time);
      drawParticles(world);
      drawTexts(world);
      ctx.restore();

      drawHud(world, screen, best, width, height, time);
      if (screen === SCREEN_TITLE) drawTitle(world, best, width, height, time, mouse);
      else if (screen === SCREEN_PAUSED) drawPaused(width, height, mouse);
      else if (screen === SCREEN_LEVELUP) drawLevelUp(world, width, height, mouse);
      else if (screen === SCREEN_OVER) drawOver(world, best, width, height, mouse);
      else if (screen === SCREEN_VICTORY) drawVictory(world, best, width, height, mouse);

      // The hurt flash and the low-health heartbeat.
      if (world.flashRed > 0) {
        ctx.fillStyle = `rgba(255, 40, 70, ${(world.flashRed * 0.28).toFixed(3)})`;
        ctx.fillRect(0, 0, width, height);
      }
      if (screen === SCREEN_PLAY && player.hp > 0 && player.hp < player.maxHp * 0.3) {
        const pulse = 0.10 + 0.06 * Math.sin(time * 5);
        ctx.fillStyle = `rgba(255, 40, 70, ${pulse.toFixed(3)})`;
        ctx.fillRect(0, 0, width, height);
      }
      drawVignette(width, height);
      drawMuteButton(world, width, mouse);
    },
  };

  function clampCamera(value, viewSize, arenaSize) {
    if (viewSize >= arenaSize) return (arenaSize - viewSize) / 2;
    return Math.max(0, Math.min(arenaSize - viewSize, value));
  }

  function drawArena(world, time) {
    const { width, height } = view;
    const camX = clampCamera(world.player.x - width / 2, width, ARENA.width);
    const camY = clampCamera(world.player.y - height / 2, height, ARENA.height);
    ctx.fillStyle = PALETTE.ground;
    ctx.fillRect(camX - 40, camY - 40, width + 80, height + 80);
    // A faint dot grid, so motion reads.
    ctx.fillStyle = 'rgba(140, 200, 230, 0.07)';
    const step = 130;
    const startX = Math.floor((camX - 40) / step) * step;
    const startY = Math.floor((camY - 40) / step) * step;
    for (let x = startX; x < camX + width + 40; x += step) {
      for (let y = startY; y < camY + height + 40; y += step) {
        ctx.fillRect(x, y, 3, 3);
      }
    }
    // The grove's edge: a glowing ring the gloom presses against.
    ctx.strokeStyle = PALETTE.groveRing;
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, ARENA.width - 16, ARENA.height - 16);
    ctx.strokeStyle = 'rgba(126, 240, 193, 0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 16, ARENA.width - 32, ARENA.height - 32);
    // Decor, only where the camera looks.
    for (const item of world.decor) {
      if (item.x < camX - 60 || item.x > camX + width + 60 || item.y < camY - 60 || item.y > camY + height + 60) continue;
      drawDecor(item, time);
    }
  }

  function drawDecor(item, time) {
    const sway = Math.sin(time * 0.8 + item.phase) * 2;
    const s = item.size;
    if (item.kind === 'shroom') {
      ctx.fillStyle = '#274b5e';
      ctx.fillRect(item.x - 3 * s, item.y - 4 * s, 6 * s, 12 * s);
      ctx.fillStyle = '#3fa7a0';
      ctx.beginPath();
      ctx.arc(item.x, item.y - 6 * s, 11 * s, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.beginPath();
      ctx.arc(item.x - 4 * s, item.y - 9 * s, 2 * s, 0, Math.PI * 2);
      ctx.arc(item.x + 4 * s, item.y - 7 * s, 1.6 * s, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.kind === 'tree') {
      ctx.fillStyle = '#1d3a4d';
      ctx.fillRect(item.x - 4 * s, item.y - 10 * s, 8 * s, 26 * s);
      ctx.fillStyle = '#14532d';
      ctx.beginPath();
      ctx.arc(item.x + sway, item.y - 22 * s, 18 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1e6b3a';
      ctx.beginPath();
      ctx.arc(item.x + sway - 6 * s, item.y - 28 * s, 11 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.8;
      ctx.drawImage(glow('#7ef0c1'), item.x - 14 * s, item.y - 36 * s, 28 * s, 28 * s);
      ctx.globalAlpha = 1;
    } else if (item.kind === 'stone') {
      ctx.fillStyle = '#22394d';
      ctx.beginPath();
      ctx.ellipse(item.x, item.y, 13 * s, 9 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2d4a61';
      ctx.beginPath();
      ctx.ellipse(item.x - 3 * s, item.y - 3 * s, 7 * s, 4 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = '#2f6b4f';
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.moveTo(item.x, item.y + 8 * s);
      ctx.lineTo(item.x + sway, item.y - 4 * s);
      ctx.stroke();
      ctx.fillStyle = '#ffd166';
      for (let i = 0; i < 5; i += 1) {
        const angle = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(item.x + sway + Math.cos(angle) * 5 * s, item.y - 4 * s + Math.sin(angle) * 5 * s, 3 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawFireflies(world, time) {
    for (const fly of world.fireflies) {
      const x = fly.x + Math.sin(time * fly.speed + fly.phase) * 14;
      const y = fly.y + Math.cos(time * fly.speed * 0.8 + fly.phase) * 10;
      const twinkle = 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(time * 2 + fly.phase * 3));
      ctx.globalAlpha = twinkle;
      const size = fly.size * 8;
      ctx.drawImage(glow('#ffe66d'), x - size / 2, y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }

  function drawGems(world, time) {
    for (const gem of world.gems) {
      const bob = Math.sin(time * 3 + gem.bob) * 3;
      const size = gem.value >= 20 ? 10 : gem.value >= 5 ? 8 : 6;
      ctx.save();
      ctx.translate(gem.x, gem.y + bob);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#7ef0c1';
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.fillStyle = '#d8fff0';
      ctx.fillRect(-size / 4, -size / 4, size / 2, size / 2);
      ctx.restore();
      ctx.globalAlpha = 0.5;
      ctx.drawImage(glow('#7ef0c1'), gem.x - 16, gem.y - 16 + bob, 32, 32);
      ctx.globalAlpha = 1;
    }
  }

  function drawOrbs(world, time) {
    for (const orb of world.orbs) {
      const bob = Math.sin(time * 3 + orb.bob) * 3;
      ctx.globalAlpha = 0.7;
      ctx.drawImage(glow('#ff8fa3'), orb.x - 22, orb.y - 22 + bob, 44, 44);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ff8fa3';
      ctx.beginPath();
      ctx.arc(orb.x - 4, orb.y - 2 + bob, 6, 0, Math.PI * 2);
      ctx.arc(orb.x + 4, orb.y - 2 + bob, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(orb.x - 9, orb.y + bob);
      ctx.lineTo(orb.x, orb.y + 10 + bob);
      ctx.lineTo(orb.x + 9, orb.y + bob);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawEnemies(world, time) {
    for (const enemy of world.enemies) {
      const kind = enemy.kind === 'boss' ? null : ENEMY_KINDS[enemy.kind];
      const color = enemy.kind === 'boss' ? '#b5179e' : kind.color;
      const core = enemy.kind === 'boss' ? '#f8b4e8' : kind.core;
      const wobble = 1 + 0.06 * Math.sin(time * 4 + enemy.wobble);
      const r = enemy.radius * wobble;
      ctx.globalAlpha = 0.55;
      ctx.drawImage(glow(color), enemy.x - r * 2.2, enemy.y - r * 2.2, r * 4.4, r * 4.4);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#14102a';
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      ctx.stroke();
      // The eyes look at the warden.
      const angle = Math.atan2(world.player.y - enemy.y, world.player.x - enemy.x);
      const ex = Math.cos(angle) * r * 0.3;
      const ey = Math.sin(angle) * r * 0.3;
      const eyeGap = r * 0.42;
      const px = -Math.sin(angle) * eyeGap;
      const py = Math.cos(angle) * eyeGap;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(enemy.x + ex + px, enemy.y + ey + py, r * 0.22, 0, Math.PI * 2);
      ctx.arc(enemy.x + ex - px, enemy.y + ey - py, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#14102a';
      ctx.beginPath();
      ctx.arc(enemy.x + ex + px + Math.cos(angle) * r * 0.08, enemy.y + ey + py + Math.sin(angle) * r * 0.08, r * 0.11, 0, Math.PI * 2);
      ctx.arc(enemy.x + ex - px + Math.cos(angle) * r * 0.08, enemy.y + ey - py + Math.sin(angle) * r * 0.08, r * 0.11, 0, Math.PI * 2);
      ctx.fill();
      // Elites wear a gold ring; the Herald wears a crown of spikes.
      if (enemy.elite) {
        ctx.strokeStyle = PALETTE.gold;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, r + 6, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (enemy.kind === 'boss') {
        ctx.fillStyle = core;
        for (let i = 0; i < 8; i += 1) {
          const a = (i / 8) * Math.PI * 2 + time * 0.5;
          ctx.beginPath();
          ctx.arc(enemy.x + Math.cos(a) * (r + 8), enemy.y + Math.sin(a) * (r + 8), 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (enemy.flash > 0) {
        ctx.globalAlpha = enemy.flash * 0.7;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      // A thin health bar over anything hurt.
      if (enemy.hp < enemy.maxHp && enemy.kind !== 'boss') {
        const w = enemy.radius * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(enemy.x - w / 2, enemy.y - enemy.radius - 12, w, 5);
        ctx.fillStyle = enemy.elite ? PALETTE.gold : '#ff5d73';
        ctx.fillRect(enemy.x - w / 2, enemy.y - enemy.radius - 12, (w * enemy.hp) / enemy.maxHp, 5);
      }
    }
  }

  function drawPlayer(world, time) {
    const player = world.player;
    const blink = player.invuln > 0 && player.dashTime <= 0 && Math.floor(time * 14) % 2 === 0;
    const breathe = 1 + 0.05 * Math.sin(time * 3);
    const r = player.radius * breathe;
    ctx.globalAlpha = blink ? 0.45 : 0.85;
    ctx.drawImage(glow('#ffd166'), player.x - r * 3, player.y - r * 3, r * 6, r * 6);
    ctx.globalAlpha = blink ? 0.5 : 1;
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(player.x, player.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.playerCore;
    ctx.beginPath();
    ctx.arc(player.x, player.y, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    // Wings: two pale arcs that beat with the time.
    const beat = Math.sin(time * 10) * 0.35;
    ctx.fillStyle = 'rgba(234, 246, 255, 0.85)';
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(player.facing + side * (1.9 + beat));
      ctx.beginPath();
      ctx.ellipse(r * 0.9, 0, r * 0.85, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawBolts(world) {
    for (const bolt of world.bolts) {
      ctx.save();
      ctx.translate(bolt.x, bolt.y);
      ctx.rotate(bolt.angle);
      ctx.fillStyle = bolt.crit ? '#ffe66d' : PALETTE.bolt;
      roundRect(ctx, -9, -3.5, 18, 7, 3.5);
      ctx.fill();
      ctx.fillStyle = '#fffbe8';
      roundRect(ctx, -4, -1.5, 9, 3, 1.5);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawGloobs(world, time) {
    for (const gloob of world.gloobs) {
      const wobble = 1 + 0.12 * Math.sin(time * 9 + gloob.x);
      ctx.globalAlpha = 0.6;
      ctx.drawImage(glow('#80ed99'), gloob.x - 18, gloob.y - 18, 36, 36);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#2d6a4f';
      ctx.beginPath();
      ctx.arc(gloob.x, gloob.y, gloob.radius * wobble, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#b7f0ad';
      ctx.beginPath();
      ctx.arc(gloob.x - 2, gloob.y - 2, gloob.radius * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawParticles(world) {
    ctx.globalCompositeOperation = 'lighter';
    for (const particle of world.particles) {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * (0.5 + alpha * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawTexts(world) {
    ctx.textAlign = 'center';
    for (const text of world.texts) {
      const alpha = Math.max(0, text.life / text.maxLife);
      ctx.globalAlpha = alpha;
      ctx.font = `${text.big ? 700 : 600} ${text.big ? 22 : 15}px ${FONT}`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(text.content, text.x, text.y);
      ctx.fillStyle = text.color;
      ctx.fillText(text.content, text.x, text.y);
    }
    ctx.globalAlpha = 1;
  }

  /** A button: drawn, hover-aware, and recorded for click hit-testing. */
  function drawButton(id, x, y, w, h, label, mouse, options = {}) {
    const hovered = mouse.inside && mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
    const fill = options.fill || '#ffd166';
    ctx.fillStyle = hovered ? options.hoverFill || '#ffe29a' : fill;
    roundRect(ctx, x, y, w, h, options.radius ?? 12);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = options.stroke || 'rgba(0,0,0,0.35)';
    ctx.stroke();
    ctx.fillStyle = options.text || '#231a04';
    ctx.font = `800 ${options.font ?? 20}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
    renderer.buttons.push({ id, x, y, w, h });
    return hovered;
  }

  function panel(x, y, w, h, alpha = 0.72) {
    ctx.fillStyle = `rgba(6, 14, 28, ${alpha})`;
    roundRect(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(126, 240, 193, 0.25)';
    ctx.stroke();
  }

  function drawHud(world, screen, best, width, height, time) {
    if (screen === SCREEN_TITLE) return;
    const player = world.player;
    const pad = 16;

    // Left: health and experience.
    panel(pad, pad, 252, 78);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 15px ${FONT}`;
    ctx.fillText(`HP  ${Math.ceil(player.hp)} / ${player.maxHp}`, pad + 14, pad + 22);
    bar(pad + 14, pad + 30, 224, 12, player.hp / player.maxHp, '#ff5d73', 'rgba(255,255,255,0.12)');
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 15px ${FONT}`;
    ctx.fillText(`LEVEL ${player.level}`, pad + 14, pad + 66);
    bar(pad + 84, pad + 56, 154, 10, player.xp / player.xpNeed, '#7ef0c1', 'rgba(255,255,255,0.12)');

    // Centre: the wave, the clock, and what is left of the gloom.
    const left = world.enemies.length + world.director.queue.length;
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 22px ${FONT}`;
    ctx.fillText(world.wave === FINAL_WAVE ? 'THE HERALD' : `WAVE ${world.wave} / ${FINAL_WAVE}`, width / 2, pad + 26);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = `600 15px ${FONT}`;
    ctx.fillText(`${formatTime(world.time)}   •   ${left} gloom left`, width / 2, pad + 48);
    if (world.boss) {
      const bw = Math.min(420, width * 0.4);
      bar(width / 2 - bw / 2, pad + 58, bw, 12, world.boss.hp / world.boss.maxHp, '#f72585', 'rgba(255,255,255,0.12)');
      ctx.fillStyle = '#f8b4e8';
      ctx.font = `800 13px ${FONT}`;
      ctx.fillText('GLOOM HERALD', width / 2, pad + 86);
    }

    // Right: score, kills, best.
    ctx.textAlign = 'right';
    panel(width - 268, pad, 204, 78);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `800 24px ${FONT}`;
    ctx.fillText(world.score.toLocaleString('en-US'), width - 84, pad + 32);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = `600 14px ${FONT}`;
    ctx.fillText(`KILLS ${world.kills}   •   BEST ${Math.max(best.score, world.score).toLocaleString('en-US')}`, width - 84, pad + 58);

    // Bottom right: the dash, with its cooldown sweep.
    const dashReady = player.dashCd <= 0;
    const cx = width - 56;
    const cy = height - 56;
    ctx.fillStyle = 'rgba(6, 14, 28, 0.72)';
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(126, 240, 193, 0.35)';
    ctx.stroke();
    if (dashReady) {
      ctx.fillStyle = '#90e0ef';
      ctx.beginPath();
      ctx.moveTo(cx - 10, cy - 8);
      ctx.lineTo(cx + 12, cy);
      ctx.lineTo(cx - 10, cy + 8);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(144, 224, 239, 0.35)';
      ctx.beginPath();
      ctx.moveTo(cx - 10, cy - 8);
      ctx.lineTo(cx + 12, cy);
      ctx.lineTo(cx - 10, cy + 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = PALETTE.text;
      ctx.font = `800 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(player.dashCd.toFixed(1), cx, cy + 5);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.dim;
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText('SPACE / CLICK — DASH', width - 100, height - 50);

    // Bottom left: the quiet controls line.
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(157, 184, 204, 0.85)';
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText('WASD / ARROWS move   •   P pause   •   M mute   •   R restart', pad, height - 18);

    // The wave banner, while it shows.
    if (world.waveState === 'banner') {
      const alpha = Math.min(1, world.bannerTimer > 1.2 ? (1.8 - world.bannerTimer) / 0.6 : world.bannerTimer / 0.4);
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.textAlign = 'center';
      ctx.fillStyle = world.wave === FINAL_WAVE ? '#f8b4e8' : PALETTE.gold;
      ctx.font = `800 54px ${FONT}`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      const title = world.wave === FINAL_WAVE ? 'THE GLOOM HERALD' : `WAVE ${world.wave}`;
      ctx.strokeText(title, width / 2, height * 0.3);
      ctx.fillText(title, width / 2, height * 0.3);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `600 20px ${FONT}`;
      ctx.fillText(world.wave === FINAL_WAVE ? 'Defeat it, and the grove endures' : 'The gloom stirs…', width / 2, height * 0.3 + 36);
      ctx.globalAlpha = 1;
    } else if (world.waveState === 'rest') {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#7ef0c1';
      ctx.font = `800 30px ${FONT}`;
      ctx.fillText('Wave cleared!', width / 2, height * 0.3);
      ctx.fillStyle = PALETTE.dim;
      ctx.font = `600 18px ${FONT}`;
      ctx.fillText(`Next wave in ${Math.ceil(world.waveTimer)}…`, width / 2, height * 0.3 + 32);
    }
  }

  function bar(x, y, w, h, fraction, color, back) {
    ctx.fillStyle = back;
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    if (fraction > 0) {
      ctx.fillStyle = color;
      roundRect(ctx, x, y, Math.max(h, w * Math.min(1, fraction)), h, h / 2);
      ctx.fill();
    }
  }

  function dim(width, height, alpha = 0.62) {
    ctx.fillStyle = `rgba(4, 8, 18, ${alpha})`;
    ctx.fillRect(0, 0, width, height);
  }

  function drawTitle(world, best, width, height, time, mouse) {
    dim(width, height, 0.45);
    const cx = width / 2;
    const pulse = 0.75 + 0.25 * Math.sin(time * 1.6);
    ctx.globalAlpha = pulse * 0.5;
    ctx.drawImage(glow('#ffd166'), cx - 190, height * 0.16 - 90, 380, 180);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `800 74px ${FONT}`;
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.strokeText('LUMEN GROVE', cx, height * 0.24);
    ctx.fillText('LUMEN GROVE', cx, height * 0.24);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 26px ${FONT}`;
    ctx.fillText('Warden of the Emberwild', cx, height * 0.24 + 40);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = `600 18px ${FONT}`;
    ctx.fillText('The Gloom is coming. Hold the grove for 10 waves — then face the Herald.', cx, height * 0.24 + 72);

    if (best.score > 0) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `800 18px ${FONT}`;
      ctx.fillText(`BEST  ${best.score.toLocaleString('en-US')}  •  WAVE ${best.wave}`, cx, height * 0.24 + 104);
    }

    panel(cx - 240, height * 0.46, 480, 132, 0.66);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 17px ${FONT}`;
    const rows = [
      ['WASD  /  ARROWS', 'Move the Warden'],
      ['SPACE  /  CLICK', 'Dash (briefly untouchable)'],
      ['1  2  3  /  CLICK', 'Choose a blessing on level-up'],
      ['P  pause     M  mute     R  restart', ''],
    ];
    rows.forEach((row, i) => {
      const y = height * 0.46 + 32 + i * 28;
      ctx.fillStyle = PALETTE.gold;
      ctx.fillText(row[0], cx - 216, y);
      ctx.fillStyle = PALETTE.text;
      ctx.fillText(row[1], cx + 8, y);
    });

    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.dim;
    ctx.font = `600 15px ${FONT}`;
    ctx.fillText('Ember bolts fire on their own — you fly, dodge, gather shards and choose.', cx, height * 0.46 + 162);

    drawButton('start', cx - 130, height * 0.72, 260, 58, 'START THE GROVE', mouse, { font: 22 });
    ctx.fillStyle = PALETTE.dim;
    ctx.font = `600 14px ${FONT}`;
    ctx.fillText('or press Enter', cx, height * 0.72 + 82);
  }

  function drawPaused(width, height, mouse) {
    dim(width, height, 0.6);
    const cx = width / 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 52px ${FONT}`;
    ctx.fillText('PAUSED', cx, height * 0.32);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = `600 18px ${FONT}`;
    ctx.fillText('The grove waits for its Warden.', cx, height * 0.32 + 34);
    drawButton('resume', cx - 110, height * 0.46, 220, 52, 'RESUME', mouse);
    drawButton('restart', cx - 110, height * 0.46 + 66, 220, 52, 'RESTART RUN', mouse, { fill: '#22394d', text: '#eaf6ff', hoverFill: '#2d4a61' });
  }

  function drawLevelUp(world, width, height, mouse) {
    dim(width, height, 0.6);
    const cx = width / 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `800 40px ${FONT}`;
    ctx.fillText(`LEVEL ${world.player.level}`, cx, height * 0.2);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 22px ${FONT}`;
    ctx.fillText('The grove offers a blessing — choose one', cx, height * 0.2 + 34);
    const cardW = 210;
    const cardH = 250;
    const gap = 24;
    const total = cardW * 3 + gap * 2;
    let x = cx - total / 2;
    const y = height * 0.32;
    world.choices.forEach((blessing, i) => {
      const owned = world.player.owned[blessing.id] || 0;
      const hovered = mouse.inside && mouse.x >= x && mouse.x <= x + cardW && mouse.y >= y && mouse.y <= y + cardH;
      ctx.fillStyle = hovered ? 'rgba(30, 58, 80, 0.96)' : 'rgba(10, 22, 38, 0.94)';
      roundRect(ctx, x, y, cardW, cardH, 16);
      ctx.fill();
      ctx.lineWidth = hovered ? 3 : 2;
      ctx.strokeStyle = blessing.color;
      ctx.stroke();
      // Glyph in a ring.
      ctx.fillStyle = blessing.color;
      ctx.beginPath();
      ctx.arc(x + cardW / 2, y + 58, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#101828';
      ctx.font = `800 34px ${FONT}`;
      ctx.fillText(blessing.glyph, x + cardW / 2, y + 70);
      // Name, rank pips, summary.
      ctx.fillStyle = PALETTE.text;
      ctx.font = `800 20px ${FONT}`;
      ctx.fillText(blessing.name, x + cardW / 2, y + 122);
      ctx.fillStyle = blessing.color;
      ctx.font = `700 16px ${FONT}`;
      const pips = '●'.repeat(owned + 1) + '○'.repeat(Math.max(0, blessing.maxRank - owned - 1));
      if (blessing.maxRank < 99) ctx.fillText(pips, x + cardW / 2, y + 148);
      ctx.fillStyle = PALETTE.dim;
      ctx.font = `600 15px ${FONT}`;
      wrapText(blessing.summary, x + 16, y + 178, cardW - 32, 20);
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `800 15px ${FONT}`;
      ctx.fillText(`[ ${i + 1} ]`, x + cardW / 2, y + cardH - 18);
      renderer.buttons.push({ id: `choice-${i}`, x, y, w: cardW, h: cardH });
      x += cardW + gap;
    });
    ctx.fillStyle = PALETTE.dim;
    ctx.font = `600 15px ${FONT}`;
    ctx.fillText('Click a card, or press 1, 2 or 3', cx, y + cardH + 36);
  }

  function wrapText(text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let lineY = y;
    ctx.textAlign = 'center';
    const cx = x + maxWidth / 2;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, cx, lineY);
        line = word;
        lineY += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, cx, lineY);
  }

  function drawStats(world, best, cx, y, width) {
    const stats = [
      ['SCORE', world.score.toLocaleString('en-US')],
      ['BEST', Math.max(best.score, world.score).toLocaleString('en-US')],
      ['WAVE', `${Math.min(world.wave, FINAL_WAVE)} / ${FINAL_WAVE}`],
      ['KILLS', String(world.kills)],
      ['TIME', formatTime(world.time)],
      ['LEVEL', String(world.player.level)],
    ];
    const cellW = 150;
    const cellH = 62;
    const gap = 14;
    const total = cellW * 3 + gap * 2;
    let sx = cx - total / 2;
    let sy = y;
    stats.forEach((row, i) => {
      if (i > 0 && i % 3 === 0) {
        sx = cx - total / 2;
        sy += cellH + gap;
      }
      panel(sx, sy, cellW, cellH, 0.66);
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.dim;
      ctx.font = `700 13px ${FONT}`;
      ctx.fillText(row[0], sx + cellW / 2, sy + 22);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `800 22px ${FONT}`;
      ctx.fillText(row[1], sx + cellW / 2, sy + 48);
      sx += cellW + gap;
    });
    return sy + cellH;
  }

  function drawOver(world, best, width, height, mouse) {
    dim(width, height, 0.66);
    const cx = width / 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5d73';
    ctx.font = `800 52px ${FONT}`;
    ctx.fillText('THE GROVE FALLS', cx, height * 0.22);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = `600 19px ${FONT}`;
    ctx.fillText(`The Gloom took the Warden on wave ${Math.min(world.wave, FINAL_WAVE)}. The ember remains.`, cx, height * 0.22 + 34);
    const bottom = drawStats(world, best, cx, height * 0.34, width);
    if (world.score > best.score && world.score > 0) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `800 18px ${FONT}`;
      ctx.fillText('★  NEW BEST SCORE  ★', cx, bottom + 32);
    }
    drawButton('restart', cx - 120, height * 0.74, 240, 54, 'TRY AGAIN', mouse, { font: 21 });
    ctx.fillStyle = PALETTE.dim;
    ctx.font = `600 14px ${FONT}`;
    ctx.fillText('or press R', cx, height * 0.74 + 78);
  }

  function drawVictory(world, best, width, height, mouse) {
    dim(width, height, 0.6);
    const cx = width / 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `800 52px ${FONT}`;
    ctx.fillText('THE GROVE ENDURES!', cx, height * 0.2);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 19px ${FONT}`;
    ctx.fillText('The Gloom Herald is unmade. Dawn returns to the Emberwild.', cx, height * 0.2 + 34);
    const stars = starsForTime(world.time);
    ctx.font = '44px ' + FONT;
    for (let i = 0; i < 3; i += 1) {
      ctx.fillStyle = i < stars ? PALETTE.gold : 'rgba(255,255,255,0.22)';
      ctx.fillText('★', cx - 56 + i * 56, height * 0.2 + 84);
    }
    const bottom = drawStats(world, best, cx, height * 0.38, width);
    if (world.score > best.score && world.score > 0) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `800 18px ${FONT}`;
      ctx.fillText('★  NEW BEST SCORE  ★', cx, bottom + 32);
    }
    drawButton('again', cx - 120, height * 0.76, 240, 54, 'PLAY AGAIN', mouse, { font: 21 });
    ctx.fillStyle = PALETTE.dim;
    ctx.font = `600 14px ${FONT}`;
    ctx.fillText('or press R', cx, height * 0.76 + 78);
  }

  function drawVignette(width, height) {
    const gradient = ctx.createRadialGradient(
      width / 2, height / 2, Math.min(width, height) * 0.42,
      width / 2, height / 2, Math.max(width, height) * 0.75,
    );
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(2, 5, 12, 0.5)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  function drawMuteButton(world, width, mouse) {
    const x = width - 52;
    const y = 108;
    const hovered = mouse.inside && mouse.x >= x && mouse.x <= x + 36 && mouse.y >= y && mouse.y <= y + 36;
    ctx.fillStyle = hovered ? 'rgba(30, 58, 80, 0.95)' : 'rgba(6, 14, 28, 0.72)';
    roundRect(ctx, x, y, 36, 36, 10);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(126, 240, 193, 0.35)';
    ctx.stroke();
    ctx.fillStyle = PALETTE.text;
    ctx.font = '18px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(world.muted ? '✕' : '♪', x + 18, y + 19);
    ctx.textBaseline = 'alphabetic';
    renderer.buttons.push({ id: 'mute', x, y, w: 36, h: 36 });
  }

  return renderer;
}
