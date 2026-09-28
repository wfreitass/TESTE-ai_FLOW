'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DIVISION_BY_ZERO_MESSAGE,
  MAX_INPUT_DIGITS,
  createInitialState,
  roundPrecision,
  calculate,
  formatNumber,
  formatDisplay,
  reduce,
  keyToAction,
} = require('../calculator.js');

/** Aplica uma sequencia de teclas (via keyToAction) a partir do estado inicial. */
function press(keys, state = createInitialState()) {
  return keys.reduce((acc, key) => {
    const action = keyToAction(key);
    assert.ok(action, `tecla sem acao: ${key}`);
    return reduce(acc, action);
  }, state);
}

const value = (state) => formatDisplay(state).value;
const expression = (state) => formatDisplay(state).expression;

test('estado inicial exibe 0 sem expressao', () => {
  const state = createInitialState();
  assert.equal(value(state), '0');
  assert.equal(expression(state), '');
});

test('calculate executa as quatro operacoes', () => {
  assert.equal(calculate(2, '+', 3), 5);
  assert.equal(calculate(2, '-', 3), -1);
  assert.equal(calculate(4, '×', 2.5), 10);
  assert.equal(calculate(9, '÷', 3), 3);
});

test('calculate lanca erro na divisao por zero e em operador invalido', () => {
  assert.throws(() => calculate(5, '÷', 0), { message: DIVISION_BY_ZERO_MESSAGE });
  assert.throws(() => calculate(5, '^', 2));
});

test('roundPrecision elimina erros de ponto flutuante', () => {
  assert.equal(roundPrecision(0.1 + 0.2), 0.3);
  assert.equal(roundPrecision(1.1 * 3), 3.3);
  assert.equal(roundPrecision(-0), 0);
  assert.equal(calculate(0.1, '+', 0.2), 0.3);
  assert.equal(formatNumber(0.1 + 0.2), '0.3');
});

test('aritmetica via reducer: 12 + 7 = 19', () => {
  const state = press(['1', '2', '+', '7', 'Enter']);
  assert.equal(value(state), '19');
  assert.equal(expression(state), '12 + 7 =');
});

test('aritmetica: 0.1 + 0.2 = 0.3', () => {
  assert.equal(value(press(['0', '.', '1', '+', '0', '.', '2', '='])), '0.3');
});

test('aritmetica: subtracao, multiplicacao e divisao', () => {
  assert.equal(value(press(['3', '-', '8', '='])), '-5');
  assert.equal(value(press(['6', '*', '7', '='])), '42');
  assert.equal(value(press(['1', '/', '4', '='])), '0.25');
});

test('divisao por zero exibe mensagem de erro e nunca Infinity/NaN', () => {
  const state = press(['5', '/', '0', 'Enter']);
  assert.equal(value(state), DIVISION_BY_ZERO_MESSAGE);
  assert.equal(value(state), 'Erro: Divisão por 0');
  assert.doesNotMatch(value(state), /Infinity|NaN/);
});

test('divisao por zero em cadeia tambem gera erro', () => {
  const state = press(['5', '/', '0', '+']);
  assert.equal(value(state), DIVISION_BY_ZERO_MESSAGE);
});

test('proxima entrada apos erro reinicia o estado', () => {
  const error = press(['5', '/', '0', '=']);
  const afterDigit = press(['7'], error);
  assert.equal(value(afterDigit), '7');
  assert.equal(expression(afterDigit), '');
  assert.equal(value(press(['2', '+', '3', '='], error)), '5');
  assert.equal(value(press(['Backspace'], error)), '0');
  assert.equal(value(press(['.'], error)), '0.');
});

test('bloqueia ponto duplo no mesmo numero', () => {
  assert.equal(value(press(['1', '.', '2', '.', '3'])), '1.23');
  assert.equal(value(press(['.', '.', '5'])), '0.5');
});

test('ponto e virgula iniciam novo numero com 0.', () => {
  assert.equal(value(press(['5', '+', ','])), '0.');
});

test('DEL remove o ultimo digito e volta para 0', () => {
  assert.equal(value(press(['1', '2', '3', 'Backspace'])), '12');
  assert.equal(value(press(['7', 'Backspace'])), '0');
  assert.equal(value(press(['1', '.', '5', 'Backspace'])), '1.');
  const negative = reduce(press(['7']), { type: 'toggleSign' });
  assert.equal(value(press(['Backspace'], negative)), '0');
});

test('DEL nao altera resultado ja calculado', () => {
  const state = press(['2', '+', '2', '=', 'Backspace']);
  assert.equal(value(state), '4');
});

test('AC limpa tudo', () => {
  const state = press(['9', '+', '1', 'Escape']);
  assert.deepEqual(state, createInitialState());
});

test('+/- inverte o sinal do numero atual', () => {
  let state = press(['5']);
  state = reduce(state, { type: 'toggleSign' });
  assert.equal(value(state), '-5');
  state = reduce(state, { type: 'toggleSign' });
  assert.equal(value(state), '5');
  state = press(['-', '3', '='], reduce(state, { type: 'toggleSign' }));
  assert.equal(value(state), '-8');
});

test('+/- apos operador permite digitar numero negativo', () => {
  let state = press(['4', '*']);
  state = reduce(state, { type: 'toggleSign' });
  state = press(['2', '='], state);
  assert.equal(value(state), '-8');
});

test('% divide o numero atual por 100', () => {
  assert.equal(value(press(['5', '0', '%'])), '0.5');
  assert.equal(value(press(['2', '0', '0', '+', '1', '0', '%', '='])), '200.1');
});

test('resultado de % e concluido: proximo digito inicia novo numero', () => {
  assert.equal(value(press(['5', '0', '%', '7'])), '7');
  assert.equal(value(press(['5', '0', '%', '.', '5'])), '0.5');
  assert.equal(value(press(['2', '+', '5', '0', '%', '3', '='])), '5');
});

test('resultado de % nao e editavel por DEL', () => {
  assert.equal(value(press(['5', '0', '%', 'Backspace'])), '0.5');
});

test('% com resultado em notacao exponencial nunca gera NaN nem valor errado', () => {
  const tiny = press(['0', '.', '0', '0', '0', '0', '1', '%']);
  assert.equal(value(tiny), '1e-7');
  assert.equal(value(press(['Backspace'], tiny)), '1e-7');
  const afterOp = press(['Backspace', '+', '1', '='], tiny);
  assert.equal(value(afterOp), '1.0000001');
  assert.equal(value(press(['7', '5'], tiny)), '75');
  assert.equal(value(press(['+', '0', '='], tiny)), '1e-7');
  assert.ok(!/NaN|Infinity/.test(value(press(['Backspace', '*', '2', '='], tiny))));
});

test('DEL nao edita texto em notacao exponencial', () => {
  const state = { ...createInitialState(), current: '1e-7' };
  assert.equal(value(reduce(state, { type: 'delete' })), '1e-7');
});

test('encadeamento calcula da esquerda para a direita', () => {
  const partial = press(['2', '+', '3', '*']);
  assert.equal(value(partial), '5');
  assert.equal(expression(partial), '5 ×');
  assert.equal(value(press(['4', '='], partial)), '20');
});

test('trocar operador consecutivo substitui o anterior', () => {
  const state = press(['8', '+', '-', '3', '=']);
  assert.equal(value(state), '5');
});

test('resultado pode continuar sendo usado; digito apos = inicia novo numero', () => {
  const result = press(['2', '+', '3', '=']);
  assert.equal(value(press(['*', '2', '='], result)), '10');
  const fresh = press(['9'], result);
  assert.equal(value(fresh), '9');
  assert.equal(expression(fresh), '');
});

test('display duplo mostra expressao pendente e valor atual', () => {
  const state = press(['1', '2', '+', '3']);
  assert.equal(expression(state), '12 + 3');
  assert.equal(value(state), '3');
});

test('zeros a esquerda sao substituidos e ha limite de digitos', () => {
  assert.equal(value(press(['0', '0', '7'])), '7');
  const long = press(Array(MAX_INPUT_DIGITS + 5).fill('9'));
  assert.equal(value(long).length, MAX_INPUT_DIGITS);
});

test('reduce e imutavel', () => {
  const state = createInitialState();
  const snapshot = structuredClone(state);
  Object.freeze(state);
  reduce(state, { type: 'digit', value: '1' });
  reduce(state, { type: 'operator', value: '+' });
  reduce(state, { type: 'equals' });
  assert.deepEqual(state, snapshot);
});

test('reduce ignora acoes invalidas', () => {
  const state = createInitialState();
  assert.equal(reduce(state, { type: 'unknown' }), state);
  assert.equal(reduce(state, { type: 'digit', value: 'a' }), state);
  assert.equal(reduce(state, { type: 'operator', value: '^' }), state);
  assert.equal(reduce(state, null), state);
});

test('keyToAction mapeia as teclas do teclado fisico', () => {
  for (const digit of '0123456789') {
    assert.deepEqual(keyToAction(digit), { type: 'digit', value: digit });
  }
  assert.deepEqual(keyToAction('.'), { type: 'decimal' });
  assert.deepEqual(keyToAction(','), { type: 'decimal' });
  assert.deepEqual(keyToAction('+'), { type: 'operator', value: '+' });
  assert.deepEqual(keyToAction('-'), { type: 'operator', value: '-' });
  assert.deepEqual(keyToAction('*'), { type: 'operator', value: '×' });
  assert.deepEqual(keyToAction('/'), { type: 'operator', value: '÷' });
  assert.deepEqual(keyToAction('Enter'), { type: 'equals' });
  assert.deepEqual(keyToAction('='), { type: 'equals' });
  assert.deepEqual(keyToAction('Escape'), { type: 'clear' });
  assert.deepEqual(keyToAction('Backspace'), { type: 'delete' });
  assert.deepEqual(keyToAction('%'), { type: 'percent' });
  assert.equal(keyToAction('a'), null);
  assert.equal(keyToAction('toString'), null);
  assert.equal(keyToAction('Shift'), null);
});
