/* ═══════════════════════════════════════════════════════
   CV CRM — Utilitários Puros
   Funções sem dependência de banco de dados ou DOM global.
   Extraído de sistema58.html → sistema59.html
   ═══════════════════════════════════════════════════════ */

/* ── Segurança ── */
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/* ── Formatação de datas ── */
function timeAgo(dateString) {
    const now = new Date();
    const date = new Date(dateString);
    const diff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Ontem';
    return 'há ' + diff + ' dias';
}

function getDateLabel(dateStr) {
    const d = new Date(dateStr);
    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(hoje.getDate() - 1);
    if (d.toDateString() === hoje.toDateString()) return 'Hoje';
    if (d.toDateString() === ontem.toDateString()) return 'Ontem';
    return d.toLocaleDateString('pt-BR');
}

/* ── Controle de última visita (localStorage) ── */
function getUltimaVisita(id) {
    const ts = localStorage.getItem('ultima_visita_' + id);
    return ts ? parseInt(ts) : 0;
}

function setUltimaVisita(id) {
    localStorage.setItem('ultima_visita_' + id, Date.now().toString());
}

function isCommentNew(commentDateStr, clienteId) {
    const commentTime = new Date(commentDateStr).getTime();
    const lastVisit = getUltimaVisita(clienteId);
    if (lastVisit === 0) return false;
    return commentTime > lastVisit;
}

/* ── Formatação de moeda ── */
function formatCurrency(value) {
    let num = value.replace(/\D/g, '');
    num = (parseInt(num) || 0).toString();
    return 'R$ ' + parseInt(num.slice(0, -2) || '0').toLocaleString('pt-BR') + ',' + num.slice(-2).padStart(2, '0');
}

function parseCurrency(value) {
    return parseFloat(value.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
}

/* ── Mapeamento de status → classe CSS ── */
function classToFormatStatus(status) {
    const map = {
        'Contato Inicial':  'contato-inicial',
        'Negociação':       'negociacao-valores',
        'Em Fechamento':    'aguardando-decisao',
        'Fechado':          'fechado',
        'Perdido':          'perdido'
    };
    return map[status] || 'em-atendimento';
}
