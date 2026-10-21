// ==UserScript==
// @name         CatWar: быстрое выделение предметов для смешивания
// @namespace    catwar-mix-select
// @version      1.1.0
// @description  Кнопки «Выбрать всё»/«В смешение»/«Снять» у рта и Ctrl+клик по предмету — выделить все предметы этого типа для смешивания, без клика по каждому.
// @author       local
// @match        https://catwar.su/cw3
// @match        https://catwar.su/cw3/
// @match        https://catwar.su/cw3?*
// @match        https://catwar.su/cw3/*
// @match        https://catwar.net/cw3
// @match        https://catwar.net/cw3/
// @match        https://catwar.net/cw3?*
// @match        https://catwar.net/cw3/*
// @updateURL    https://cw-mod.github.io/mix-select/mix-select.meta.js
// @downloadURL  https://cw-mod.github.io/mix-select/mix-select.user.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
 * Быстрое выделение предметов во рту для смешивания.
 *
 * Совместимость с «CatWar: предметы во рту» (mouth-tools, мод с Рецептом):
 *   - Ctrl+клик по предмету отдан mouth-tools (его «галка на весь тип» —
 *     обычный мультивыбор без режима смешивания): наш обработчик при
 *     обнаружении mouth-tools просто пропускает событие;
 *   - после Ctrl+кликов (или ручного выделения) кнопка «В смешение»
 *     входит в режим смешивания, СОХРАНИВ выделение (игра при входе в
 *     режим его сбрасывает — мы возвращаем);
 *   - панель не наезжает на плавающее окно «Рецепт» (#cwb-mt-root).
 *
 * История:
 *   v1.0.1 — панель вынесена из Vue-контейнера #tr_mouth > td (чужой узел
 *     ломал патчинг Vue при переключении режима смешивания).
 *   v1.0.2 — позиция ограничена вьюпортом: прилипает к низу экрана, пока
 *     список рта виден; скрывается, когда рот вне экрана.
 *   v1.1.0 — совместимость с mouth-tools (Ctrl+клик, кнопка-мост
 *     «В смешение», обход окна «Рецепта»).
 *
 * Игра: выделение — Vue-флаг isActive, «Смешать» зовёт нативный confirm().
 * Скрипт сам mix() не вызывает. Заблокированные предметы не выделяются.
 */

(function () {
  'use strict';

  var BAR_ID = 'cwb-mixsel-bar';
  var TRACK_MS = 1000; // трекинг позиции панели (компакт/нюх/ре-рендеры)

  // ------------------------------------------------------------ Vue доступ

  function getItemModule() {
    var app = document.querySelector('#app');
    var vm = app && app.__vue__;
    return vm && vm.item && Array.isArray(vm.item.list) ? vm.item : null;
  }

  // ------------------------------------------- обнаружение mouth-tools

  function mouthToolsActive(el) {
    // mouth-tools помечает предметы атрибутом data-cwb-type и держит
    // в body окно #cwb-mt-root (даже скрытое).
    if (el && el.hasAttribute && el.hasAttribute('data-cwb-type')) return true;
    return !!document.getElementById('cwb-mt-root');
  }

  // ------------------------------------------------------------ выделение
  // Только через игровые методы: showActions(it, true) — toggle с сохранением
  // остальных (как у ванильного selectAll), hideActions() — полный сброс.

  function mixable(it) {
    return it && !it.isLocked;
  }

  function ensureMixMode(item) {
    if (item.mixMode) return;
    try { item.enableMixMode(); }
    catch (e) { item.mixMode = true; } // запасной путь, если метод переименуют
  }

  function markActive(item, it) {
    try { item.showActions(it, true); }
    catch (e) { it.isActive = true; } // запасной путь
  }

  function select(filter) {
    var item = getItemModule();
    if (!item) return;
    ensureMixMode(item); // enableMixMode() внутри сам сбросит выделение
    item.list.forEach(function (it) {
      if (mixable(it) && !it.isActive && filter(it)) markActive(item, it);
    });
  }

  function selectAll() {
    select(function () { return true; });
  }

  // Кнопка-мост: войти в режим смешивания, СОХРАНИВ текущее выделение
  // (после Ctrl+кликов mouth-tools или обычных кликов по предметам).
  function mixSelected() {
    var item = getItemModule();
    if (!item) return;
    if (item.mixMode) return; // уже в режиме — выделение и так живое
    var ids = item.list.filter(function (it) { return it.isActive; })
      .map(function (it) { return it.id; });
    ensureMixMode(item); // сбрасывает выделение…
    item.list.forEach(function (it) {
      if (!it.isActive && ids.indexOf(it.id) !== -1) markActive(item, it);
    });
  }

  function clearSelection() {
    var item = getItemModule();
    if (!item) return;
    try { item.hideActions(); }
    catch (e) {
      item.list.forEach(function (it) { it.isActive = false; });
    }
  }

  // ------------------------------------------------------------ UI панель
  // Панель живёт в body (position:fixed) — НЕ внутри Vue-контейнеров игры.
  // Позиция вычисляется по #tr_mouth и обновляется интервалом + scroll/resize.

  function makeBtn(text, title, fn) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ui-btn ui-btn--tiny'; // игровой класс кнопок — родной вид
    b.textContent = text;
    b.title = title;
    b.style.cursor = 'pointer';
    b.addEventListener('click', fn);
    return b;
  }

  function buildBar() {
    var bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.style.cssText = 'position:fixed;z-index:99999;display:flex;gap:4px;' +
      'flex-wrap:wrap;align-items:center;padding:2px;background:rgba(28,20,12,.92);' +
      'border:1px solid rgba(243,228,200,.25);border-radius:8px;';

    bar.appendChild(makeBtn('✚ Всё',
      'Войти в режим смешивания и выделить все предметы',
      selectAll));

    bar.appendChild(makeBtn('→ В смешение',
      'Войти в режим смешивания, сохранив текущее выделение (например, после Ctrl+кликов)',
      mixSelected));

    bar.appendChild(makeBtn('✖ Снять',
      'Снять выделение со всех предметов',
      clearSelection));

    var hint = document.createElement('span');
    hint.style.cssText = 'font-size:10px;opacity:.55;margin:0 4px;white-space:nowrap;';
    bar.appendChild(hint);
    return bar;
  }

  function updateHint(bar) {
    var hint = bar.lastElementChild;
    if (!hint || hint.tagName !== 'SPAN') return;
    var text;
    if (document.getElementById('cwb-mt-root')) {
      // mouth-tools: Ctrl+клик — его «галка на весь тип» (без смешивания)
      text = 'Ctrl+клик — весь тип, затем «→ В смешение»';
    } else {
      text = 'Ctrl+клик (⌘ на Mac) по предмету — весь тип в смешение';
    }
    if (hint.textContent !== text) hint.textContent = text;
  }

  function rectsOverlap(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function positionBar(bar) {
    var td = document.querySelector('#tr_mouth > td');
    if (!td || !td.isConnected) { bar.style.visibility = 'hidden'; return; }
    var r = td.getBoundingClientRect();
    var vh = window.innerHeight;
    // панель рта не на экране (выше/ниже вьюпорта) — прячем нашу панель
    if (r.width === 0 || r.bottom <= 0 || r.top >= vh) {
      bar.style.visibility = 'hidden';
      return;
    }
    var barH = bar.offsetHeight || 33;
    var top = r.bottom + 4;                 // желаем: сразу под панелью рта
    var maxTop = vh - barH - 8;             // но не ниже низа экрана
    var minTop = Math.max(r.top + 4, 8);    // и не выше начала панели рта
    if (top > maxTop) top = Math.max(maxTop, minTop);
    if (top < minTop) top = minTop;
    // не наезжать на окно «Рецепт» mouth-tools (если оно видно и рядом)
    var mt = document.getElementById('cwb-mt-root');
    if (mt && mt.offsetParent !== null) {
      var m = mt.getBoundingClientRect();
      var barW = bar.offsetWidth || 520;
      var guess = { left: r.left, right: r.left + barW, top: top, bottom: top + barH };
      if (rectsOverlap(guess, m)) top = m.bottom + 8;
    }
    bar.style.left = Math.round(r.left) + 'px';
    bar.style.top = Math.round(top) + 'px';
    bar.style.visibility = 'visible';
  }

  function mountBar() {
    var bar = document.getElementById(BAR_ID);
    if (!bar) {
      bar = buildBar();
      document.body.appendChild(bar);
    } else if (!bar.isConnected) {
      document.body.appendChild(bar);
    }
    updateHint(bar);
    positionBar(bar);
  }

  // ------------------------------------------- Ctrl+клик: все этого типа
  // Если стоит mouth-tools — Ctrl+клик отдан ему (его «галка на весь тип»),
  // наш обработчик пропускает событие. Мост в смешивание — кнопка
  // «→ В смешение».

  document.addEventListener('click', function (e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.shiftKey || e.altKey) return; // Shift/Alt+клик — жаргон mouth-tools
    var el = e.target && e.target.closest ? e.target.closest('.itemInMouth') : null;
    if (!el) return;
    if (mouthToolsActive(el)) return; // Ctrl+клик уже занят mouth-tools
    var item = getItemModule();
    if (!item) return;
    var id = Number(el.id);
    var src = item.list.find(function (it) { return it.id === id; });
    if (!src) return; // не предмет (или DOM устарел) — не мешаем игре
    // перехватываем клик ДО обработчика Vue, чтобы игра не тогглила сам предмет
    e.preventDefault();
    e.stopPropagation();
    select(function (it) { return it.type === src.type; });
  }, true);

  // ------------------------------------------------------------ запуск

  function start() {
    mountBar();
    setInterval(mountBar, TRACK_MS);
    window.addEventListener('scroll', function () {
      var bar = document.getElementById(BAR_ID);
      if (bar) positionBar(bar);
    }, true); // capture: скроллится не window, а внутренние блоки
    window.addEventListener('resize', function () {
      var bar = document.getElementById(BAR_ID);
      if (bar) positionBar(bar);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
