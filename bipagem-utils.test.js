const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizarIdentificadorPedido } = require('./bipagem-utils.js');

test('aceita numero puro do Mercado Livre/TikTok Shop', () => {
    assert.equal(normalizarIdentificadorPedido('2000013866459793'), '2000013866459793');
});

test('aceita identificador alfanumerico do Shopee', () => {
    assert.equal(normalizarIdentificadorPedido('26070606BSBAKE'), '26070606BSBAKE');
});

test('aceita identificador com prefixo do Magalu', () => {
    assert.equal(normalizarIdentificadorPedido('LU-1550370116151430'), 'LU-1550370116151430');
});

test('aceita identificador com hifens da Amazon', () => {
    assert.equal(normalizarIdentificadorPedido('702-9802415-7265855'), '702-9802415-7265855');
});

test('rejeita vazio, null e undefined', () => {
    assert.equal(normalizarIdentificadorPedido(''), null);
    assert.equal(normalizarIdentificadorPedido(null), null);
    assert.equal(normalizarIdentificadorPedido(undefined), null);
});

test('rejeita o placeholder "Sem Pedido" usado pelo pdf-parser quando falta Nº EC', () => {
    assert.equal(normalizarIdentificadorPedido('Sem Pedido'), null);
});

test('remove espaco nas bordas', () => {
    assert.equal(normalizarIdentificadorPedido('  LU-123  '), 'LU-123');
});
