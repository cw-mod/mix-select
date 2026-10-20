// ==UserScript==
// @name         CatWar: быстрое выделение предметов для смешивания
// @namespace    catwar-mix-select
// @version      1.0.0
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
 * Как работает игра: выделение для смешивания — это Vue-флаг isActive у каждого
 * предмета (vm.item.list[i].isActive), в DOM он отражается классом .active_thing.
 * Само смешивание (vm.item.mix) читает isActive из состояния, поэтому скрипт
 * меняет состояние напрямую, а DOM Vue обновляет сам. Античит (isTrusted) на
 * предметы/смешивание не распространяется (только на боевые действия).
 *
 * Скрипт НЕ жмёт «Смешать» за игрока: после выделения игрок сам подтверждает
 * игровой кнопкой. Заблокированные предметы (is_locked) не выделяются.
 */

(function () {
  'use strict';

  var BAR_ID = 'cwb-mixsel-bar';
  var MOUNT_MS = 2000; // период проверки, что панель на месте (ре-рендеры/компакт)

  // ------------------------------------------------------------ Vue доступ

  function getItemModule() {
    var app = document.querySelector('#app');
    var vm = app && app.__vue__;
    return vm && vm.item && Array.isArray(vm.item.list) ? vm.item : null;
  }

  // ------------------------------------------------------------ выделение

  function mixable(it) {
    // коты во рту — не в item.list, а заблокированные предметы смешивать нельзя
    return it && !it.isLocked;
  }

  function ensureMixMode(item) {
    if (!item.mixMode) {
      try { item.enableMixMode(); }
      catch (e) { item.mixMode = true; } // запасной путь, если метод переименуют
    }
  }

  function selectAll() {
    var item = getItemModule();
    if (!item) return;
    ensureMixMode(item);
    item.list.forEach(function (it) {
      if (mixable(it)) it.isActive = true;
    });
  }

  function selectType(type) {
    var item = getItemModule();
    if (!item) return;
    ensureMixMode(item);
    item.list.forEach(function (it) {
      if (mixable(it) && it.type === type) it.isActive = true;
    });
  }

  function clearSelection() {
    var item = getItemModule();
    if (!item) return;
    item.list.forEach(function (it) { it.isActive = false; });
  }

  // ------------------------------------------------------------ UI панель

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
    bar.style.cssText = 'margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;align-items:center;';

    bar.appendChild(makeBtn('✚ Выбрать всё',
      'Войти в режим смешивания и выделить все предметы',
      selectAll));

    bar.appendChild(makeBtn('✖ Снять',
      'Снять выделение со всех предметов',
      clearSelection));

    var hint = document.createElement('span');
    hint.style.cssText = 'font-size:10px;opacity:.55;margin-left:4px;';
    hint.textContent = 'Ctrl+клик (⌘ на Mac) по предмету — выбрать все этого типа';
    bar.appendChild(hint);
    return bar;
  }

  function mountBar() {
    if (document.getElementById(BAR_ID)) return;
    var td = document.querySelector('#tr_mouth > td');
    if (!td) return; // страница ещё не готова — попробуем на следующем тике
    var mix = td.querySelector('#mix');
    var bar = buildBar();
    if (mix) td.insertBefore(bar, mix.nextSibling); // сразу после блока «Смешивать»
    else td.appendChild(bar);
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
    setInterval(mountBar, MOUNT_MS); // ре-рендер/компакт/нюх — просто вернём панель
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
