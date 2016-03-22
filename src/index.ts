/// <reference path="../typings/myself.d.ts" />
/// <reference path="../typings/browser.d.ts" />
/// <reference path="../node_modules/typescript/lib/lib.es6.d.ts" />

'use strict';

/**
 * Talkie.js
 */
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/of';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/throttleTime';

import { extend, defaults, toArray, getById, getPageNumberFromHash,
         textAssignOf, styleAssignOf, attributeAssignOf } from './util';
import { click, mousemove, keydown, swipeLeft, swipeRight,
         resize, hashchange } from './control';
import { parse }   from './query';
import { compileMarkdown, extractNote } from './slide';
import Paging     from './paging';
import FullScreen from './fullscreen';
import Responsive from './responsive';
import Pointer    from './pointer';
import Backface   from './backface';

const IDENT_NEXT     = 'next';
const IDENT_PREV     = 'prev';
const IDENT_SCALER   = 'scaler';
const IDENT_CONTROL  = 'control';
const IDENT_PAGE     = 'page';
const IDENT_TOTAL    = 'total';
const IDENT_PROGRESS = 'progress';
const IDENT_POINTER  = 'pointer';
const IDENT_BACKFACE = 'backface';

const SELECTOR_MD = '[type="text/x-markdown"]';

const ATTR_LAYOUT   = 'layout';
const ATTR_BODY_BG  = 'body-bg';
const ATTR_PAGE     = 'page';
const ATTR_NO_TRANS = 'no-transition';

const NORMAL_WIDTH  = 1024;
const NORMAL_HEIGHT = 768;
const WIDE_WIDTH    = 1366;
const WIDE_HEIGHT   = 768;

interface TalkieOptions {
  wide?: boolean;
  control?: boolean;
  pointer?: boolean;
  progress?: boolean;
  backface?: boolean;
  notransition?: boolean;
}

(window as any).Talkie = function main(givenOptions: TalkieOptions = {}) {

  const options = extend(defaults(givenOptions, {
    api          : false,
    wide         : false,
    control      : true,
    pointer      : true,
    progress     : true,
    backface     : true,
    notransition : false
  }), parse(location.search)) as TalkieOptions;

  /**
   * Init slide sizes
   */
  const width  = options.wide ? WIDE_WIDTH : NORMAL_WIDTH;
  const height = options.wide ? WIDE_HEIGHT : NORMAL_HEIGHT;
  (document.querySelector('head') as HTMLElement).insertAdjacentHTML('beforeend', `
    <style>
      [layout],
      #${IDENT_SCALER} {
        width: ${width}px !important;
        height: ${height}px !important;
      }
    </style>`
  );

  /**
   * Init slide sections
   *   1. compile markdowns
   *   2. traverse slides & assign page number
   *   3. extract presenter notes
   */
  const mds = toArray<Element>(document.querySelectorAll(SELECTOR_MD));
  mds.forEach(compileMarkdown);
  const slides = toArray<HTMLElement>(document.querySelectorAll(`[${ATTR_LAYOUT}]`));
  slides.forEach((el, i) => attributeAssignOf(el, ATTR_PAGE)(i + 1));
  const notes  = {};
  slides.map(extractNote).forEach((txt, i) => notes[i + 1] = txt);

  /**
   * Responsive scaling
   */
  document.body.insertAdjacentHTML('beforeend', `
    <div id="${IDENT_SCALER}"></div>
  `);
  const scalerEl = getById(IDENT_SCALER);
  slides.forEach((el) => scalerEl.appendChild(el));

  const responsive = Responsive({
    width  : width,
    height : height,
    target : scalerEl
  });
  resize().subscribe(responsive.scale);

  /**
   * Paging control
   */
  const paging = Paging({
    startPage     : getPageNumberFromHash() || 1,
    endPage       : slides.length,
    slideElements : slides
  });

  keydown('right').throttleTime(100).subscribe(paging.next);
  keydown('left').throttleTime(100).subscribe(paging.prev);

  swipeLeft().subscribe(paging.next);
  swipeRight().subscribe(paging.prev);

  // sync location.hash
  hashchange().map(getPageNumberFromHash).subscribe(paging.move);
  paging.current.subscribe((page) => location.hash = page === 1 ? '/' : '/' + page);

  // sync body background attribute
  paging.changed
    .map((el) => el.getAttribute(ATTR_LAYOUT))
    .subscribe(attributeAssignOf(document.body, ATTR_BODY_BG));

  /**
   * Insert Ui Elements
   */
  if (options.notransition) {
    Observable.of(1)
      .subscribe(attributeAssignOf(document.body, ATTR_NO_TRANS));
  }

  if (options.pointer) {
    document.body.insertAdjacentHTML('beforeend', `<div id="${IDENT_POINTER}"></div>`);
    const {coord, toggle} = Pointer(getById(IDENT_POINTER));
    mousemove().subscribe(coord);
    keydown('b').subscribe(toggle);
  }

  if (options.backface) {
    document.body.insertAdjacentHTML('beforeend', `<div id="${IDENT_BACKFACE}"></div>`);
    const {bgImage, bgFilter} = Backface(getById(IDENT_BACKFACE));
    paging.changed.subscribe((el) => {
      bgImage.next(el);
      bgFilter.next(el);
    });
  }

  if (options.control) {
    document.body.insertAdjacentHTML('beforeend', `
      <div id="${IDENT_CONTROL}">
        <p><span id="${IDENT_PREV}">◀</span>
        Page <span id="${IDENT_PAGE}">0</span> of <span id="${IDENT_TOTAL}">0</span>
        <span id="${IDENT_NEXT}">▶</span></p>
      </div>
    `);

    const nextEl = getById(IDENT_NEXT);
    const prevEl = getById(IDENT_PREV);

    // next button
    click(nextEl).subscribe(paging.next);

    // prev button
    click(prevEl).subscribe(paging.prev);

    // current page
    paging.current.subscribe(textAssignOf(getById(IDENT_PAGE)));

    // total of page
    Observable.of(slides.length).subscribe(textAssignOf(getById(IDENT_TOTAL)));
  }

  if (options.progress) {
    document.body.insertAdjacentHTML('beforeend', `<div id="${IDENT_PROGRESS}"></div>`);

    // progress bar
    paging.percent.subscribe(styleAssignOf(getById(IDENT_PROGRESS), 'width'));
  }

  /**
   * FullScreen
   */
  keydown('f').subscribe(FullScreen(document.documentElement));

  /**
   * export some of control
   *
   * @typedef {Object} TalkieExport
   * @param {Function} key
   * @param {Object.<Number, String>} notes
   * @param {Rx.Observable} changed
   * @param {Rx.Observable} ratio
   * @param {Rx.Subject} next$
   * @param {Rx.Subject} prev$
   * @param {Rx.Subject} jump$
   */
  return {
    key     : keydown,
    notes   : notes,
    changed : paging.changed,
    ratio   : responsive.currentRatio,
    next$   : paging.next,
    prev$   : paging.prev,
    jump$   : paging.move,
  };
}
