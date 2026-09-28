'use strict';

// Testes complementares do QA: cobrem os criterios de aceite da SPEC-01 que
// nao tinham verificacao direta nas demais suites.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  DIVISION_BY_ZERO_MESSAGE,
  createInitialState,
  calculate,
  formatDisplay,
  reduce,
  keyToAction,
} = require('../calculator.js');

const ROOT = path.join(__dirname, '..');
const REPO = path.join(ROOT, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'calculator.js'), 'utf8');

function press(keys, state = createInitialState()) {
  return keys.reduce((acc, key) => reduce(acc, keyToAction(key)), state);
}

const value = (state) => formatDisplay(state).value;

/* Criterio 1: operacoes aritmeticas calculam com precisao */

test('precisao: casos classicos de ponto flutuante', () => {
  assert.equal(value(press([...'0.3-0.1='])), '0.2');
  assert.equal(value(press([...'1.1*3='])), '3.3');
  assert.equal(value(press([...'0.7+0.1='])), '0.8');
  assert.equal(value(press([...'0.1*3='])), '0.3');
  assert.equal(value(press([...'1.005*1000='])), '1005');
  assert.equal(value(press([...'10/3='])), '3.33333333333333');
});

test('precisao: encadeamento acumulado nao propaga ruido', () => {
  assert.equal(value(press([...'0.1+0.2+0.3='])), '0.6');
  assert.equal(value(press([...'0.1+0.2=+0.3='])), '0.6');
});

test('overflow vira mensagem de erro, nunca Infinity', () => {
  let state = press([...'999999999999999']);
  for (let i = 0; i < 25; i++) state = press([...'*999999999999999='], state);
  assert.doesNotMatch(value(state), /Infinity|NaN/);
  assert.throws(() => calculate(Number.MAX_VALUE, '×', 10));
});

/* Criterio 2: divisao por zero nao gera crash nem Infinity */

test('divisao por zero: 0/0, decimal zero e resultado seguido de operador', () => {
  assert.equal(value(press([...'0/0='])), DIVISION_BY_ZERO_MESSAGE);
  assert.equal(value(press([...'5/0.0='])), DIVISION_BY_ZERO_MESSAGE);
  const err = press([...'5/0=']);
  for (const key of ['+', '%', '=', 'Backspace', 'Escape']) {
    assert.doesNotMatch(value(press([key], err)), /Infinity|NaN/, `apos ${key}`);
  }
  assert.equal(value(reduce(err, { type: 'toggleSign' })), '-0');
});

/* Criterio 3: codigo 100% puro (sem dependencias externas) */

test('nenhuma dependencia externa: sem package com dependencias nem require/import', () => {
  const pkgPath = path.join(REPO, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.equal(Object.keys(pkg.dependencies || {}).length, 0);
  }
  assert.doesNotMatch(js, /\brequire\(|^\s*import\s/m);
  assert.doesNotMatch(html, /<script[^>]*src="(?!calculator\.js")/);
  assert.equal([...html.matchAll(/<script\b/g)].length, 1);
});

/* Criterio 4: navegacao completa por teclado */

test('teclado fisico cobre todos os botoes da UI (exceto +/-)', () => {
  const actions = [...html.matchAll(/<button\b[^>]*>/g)].map((m) => {
    const type = m[0].match(/data-action="([^"]*)"/)[1];
    const v = m[0].match(/data-value="([^"]*)"/);
    return v ? `${type}:${v[1]}` : type;
  });
  const keys = [...'0123456789.+-*/=%', 'Enter', 'Escape', 'Backspace', 'x', 'X', ','];
  const reachable = new Set(keys.map(keyToAction).filter(Boolean)
    .map((a) => (a.value !== undefined ? `${a.type}:${a.value}` : a.type)));
  const missing = actions.filter((a) => !reachable.has(a));
  assert.deepEqual(missing, ['toggleSign']);
});

test('x/X mapeiam para multiplicacao', () => {
  assert.equal(value(press([...'6x7='])), '42');
  assert.equal(value(press([...'6X7='])), '42');
});

test('botoes sao focaveis por Tab (nativos, sem tabindex negativo nem disabled)', () => {
  assert.doesNotMatch(html, /tabindex="-\d+"/);
  assert.doesNotMatch(html, /<button\b[^>]*\bdisabled\b/);
});

/* Criterio 5: motor matematico puro separado da manipulacao de DOM */

test('secao do motor nao referencia document/window/DOM', () => {
  const section = js.slice(0, js.indexOf('Camada de UI'));
  assert.ok(section.length > 0 && section.length < js.length);
  const engine = section.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(engine, /\b(document|window|querySelector|getElementById|addEventListener|textContent)\b/);
});

/* Regressao (QA tentativa 2): textos exponenciais e +/- nunca geram NaN */

test('+/- sobre resultado exponencial: DEL e operacao seguinte seguem validos', () => {
  const tiny = reduce(press([...'0.00001%']), { type: 'toggleSign' });
  assert.equal(value(tiny), '-1e-7');
  assert.equal(value(press(['Backspace'], tiny)), '-1e-7');
  assert.equal(value(press(['Backspace', '+', '1', '='], tiny)), '0.9999999');

  const big = press([...'999999999999999*999999999999999*1000000=']);
  assert.match(value(big), /e\+/);
  const negBig = reduce(big, { type: 'toggleSign' });
  assert.equal(value(negBig), `-${value(big)}`);
  assert.doesNotMatch(value(press(['Backspace', '+', '1', '='], negBig)), /NaN|Infinity/);
});

test('+/- apos operador e apos = produzem operandos validos', () => {
  const waiting = reduce(press([...'5*']), { type: 'toggleSign' });
  assert.equal(value(press([...'3='], waiting)), '-15');
  assert.equal(value(press(['='], waiting)), '0');
  const negFive = reduce(press(['5']), { type: 'toggleSign' });
  assert.equal(value(press(['Backspace'], negFive)), '0');
  const afterEq = reduce(press([...'0.1+0.2=']), { type: 'toggleSign' });
  assert.equal(value(afterEq), '-0.3');
  assert.equal(value(press(['7'], afterEq)), '7');
});

test('operando terminado em ponto e % apos = calculam corretamente', () => {
  assert.equal(value(press([...'0.*3='])), '0');
  assert.equal(value(press([...'2.+1='])), '3');
  assert.equal(value(press([...'50+50=%'])), '1');
});

test('funcoes do motor sao deterministicas e sem efeitos colaterais', () => {
  const state = Object.freeze(createInitialState());
  const a = press([...'12+3='], state);
  const b = press([...'12+3='], state);
  assert.deepEqual(a, b);
  assert.deepEqual(state, createInitialState());
});
