'use strict';

/* ==========================================================================
 * Motor de calculo puro
 *
 * Nenhuma funcao desta secao acessa document/window: todas recebem dados e
 * devolvem dados novos, o que permite testa-las em Node (node --test).
 * ========================================================================== */

const DIVISION_BY_ZERO_MESSAGE = 'Erro: Divisão por 0';
const GENERIC_ERROR_MESSAGE = 'Erro';
const OPERATORS = ['+', '-', '×', '÷'];
const MAX_INPUT_DIGITS = 15;
const PRECISION_DIGITS = 15;

/**
 * Estado da calculadora.
 * - current: texto do numero em edicao/resultado (display inferior)
 * - previous: primeiro operando ja confirmado (number) ou null
 * - operator: operador pendente ('+', '-', '×', '÷') ou null
 * - expression: expressao concluida exibida apos '=' (display superior)
 * - waitingForOperand: true logo apos escolher um operador
 * - justEvaluated: true logo apos '=' (proximo digito inicia novo numero)
 * - error: mensagem de erro ou null
 */
function createInitialState() {
  return {
    current: '0',
    previous: null,
    operator: null,
    expression: '',
    waitingForOperand: false,
    justEvaluated: false,
    error: null,
  };
}

class CalculationError extends Error {}

/** Elimina ruido de ponto flutuante (0.1 + 0.2 => 0.3) e normaliza -0. */
function roundPrecision(value, digits = PRECISION_DIGITS) {
  if (!Number.isFinite(value)) return value;
  const rounded = Number(value.toPrecision(digits));
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** Aplica a operacao; lanca CalculationError para divisao por zero ou overflow. */
function calculate(a, op, b) {
  let result;
  switch (op) {
    case '+': result = a + b; break;
    case '-': result = a - b; break;
    case '×': result = a * b; break;
    case '÷':
      if (b === 0) throw new CalculationError(DIVISION_BY_ZERO_MESSAGE);
      result = a / b;
      break;
    default:
      throw new CalculationError(GENERIC_ERROR_MESSAGE);
  }
  if (!Number.isFinite(result)) throw new CalculationError(GENERIC_ERROR_MESSAGE);
  return roundPrecision(result);
}

/** Converte um numero para o texto exibido no display. */
function formatNumber(value) {
  return String(roundPrecision(value));
}

/** Dados do display duplo: expressao acima, valor atual abaixo. */
function formatDisplay(state) {
  if (state.error) {
    return { expression: state.expression, value: state.error };
  }
  if (state.operator !== null) {
    const pending = `${formatNumber(state.previous)} ${state.operator}`;
    return {
      expression: state.waitingForOperand ? pending : `${pending} ${state.current}`,
      value: state.current,
    };
  }
  return { expression: state.expression, value: state.current };
}

function countDigits(text) {
  return text.replace(/[^0-9]/g, '').length;
}

function toErrorState(state, message) {
  return { ...createInitialState(), expression: state.expression, error: message };
}

/** Estado base para a proxima entrada: apos erro, tudo e reiniciado. */
function recover(state) {
  return state.error ? createInitialState() : state;
}

function inputDigit(state, digit) {
  const base = recover(state);
  if (base.waitingForOperand || base.justEvaluated) {
    return {
      ...base,
      current: digit,
      expression: base.justEvaluated ? '' : base.expression,
      waitingForOperand: false,
      justEvaluated: false,
    };
  }
  if (countDigits(base.current) >= MAX_INPUT_DIGITS) return base;
  let current;
  if (base.current === '0') current = digit;
  else if (base.current === '-0') current = `-${digit}`;
  else current = base.current + digit;
  return { ...base, current };
}

function inputDecimal(state) {
  const base = recover(state);
  if (base.waitingForOperand || base.justEvaluated) {
    return {
      ...base,
      current: '0.',
      expression: base.justEvaluated ? '' : base.expression,
      waitingForOperand: false,
      justEvaluated: false,
    };
  }
  if (base.current.includes('.')) return base;
  return { ...base, current: `${base.current}.` };
}

function chooseOperator(state, operator) {
  if (!OPERATORS.includes(operator)) return state;
  const base = recover(state);
  if (base.operator !== null && base.waitingForOperand) {
    return { ...base, operator };
  }
  let previous = Number(base.current);
  if (base.operator !== null) {
    try {
      previous = calculate(base.previous, base.operator, Number(base.current));
    } catch (err) {
      return toErrorState({ ...base, expression: formatDisplay(base).expression }, err.message);
    }
  }
  previous = roundPrecision(previous);
  return {
    ...base,
    previous,
    operator,
    current: formatNumber(previous),
    expression: '',
    waitingForOperand: true,
    justEvaluated: false,
  };
}

function evaluate(state) {
  if (state.error) return state;
  if (state.operator === null) {
    return { ...state, justEvaluated: true };
  }
  const operand = Number(state.current);
  const expression = `${formatNumber(state.previous)} ${state.operator} ${formatNumber(operand)} =`;
  try {
    const result = calculate(state.previous, state.operator, operand);
    return {
      ...createInitialState(),
      current: formatNumber(result),
      expression,
      justEvaluated: true,
    };
  } catch (err) {
    return toErrorState({ ...state, expression }, err.message);
  }
}

function deleteDigit(state) {
  if (state.error) return createInitialState();
  if (state.waitingForOperand || state.justEvaluated) return state;
  // Texto em notacao exponencial nao e editavel digito a digito.
  if (/e/i.test(state.current)) return state;
  let current = state.current.slice(0, -1);
  if (current === '' || current === '-' || current === '-0') current = '0';
  return { ...state, current };
}

function toggleSign(state) {
  const base = recover(state);
  if (base.waitingForOperand) {
    return { ...base, current: '-0', waitingForOperand: false };
  }
  const current = base.current.startsWith('-') ? base.current.slice(1) : `-${base.current}`;
  return { ...base, current };
}

/**
 * O resultado de % e tratado como valor concluido (como apos '='): o proximo
 * digito inicia um novo numero e DEL nao o edita. Isso evita editar textos
 * em notacao exponencial (ex.: '1e-7' => '1e-' => NaN).
 */
function applyPercent(state) {
  const base = recover(state);
  const value = roundPrecision(Number(base.current) / 100);
  return { ...base, current: formatNumber(value), waitingForOperand: false, justEvaluated: true };
}

/** Reducer imutavel: devolve um novo estado sem alterar o recebido. */
function reduce(state, action) {
  if (!action || typeof action.type !== 'string') return state;
  switch (action.type) {
    case 'digit':
      return /^[0-9]$/.test(action.value) ? inputDigit(state, action.value) : state;
    case 'decimal': return inputDecimal(state);
    case 'operator': return chooseOperator(state, action.value);
    case 'equals': return evaluate(state);
    case 'clear': return createInitialState();
    case 'delete': return deleteDigit(state);
    case 'toggleSign': return toggleSign(state);
    case 'percent': return applyPercent(state);
    default: return state;
  }
}

const KEY_OPERATORS = { '+': '+', '-': '-', '*': '×', 'x': '×', 'X': '×', '/': '÷' };

/** Mapeia KeyboardEvent.key para uma acao do reducer (ou null se ignorada). */
function keyToAction(key) {
  if (/^[0-9]$/.test(key)) return { type: 'digit', value: key };
  if (key === '.' || key === ',') return { type: 'decimal' };
  if (Object.hasOwn(KEY_OPERATORS, key)) return { type: 'operator', value: KEY_OPERATORS[key] };
  if (key === 'Enter' || key === '=') return { type: 'equals' };
  if (key === 'Escape') return { type: 'clear' };
  if (key === 'Backspace') return { type: 'delete' };
  if (key === '%') return { type: 'percent' };
  return null;
}

/* ==========================================================================
 * Camada de UI
 *
 * Apenas traduz eventos do DOM em acoes do reducer e desenha o estado. Toda
 * regra de calculo fica no motor acima. Recebe o document por parametro para
 * poder ser exercitada em testes com um DOM falso.
 * ========================================================================== */

const PRESSED_CLASS = 'key--pressed';
const PRESSED_DURATION_MS = 120;

/** Le data-action/data-value de um botao do teclado virtual. */
function actionFromButton(button) {
  const type = button.getAttribute('data-action');
  if (!type) return null;
  const value = button.getAttribute('data-value');
  return value === null ? { type } : { type, value };
}

/** Localiza o botao que dispara a mesma acao (para feedback visual). */
function findButtonForAction(keypad, action) {
  const buttons = keypad.querySelectorAll('[data-action]');
  for (const button of buttons) {
    const candidate = actionFromButton(button);
    if (candidate && candidate.type === action.type && candidate.value === action.value) {
      return button;
    }
  }
  return null;
}

function initCalculatorUI(doc) {
  const expressionEl = doc.getElementById('expression');
  const currentEl = doc.getElementById('current');
  const keypad = doc.querySelector('.keypad');
  if (!expressionEl || !currentEl || !keypad) return null;

  let state = createInitialState();

  function render() {
    const display = formatDisplay(state);
    expressionEl.textContent = display.expression;
    currentEl.textContent = display.value;
    if (state.error) currentEl.setAttribute('data-error', '');
    else currentEl.removeAttribute('data-error');
  }

  function dispatch(action) {
    state = reduce(state, action);
    render();
  }

  function flash(action) {
    const button = findButtonForAction(keypad, action);
    if (!button) return;
    button.classList.add(PRESSED_CLASS);
    setTimeout(() => button.classList.remove(PRESSED_CLASS), PRESSED_DURATION_MS);
  }

  function onClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button || !keypad.contains(button)) return;
    const action = actionFromButton(button);
    if (action) dispatch(action);
  }

  function onKeyDown(event) {
    // Preserva atalhos do navegador/sistema (Ctrl+C, Cmd+R, Alt+...).
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const action = keyToAction(event.key);
    if (!action) return;
    // Evita a busca rapida do '/' (Firefox) e que Enter/Backspace acionem
    // o botao focado ou naveguem; a acao e despachada uma unica vez aqui.
    event.preventDefault();
    dispatch(action);
    flash(action);
  }

  keypad.addEventListener('click', onClick);
  doc.addEventListener('keydown', onKeyDown);
  render();

  return {
    getState: () => state,
    dispatch,
    destroy() {
      keypad.removeEventListener('click', onClick);
      doc.removeEventListener('keydown', onKeyDown);
    },
  };
}

if (typeof document !== 'undefined') {
  initCalculatorUI(document);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DIVISION_BY_ZERO_MESSAGE,
    OPERATORS,
    MAX_INPUT_DIGITS,
    createInitialState,
    roundPrecision,
    calculate,
    formatNumber,
    formatDisplay,
    reduce,
    keyToAction,
    actionFromButton,
    findButtonForAction,
    initCalculatorUI,
  };
}
