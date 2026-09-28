'use strict';

// Permite rodar `node --test calculator/tests`: em Node >= 21 o argumento e
// tratado como caminho de modulo, que resolve para este index.
require('./engine.test.js');
require('./markup.test.js');
require('./ui.test.js');
require('./qa.test.js');
