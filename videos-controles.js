/* Complemento del reproductor existente. Cargar después de script.js. */
(() => {
  'use strict';
  function init() {
    const dialog = document.getElementById('story-dialog');
    const video = document.getElementById('story-dialog-video');
    if (!dialog || !video || dialog.dataset.controlsReady) return;
    dialog.dataset.controlsReady = 'true';
    video.controls = true;
    video.playsInline = true;
    video.loop = false;
    video.setAttribute('aria-label', 'Video de Buen Nacer');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let animation;
    const panel = dialog.querySelector('.story-dialog-inner');
    function opened() {
      animation?.cancel();
      if (!dialog.open) { video.pause(); return; }
      video.controls = true;
      if (panel && !reduced.matches && panel.animate) {
        animation = panel.animate([
          { opacity: 0, transform: 'translateY(20px) scale(.96)' },
          { opacity: 1, transform: 'translateY(0) scale(1)' }
        ], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' });
      }
    }
    new MutationObserver(opened).observe(dialog, {
      attributes: true, attributeFilter: ['open']
    });
    dialog.addEventListener('close', () => video.pause());
    reduced.addEventListener('change', () => animation?.cancel());
    if (dialog.open) opened();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else init();
})();
