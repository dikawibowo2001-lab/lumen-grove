// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between six screens: title,
// play, paused, level-up, game over and victory.
//
// ?seed=N fixes the run's random pattern. ?shot=title|play|levelup|victory
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.

import { BEST_KEY, BEST_WAVE_KEY, MAX_FRAME, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import {
  ACTION_CHOICE_1, ACTION_CHOICE_2, ACTION_CHOICE_3, ACTION_CONFIRM,
  ACTION_DASH, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput,
} from './input.js';
import {
  EVENT_BOSS, EVENT_DASH, EVENT_HEAL, EVENT_HIT, EVENT_KILL, EVENT_LEVELUP,
  EVENT_NOVA, EVENT_OVER, EVENT_PICKUP, EVENT_SHOOT, EVENT_VICTORY,
  EVENT_WAVE_CLEAR, applyChoice, createWorld, resetWorld, stepAttract, stepWorld,
} from './world.js';
import {
  SCREEN_LEVELUP, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE,
  SCREEN_VICTORY, createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return {
      score: Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0,
      wave: Number.parseInt(window.localStorage.getItem(BEST_WAVE_KEY) ?? '0', 10) || 0,
    };
  } catch {
    return { score: 0, wave: 0 };
  }
}

function saveBest(best) {
  try {
    window.localStorage.setItem(BEST_KEY, String(best.score));
    window.localStorage.setItem(BEST_WAVE_KEY, String(best.wave));
  } catch {
    // Storage can be off (private windows): the best then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, scene.best, scene.time, { x: 0, y: 0, inside: false });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const audio = createAudio();
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let renderTime = 0;
  let pendingDash = false;
  let pendingDashDir = null;

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    audio.startMusic();
    resetWorld(world);
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Survive 10 waves and defeat the Gloom Herald.');
  }

  function finishRun(victory) {
    screen = victory ? SCREEN_VICTORY : SCREEN_OVER;
    audio.stopMusic();
    if (victory) audio.victory();
    else audio.defeat();
    if (world.score > best.score) {
      best = { score: world.score, wave: Math.max(best.wave, world.wave) };
      saveBest(best);
    } else if (world.wave > best.wave) {
      best = { ...best, wave: world.wave };
      saveBest(best);
    }
    announce(victory
      ? `Victory! Score ${world.score}. Press R or Play Again to run it back.`
      : `Game over on wave ${world.wave}. Score ${world.score}. Press R to try again.`);
  }

  function toggleMute() {
    audio.setMuted(!audio.isMuted());
    announce(audio.isMuted() ? 'Muted.' : 'Sound on.');
  }

  function soundFor(events) {
    if (events & EVENT_SHOOT) audio.shoot();
    if (events & EVENT_KILL) audio.kill();
    else if (events & EVENT_HIT) audio.hurt();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_HEAL) audio.heal();
    if (events & EVENT_DASH) audio.dash();
    if (events & EVENT_NOVA) audio.nova();
    if (events & EVENT_LEVELUP) audio.levelup();
    if (events & EVENT_WAVE_CLEAR) audio.waveClear();
    if (events & EVENT_BOSS) audio.boss();
  }

  /** The button under a click, if any (last drawn wins). */
  function buttonAt(point) {
    const buttons = renderer.buttons;
    for (let i = buttons.length - 1; i >= 0; i -= 1) {
      const button = buttons[i];
      if (point.x >= button.x && point.x <= button.x + button.w && point.y >= button.y && point.y <= button.y + button.h) {
        return button.id;
      }
    }
    return null;
  }

  function chooseBlessing(index) {
    if (screen !== SCREEN_LEVELUP || !world.choicePending) return;
    const blessing = world.choices[index];
    if (!blessing) return;
    audio.click();
    applyChoice(world, blessing.id);
    screen = SCREEN_PLAY;
    announce(`Chose ${blessing.name}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    const clicks = input.takeClicks();
    let clickedButton = false;
    for (const click of clicks) {
      const id = buttonAt(click);
      if (id === 'mute') {
        clickedButton = true;
        toggleMute();
        continue;
      }
      if (id === 'start' && screen === SCREEN_TITLE) {
        clickedButton = true;
        audio.click();
        startGame();
        continue;
      }
      if (id === 'resume' && screen === SCREEN_PAUSED) {
        clickedButton = true;
        screen = SCREEN_PLAY;
        announce('Playing.');
        continue;
      }
      if (id === 'restart' && (screen === SCREEN_PAUSED || screen === SCREEN_OVER)) {
        clickedButton = true;
        audio.click();
        startGame();
        continue;
      }
      if (id === 'again' && screen === SCREEN_VICTORY) {
        clickedButton = true;
        audio.click();
        startGame();
        continue;
      }
      if (id && id.startsWith('choice-') && screen === SCREEN_LEVELUP) {
        clickedButton = true;
        chooseBlessing(Number(id.slice('choice-'.length)));
      }
    }

    if (actions & ACTION_MUTE) toggleMute();
    if (actions & ACTION_RESTART && (screen === SCREEN_OVER || screen === SCREEN_VICTORY || screen === SCREEN_PAUSED || screen === SCREEN_PLAY)) {
      startGame();
      return;
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startGame();
      return;
    }
    if (screen === SCREEN_OVER || screen === SCREEN_VICTORY) {
      if (actions & ACTION_CONFIRM) startGame();
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (screen === SCREEN_LEVELUP) {
      if (actions & ACTION_CHOICE_1) chooseBlessing(0);
      else if (actions & ACTION_CHOICE_2) chooseBlessing(1);
      else if (actions & ACTION_CHOICE_3) chooseBlessing(2);
      return;
    }
    // Play: pause, and the dash (a click that hit a button is not a dash).
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
      return;
    }
    if (actions & ACTION_DASH && !clickedButton) {
      pendingDash = true;
      const mouse = input.getMouse();
      if (mouse.inside) {
        const camera = renderer.getCamera();
        const player = world.player;
        const px = player.x - camera.x;
        const py = player.y - camera.y;
        const dx = mouse.x - px;
        const dy = mouse.y - py;
        const length = Math.hypot(dx, dy);
        if (length > 12) pendingDashDir = { x: dx / length, y: dy / length };
        else pendingDashDir = null;
      }
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      stepAttract(world, STEP);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const move = input.direction();
    const inputState = {
      mx: move.x,
      my: move.y,
      dash: pendingDash,
      dashDx: pendingDashDir ? pendingDashDir.x : 0,
      dashDy: pendingDashDir ? pendingDashDir.y : 0,
    };
    pendingDash = false;
    pendingDashDir = null;
    const events = stepWorld(world, inputState, STEP);
    soundFor(events);
    if (events & EVENT_VICTORY) finishRun(true);
    else if (events & EVENT_OVER) finishRun(false);
    else if (events & EVENT_LEVELUP) screen = SCREEN_LEVELUP;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const frameSeconds = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    renderTime += frameSeconds;
    handleActions();
    if (world.hitStop > 0) {
      world.hitStop -= frameSeconds;
    } else if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      accumulator += frameSeconds;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    world.muted = audio.isMuted();
    renderer.draw(world, screen, best, renderTime, input.getMouse());
  }

  // Leaving the tab pauses a running game rather than letting the gloom hunt unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Lumen Grove. Press Enter or click Start to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
