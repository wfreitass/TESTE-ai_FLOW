'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  DIVISION_BY_ZERO_MESSAGE,
  actionFromButton,
  initCalculatorUI,
} = require('../calculator.js');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'calculator.js'), 'utf8');

/* DOM falso minimo (sem dependencias externas), montado a partir do index.html. */

class FakeElement {
  constructor(attrs = {}) {
    this.attrs = { ...attrs };
    this.listeners = {};
    this.children = [];
    this.parent = null;
    this.textContent = '';
    const classes = new Set((attrs.class || '').split(/\s+/).filter(Boolean));
    this.classList = {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    };
  }

  getAttribute(name) {
    return Object.hasOwn(this.attrs, name) ? this.attrs[name] : null;
  }

  setAttribute(name, value) { this.attrs[name] = String(value); }

  removeAttribute(name) { delete this.attrs[name]; }

  hasAttribute(name) { return Object.hasOwn(this.attrs, name); }

  append(child) {
    child.parent = this;
    this.children.push(child);
  }

  contains(node) {
    for (let n = node; n; n = n.parent) if (n === this) return true;
    return false;
  }

  closest(selector) {
    for (let n = this; n; n = n.parent) {
      if (selector === 'button[data-action]' && n.tag === 'button' && n.hasAttribute('data-action')) return n;
    }
    return null;
  }

  querySelectorAll(selector) {
    assert.equal(selector, '[data-action]');
    return this.children.filter((c) => c.hasAttribute('data-action'));
  }

  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }

  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
  }

  dispatch(type, event) {
    for (const fn of this.listeners[type] || []) fn(event);
  }

  set innerHTML(_value) {
    throw new Error('innerHTML nao deve ser usado');
  }
}

function parseAttributes(tag) {
  const attrs = {};
  const re = /([\w-]+)(?:="([^"]*)")?/g;
  const body = tag.replace(/^<\w+/, '').replace(/>$/, '');
  let match;
  while ((match = re.exec(body)) !== null) attrs[match[1]] = match[2] ?? '';
  return attrs;
}

function createDocument() {
  const doc = new FakeElement();
  const expression = new FakeElement({ id: 'expression' });
  const current = new FakeElement({ id: 'current' });
  const keypad = new FakeElement({ class: 'keypad' });
  for (const m of html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)) {
    const button = new FakeElement(parseAttributes(m[0].match(/<button\b[^>]*>/)[0]));
    button.tag = 'button';
    button.textContent = m[1].trim();
    keypad.append(button);
  }
  const byId = { expression, current };
  doc.getElementById = (id) => byId[id] || null;
  doc.querySelector = (sel) => (sel === '.keypad' ? keypad : null);
  return { doc, expression, current, keypad };
}

function keyEvent(key, extra = {}) {
  return {
    key,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
    ...extra,
  };
}

function setup() {
  const dom = createDocument();
  const ui = initCalculatorUI(dom.doc);
  const press = (key, extra) => {
    const event = keyEvent(key, extra);
    dom.doc.dispatch('keydown', event);
    return event;
  };
  const click = (label) => {
    const button = dom.keypad.children.find((b) => b.getAttribute('aria-label') === label);
    assert.ok(button, `botao ${label} existe`);
    dom.keypad.dispatch('click', { target: button });
    return button;
  };
  const type = (keys) => [...keys].forEach((k) => press(k));
  return { ...dom, ui, press, click, type };
}

test('secao de DOM so roda com document (Node carrega o motor sem erro)', () => {
  assert.match(js, /if \(typeof document !== 'undefined'\)/);
  assert.equal(typeof document, 'undefined');
});

test('render inicial mostra 0 e expressao vazia', () => {
  const { current, expression } = setup();
  assert.equal(current.textContent, '0');
  assert.equal(expression.textContent, '');
});

test('initCalculatorUI devolve null se faltar elemento do display', () => {
  const { doc } = createDocument();
  doc.getElementById = () => null;
  assert.equal(initCalculatorUI(doc), null);
});

test('actionFromButton le data-action e data-value', () => {
  const op = new FakeElement({ 'data-action': 'operator', 'data-value': '÷' });
  const clear = new FakeElement({ 'data-action': 'clear' });
  assert.deepEqual(actionFromButton(op), { type: 'operator', value: '÷' });
  assert.deepEqual(actionFromButton(clear), { type: 'clear' });
  assert.equal(actionFromButton(new FakeElement()), null);
});

test('cliques: 7 × 8 = mostra 56 e a expressao completa', () => {
  const { click, current, expression } = setup();
  click('Sete');
  click('Multiplicar');
  assert.equal(expression.textContent, '7 ×');
  click('Oito');
  assert.equal(expression.textContent, '7 × 8');
  click('Igual');
  assert.equal(current.textContent, '56');
  assert.equal(expression.textContent, '7 × 8 =');
});

test('clique fora de um botao e ignorado', () => {
  const { keypad, current, ui } = setup();
  const before = ui.getState();
  keypad.dispatch('click', { target: keypad });
  assert.equal(ui.getState(), before);
  assert.equal(current.textContent, '0');
});

test('cliques em AC, DEL, +/- e %', () => {
  const { click, current } = setup();
  click('Um'); click('Dois'); click('Três');
  click('Apagar último dígito');
  assert.equal(current.textContent, '12');
  click('Inverter sinal');
  assert.equal(current.textContent, '-12');
  click('Porcentagem');
  assert.equal(current.textContent, '-0.12');
  click('Limpar tudo');
  assert.equal(current.textContent, '0');
});

test('teclado: digitos, ponto e precisao (0.1 + 0.2 = 0.3)', () => {
  const { type, press, current } = setup();
  type('0.1+0.2');
  press('Enter');
  assert.equal(current.textContent, '0.3');
});

test('teclado: ponto duplo bloqueado', () => {
  const { type, current } = setup();
  type('1.2.3');
  assert.equal(current.textContent, '1.23');
});

test('teclado: * e / mapeiam para × e ÷; "=" calcula', () => {
  const { type, current, expression } = setup();
  type('9*3/2=');
  assert.equal(current.textContent, '13.5');
  assert.equal(expression.textContent, '27 ÷ 2 =');
});

test('teclado: Escape = AC e Backspace = DEL', () => {
  const { type, press, current, expression } = setup();
  type('45');
  press('Backspace');
  assert.equal(current.textContent, '4');
  type('+1');
  press('Escape');
  assert.equal(current.textContent, '0');
  assert.equal(expression.textContent, '');
});

test('teclas mapeadas chamam preventDefault ("/" e Enter)', () => {
  const { press } = setup();
  assert.equal(press('/').defaultPrevented, true);
  assert.equal(press('Enter').defaultPrevented, true);
  assert.equal(press('Backspace').defaultPrevented, true);
});

test('Enter com botao focado calcula uma unica vez (sem re-disparar o clique)', () => {
  const { type, press, current } = setup();
  type('2+3');
  const event = press('Enter');
  // preventDefault no keydown impede o navegador de gerar o click do botao focado.
  assert.equal(event.defaultPrevented, true);
  assert.equal(current.textContent, '5');
});

test('teclas nao mapeadas e atalhos com modificadores sao ignorados', () => {
  const { press, current } = setup();
  const tab = press('Tab');
  assert.equal(tab.defaultPrevented, false);
  const copy = press('c', { ctrlKey: true });
  assert.equal(copy.defaultPrevented, false);
  const reload = press('5', { metaKey: true });
  assert.equal(reload.defaultPrevented, false);
  assert.equal(current.textContent, '0');
});

test('divisao por zero exibe a mensagem sem Infinity e a UI segue funcionando', () => {
  const { type, press, current, expression } = setup();
  type('5/0');
  press('Enter');
  assert.equal(current.textContent, DIVISION_BY_ZERO_MESSAGE);
  assert.equal(current.hasAttribute('data-error'), true);
  assert.equal(expression.textContent, '5 ÷ 0 =');
  assert.doesNotMatch(current.textContent, /Infinity|NaN/);
  type('7');
  assert.equal(current.textContent, '7');
  assert.equal(current.hasAttribute('data-error'), false);
});

test('feedback visual: tecla fisica marca o botao correspondente temporariamente', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { press, keypad } = setup();
  press('*');
  const multiply = keypad.children.find((b) => b.getAttribute('data-value') === '×');
  assert.equal(multiply.classList.contains('key--pressed'), true);
  t.mock.timers.tick(200);
  assert.equal(multiply.classList.contains('key--pressed'), false);
});

test('regiao aria-live e atualizada via textContent', () => {
  const { type, press, current } = setup();
  assert.match(html, /id="current"[^>]*aria-live="polite"/);
  type('8-3');
  press('Enter');
  assert.equal(current.textContent, '5');
  assert.doesNotMatch(js, /innerHTML/);
});

test('destroy remove os listeners', () => {
  const { ui, press, current } = setup();
  ui.destroy();
  press('9');
  assert.equal(current.textContent, '0');
});

test('CSS define o estado .key--pressed', () => {
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.match(css, /\.key--pressed/);
});
