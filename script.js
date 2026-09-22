/* Buen Nacer · JavaScript MEJORADO y sincronizado con el CSS actual. Reemplaza el script anterior completo. */
(() => {
  'use strict';

  /* ==================================================================
     EFECTO DE LETRAS VOLADORAS (fly-text)
     Adaptado de https://codepen.io/shubniggurath/pen/jEyZdPj
     Original: GSAP + ScrollTrigger, mide cada letra con la Range API
     y la anima como si el viento la arrastrara.

     >>> AQUI SE CAMBIA EL EFECTO <<<
     Cualquiera de estos valores se puede sobrescribir por elemento
     desde el HTML con atributos data-*, en kebab-case:
        data-wind-angle="-60"    ->  windAngle
        data-wind-strength="170" ->  windStrength
        data-reverse="false"     ->  reverse
     ================================================================== */

  const FLY_DEFAULTS = {
    windAngle: -60,       // grados. 0=derecha 90=arriba 180=izquierda -60=abajo-derecha
    windStrength: 170,    // px que recorre cada letra en la direccion del viento
    scatter: 26,          // px de desvio aleatorio alrededor de esa direccion
    maxRotation: 120,     // grados maximos de giro (X, Y y Z se derivan de este)
    depth: 55,            // px de movimiento en Z. 0 = efecto plano
    perspective: 620,     // px de perspectiva 3D. Menor = mas exagerado
    stagger: 0.55,        // 0-1 cuanto se reparten los arranques entre letras
    order: 'ltr',         // 'random' | 'ltr' | 'rtl' | 'outward'
    randomness: 0.35,     // 0 = orden exacto, 1 = arranques totalmente al azar
    gustiness: 0,         // px de deriva lateral tipo rafaga durante el vuelo
    gustFrequency: 1,     // ciclos de la rafaga durante el vuelo
    gustPhaseSpread: 1,   // 0 = todas las letras ondulan juntas, 1 = desfasadas
    reverse: true,        // true = las letras llegan y se arman. false = se dispersan
    mode: 'entrance',     // 'entrance' = al cargar la pagina | 'scroll' = atado al scroll
    duration: 1.7,        // segundos que dura la entrada (solo modo entrance)
    delay: 0.15,          // segundos de espera antes de arrancar (solo entrance)
    startY: null,         // solo modo scroll. null usa .85 al revelar / .65 al dispersar
    animationDuration: 1, // solo modo scroll. 0-1 fraccion del scroll que ocupa
    easing: null,         // null usa power3.out al revelar y power3.in al dispersar
    seed: 42              // cambia el numero y cambia el patron aleatorio
  };

  /* --- generador aleatorio con semilla (identico al pen) --- */
  function flySfc32(a, b, c, d) {
    return function () {
      a |= 0; b |= 0; c |= 0; d |= 0;
      const t = (a + b | 0) + d | 0;
      d = d + 1 | 0;
      a = b ^ (b >>> 9);
      b = c + (c << 3) | 0;
      c = (c << 21) | (c >>> 11);
      c = c + t | 0;
      return (t >>> 0) / 4294967296;
    };
  }

  function flySeeded(seed) {
    let s = seed >>> 0;
    const splitmix32 = () => {
      s = (s + 0x9e3779b9) | 0;
      let t = s ^ (s >>> 16);
      t = Math.imul(t, 0x21f0aaad);
      t = t ^ (t >>> 15);
      t = Math.imul(t, 0x735a2d97);
      return (t ^ (t >>> 15)) >>> 0;
    };
    const rnd = flySfc32(splitmix32(), splitmix32(), splitmix32(), splitmix32());
    for (let i = 0; i < 12; i++) rnd();
    return rnd;
  }

  const flyClamp01 = v => Math.max(0, Math.min(1, v));
  const flyLerp = (a, b, t) => a + (b - a) * t;

  // El pen mezcla el dataset sin convertir tipos: data-reverse="false"
  // llegaba como la cadena "false", que es verdadera. Aqui si se convierte.
  function flyCoerce(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null' || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }

  function createFlyText(el) {
    const p = Object.assign({}, FLY_DEFAULTS);
    for (const key of Object.keys(el.dataset)) {
      if (key in p) p[key] = flyCoerce(el.dataset[key]);
    }

    const originalHTML = el.innerHTML;
    const originalPosition = el.style.position;
    const raw = el.textContent.replace(/\s+/g, ' ').trim();
    if (!raw) return null;

    // Si el elemento (o un ancestro) ya esta oculto para lectores de pantalla
    // no duplicamos el texto accesible: el contenedor ya tiene su etiqueta.
    const silent = el.getAttribute('aria-hidden') === 'true' || Boolean(el.closest('[aria-hidden="true"]'));
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.textContent = '';

    if (!silent) {
      const sr = document.createElement('span');
      sr.className = 'visually-hidden';
      sr.textContent = raw;
      el.appendChild(sr);
    }

    // Copia invisible: sostiene el tamano real del bloque para que nada salte.
    const placeholder = document.createElement('span');
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.style.cssText = 'visibility:hidden;pointer-events:none;user-select:none;';
    placeholder.textContent = raw;
    el.appendChild(placeholder);

    // Capa absoluta donde viven las letras animadas.
    const overlay = document.createElement('span');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;pointer-events:none;';
    el.appendChild(overlay);

    let rnd = flySeeded(p.seed);
    const pick = (min, max) => min + rnd() * (max - min);
    let timeline = null, trigger = null, entrance = null, finished = false;

    // Mide cada caracter con la Range API y crea un span absoluto encima.
    function measure() {
      const box = el.getBoundingClientRect();
      const node = placeholder.firstChild;
      const chars = [];
      for (let i = 0; i < raw.length; i++) {
        if (raw[i] === ' ') continue;
        const range = document.createRange();
        range.setStart(node, i); range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        const span = document.createElement('span');
        span.className = 'fly-char';
        span.textContent = raw[i];
        span.style.cssText = `position:absolute;left:${r.left - box.left}px;top:${r.top - box.top}px;width:${r.width}px;height:${r.height}px;white-space:nowrap`;
        span._x = r.left - box.left;
        overlay.appendChild(span);
        chars.push(span);
      }
      if (!chars.length) return chars;
      const xs = chars.map(c => c._x);
      const min = Math.min(...xs);
      const range = Math.max(...xs) - min || 1;
      chars.forEach(c => { c._normX = (c._x - min) / range; });
      return chars;
    }

    function startTimeFor(char) {
      const x = char._normX;
      let ordered;
      if (p.order === 'ltr') ordered = x * p.stagger;
      else if (p.order === 'rtl') ordered = (1 - x) * p.stagger;
      else if (p.order === 'outward') ordered = (1 - Math.abs(x - .5) * 2) * p.stagger;
      else return pick(0, p.stagger);
      return ordered * (1 - p.randomness) + pick(0, p.stagger) * p.randomness;
    }

    function build(chars) {
      const tl = gsap.timeline({ paused: true });
      const rad = p.windAngle * Math.PI / 180;
      const windX = Math.cos(rad), windY = -Math.sin(rad);
      const perpX = Math.sin(rad), perpY = Math.cos(rad);
      const sharedAmp = p.gustiness > 0 ? pick(.1, 1) * p.gustiness * (rnd() > .5 ? 1 : -1) : 0;

      chars.forEach((char, i) => {
        const at = startTimeFor(char);
        const dur = pick(1 - p.randomness * .5, 1 + p.randomness * .5);
        const angle = pick(0, Math.PI * 2);
        const dist = pick(0, p.scatter);
        const fx = windX * p.windStrength + Math.cos(angle) * dist;
        const fy = windY * p.windStrength + Math.sin(angle) * dist;
        const fz = pick(-p.depth, p.depth);
        const rx = pick(-p.maxRotation, p.maxRotation);
        const ry = pick(-p.maxRotation * .7, p.maxRotation * .7);
        const rz = pick(-p.maxRotation * .3, p.maxRotation * .3);
        const away = { x: fx, y: fy, z: fz, rotationX: rx, rotationY: ry, rotationZ: rz, opacity: 0 };
        const home = { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, opacity: 1 };

        if (p.gustiness > 0) {
          const ownAmp = pick(.1, 1) * p.gustiness * (rnd() > .5 ? 1 : -1);
          const amp = flyLerp(sharedAmp, ownAmp, p.gustPhaseSpread);
          const syncPhase = Math.PI * p.gustFrequency * at;
          const indexPhase = (i / Math.max(1, chars.length - 1)) * Math.PI * 2;
          const phase = flyLerp(syncPhase, indexPhase, p.gustPhaseSpread);
          const s0 = Math.sin(phase);
          const s1 = Math.sin(Math.PI * p.gustFrequency + phase);
          // Se resta la rampa lineal para que la onda valga 0 al inicio y al final.
          const gust = t => amp * (Math.sin(Math.PI * p.gustFrequency * t + phase) - s0 - t * (s1 - s0));
          const at_ = t => {
            const s = p.reverse ? 1 - t : t;
            return {
              x: s * fx + perpX * gust(t), y: s * fy + perpY * gust(t), z: s * fz,
              rotationX: rx * s, rotationY: ry * s, rotationZ: rz * s,
              opacity: flyClamp01((1 - s) / .6)
            };
          };
          gsap.set(char, at_(0));
          const proxy = { t: 0 };
          tl.to(proxy, {
            t: 1, duration: dur, ease: p.easing || 'power3.in', immediateRender: true,
            onUpdate() { gsap.set(char, at_(proxy.t)); }
          }, at);
        } else {
          const from = p.reverse ? away : home;
          const to = p.reverse ? home : away;
          tl.fromTo(char, from, Object.assign({}, to, {
            duration: dur,
            ease: p.easing || (p.reverse ? 'power3.out' : 'power3.in')
          }), at);
        }
      });

      const frac = parseFloat(p.animationDuration);
      if (p.mode === 'scroll' && frac > 0 && frac < 1) tl.call(() => {}, [], tl.duration() / frac);
      return tl;
    }

    function setup() {
      trigger?.kill(); timeline?.kill(); entrance?.kill();
      trigger = entrance = null;
      overlay.innerHTML = '';
      rnd = flySeeded(p.seed);
      const chars = measure();
      if (!chars.length) return;
      gsap.set(chars, { transformPerspective: p.perspective });
      timeline = build(chars);

      if (p.mode === 'scroll') {
        const pct = Math.round((p.startY ?? (p.reverse ? .85 : .65)) * 100);
        trigger = ScrollTrigger.create({
          trigger: el, start: `top ${pct}%`,
          end: p.reverse ? 'top 20%' : 'bottom top',
          scrub: 1, animation: timeline, invalidateOnRefresh: true
        });
        return;
      }

      // Modo entrada: se reproduce una vez al cargar.
      const natural = timeline.duration() || 1;
      timeline.timeScale(natural / p.duration);
      timeline.eventCallback('onComplete', () => { finished = true; });
      if (finished) { timeline.progress(1); return; }
      entrance = gsap.delayedCall(p.delay, () => timeline.play());
    }

    setup();

    let resizeTimer, lastW = 0, lastH = 0;
    const observer = new ResizeObserver(([entry]) => {
      const size = entry.contentBoxSize?.[0] || entry.contentBoxSize;
      const w = size?.inlineSize ?? entry.contentRect.width;
      const h = size?.blockSize ?? entry.contentRect.height;
      if (w === lastW && h === lastH) return;
      lastW = w; lastH = h;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(setup, 200);
    });
    observer.observe(el);

    return {
      destroy() {
        observer.disconnect(); clearTimeout(resizeTimer);
        trigger?.kill(); timeline?.kill(); entrance?.kill();
        el.style.position = originalPosition; el.innerHTML = originalHTML;
      }
    };
  }

  function init() {
    const root = document.documentElement;
    if (root.dataset.buenNacerReady) return;
    root.dataset.buenNacerReady = 'true';

    const $ = (q, base = document) => base.querySelector(q);
    const $$ = (q, base = document) => Array.from(base.querySelectorAll(q));
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const desktop = matchMedia('(min-width: 901px)');
    const fine = matchMedia('(hover: hover) and (pointer: fine)');

    let paused = false, mediaContext = null, lenis = null, ticker = null;
    let refreshTimer;
    let pointerHandler = null, pointerLeave = null;

    const hero = $('.hero');
    const menu = $('.menu-toggle');
    const nav = $('#navigation');
    const dialog = $('#gallery-dialog');
    const motionButton = $('#motion-toggle');
    const canGSAP = Boolean(window.gsap && window.ScrollTrigger);
    if (canGSAP) gsap.registerPlugin(ScrollTrigger);
    const disabled = () => paused || reduce.matches;

    function menuState(open) {
      if (!menu || !nav) return;
      nav.classList.toggle('open', open);
      menu.setAttribute('aria-expanded', String(open));
      const icon = $('span', menu);
      if (icon) icon.textContent = open ? '×' : '☰';
    }
    menu?.addEventListener('click', () => menuState(menu.getAttribute('aria-expanded') !== 'true'));
    $$('a', nav || document).forEach(a => a.addEventListener('click', () => menuState(false)));
    document.addEventListener('click', e => { if (!e.target.closest('.site-header')) menuState(false); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && menu?.getAttribute('aria-expanded') === 'true') {
        menuState(false); menu.focus();
      }
    });
    desktop.addEventListener('change', () => menuState(false));
    root.classList.add('js');

    // Letras voladoras. Solo se montan si hay GSAP, fuentes listas y movimiento activo.
    // El texto plano es el estado de reposo: destroy() lo devuelve tal cual.
    let flyItems = [], fontsReady = false;
    function startFly() {
      if (!fontsReady || !canGSAP || disabled() || flyItems.length) return;
      flyItems = $$('.fly-text').map(createFlyText).filter(Boolean);
      refresh();
    }
    function stopFly() {
      flyItems.splice(0).forEach(item => item.destroy());
    }
    (document.fonts?.ready || Promise.resolve()).then(() => { fontsReady = true; startFly(); });

    // Programas: conservar el selector del formulario sin duplicar enlaces.
    $$('.program').forEach((card, index) => {
      const copy = $('.program-copy', card);
      if (!copy) return;

      let a = $('.text-link[href="#visita"]', copy);
      if (!a) {
        a = document.createElement('a');
        a.className = 'text-link';
        a.href = '#visita';
        a.textContent = 'Consultar por este programa ↗';
        copy.appendChild(a);
      }

      a.addEventListener('click', () => {
        const select = $('#program');
        if (!select) return;
        select.selectedIndex = Math.min(index, Math.max(0, select.options.length - 1));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });

    // Pestañas accesibles de sedes.
    const tabs = $$('[data-location]');
    function selectTab(tab) {
      tabs.forEach(t => {
        const active = t === tab;
        t.setAttribute('aria-selected', String(active));
        t.tabIndex = active ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (!panel) return;
        panel.hidden = !active; panel.tabIndex = 0;
        const iframe = $('iframe', panel);
        if (active && iframe?.dataset.src) {
          iframe.src = iframe.dataset.src; delete iframe.dataset.src;
        }
      });
      if ($('#sede')) $('#sede').value = tab.dataset.location === 'molina' ? 'La Molina' : 'San Borja';
      refresh();
    }
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => selectTab(tab));
      tab.addEventListener('keydown', e => {
        let next;
        if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
        if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
        if (e.key === 'Home') next = 0;
        if (e.key === 'End') next = tabs.length - 1;
        if (next === undefined) return;
        e.preventDefault(); tabs[next].focus(); selectTab(tabs[next]);
      });
    });

    // Asegura un estado inicial coherente para las sedes y carga solo el mapa activo.
    const initialTab = tabs.find(tab => tab.getAttribute('aria-selected') === 'true') || tabs[0];
    if (initialTab) selectTab(initialTab);

    /* ==========================================================
       GALERÍA / IMAGEN AMPLIADA
       El CSS ya define #gallery-dialog, #gallery-image y controles.
       ========================================================== */
    const moments = $$('.moment');
    const galleryImage = dialog ? $('#gallery-image', dialog) : null;
    const galleryTitle = dialog ? $('#gallery-title', dialog) : null;
    const galleryPrev = dialog ? $('#gallery-prev', dialog) : null;
    const galleryNext = dialog ? $('#gallery-next', dialog) : null;
    const galleryClose = dialog ? $('.dialog-close', dialog) : null;
    let galleryIndex = 0;
    let galleryReturnFocus = null;

    function galleryData(index) {
      if (!moments.length) return null;
      galleryIndex = (index + moments.length) % moments.length;
      const item = moments[galleryIndex];
      const img = $('img', item);
      if (!img) return null;
      const title = item.dataset.title || $('big', item)?.textContent?.trim() || img.alt || `Imagen ${galleryIndex + 1}`;
      const src = item.dataset.full || img.dataset.full || img.currentSrc || img.src;
      return { item, img, title, src };
    }

    function renderGallery(index) {
      const data = galleryData(index);
      if (!data || !galleryImage) return;
      galleryImage.src = data.src;
      galleryImage.alt = data.img.alt || data.title;
      if (galleryTitle) galleryTitle.textContent = data.title;
    }

    function openGallery(index, opener) {
      if (!dialog || !galleryImage || !moments.length) return;
      galleryReturnFocus = opener || document.activeElement;
      renderGallery(index);
      document.body.classList.add('modal-open');
      if (!dialog.open) {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
      }
      lenis?.stop();
      galleryClose?.focus({ preventScroll: true });
    }

    function closeGallery() {
      if (!dialog) return;
      if (typeof dialog.close === 'function' && dialog.open) dialog.close();
      else dialog.removeAttribute('open');
    }

    moments.forEach((moment, index) => {
      moment.addEventListener('click', () => openGallery(index, moment));

      // Si .moment no es botón/enlace, le damos navegación por teclado.
      const nativeInteractive = moment.matches('button, a[href], input, select, textarea, summary');
      if (!nativeInteractive) {
        if (!moment.hasAttribute('tabindex')) moment.tabIndex = 0;
        if (!moment.hasAttribute('role')) moment.setAttribute('role', 'button');
        moment.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          openGallery(index, moment);
        });
      }
    });

    galleryPrev?.addEventListener('click', () => renderGallery(galleryIndex - 1));
    galleryNext?.addEventListener('click', () => renderGallery(galleryIndex + 1));
    galleryClose?.addEventListener('click', closeGallery);

    dialog?.addEventListener('click', event => {
      if (event.target === dialog) closeGallery();
    });

    dialog?.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); renderGallery(galleryIndex - 1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); renderGallery(galleryIndex + 1); }
    });

    dialog?.addEventListener('close', () => {
      document.body.classList.remove('modal-open');
      lenis?.start();
      galleryReturnFocus?.focus?.({ preventScroll: true });
      galleryReturnFocus = null;
    });

    /* ==========================================================
       HISTORIAS / VIDEOS
       ========================================================== */

    const storiesCarousel = $('[data-story-carousel]');
    const storyCards = storiesCarousel ? $$('.story-card', storiesCarousel) : [];
    const storyPrev = storiesCarousel ? $('.stories-arrow--prev', storiesCarousel) : null;
    const storyNext = storiesCarousel ? $('.stories-arrow--next', storiesCarousel) : null;
    const storyDots = storiesCarousel ? $$('.stories-dots button', storiesCarousel) : [];
    const storyCounter = storiesCarousel ? $('.stories-counter strong', storiesCarousel) : null;

    let storyIndex = 0;
    let storyAutoplay = null;
    let storyTouchStart = 0;
    let storyTouchEnd = 0;
    let storyVisible = false;
    let storyHovered = false;
    let storyTouchStartY = 0;

    /* ---------- ACTUALIZAR CARRUSEL ---------- */
    function updateStories(index, animate = true) {
      if (!storyCards.length) return;

      const total = storyCards.length;
      storyIndex = (index + total) % total;
      const previous = (storyIndex - 1 + total) % total;
      const next = (storyIndex + 1) % total;

      storyCards.forEach((card, cardIndex) => {
        card.classList.remove('is-active', 'is-prev', 'is-next');

        if (cardIndex === storyIndex) card.classList.add('is-active');
        else if (cardIndex === previous) card.classList.add('is-prev');
        else if (cardIndex === next) card.classList.add('is-next');

        const video = $('video', card);
        if (!video) return;

        if (cardIndex === storyIndex && storyVisible && !document.hidden && !disabled()) {
          video.play().catch(() => {});
        } else {
          video.pause();
          video.muted = true;
          const soundButton = $('.story-sound', card);
          if (soundButton) {
            soundButton.textContent = '🔇';
            soundButton.setAttribute('aria-label', 'Activar sonido');
          }
        }
      });

      /* DOTS */
      storyDots.forEach((dot, dotIndex) => {
        dot.classList.toggle('is-active', dotIndex === storyIndex);
      });

      /* CONTADOR */
      if (storyCounter) {
        storyCounter.textContent = String(storyIndex + 1).padStart(2, '0');
      }

      /* ---------- EFECTO CUANDO CAMBIA DE VIDEO ---------- */
      if (animate && canGSAP && !disabled() && storiesCarousel?.classList.contains('stories-ready')) {
        const activeCard = storyCards[storyIndex];
        const activeVideo = $('.story-video', activeCard);
        const activeTexts = $$('.story-copy > *', activeCard);
        const activeNumber = $('.story-number', activeCard);

        /* Video: pequeño zoom + blur + giro 3D */
        gsap.fromTo(activeVideo,
          {
            scale: .82,
            rotationY: storyIndex % 2 === 0 ? 12 : -12,
            rotationX: 5,
            filter: 'blur(12px)'
          },
          {
            scale: 1,
            rotationY: 0,
            rotationX: 0,
            filter: 'blur(0px)',
            duration: .95,
            ease: 'expo.out',
            overwrite: true
          }
        );

        /* Textos del video */
        gsap.fromTo(activeTexts,
          { y: 34, opacity: 0 },
          { y: 0, opacity: 1, duration: .7, stagger: .08, ease: 'power3.out', overwrite: true }
        );

        /* Número */
        gsap.fromTo(activeNumber,
          { scale: .5, opacity: 0 },
          { scale: 1, opacity: 1, duration: .65, ease: 'back.out(2)', overwrite: true }
        );
      }
    }

    function nextStory() { updateStories(storyIndex + 1); }
    function prevStory() { updateStories(storyIndex - 1); }

    function stopStoryAutoplay() {
      if (!storyAutoplay) return;
      clearInterval(storyAutoplay);
      storyAutoplay = null;
    }

    function startStoryAutoplay() {
      stopStoryAutoplay();
      if (
        !storiesCarousel ||
        !storyVisible ||
        document.hidden ||
        storyHovered ||
        storiesCarousel.contains(document.activeElement) ||
        storyCards.length < 2 ||
        disabled()
      ) return;

      storyAutoplay = setInterval(() => { nextStory(); }, 6000);
    }

    /* FLECHAS */
    storyPrev?.addEventListener('click', () => { prevStory(); startStoryAutoplay(); });
    storyNext?.addEventListener('click', () => { nextStory(); startStoryAutoplay(); });

    /* CLICK EN VIDEO LATERAL */
    storyCards.forEach((card, index) => {
      card.addEventListener('click', event => {
        if (event.target.closest('.story-sound')) return;
        if (index !== storyIndex) {
          updateStories(index);
          startStoryAutoplay();
        }
      });
    });

    /* DOTS */
    storyDots.forEach((dot, index) => {
      dot.addEventListener('click', () => {
        updateStories(index);
        startStoryAutoplay();
      });
    });

    /* SONIDO */
    storyCards.forEach(card => {
      const video = $('video', card);
      const button = $('.story-sound', card);
      if (!video || !button) return;

      button.addEventListener('click', event => {
        event.stopPropagation();
        const selected = storyCards.indexOf(card);
        if (selected !== storyIndex) updateStories(selected, false);

        video.muted = !video.muted;

        if (video.muted) {
          button.textContent = '🔇';
          button.setAttribute('aria-label', 'Activar sonido');
        } else {
          button.textContent = '🔊';
          button.setAttribute('aria-label', 'Silenciar video');
        }

        video.play().catch(() => {});
      });
    });

    /* SWIPE EN CELULAR */
    storiesCarousel?.addEventListener('touchstart', event => {
      storyTouchStart = event.changedTouches[0].clientX;
      storyTouchStartY = event.changedTouches[0].clientY;
    }, { passive: true });

    storiesCarousel?.addEventListener('touchend', event => {
      storyTouchEnd = event.changedTouches[0].clientX;
      const difference = storyTouchStart - storyTouchEnd;

      if (
        Math.abs(difference) < 45 ||
        Math.abs(difference) <= Math.abs(event.changedTouches[0].clientY - storyTouchStartY)
      ) return;

      if (difference > 0) nextStory();
      else prevStory();

      startStoryAutoplay();
    }, { passive: true });

    /* TECLADO */
    if (storiesCarousel) {
      storiesCarousel.tabIndex = 0;
      storiesCarousel.addEventListener('keydown', event => {
        if (event.key === 'ArrowRight') { nextStory(); startStoryAutoplay(); }
        if (event.key === 'ArrowLeft') { prevStory(); startStoryAutoplay(); }
      });
    }

    /* DETENER CUANDO EL MOUSE ESTÁ ENCIMA */
    storiesCarousel?.addEventListener('mouseenter', () => { storyHovered = true; stopStoryAutoplay(); });
    storiesCarousel?.addEventListener('mouseleave', () => { storyHovered = false; startStoryAutoplay(); });
    storiesCarousel?.addEventListener('focusin', stopStoryAutoplay);
    storiesCarousel?.addEventListener('focusout', () => setTimeout(startStoryAutoplay, 0));

    /* DETECTAR SI LA SECCIÓN ESTÁ VISIBLE */
    if (storiesCarousel && 'IntersectionObserver' in window) {
      const storyObserver = new IntersectionObserver(entries => {
        const entry = entries[0];
        storyVisible = entry.isIntersecting;

        if (storyVisible) {
          updateStories(storyIndex, false);
          startStoryAutoplay();
        } else {
          stopStoryAutoplay();
          storyCards.forEach(card => { $('video', card)?.pause(); });
        }
      }, { threshold: .3 });

      storyObserver.observe(storiesCarousel);
    }

    /* CAMBIO DE PESTAÑA DEL NAVEGADOR */
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopStoryAutoplay();
        storyCards.forEach(card => $('video', card)?.pause());
      } else {
        updateStories(storyIndex, false);
        startStoryAutoplay();
      }
    });

    /* ESTADO INICIAL */
    updateStories(0, false);

    // WhatsApp prepara el texto; el usuario confirma el envío allí.
    const form = $('#contact-form');
    const parent = $('#parent');
    const programSelect = $('#program');
    const sedeSelect = $('#sede');
    const liveSummary = form ? $('.contact-live-summary', form) : null;

    function updateContactSummary() {
      if (!liveSummary) return;
      const parts = [];
      const name = parent?.value.trim();
      if (name) parts.push(`Familia: ${name}`);
      if (programSelect?.value) parts.push(`Programa: ${programSelect.value}`);
      if (sedeSelect?.value) parts.push(`Sede: ${sedeSelect.value}`);
      liveSummary.textContent = parts.join(' · ');
    }

    form?.querySelectorAll('input, select, textarea').forEach(field => {
      const label = field.id ? form.querySelector(`label[for="${CSS.escape(field.id)}"]`) : null;
      field.addEventListener('focus', () => label?.classList.add('is-focused'));
      field.addEventListener('blur', () => label?.classList.remove('is-focused'));
      field.addEventListener('input', updateContactSummary);
      field.addEventListener('change', updateContactSummary);
    });

    parent?.addEventListener('input', () => parent.setCustomValidity(''));
    updateContactSummary();
    form?.addEventListener('submit', e => {
      e.preventDefault();
      if (!parent || !$('#program') || !$('#sede')) return;
      const name = parent.value.trim();
      parent.setCustomValidity(name ? '' : 'Escribe tu nombre.');
      if (!form.reportValidity()) return;
      const message = `Hola, Buen Nacer. Mi nombre es ${name}.\n\nMe interesa: ${$('#program').value}.\nSede: ${$('#sede').value}.\n\nQuisiera conocer los horarios, la disponibilidad y cómo coordinar una visita. ¡Gracias!`;
      const url = `https://wa.me/51966321996?text=${encodeURIComponent(message)}`;
      if ($('#message')) $('#message').value = message;
      if ($('#whatsapp-message')) $('#whatsapp-message').href = url;
      if ($('#message-result')) $('#message-result').hidden = false;
      if ($('#copy-status')) $('#copy-status').textContent = '';
      window.open(url, '_blank', 'noopener,noreferrer');
      refresh();
    });

    $('#copy-message')?.addEventListener('click', async () => {
      if (!$('#message') || !$('#copy-status')) return;
      try {
        if (!navigator.clipboard || !isSecureContext) throw new Error('clipboard');
        await navigator.clipboard.writeText($('#message').value);
        $('#copy-status').textContent = 'Mensaje copiado.';
      } catch {
        $('#message').focus(); $('#message').select();
        $('#copy-status').textContent = 'Seleccioné el texto. Usa Copiar en tu dispositivo.';
      }
    });

    if ($('#year')) $('#year').textContent = new Date().getFullYear();

    /* ── VENTANAS DE PROGRAMAS + CURSOR ────────────────────────────────
       Efecto de codepen.io/wolfscot/pen/EaNPjQQ:
       - Acordeón: las tres tarjetas son tiras flex que crecen al pasar el
         mouse (flex 1 -> 2.6, igual que .gallery-cell del original).
       - Cursor de dos capas: un punto que sigue al mouse al instante y un
         anillo que lo persigue con retardo (rx += (mx-rx) * EASE).
       Solo en escritorio con mouse fino, y solo dentro de esta sección.
       >>> AQUI SE AJUSTA <<< la velocidad del anillo y el alcance:        */
    const CURSOR_EASE = 0.12;   // 0.05 = suave, 0.3 = casi pegado
    const programGrid = $('#programas .program-grid') || $('.program-grid');
    const programCards = programGrid ? $$('.program', programGrid) : [];
    let activeProgramIndex = Math.max(0, programCards.findIndex(card => card.classList.contains('is-program-active')));
    let cursorRaf = 0, cursorNodes = null, cursorOff = null;

    let programSwapTimer = null;
    let programRevealTimer = null;
    let requestedProgramIndex = activeProgramIndex;

    function clearProgramTransition() {
      clearTimeout(programSwapTimer);
      clearTimeout(programRevealTimer);
      programCards.forEach(card => card.classList.remove('bn-copy-switching'));
    }

    function setActiveProgram(index, { focus = false } = {}) {
      if (!programCards.length) return;
      const next = index === null ? -1 : (index + programCards.length) % programCards.length;
      const initialized = programCards.some(card => card.classList.contains('is-program-active'));
      if (next === requestedProgramIndex && !focus && (initialized || next === -1)) return;
      requestedProgramIndex = next;
      clearProgramTransition();

      const apply = () => {
        activeProgramIndex = next;
        programCards.forEach((card, cardIndex) => {
          const active = cardIndex === next;
          card.classList.toggle('is-program-active', active);
          if (!active) {
            $$('details[open]', card).forEach(detail => { detail.open = false; });
          }
        });
        if (focus && next >= 0) programCards[next].focus({ preventScroll: true });
        refresh();
      };

      if (!programGrid.classList.contains('strip') || disabled() || focus) {
        apply();
        return;
      }
      if (next === activeProgramIndex) return;

      // Conserva el espacio de lectura mientras las columnas cambian de ancho.
      programGrid.style.minHeight = `${programGrid.getBoundingClientRect().height}px`;
      programCards[activeProgramIndex]?.classList.add('bn-copy-switching');
      programCards[next]?.classList.add('bn-copy-switching');
      programSwapTimer = setTimeout(() => {
        apply();
        programRevealTimer = setTimeout(() => {
          programCards.forEach(card => card.classList.remove('bn-copy-switching'));
          refresh();
        }, 550);
      }, 160);
    }

    // El CSS necesita una tarjeta activa para expandirla.
    if (programCards.length) setActiveProgram(activeProgramIndex);

    function stopWindows() {
      clearProgramTransition();
      requestedProgramIndex = activeProgramIndex;
      programGrid?.style.removeProperty('min-height');
      programGrid?.style.removeProperty('--bn-expanded-copy-width');
      programGrid?.classList.remove('strip');
      root.classList.remove('bn-cursor-on');
      if (cursorRaf) cancelAnimationFrame(cursorRaf);
      cursorRaf = 0;
      cursorOff?.(); cursorOff = null;
      cursorNodes?.forEach(node => node.remove());
      cursorNodes = null;

      programCards.forEach(card => {
        if (card.dataset.bnAddedTabindex === 'true') {
          card.removeAttribute('tabindex');
          delete card.dataset.bnAddedTabindex;
        }
      });
    }

    function startWindows(large) {
      if (!programGrid || !programCards.length || !large || !fine.matches || disabled()) return;
      if (programGrid.classList.contains('strip') && cursorNodes) return;

      programGrid.classList.add('strip');
      const stripGap = parseFloat(getComputedStyle(programGrid).columnGap) || 0;
      const expandedWidth = (programGrid.clientWidth - stripGap * (programCards.length - 1)) * 2.6 / (programCards.length + 1.6);
      programGrid.style.setProperty('--bn-expanded-copy-width', `${expandedWidth}px`);
      if (activeProgramIndex < 0) {
        // Mide una tarjeta abierta al recalcular el ancho de la ventana.
        programCards[0].classList.add('is-program-active');
        programGrid.style.minHeight = `${programGrid.getBoundingClientRect().height}px`;
        programCards[0].classList.remove('is-program-active');
      } else {
        setActiveProgram(activeProgramIndex);
      }

      const dot = document.createElement('div');
      const ring = document.createElement('div');
      dot.id = 'bn-cursor'; ring.id = 'bn-cursor-ring';
      dot.setAttribute('aria-hidden', 'true'); ring.setAttribute('aria-hidden', 'true');
      document.body.append(dot, ring);
      cursorNodes = [dot, ring];

      let mx = -100, my = -100, rx = -100, ry = -100;
      const move = e => {
        mx = e.clientX; my = e.clientY;
        dot.style.transform = `translate3d(${mx}px,${my}px,0)`;
      };
      const chase = () => {
        rx += (mx - rx) * CURSOR_EASE;
        ry += (my - ry) * CURSOR_EASE;
        ring.style.transform = `translate3d(${rx}px,${ry}px,0)`;
        cursorRaf = requestAnimationFrame(chase);
      };
      const enter = e => {
        mx = rx = e.clientX; my = ry = e.clientY;
        dot.style.transform = ring.style.transform = `translate3d(${mx}px,${my}px,0)`;
        root.classList.add('bn-cursor-on');
        if (!cursorRaf) chase();
      };
      const leave = () => {
        setActiveProgram(null);
        root.classList.remove('bn-cursor-on');
        if (cursorRaf) cancelAnimationFrame(cursorRaf);
        cursorRaf = 0;
      };
      const heat = on => {
        dot.classList.toggle('is-hot', on);
        ring.classList.toggle('is-hot', on);
      };
      const hotOn = () => heat(true), hotOff = () => heat(false);

      // La parte que faltaba: cambiar .is-program-active al pasar a otra tarjeta.
      const cardHandlers = programCards.map((card, index) => {
        if (!card.hasAttribute('tabindex')) {
          card.tabIndex = 0;
          card.dataset.bnAddedTabindex = 'true';
        }

        const activate = () => setActiveProgram(index);
        const focusActivate = () => setActiveProgram(index);
        card.addEventListener('pointerenter', activate);
        card.addEventListener('focusin', focusActivate);
        return { card, activate, focusActivate };
      });

      const keyboard = event => {
        const card = event.target.closest('.program');
        if (!card || !programGrid.contains(card)) return;
        const index = programCards.indexOf(card);
        if (index < 0 || event.target !== card) return;

        let next = null;
        if (event.key === 'ArrowRight') next = index + 1;
        if (event.key === 'ArrowLeft') next = index - 1;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = programCards.length - 1;
        if (next === null) return;
        event.preventDefault();
        setActiveProgram(next, { focus: true });
      };

      programGrid.addEventListener('pointerenter', enter);
      programGrid.addEventListener('pointerleave', leave);
      programGrid.addEventListener('keydown', keyboard);
      addEventListener('pointermove', move, { passive: true });

      const hotspots = $$('a, summary, button, input, select, textarea', programGrid);
      hotspots.forEach(el => {
        el.addEventListener('pointerenter', hotOn);
        el.addEventListener('pointerleave', hotOff);
      });

      cursorOff = () => {
        programGrid.removeEventListener('pointerenter', enter);
        programGrid.removeEventListener('pointerleave', leave);
        programGrid.removeEventListener('keydown', keyboard);
        removeEventListener('pointermove', move);
        hotspots.forEach(el => {
          el.removeEventListener('pointerenter', hotOn);
          el.removeEventListener('pointerleave', hotOff);
        });
        cardHandlers.forEach(({ card, activate, focusActivate }) => {
          card.removeEventListener('pointerenter', activate);
          card.removeEventListener('focusin', focusActivate);
        });
      };
    }

    function syncWindows() {
      stopWindows();
      if (!disabled() && desktop.matches && fine.matches) startWindows(true);
    }

    function stopMotion() {
      stopStoryAutoplay();
      storyCards.forEach(card => $('video', card)?.pause());
      stopFly();
      stopWindows();

      if (pointerHandler) hero?.removeEventListener('pointermove', pointerHandler);
      if (pointerLeave) hero?.removeEventListener('pointerleave', pointerLeave);
      pointerHandler = pointerLeave = null;

      mediaContext?.revert();
      mediaContext = null;

      if (ticker && canGSAP) gsap.ticker.remove(ticker);
      ticker = null;

      lenis?.destroy();
      lenis = null;
    }

    function setupMotion() {
      stopMotion();
      root.classList.toggle('motion-off', disabled());
      motionButton?.setAttribute('aria-pressed', String(disabled()));
      if (motionButton) {
        motionButton.disabled = reduce.matches;
        motionButton.textContent = reduce.matches
          ? 'Movimiento reducido del dispositivo'
          : paused ? 'Activar animaciones' : 'Pausar animaciones';
      }
      // Las ventanas de Programas son CSS puro: deben funcionar aunque GSAP no cargue.
      syncWindows();

      if (disabled() || !canGSAP) {
        updateStories(storyIndex, false);
        startStoryAutoplay();
        schedule();
        return;
      }

      mediaContext = gsap.matchMedia();
      mediaContext.add({ desktop: '(min-width: 901px)', mobile: '(max-width: 900px)' }, context => {
        const large = context.conditions.desktop;

        // La entrada del wordmark la gobierna ahora el efecto de letras voladoras.
        const entrance = gsap.timeline({ defaults: { ease: 'power3.out' } });
        entrance.from('.hero-kicker, .hero h1, .hero-description, .hero-note', { y: 22, opacity: 0, duration: .7, stagger: .09 }, .28)
          .from('.hero-visual', { opacity: 0, duration: 1 }, .25);

        const scene = gsap.timeline({ scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: .7, invalidateOnRefresh: true } });
        scene.to('.brand-scroll', { y: large ? -65 : -18, ease: 'none' }, 0)
          .to('.main-scroll', { y: large ? 95 : 28, scale: large ? 1.08 : 1.025, ease: 'none' }, 0)
          .to('.mini-scroll', { y: large ? -95 : -30, ease: 'none' }, 0)
          .to('.badge-scroll', { y: large ? -65 : -22, ease: 'none' }, 0)
          .to('.blob-mint', { y: -80, ease: 'none' }, 0)
          .to('.hero-photo', { borderRadius: '28px', ease: 'none' }, 0);

        gsap.to('.hero-mini', { y: -10, duration: 3.1, repeat: -1, yoyo: true, ease: 'sine.inOut' });
        gsap.to('.hero-badge', { rotation: -5, duration: 3.6, repeat: -1, yoyo: true, ease: 'sine.inOut' });

        gsap.utils.toArray('.section-heading, .program, .location-explorer, .faq-intro').forEach(el => {
          gsap.from(el, {
            y: 30,
            opacity: 0,
            duration: .85,
            ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 94%', once: true }
          });
        });

        /* FORMULARIO: ENTRA COMO UNA HOJA AL BAJAR */
        const hojaFormulario = document.querySelector('#visita #contact-form');
        if (hojaFormulario) {
          gsap.fromTo(hojaFormulario,
            {
              autoAlpha: 0,
              x: large ? 55 : 12,
              y: large ? 100 : 45,
              rotation: large ? 9 : 4,
              rotationY: large ? -16 : -6,
              scale: 0.94,
              transformPerspective: 1000,
              transformOrigin: '15% 0%'
            },
            {
              autoAlpha: 1,
              x: 0,
              y: 0,
              rotation: 0,
              rotationY: 0,
              scale: 1,
              ease: 'none',
              scrollTrigger: {
                trigger: hojaFormulario,
                start: 'top 95%',
                end: 'top 55%',
                scrub: 1.2,
                invalidateOnRefresh: true
              }
            }
          );
        }

        /* NOSOTROS: FOTO, TÍTULO, ETIQUETA Y PUNTOS */
        const nosotros = document.querySelector('#nosotros');
        if (nosotros) {
          const foto = nosotros.querySelector('.about-visual > img');
          const etiqueta = nosotros.querySelector('.about-tag');
          const titulos = nosotros.querySelectorAll('.about-title-part');
          const descripcion = nosotros.querySelector('.about-grid > div > p');
          const puntos = nosotros.querySelectorAll('.about-list > div');
          const enlace = nosotros.querySelector('.text-link');

          /* Foto: entra como una tarjeta y se endereza */
          if (foto) {
            gsap.fromTo(foto,
              { y: large ? 45 : 25, rotation: large ? -4 : -2, scale: 0.96, opacity: 0 },
              {
                y: 0, rotation: 0, scale: 1, opacity: 1,
                duration: 1, ease: 'power3.out',
                scrollTrigger: { trigger: foto, start: 'top 88%', once: true }
              }
            );

            /* Parallax independiente. La entrada usa y; el parallax usa yPercent. */
            gsap.to(foto, {
              yPercent: large ? -5 : -2,
              ease: 'none',
              scrollTrigger: { trigger: foto.parentElement, start: 'top 65%', end: 'bottom top', scrub: 1.2 }
            });
          }

          /* Título y descripción */
          if (titulos.length) {
            const entradaTexto = gsap.timeline({
              scrollTrigger: { trigger: titulos[0], start: 'top 88%', once: true }
            });

            entradaTexto.from(titulos, { y: 28, opacity: 0, duration: 0.9, stagger: 0.18, ease: 'power3.out' });

            if (descripcion) {
              entradaTexto.from(descripcion, { y: 16, opacity: 0, duration: 0.8, ease: 'power3.out' }, '-=0.5');
            }
          }

          /* Etiqueta: pequeño rebote, como una pegatina */
          if (etiqueta) {
            gsap.fromTo(etiqueta,
              { y: 18, rotation: -10, scale: 0.85, opacity: 0 },
              {
                y: 0, rotation: -4, scale: 1, opacity: 1,
                duration: 0.85, ease: 'back.out(1.3)',
                scrollTrigger: { trigger: etiqueta, start: 'top 90%', once: true }
              }
            );
          }

          /* TRES PUNTOS: ENTRADA EN ESCALERA */
          if (puntos.length) {
            gsap.from(puntos, {
              y: 30, opacity: 0, duration: 1.1, stagger: 0.4, ease: 'power3.out',
              scrollTrigger: { trigger: puntos[0].parentElement, start: 'top 85%', once: true }
            });
          }

          if (enlace) {
            gsap.from(enlace, {
              y: 12, opacity: 0, duration: 0.7, ease: 'power3.out',
              scrollTrigger: { trigger: enlace, start: 'top 95%', once: true }
            });
          }
        }

        /* REDES SOCIALES — ENTRADA
           La entrada anima opacidad; el CSS controla inclinación, relieve e iconos. */
        const socialButtons = gsap.utils.toArray('#visita .social-brutal');
        if (socialButtons.length) {
          gsap.from(socialButtons, {
            opacity: 0, duration: .7, stagger: .13, ease: 'power2.out',
            scrollTrigger: { trigger: '#visita .social-buttons', start: 'top 88%', once: true }
          });
        }

        /* ENTRADA CINEMATOGRÁFICA DE LOS VIDEOS */
        if (storiesCarousel && storyCards.length) {
          const storiesSection = $('.stories-section');

          const reveal = gsap.timeline({
            scrollTrigger: { trigger: storiesSection, start: 'top 73%', once: true },
            defaults: { ease: 'power4.out' },
            onComplete() { storiesCarousel.classList.add('stories-ready'); }
          });

          /* TÍTULO PEQUEÑO */
          reveal.from('.stories-heading .eyebrow', { y: 30, opacity: 0, duration: .7 });

          /* TÍTULO GRANDE */
          reveal.from('.stories-heading h2', {
            y: 100, opacity: 0, rotationX: 24, scale: .92,
            transformPerspective: 1000, transformOrigin: '50% 100%', duration: 1.15
          }, '-=.4');

          /* DESCRIPCIÓN */
          reveal.from('.stories-heading > p', { y: 40, opacity: 0, duration: .8 }, '-=.75');

          /* VIDEO CENTRAL */
          reveal.from('.story-card.is-active .story-video', {
            y: 220, scale: .48, rotationX: 28, opacity: 0, filter: 'blur(22px)',
            transformPerspective: 1300, transformOrigin: '50% 100%',
            duration: 1.35, ease: 'expo.out'
          }, '-=.25');

          /* VIDEO IZQUIERDO */
          reveal.from('.story-card.is-prev .story-video', {
            x: 230, y: 120, scale: .55, rotationY: -35, rotationZ: -10,
            opacity: 0, filter: 'blur(22px)', transformPerspective: 1300,
            duration: 1.25, ease: 'expo.out'
          }, '-=.95');

          /* VIDEO DERECHO */
          reveal.from('.story-card.is-next .story-video', {
            x: -230, y: 120, scale: .55, rotationY: 35, rotationZ: 10,
            opacity: 0, filter: 'blur(22px)', transformPerspective: 1300,
            duration: 1.25, ease: 'expo.out'
          }, '<');

          /* TEXTOS */
          reveal.from('.story-copy > *', {
            y: 35, opacity: 0, duration: .7, stagger: .07, ease: 'power3.out'
          }, '-=.55');

          /* NÚMEROS */
          reveal.from('.story-number', {
            scale: .2, rotation: -20, opacity: 0, duration: .65, stagger: .1, ease: 'back.out(2.3)'
          }, '-=.55');

          /* BOTONES DE SONIDO */
          reveal.from('.story-sound', {
            scale: 0, opacity: 0, duration: .55, stagger: .1, ease: 'back.out(2.5)'
          }, '-=.55');

          /* FLECHAS */
          reveal.from('.stories-arrow', {
            scale: .25, opacity: 0, duration: .6, stagger: .15, ease: 'back.out(2.4)'
          }, '-=.3');

          /* DOTS */
          reveal.from('.stories-bottom', { y: 25, opacity: 0, duration: .7 }, '-=.4');
        }

        gsap.utils.toArray('.program-photo img').forEach(img => {
          gsap.fromTo(img,
            { yPercent: -4, scale: 1.13 },
            {
              yPercent: 4, scale: 1.13, ease: 'none',
              scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: .5 }
            }
          );
        });

        const xTo = gsap.quickTo('.hero-photo', 'x', { duration: .65, ease: 'power3.out' });
        const rotateTo = gsap.quickTo('.hero-photo', 'rotation', { duration: .8, ease: 'power3.out' });
        pointerHandler = e => {
          if (!fine.matches || disabled()) return;
          const r = hero.getBoundingClientRect();
          const x = Math.max(-.5, Math.min(.5, (e.clientX - r.left) / r.width - .5));
          xTo(x * 28); rotateTo(3 + x * 4);
        };
        pointerLeave = () => { xTo(0); rotateTo(3); };
        hero?.addEventListener('pointermove', pointerHandler, { passive: true });
        hero?.addEventListener('pointerleave', pointerLeave);

        if (large && window.Lenis) {
          lenis = new Lenis({
            lerp: .1, smoothWheel: true, syncTouch: false,
            anchors: { offset: -100 },
            prevent: node => Boolean(node.closest('dialog, select, textarea'))
          });
          lenis.on('scroll', ScrollTrigger.update);
          ticker = time => lenis?.raf(time * 1000);
          gsap.ticker.add(ticker);
          if (dialog?.open) lenis.stop();
        }

        return () => {
          hero?.removeEventListener('pointermove', pointerHandler);
          hero?.removeEventListener('pointerleave', pointerLeave);
          if (ticker) gsap.ticker.remove(ticker);
          ticker = null; lenis?.destroy(); lenis = null;
        };
      });

      startFly();
      updateStories(storyIndex, false);
      startStoryAutoplay();
      refresh();
    }

    motionButton?.addEventListener('click', () => { paused = !paused; setupMotion(); });
    reduce.addEventListener('change', setupMotion);
    desktop.addEventListener('change', syncWindows);
    fine.addEventListener('change', syncWindows);

    // Scroll nativo como respaldo si no se cargan las bibliotecas.
    let raf = 0;
    function schedule() { if (!raf) raf = requestAnimationFrame(update); }
    function update() {
      raf = 0;
      const distance = root.scrollHeight - innerHeight;
      if ($('.progress')) $('.progress').style.transform = `scaleX(${distance > 0 ? Math.max(0, Math.min(1, scrollY / distance)) : 0})`;
      if (!canGSAP && hero) {
        const r = hero.getBoundingClientRect();
        const p = disabled() ? 0 : Math.max(0, Math.min(1, -r.top / r.height));
        const amount = desktop.matches ? 70 : 25;
        if ($('.main-scroll')) $('.main-scroll').style.transform = `translateY(${p * amount}px)`;
        if ($('.mini-scroll')) $('.mini-scroll').style.transform = `translateY(${-p * amount}px)`;
        if ($('.brand-scroll')) $('.brand-scroll').style.transform = `translateY(${-p * amount * .5}px)`;
      }
      $$('#navigation a[href^="#"]:not(.button)').forEach(link => {
        const section = $(link.getAttribute('href')); if (!section) return;
        const r = section.getBoundingClientRect();
        if (r.top <= 180 && r.bottom > 180) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }

    function refresh() {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { if (canGSAP) ScrollTrigger.refresh(); lenis?.resize(); schedule(); }, 80);
    }

    $$('details').forEach(detail => detail.addEventListener('toggle', refresh));
    $$('img').forEach(img => {
      const failed = () => {
        if (img.id === 'gallery-image') return;
        const frame = img.closest('figure') || img.parentElement;
        frame.classList.add('media-unavailable');
        frame.dataset.imageLabel = img.alt || 'Buen Nacer';
        refresh();
      };
      img.addEventListener('load', refresh); img.addEventListener('error', failed);
      if (img.complete && img.getAttribute('src') && !img.naturalWidth) failed();
    });

    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', refresh, { passive: true });
    addEventListener('load', refresh);
    document.fonts?.ready.then(refresh);
    setupMotion(); schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();


/* ══════════════════════════════════════════════════════════
   VIDEO AMPLIADO CON SONIDO
   ══════════════════════════════════════════════════════════ */
(function () {
  const dlg   = document.getElementById('story-dialog');
  const video = document.getElementById('story-dialog-video');
  const btnS  = document.getElementById('story-dialog-sound');
  const btnX  = document.getElementById('story-dialog-close');
  if (!dlg || !video) return;

  let paused = [];

  function icon() {
    if (!btnS) return;
    btnS.textContent = video.muted ? '🔇' : '🔊';
    btnS.setAttribute('aria-label', video.muted ? 'Activar sonido' : 'Silenciar');
  }

  function open(card) {
    const src = card.querySelector('video');
    if (!src) return;

    // pausa los videos del carrusel
    paused = [...document.querySelectorAll('.story-card video')];
    paused.forEach(v => v.pause());

    video.src    = src.currentSrc || src.src;
    video.poster = src.poster || '';
    video.muted  = false;
    video.currentTime = src.currentTime || 0;

    dlg.showModal();
    document.body.classList.add('modal-open');

    video.play().catch(() => {          // si el navegador bloquea el audio
      video.muted = true; icon(); video.play().catch(() => {});
    });
    icon();
  }

  function close() {
    video.pause();
    video.removeAttribute('src');
    video.load();
    document.body.classList.remove('modal-open');
    const motionOff = document.documentElement.classList.contains('motion-off');
    paused.forEach(v => {
      if (!motionOff && !document.hidden && v.closest('.story-card.is-active')) v.play().catch(() => {});
    });
  }

  // abrir: clic en la tarjeta activa o en su botón de sonido
  document.addEventListener('click', e => {
    const card = e.target.closest('.story-card');
    if (!card) return;
    if (!card.classList.contains('is-active') && !e.target.closest('.story-sound')) return;
    e.preventDefault();
    e.stopPropagation();
    open(card);
  }, true);

  btnS?.addEventListener('click', () => { video.muted = !video.muted; icon(); });
  btnX?.addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', close);

  // clic fuera del video cierra
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
})();


/* ══════════════════════════════════════════════════════════
   CARRUSEL DE PORTADA — MOTOR ÚNICO
   Antes había dos scripts sobre el mismo .bn-cover, cada uno
   con su propia bandera (giroInicializado / giroListo), así
   que los dos arrancaban y se peleaban el transform en cada
   fotograma. Este es el único que debe existir.
   ══════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  function iniciarPortada() {
    document.querySelectorAll('.bn-cover').forEach((carrusel) => {
      if (carrusel.dataset.giroInicializado) return;

      const escenario = carrusel.querySelector('.bn-cover-stage');
      const tarjetas = Array.from(carrusel.querySelectorAll('.bn-cover-card'));

      if (!escenario || tarjetas.length < 2) return;

      carrusel.dataset.giroInicializado = 'true';
      carrusel.classList.add('bn-cover-ready');

      const reducido = window.matchMedia('(prefers-reduced-motion: reduce)');

      const SEGUNDOS_POR_VUELTA = 10;
      const vuelta = Math.PI * 2;
      const paso = vuelta / tarjetas.length;

      let angulo = 0;
      let radio = 0;
      let visible = false;
      let frame = 0;
      let tiempoAnterior = null;
      let toque = null;
      let frontalAnterior = null;
      let puente = null;

      function sinMovimiento() {
        return (
          reducido.matches ||
          document.documentElement.classList.contains('motion-off')
        );
      }

      function eliminarPuente() {
        if (!puente) return;
        puente.animacion.cancel();
        puente.elemento.remove();
        puente = null;
      }

      function medir() {
        const mitad = tarjetas[0].offsetWidth / 2;

        const espacio = Math.max(
          0,
          escenario.clientWidth / 2 - 18 - mitad * 0.81
        );

        radio = Math.sqrt(
          Math.max(0, espacio * espacio - Math.pow(mitad * 0.19, 2))
        );

        dibujar(false);
      }

      function dibujar(suavizar = true) {
        let frontal = null;
        let mayorProfundidad = -Infinity;

        tarjetas.forEach((tarjeta, indice) => {
          const posicion = angulo + indice * paso;
          const profundidad = Math.cos(posicion);
          const lateral = Math.sin(posicion);

          const escala = 0.81 + profundidad * 0.19;
          const x = lateral * radio;
          const y = profundidad * 14;
          const inclinacion = lateral * -6;

          tarjeta.style.transform = `
            translate(-50%, -50%)
            translate(${x}px, ${y}px)
            scale(${escala})
            rotateY(${inclinacion}deg)
          `;

          tarjeta.style.opacity = '1';
          tarjeta.style.zIndex = String(Math.round((profundidad + 1) * 100));
          tarjeta.style.pointerEvents = 'auto';
          tarjeta.tabIndex = 0;
          tarjeta.removeAttribute('aria-hidden');

          if (profundidad > mayorProfundidad) {
            mayorProfundidad = profundidad;
            frontal = tarjeta;
          }
        });

        /*
         * Suaviza el cambio de la tarjeta delantera.
         * La copia se crea solamente cuando cambia,
         * no en cada fotograma.
         */
        if (suavizar && frontalAnterior && frontal !== frontalAnterior && !sinMovimiento()) {
          eliminarPuente();

          const original = frontalAnterior;
          const copia = original.cloneNode(true);

          copia.removeAttribute('id');
          copia.removeAttribute('aria-current');
          copia.setAttribute('aria-hidden', 'true');
          copia.tabIndex = -1;
          copia.disabled = true;

          copia.style.zIndex = '500';
          copia.style.pointerEvents = 'none';

          escenario.appendChild(copia);

          const animacion = copia.animate(
            [{ opacity: 1 }, { opacity: 0 }],
            { duration: 650, easing: 'ease-in-out', fill: 'forwards' }
          );

          puente = { original, elemento: copia, animacion };

          animacion.onfinish = () => {
            copia.remove();
            if (puente?.elemento === copia) puente = null;
          };
        }

        if (puente) {
          puente.elemento.style.transform = puente.original.style.transform;
        }

        frontalAnterior = frontal;
      }

      function puedeGirar() {
        return (
          visible &&
          !document.hidden &&
          !sinMovimiento() &&
          !toque &&
          !carrusel.contains(document.activeElement)
        );
      }

      function detener() {
        cancelAnimationFrame(frame);
        frame = 0;
        tiempoAnterior = null;
      }

      function animar(tiempo) {
        frame = 0;

        if (!puedeGirar()) {
          tiempoAnterior = null;
          return;
        }

        if (tiempoAnterior !== null) {
          const segundos = Math.min((tiempo - tiempoAnterior) / 1000, 0.05);
          angulo = (angulo + segundos * vuelta / SEGUNDOS_POR_VUELTA) % vuelta;
        }

        tiempoAnterior = tiempo;
        dibujar();
        frame = requestAnimationFrame(animar);
      }

      function actualizarMovimiento() {
        if (sinMovimiento()) eliminarPuente();

        if (!puedeGirar()) {
          detener();
        } else if (!frame) {
          tiempoAnterior = null;
          frame = requestAnimationFrame(animar);
        }
      }

      /* Arrastrar horizontalmente en celular */
      escenario.addEventListener('touchstart', (evento) => {
        const punto = evento.changedTouches[0];
        toque = { x: punto.clientX, y: punto.clientY, angulo };
        eliminarPuente();
        detener();
      }, { passive: true });

      escenario.addEventListener('touchmove', (evento) => {
        if (!toque) return;

        const punto = evento.changedTouches[0];
        const dx = punto.clientX - toque.x;
        const dy = punto.clientY - toque.y;

        if (Math.abs(dx) > Math.abs(dy)) {
          angulo = toque.angulo + dx * 0.009;
          dibujar();
        }
      }, { passive: true });

      function terminarToque() {
        toque = null;
        actualizarMovimiento();
      }

      escenario.addEventListener('touchend', terminarToque, { passive: true });
      escenario.addEventListener('touchcancel', terminarToque, { passive: true });

      /* El mouse no detiene el giro ni provoca saltos */
      tarjetas.forEach((tarjeta) => {
        tarjeta.addEventListener('pointerdown', (evento) => {
          if (evento.pointerType === 'mouse') evento.preventDefault();
        });

        tarjeta.addEventListener('click', (evento) => {
          if (evento.detail > 0) {
            tarjeta.blur();
            actualizarMovimiento();
          }
        });
      });

      /* Pausa para navegar con teclado */
      carrusel.addEventListener('focusin', detener);
      carrusel.addEventListener('focusout', () => { setTimeout(actualizarMovimiento, 0); });

      carrusel.addEventListener('keydown', (evento) => {
        if (evento.key !== 'ArrowRight' && evento.key !== 'ArrowLeft') return;

        evento.preventDefault();
        eliminarPuente();

        const indice = tarjetas.indexOf(document.activeElement);
        const direccion = evento.key === 'ArrowRight' ? 1 : -1;
        const siguiente = (Math.max(0, indice) + direccion + tarjetas.length) % tarjetas.length;

        angulo = -siguiente * paso;
        dibujar(false);
        tarjetas[siguiente].focus({ preventScroll: true });
      });

      /* Ajustar al tamaño de pantalla */
      if ('ResizeObserver' in window) {
        new ResizeObserver(medir).observe(escenario);
      } else {
        window.addEventListener('resize', medir);
      }

      /* No animar fuera de pantalla */
      if ('IntersectionObserver' in window) {
        new IntersectionObserver((entradas) => {
          visible = entradas[0].isIntersecting;
          actualizarMovimiento();
        }, { threshold: 0.15 }).observe(carrusel);
      } else {
        visible = true;
      }

      document.addEventListener('visibilitychange', actualizarMovimiento);
      reducido.addEventListener('change', actualizarMovimiento);

      new MutationObserver(actualizarMovimiento).observe(
        document.documentElement,
        { attributes: true, attributeFilter: ['class'] }
      );

      medir();
      actualizarMovimiento();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarPortada, { once: true });
  } else {
    iniciarPortada();
  }
})();
/* Solicitud de cita: programa definido por la tarjeta elegida. */
(() => {
  function iniciarCitas() {
    const dialog = document.getElementById('bn-booking');
    const form = document.getElementById('bn-book-form');
    if (!dialog || !form || dialog.dataset.ready) return;
    dialog.dataset.ready = 'true';
    const dates = document.getElementById('bn-book-dates');
    const status = document.getElementById('bn-book-status');
    const fallback = document.getElementById('bn-book-fallback');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let program = '', origin = null, dayKey = '', closeTimer;
    const dateFormat = new Intl.DateTimeFormat('es-PE', {
      timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long'
    });
    function upcomingDates(now = new Date()) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(now);
      const part = name => Number(parts.find(item => item.type === name).value);
      const today = Date.UTC(part('year'), part('month') - 1, part('day'));
      return [1, 2].map(offset => {
        const date = new Date(today + offset * 86400000);
        return { value: date.toISOString().slice(0, 10), label: dateFormat.format(date) };
      });
    }
    function renderDates() {
      const options = upcomingDates();
      dayKey = options[0].value;
      dates.replaceChildren();
      options.forEach((option, index) => {
        const label = document.createElement('label');
        const radio = document.createElement('input');
        radio.type = 'radio'; radio.name = 'fecha'; radio.value = option.value; radio.required = true;
        const span = document.createElement('span');
        const title = document.createElement('strong');
        title.textContent = index ? 'Pasado mañana' : 'Mañana';
        const caption = document.createElement('small'); caption.textContent = option.label;
        span.append(title, caption); label.append(radio, span); dates.append(label);
      });
      document.getElementById('bn-book-deadline').textContent =
        `Puedes solicitar una cita para mañana o pasado mañana. Este plazo de 2 días llega hasta el ${options[1].label}. Sujeto a disponibilidad.`;
    }
    function close() {
      if (!dialog.open || dialog.classList.contains('bn-book-closing')) return;
      dialog.classList.add('bn-book-closing');
      closeTimer = setTimeout(() => dialog.close(), reduced.matches ? 0 : 180);
    }
    document.querySelectorAll('[data-book-program]').forEach(button => {
      button.addEventListener('click', () => {
        if (dialog.open) return;
        origin = button; program = button.dataset.bookProgram;
        clearTimeout(closeTimer); dialog.classList.remove('bn-book-closing');
        form.reset(); status.textContent = ''; fallback.hidden = true; fallback.removeAttribute('href');
        document.getElementById('bn-book-program').textContent = program;
        renderDates(); dialog.showModal(); document.body.classList.add('bn-book-open');
        // El cursor de las tarjetas no debe aparecer sobre el formulario.
        document.documentElement.classList.remove('bn-cursor-on');
        form.elements.nombre.focus({ preventScroll: true });
      });
    });
    dialog.querySelector('.bn-book-close').addEventListener('click', close);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close();
    });
    dialog.addEventListener('close', () => {
      clearTimeout(closeTimer); dialog.classList.remove('bn-book-closing');
      document.body.classList.remove('bn-book-open');
      origin?.closest('.program')?.focus({ preventScroll: true });
      origin?.focus({ preventScroll: true });
    });
    form.querySelectorAll('input:not([type=radio])').forEach(input => {
      input.addEventListener('input', () => input.setCustomValidity(''));
    });
    form.addEventListener('change', () => {
      fallback.hidden = true; status.textContent = '';
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const options = upcomingDates();
      if (dayKey !== options[0].value) {
        renderDates(); status.textContent = 'Cambió el día. Elige nuevamente una de las fechas disponibles.';
        dates.querySelector('input').focus(); return;
      }
      for (const name of ['nombre', 'apellido']) {
        const input = form.elements[name];
        input.setCustomValidity(input.value.trim() ? '' : 'Completa este campo.');
      }
      if (!form.reportValidity()) return;
      const data = new FormData(form);
      const date = options.find(option => option.value === data.get('fecha'));
      if (!date || !program) return;
      const message = `Hola, Buen Nacer. Soy ${data.get('nombre').trim()} ${data.get('apellido').trim()}. Quisiera solicitar una reunión informativa sobre ${program}.\nModalidad: ${data.get('modalidad')}.\nFecha solicitada: ${date.label}.\n¿Podrían confirmar disponibilidad y horario? Gracias.`;
      const url = `https://wa.me/51966321996?text=${encodeURIComponent(message)}`;
      fallback.href = url; fallback.hidden = false;
      status.textContent = 'Solicitud preparada. Envíala en WhatsApp para que el equipo confirme tu cita.';
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciarCitas, { once: true });
  else iniciarCitas();
})();
