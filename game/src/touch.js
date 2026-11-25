// Mobile Touch Controls: Left-half floating ink-wash joystick + Right-bottom thumb skill buttons
import { keys, pressed, touchMove, markTouchActive } from './input.js';

export function createTouchControls({ forceTouch = false, isPlaying = () => false, onUnlockAudio = null } = {}) {
  const isTouchCapable = forceTouch || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  if (isTouchCapable) document.body.classList.add('touch-mode');

  // Floating Joystick DOM (appears wherever left thumb touches on left half of screen)
  const joyBase = document.createElement('div');
  joyBase.id = 'touch-joy-base';
  const joyKnob = document.createElement('div');
  joyKnob.id = 'touch-joy-knob';
  joyBase.appendChild(joyKnob);
  document.body.appendChild(joyBase);

  let joyPointerId = null;
  let originX = 0, originY = 0;
  const maxRadius = 46;

  function resetJoy() {
    joyPointerId = null;
    touchMove.x = 0;
    touchMove.z = 0;
    joyBase.classList.remove('active');
    joyKnob.style.transform = 'translate(-50%, -50%)';
  }

  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') markTouchActive();
    if (!isTouchCapable && e.pointerType !== 'touch') return;
    if (onUnlockAudio) onUnlockAudio();
    if (!isPlaying()) return;
    // Ignore touches on buttons, skill icons, or modals
    if (e.target && e.target.closest && e.target.closest('button, .ch-skill, #codex-modal, #title-screen')) return;
    // Left half of screen activates floating joystick
    if (joyPointerId === null && e.clientX < window.innerWidth * 0.55) {
      joyPointerId = e.pointerId;
      originX = e.clientX;
      originY = e.clientY;
      joyBase.style.left = originX + 'px';
      joyBase.style.top = originY + 'px';
      joyBase.classList.add('active');
      touchMove.x = 0;
      touchMove.z = 0;
    }
  }, { passive: true });

  window.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joyPointerId) return;
    const dx = e.clientX - originX;
    const dy = e.clientY - originY;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(maxRadius, dist);
    const nx = dist > 1e-3 ? dx / dist : 0;
    const ny = dist > 1e-3 ? dy / dist : 0;
    joyKnob.style.transform = `translate(calc(-50% + ${nx * clamped}px), calc(-50% + ${ny * clamped}px))`;

    if (dist < 6) {
      touchMove.x = 0;
      touchMove.z = 0;
    } else {
      const mag = Math.min(1, clamped / maxRadius);
      touchMove.x = nx * mag;
      touchMove.z = ny * mag;
    }
  }, { passive: true });

  window.addEventListener('pointerup', (e) => { if (e.pointerId === joyPointerId) resetJoy(); });
  window.addEventListener('pointercancel', (e) => { if (e.pointerId === joyPointerId) resetJoy(); });
  window.addEventListener('blur', resetJoy);

  // Wire the 6 HUD skill buttons for responsive thumb taps & holds (packaging.md: release on up/cancel/leave!)
  function bindSkillButtons() {
    const map = [
      { id: 'sk-atk', code: 'KeyJ', hold: false },
      { id: 'sk-blk', code: 'KeyK', hold: true },
      { id: 'sk-ddg', code: 'Space', hold: false },
      { id: 'sk-dec', code: 'KeyQ', hold: false },
      { id: 'sk-ant', code: 'KeyE', hold: false },
      { id: 'sk-ult', code: 'KeyR', hold: false },
    ];

    for (const item of map) {
      const el = document.getElementById(item.id);
      if (!el) continue;

      const release = () => {
        el.classList.remove('pressed');
        if (item.hold) keys.delete(item.code);
      };

      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.pointerType === 'touch') markTouchActive();
        if (onUnlockAudio) onUnlockAudio();
        el.classList.add('pressed');
        pressed.add(item.code);
        if (item.hold) keys.add(item.code);
      });

      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('pointerleave', release);
    }
  }

  bindSkillButtons();
  return { isTouchCapable, resetJoy };
}
