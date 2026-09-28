'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { OPERATORS, createInitialState, reduce } = require('../calculator.js');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');

/** Extrai atributos de uma tag de abertura (sem parser externo). */
function parseAttributes(tag) {
  const attrs = {};
  const re = /([\w-]+)(?:="([^"]*)")?/g;
  let match;
  const body = tag.replace(/^<\w+/, '').replace(/>$/, '');
  while ((match = re.exec(body)) !== null) attrs[match[1]] = match[2] ?? '';
  return attrs;
}

function findElement(id) {
  const match = html.match(new RegExp(`<\\w+[^>]*\\bid="${id}"[^>]*>`));
  return match ? parseAttributes(match[0]) : null;
}

const buttons = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) => ({
  attrs: parseAttributes(m[0].match(/<button\b[^>]*>/)[0]),
  text: m[1].trim(),
}));

const actionOf = ({ attrs }) =>
  attrs['data-value'] !== undefined
    ? { type: attrs['data-action'], value: attrs['data-value'] }
    : { type: attrs['data-action'] };

test('documento HTML5 em pt-BR com viewport', () => {
  assert.match(html, /^<!DOCTYPE html>/i);
  assert.match(html, /<html[^>]*\blang="pt-BR"/);
  assert.match(html, /<meta[^>]*name="viewport"[^>]*width=device-width/);
  assert.match(html, /<main\b/);
});

test('carrega apenas recursos locais (codigo 100% puro)', () => {
  assert.match(html, /<script src="calculator\.js" defer><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="style\.css">/);
  assert.doesNotMatch(html, /(src|href)="(https?:)?\/\//);
  assert.doesNotMatch(css, /@import|url\(\s*["']?(https?:)?\/\//);
  assert.doesNotMatch(html, /type="module"/);
});

test('display duplo: #expression e #current com regiao viva', () => {
  assert.ok(findElement('expression'), '#expression ausente');
  const current = findElement('current');
  assert.ok(current, '#current ausente');
  assert.equal(current['aria-live'], 'polite');
  assert.equal(current.role, 'status');
  assert.ok(html.indexOf('id="expression"') < html.indexOf('id="current"'), 'expressao deve vir acima');
});

test('todos os botoes sao type="button" com aria-label e data-action', () => {
  assert.equal(buttons.length, 20);
  for (const { attrs, text } of buttons) {
    assert.equal(attrs.type, 'button', `botao ${text} sem type="button"`);
    assert.ok(attrs['aria-label'] && attrs['aria-label'].trim(), `botao ${text} sem aria-label`);
    assert.ok(attrs['data-action'], `botao ${text} sem data-action`);
  }
});

test('teclado cobre digitos, ponto, operadores e funcoes do contrato', () => {
  const digits = buttons.filter((b) => b.attrs['data-action'] === 'digit').map((b) => b.attrs['data-value']);
  assert.deepEqual(digits.sort(), ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);

  const ops = buttons.filter((b) => b.attrs['data-action'] === 'operator').map((b) => b.attrs['data-value']);
  assert.deepEqual(ops.sort(), [...OPERATORS].sort());

  const single = ['decimal', 'equals', 'clear', 'delete', 'toggleSign', 'percent'];
  for (const action of single) {
    assert.equal(buttons.filter((b) => b.attrs['data-action'] === action).length, 1, `acao ${action}`);
  }
});

test('aria-labels descritivos exigidos pela task', () => {
  const labels = buttons.map((b) => b.attrs['aria-label']);
  for (const label of ['Somar', 'Subtrair', 'Multiplicar', 'Dividir', 'Limpar tudo',
    'Apagar último dígito', 'Inverter sinal', 'Porcentagem', 'Igual']) {
    assert.ok(labels.includes(label), `aria-label ausente: ${label}`);
  }
  assert.equal(new Set(labels).size, labels.length, 'aria-labels devem ser unicos');
});

test('cada botao gera uma acao aceita pelo reducer', () => {
  const initial = createInitialState();
  const sequence = ['7', '+', '8', '='].map((text) => buttons.find((b) => b.text === text));
  const final = sequence.reduce((state, button) => reduce(state, actionOf(button)), initial);
  assert.equal(final.current, '15');

  for (const button of buttons) {
    const next = reduce({ ...initial, current: '5' }, actionOf(button));
    assert.ok(next && typeof next.current === 'string', `acao invalida: ${button.text}`);
  }
});

test('CSS usa variaveis, Flexbox para centralizar e Grid de 4 colunas', () => {
  assert.match(css, /:root\s*{[^}]*--color-bg:/);
  assert.match(css, /\.app\s*{[^}]*display:\s*flex[^}]*align-items:\s*center[^}]*justify-content:\s*center/);
  assert.match(css, /\.keypad\s*{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(4,/);
});

test('CSS tem estados de interacao e foco visivel', () => {
  assert.match(css, /\.key:hover/);
  assert.match(css, /\.key:active/);
  assert.match(css, /\.key:focus-visible\s*{[^}]*outline:/);
});

test('CSS e responsivo e evita estouro do display', () => {
  assert.match(css, /max-width:\s*var\(--calculator-max-width\)/);
  assert.match(css, /clamp\(/);
  assert.match(css, /\.display__current\s*{[^}]*font-size:\s*var\(--font-size-current\)/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /overflow-x:\s*hidden/);
  assert.doesNotMatch(css, /width:\s*\d{3,}px/, 'larguras fixas em px podem cortar em 320px');
});
