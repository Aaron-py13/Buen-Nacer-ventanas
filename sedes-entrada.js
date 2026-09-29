(() => {
  const section = document.getElementById('sedes');
  if (!section || section.dataset.entranceReady) return;
  section.dataset.entranceReady = 'true';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const elements = [section.querySelector('.section-heading > div'), section.querySelector('.section-heading > p'), ...section.querySelectorAll('.location-tabs button'), section.querySelector('.map-panels')].filter(Boolean);
  let observer, played = false;
  const animations = new Set();
  function clear() {
    observer?.disconnect();
    animations.forEach(animation => animation.cancel());
    animations.clear();
  }
  function enter() {
    if (played || reduced.matches) return;
    played = true;
    observer?.disconnect();
    elements.forEach((element, index) => {
      if (!element.animate) return;
      const animation = element.animate([
        { opacity: 0, translate: '0 18px' },
        { opacity: 1, translate: '0 0' }
      ], { duration: 680, delay: index * 95, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
      animations.add(animation);
      animation.onfinish = () => animations.delete(animation);
    });
  }
  if (!reduced.matches && 'IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) enter();
    }, { threshold: 0, rootMargin: '0px 0px -12% 0px' });
    observer.observe(section);
  }
  section.addEventListener('focusin', () => { played = true; clear(); });
  reduced.addEventListener('change', () => { if (reduced.matches) clear(); });
})();
