/* Theme: follows the browser until the reader picks Light or Dark; the choice is remembered.
   Loaded in <head> on every page so a saved choice applies before the first paint. */
(function () {
  'use strict';
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function saved() {
    try { var t = localStorage.getItem('theme'); return t === 'light' || t === 'dark' ? t : null; } catch (e) { return null; }
  }
  function current() {
    return root.getAttribute('data-theme') || (media && media.matches ? 'dark' : 'light');
  }

  var choice = saved();
  if (choice) root.setAttribute('data-theme', choice);

  function build() {
    var bilingual = root.hasAttribute('data-lang');   // cooking pages carry English and Chinese
    var zh = root.getAttribute('data-lang') === 'zh';
    var names = { light: ['Light', '浅色'], dark: ['Dark', '深色'] };

    var group = document.createElement('div');
    group.className = 'theme-switch';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', zh ? '主题' : 'Theme');
    if (bilingual) { group.setAttribute('data-en', 'Theme'); group.setAttribute('data-zh', '主题'); }

    var buttons = {};
    ['light', 'dark'].forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      if (bilingual) {
        b.innerHTML = '<span lang="en">' + names[t][0] + '</span><span lang="zh">' + names[t][1] + '</span>';
      } else {
        b.textContent = names[t][0];
      }
      b.addEventListener('click', function () {
        root.setAttribute('data-theme', t);
        try { localStorage.setItem('theme', t); } catch (e) { /* private mode */ }
        mark();
      });
      buttons[t] = b;
      group.appendChild(b);
    });

    function mark() {
      var now = current();
      buttons.light.setAttribute('aria-pressed', String(now === 'light'));
      buttons.dark.setAttribute('aria-pressed', String(now === 'dark'));
    }
    mark();
    if (media && media.addEventListener) media.addEventListener('change', mark);

    // One corner holds the theme switch and, on cooking pages, the language switch.
    var corner = document.createElement('div');
    corner.className = 'corner';
    corner.appendChild(group);
    var lang = document.querySelector('.lang-switch');
    if (lang) corner.appendChild(lang);
    document.body.insertBefore(corner, document.body.firstChild);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
