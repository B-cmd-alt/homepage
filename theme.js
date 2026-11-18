/* The reader's choices, applied before the first paint: loaded in <head> on every page.
   Theme: follows the browser until the reader picks Light or Dark; the choice is remembered.
   Language (cooking pages only, marked by data-lang on <html>): English unless the reader has chosen Chinese. */
(function () {
  'use strict';
  var root = document.documentElement;
  var media = window.matchMedia('(prefers-color-scheme: dark)');
  var bilingual = root.hasAttribute('data-lang');

  function saved(key, values) {
    try { var v = localStorage.getItem(key); return values.indexOf(v) < 0 ? null : v; } catch (e) { return null; }
  }

  var theme = saved('theme', ['light', 'dark']);
  if (theme) root.setAttribute('data-theme', theme);

  if (bilingual) {
    var lang = saved('lang', ['zh']) || 'en';
    root.setAttribute('data-lang', lang);
    root.lang = lang === 'zh' ? 'zh-Hans' : 'en';
    root.classList.add('js');   // cooking.css shows its switches only when scripts run
  }

  // The switch at the top right. A cooking page's language switch, written in its markup, joins it there.
  function build() {
    var names = { light: ['Light', '浅色'], dark: ['Dark', '深色'] };
    var buttons = {};

    var group = document.createElement('div');
    group.className = 'switch';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', root.getAttribute('data-lang') === 'zh' ? '主题' : 'Theme');
    if (bilingual) { group.setAttribute('data-en', 'Theme'); group.setAttribute('data-zh', '主题'); }

    function mark() {
      var now = root.getAttribute('data-theme') || (media.matches ? 'dark' : 'light');
      buttons.light.setAttribute('aria-pressed', String(now === 'light'));
      buttons.dark.setAttribute('aria-pressed', String(now === 'dark'));
    }

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
    mark();
    media.addEventListener('change', mark);

    var corner = document.createElement('div');
    corner.className = 'corner';
    corner.appendChild(group);
    var language = document.querySelector('.switch');   // the theme switch is not in the page yet, so this is the language one
    if (language) corner.appendChild(language);
    document.body.insertBefore(corner, document.body.firstChild);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
