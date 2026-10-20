// ==UserScript==
// @name         CatWar: быстрое выделение предметов для смешивания
// @namespace    catwar-mix-select
// @version      1.0.1
// @description  Кнопки «Выбрать всё»/«Снять» у рта и Ctrl+клик (⌘ на Mac) по предмету — выделить все предметы этого типа для смешивания, без клика по каждому.
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
 * v1.0.1 — фикс «улетания» UI смешивания:
 *   - панель больше НЕ вставляется внутрь Vue-контейнера #tr_mouth > td
 *     (чужой узел между v-if-нодами #mix/#item_multi ломал патчинг Vue
 *     при входе/выходе из режима смешивания); теперь она в body,
 *     position:fixed, позиция трекается по #tr_mouth (паттерн mouth-tools);
 *   - выделение только через игровые методы: item.showActions(it, true) и
 *     item.hideActions() — без прямой записи isActive (не остаётся
 *     полусостояний у меню #thdey).
 *
 * Игра: выделение для смешивания — Vue-флаг isActive у предмета
 * (vm.item.list[i].isActive), кнопка «Смешать» в режиме смешивания вызывает
 * item.mix() → нативный confirm("Смешать?"). Скрипт сам mix() не вызывает.
 * Заблокированные предметы не выделяются, коты во рту (.catrot) игнорируются.
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

  function select(filter) {
    var item = getItemModule();
    if (!item) return;
    ensureMixMode(item); // enableMixMode() внутри сам сбросит выделение
    item.list.forEach(function (it) {
      if (mixable(it) && !it.isActive && filter(it)) {
        try { item.showActions(it, true); }
        catch (e) { it.isActive = true; } // запасной путь
      }
    });
  }

  function selectAll() {
    select(function () { return true; });
  }

  function selectType(type) {
    select(function (it) { return it.type === type; });
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

    bar.appendChild(makeBtn('✚ Выбрать всё',
      'Войти в режим смешивания и выделить все предметы',
      selectAll));

    bar.appendChild(makeBtn('✖ Снять',
      'Снять выделение со всех предметов',
      clearSelection));

    var hint = document.createElement('span');
    hint.style.cssText = 'font-size:10px;opacity:.55;margin:0 4px;white-space:nowrap;';
    hint.textContent = 'Ctrl+клик (⌘ на Mac) по предмету — выбрать все этого типа';
    bar.appendChild(hint);
    return bar;
  }

  function positionBar(bar) {
    var td = document.querySelector('#tr_mouth > td');
    if (!td || !td.isConnected) return;
    var r = td.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return; // панель рта скрыта
    bar.style.left = r.left + 'px';
    bar.style.top = (r.bottom + 4) + 'px';
  }

  function mountBar() {
    var bar = document.getElementById(BAR_ID);
    if (!bar) {
      bar = buildBar();
      document.body.appendChild(bar);
    } else if (!bar.isConnected) {
      document.body.appendChild(bar);
    }
    positionBar(bar);
  }

  // ------------------------------------------- Ctrl+клик: все этого типа

  document.addEventListener('click', function (e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    var el = e.target && e.target.closest ? e.target.closest('.itemInMouth') : null;
    if (!el) return;
    var item = getItemModule();
    if (!item) return;
    var id = Number(el.id);
    var src = item.list.find(function (it) { return it.id === id; });
    if (!src) return; // не предмет (или DOM устарел) — не мешаем игре
    // перехватываем клик ДО обработчика Vue, чтобы игра не тогглила сам предмет
    e.preventDefault();
    e.stopPropagation();
    selectType(src.type);
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
