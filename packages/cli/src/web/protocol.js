/* aMACI protocol explainer — scroll reveals, i18n, interactive widgets */

(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const I18N = window.PROTOCOL_I18N;

  // Honor reduced-motion for SMIL-driven particle animations (CSS can't reach them)
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    $$('svg').forEach((svg) => {
      if (typeof svg.pauseAnimations === 'function') svg.pauseAnimations();
    });
  }

  // ── i18n ──────────────────────────────────────────────────────────────────

  let lang = localStorage.getItem('maci-proto-lang') || 'en';
  if (!I18N[lang]) lang = 'en';

  const t = (key) => I18N[lang][key] ?? I18N.en[key] ?? key;

  function applyI18n() {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    $$('[data-i18n]').forEach((node) => {
      const value = t(node.dataset.i18n);
      if (typeof value === 'string') node.textContent = value;
    });
    $('#lang-toggle').textContent = lang === 'en' ? '中文' : 'EN';
    // Re-render dynamic widgets whose copy comes from the dictionary
    renderPhase(currentPhase);
    renderCollusion();
    renderAnon();
  }

  $('#lang-toggle').addEventListener('click', () => {
    lang = lang === 'en' ? 'zh' : 'en';
    localStorage.setItem('maci-proto-lang', lang);
    applyI18n();
  });

  // ── Scroll reveal ─────────────────────────────────────────────────────────

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.25 }
  );
  $$('.reveal').forEach((sec) => observer.observe(sec));

  // ── Section 3: add-key animation (play once on view, replayable) ───────────

  const addkeySvg = $('.addkey-svg');
  function playAddkey() {
    if (!addkeySvg) return;
    addkeySvg.classList.remove('play');
    void addkeySvg.getBoundingClientRect(); // force reflow to restart animations
    addkeySvg.classList.add('play');
  }
  if (addkeySvg) {
    const addkeyObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            playAddkey();
            addkeyObserver.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.4 }
    );
    addkeyObserver.observe(addkeySvg);
    $('#addkey-replay').addEventListener('click', playAddkey);
  }

  // ── Section 4: phase stepper ──────────────────────────────────────────────

  const stage = $('.phase-stage');
  const phaseTabs = $$('.phase-tab');
  let currentPhase = 0;
  let autoTimer = null;

  function renderPhase(n) {
    currentPhase = n;
    stage.dataset.phase = String(n);
    phaseTabs.forEach((tab) => {
      tab.classList.toggle('active', Number(tab.dataset.phase) === n);
    });
    $('#phase-desc').textContent = t(`s4.p${n}.desc`);
  }

  function stopAuto() {
    if (autoTimer !== null) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
  }

  phaseTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      stopAuto();
      renderPhase(Number(tab.dataset.phase));
    });
  });

  // Auto-advance once when the stepper scrolls into view; stop at last phase
  // or on any manual interaction.
  const stepperObserver = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting) || autoTimer !== null) return;
      stepperObserver.disconnect();
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) return;
      autoTimer = setInterval(() => {
        if (currentPhase >= 4) {
          stopAuto();
          return;
        }
        renderPhase(currentPhase + 1);
      }, 3200);
    },
    { threshold: 0.5 }
  );
  stepperObserver.observe($('#phase-stepper'));

  // ── Section 5: V1 → V3 acts ───────────────────────────────────────────────

  const actStage = $('.act-stage');
  $$('.act-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.act-tab').forEach((b) => b.classList.toggle('active', b === tab));
      actStage.dataset.act = tab.dataset.act;
    });
  });

  // ── Section 6: collusion explorer ─────────────────────────────────────────

  const roleBoxes = {
    webapp: $('.role-card[data-role="webapp"] input'),
    relay: $('.role-card[data-role="relay"] input'),
    operator: $('.role-card[data-role="operator"] input'),
  };
  const userCoop = $('#user-coop-box');

  function verdictKey(w, r, o) {
    if (w && r && o) return 's6.v.all';
    if (w && r) return 's6.v.webapp_relay';
    if (w && o) return 's6.v.webapp_operator';
    if (r && o) return 's6.v.relay_operator';
    if (w) return 's6.v.webapp';
    if (r) return 's6.v.relay';
    if (o) return 's6.v.operator';
    return 's6.v.none';
  }

  function setLink(n, state, labelKey) {
    const link = $(`.kchain-link[data-link="${n}"]`);
    link.dataset.state = state;
    link.querySelector('.kchain-link-label').textContent = labelKey ? t(labelKey) : '';
  }

  function renderCollusion() {
    const w = roleBoxes.webapp.checked;
    const r = roleBoxes.relay.checked;
    const o = roleBoxes.operator.checked;

    $$('.role-card').forEach((card) => {
      card.classList.toggle('checked', card.querySelector('input').checked);
    });

    // Node knowledge highlighting
    $('.kchain-node[data-node="email"]').dataset.known = w ? 'yes' : 'no';
    $('.kchain-node[data-node="dkey"]').dataset.known = r ? 'partial' : 'no';
    $('.kchain-node[data-node="ki"]').dataset.known = r ? 'partial' : 'no';
    $('.kchain-node[data-node="vote"]').dataset.known = o ? 'yes' : 'no';

    // Link 1: email → deactivated key. Never recorded; timing correlation
    // becomes attemptable only when Web App AND Relay collude.
    if (w && r) setLink(1, 'prob', 's6.link.timing');
    else setLink(1, 'blocked', 's6.link.never');

    // Link 2: deactivated key → K_i. Always severed by the ZK proof.
    setLink(2, 'blocked', 's6.link.zk');

    // Link 3: K_i → vote content. Operator decrypts.
    if (o) setLink(3, 'open', 's6.link.dec');
    else setLink(3, 'unknown', 's6.link.unknown');

    $('#verdict-text').textContent = t(verdictKey(w, r, o));
    $('#verdict-text').dataset.i18n = verdictKey(w, r, o);
    $('#verdict-user').classList.toggle('hidden', !userCoop.checked);
  }

  Object.values(roleBoxes).forEach((box) => box.addEventListener('change', renderCollusion));
  userCoop.addEventListener('change', renderCollusion);

  // ── Section 7: anonymity-set slider ───────────────────────────────────────

  const slider = $('#anon-slider');
  // Marker positions sampled along the rising effective-anonymity curve
  const MARKER_POS = [
    { x: 60, y: 205 },
    { x: 215, y: 182 },
    { x: 370, y: 128 },
    { x: 560, y: 78 },
    { x: 730, y: 62 },
  ];

  function renderAnon() {
    const i = Number(slider.value);
    const pos = MARKER_POS[i];
    const marker = $('#anon-marker');
    marker.setAttribute('cx', pos.x);
    marker.setAttribute('cy', pos.y);
    $('#anon-scenario').textContent = t('s7.scenarios')[i];
    $('#anon-risk').textContent = t('s7.risks')[i];
    $('#anon-config').textContent = t('s7.configs')[i];
    // Risk badge colour shifts with level
    $('#anon-risk').dataset.level = String(i);
  }

  slider.addEventListener('input', renderAnon);

  // ── Init ──────────────────────────────────────────────────────────────────

  applyI18n();
})();
