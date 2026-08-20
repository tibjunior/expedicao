// ============================================================
// etiquetas-ui.js — UI de Etiquetas Tiny (pendientes / esperando / modais)
// Depende de funciones globais de app.js:
//   - reintentarPendienteEtiqueta(ec)
//   - cargarPendientesEtiquetas()
//   - etiquetasPendientes (array global)
//   - escHtml()
// ============================================================

function refreshEtiquetaBadge() {
    const n = (window.etiquetasPendientes || []).length;
    if (elements.etiquetaPendientesBadge) {
        elements.etiquetaPendientesBadge.style.display = n ? 'flex' : 'none';
        elements.etiquetaPendientesBadge.textContent = String(n);
    }
}

function renderListaPendientes() {
    if (!elements.etiquetaPendientesLista) return;
    const pend = (window.etiquetasPendientes || []);
    if (!pend.length) {
        elements.etiquetaPendientesLista.innerHTML =
            '<div style="font-size:12px; color:var(--text-success); padding:6px 0;">Nada pendiente.</div>';
        return;
    }
    elements.etiquetaPendientesLista.innerHTML = pend.map(p => {
        const ec = escHtml(p.ec);
        const err = escHtml(p.error || '');
        return `<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 8px; border:1px solid var(--border-color); border-radius:6px; margin-bottom:6px; background:rgba(15,23,42,0.3);">
            <div style="min-width:0;">
                <div style="font-size:12px; font-weight:600; color:var(--text-primary); font-family:monospace;">${ec}</div>
                <div style="font-size:11px; color:var(--text-danger); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${err}">${err}</div>
            </div>
            <button class="btn btn-outline btn-reintentar-uno" data-ec="${escHtml(p.ec || '')}" style="padding:3px 8px; font-size:11px; height:auto; flex-shrink:0;">Reintentar</button>
        </div>`;
    }).join('');

    elements.etiquetaPendientesLista.querySelectorAll('.btn-reintentar-uno').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ec = btn.getAttribute('data-ec');
            btn.disabled = true;
            btn.textContent = '...';
            await reintentarPendienteEtiqueta(ec);
            renderListaPendientes();
            refreshEtiquetaBadge();
        });
    });
}

function abrirModalPendientes() {
    cargarPendientesEtiquetas();
    renderListaPendientes();
    refreshEtiquetaBadge();
    if (elements.etiquetaPendientesModal) elements.etiquetaPendientesModal.style.display = 'flex';
    if (state) state.pendientesModalActive = true;
}
function cerrarModalPendientes() {
    if (state) state.pendientesModalActive = false;
    if (elements.etiquetaPendientesModal) elements.etiquetaPendientesModal.style.display = 'none';
}

function initEtiquetasUI() {
    cargarPendientesEtiquetas();
    refreshEtiquetaBadge();

    if (elements.btnEtiquetaPendientes) {
        elements.btnEtiquetaPendientes.addEventListener('click', (e) => { e.stopPropagation(); abrirModalPendientes(); });
    }
    if (elements.btnCloseEtiquetaError) {
        elements.btnCloseEtiquetaError.addEventListener('click', () => cerrarErrorEtiqueta());
    }
    if (elements.btnCerrarPendientes) {
        elements.btnCerrarPendientes.addEventListener('click', cerrarModalPendientes);
    }
    if (elements.btnReintentarTodas) {
        elements.btnReintentarTodas.addEventListener('click', async () => {
            const copia = (window.etiquetasPendientes || []).slice();
            for (const p of copia) {
                await reintentarPendienteEtiqueta(p.ec);
            }
            renderListaPendientes();
            refreshEtiquetaBadge();
        });
    }
}