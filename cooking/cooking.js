/* Cooking pages: language switch, and drawings that play only while on screen. */
(function () {
  'use strict';
  var root = document.documentElement;

  // ── Language. The choice is made in <head> before first paint; this keeps it in sync.
  function setLang(lang, save) {
    root.setAttribute('data-lang', lang);
    root.lang = lang === 'zh' ? 'zh-Hans' : 'en';
    if (save) { try { localStorage.setItem('lang', lang); } catch (e) { /* private mode */ } }
    document.querySelectorAll('[data-set-lang]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-set-lang') === lang));
    });
    // Text that cannot be a visible pair: the tab title and drawing descriptions.
    document.querySelectorAll('[data-en][data-zh]').forEach(function (el) {
      var text = el.getAttribute('data-' + lang);
      if (el.tagName === 'TITLE') document.title = text; else el.setAttribute('aria-label', text);
    });
  }
  document.querySelectorAll('[data-set-lang]').forEach(function (b) {
    b.addEventListener('click', function () { setLang(b.getAttribute('data-set-lang'), true); });
  });
  setLang(root.getAttribute('data-lang') === 'zh' ? 'zh' : 'en', false);

  // ── A drawing starts once about a third of it is on screen, and stops when it leaves.
  var figs = document.querySelectorAll('.fig');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.intersectionRatio >= 0.28) e.target.classList.add('on');
        else if (!e.isIntersecting) e.target.classList.remove('on');
      });
    }, { threshold: [0, 0.3] });
    figs.forEach(function (f) { io.observe(f); });
  } else {
    figs.forEach(function (f) { f.classList.add('on'); });
  }

  // ── One switch to pause or play every drawing on the page.
  var btn = document.getElementById('motion-toggle');
  if (btn) {
    btn.addEventListener('click', function () {
      var still = document.body.classList.toggle('still');
      btn.setAttribute('aria-pressed', String(still));
    });
  }
})();
