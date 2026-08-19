// Funções puras compartilhadas pela integração de bipagem (Tiny/SellInfoTurbo).
// Carregado via <script> no index.html, antes de app.js — sem dependência de
// DOM, testável isoladamente com `node --test`.

function normalizarIdentificadorPedido(valor) {
    const texto = String(valor ?? '').trim();
    if (!texto || texto === 'Sem Pedido') {
        return null;
    }
    return texto;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { normalizarIdentificadorPedido };
}
