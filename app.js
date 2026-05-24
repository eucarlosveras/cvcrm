const SUPABASE_URL = 'https://blumqkxwasdbyozdvrsp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_kvVacObZ3ERPqc9MjOIoWw_aRZeYeIn';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const META_PADRAO = 50000;
const ITEMS_PER_PAGE = 10;

const STATUS = {
    CONTATO_INICIAL: 'Contato Inicial',
    NEGOCIACAO: 'Negociação de Valores',
    AGUARDANDO: 'Aguardando Decisão',
    VENDIDO: 'Vendido',
    FECHADO: 'Fechado',
    PERDIDO: 'Perdido',
    DECLINADO: 'Declinado',
    POS_VENDA: 'Pós-Venda',
    EM_NEGOCIACAO: 'Em Negociação'
};

let mapStatusUUID = []; 
let mapInteresseUUID = [];
let listaLojas = [];

let currentUser = null;
let kpisMensais = []; 
let todosVendedores = [];
let todosUsuarios = [];
let todosProdutos = [];

let currentFilter = 'todos';
let currentView = 'inicio';
let previousView = 'inicio';
let currentMonth = new Date().getMonth() + 1;
let currentYear = new Date().getFullYear();
let currentDay = null;
let currentPage = 1;
let searchTerm = '';
let searchProtocolo = '';
let selectedVendedor = 'todos';

let clienteAtualParaDetalhes = null;
let clienteSelecionadoParaAcao = null;
let clienteParaOrcamento = null;
let idOrcamentoParaPerder = null;
let idMetaEdicao = null;
let donutChartInstance = null;
let barChartInstance = null;
let salvandoOrcamento = false;
let historicoFaturamento = [];
let comentarioParaExcluir = null;
let idUsuarioEmEdicao = null;

let usuariosParaLogin = [];
let perfilSelecionadoLogin = null;
let isSavingComment = false;
let isConfirmingPerda = false;
let notificacoesLidas = new Set();

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = '';
    if(type === 'success') icon = '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
    if(type === 'error') icon = '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    if(type === 'info') icon = '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    toast.innerHTML = `${icon} <span>${message}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
}

function carregarNotificacoesLidas() { const stored = localStorage.getItem('notificacoesLidas'); if (stored) { try { notificacoesLidas = new Set(JSON.parse(stored)); } catch(e) { } } }
function salvarNotificacoesLidas() { localStorage.setItem('notificacoesLidas', JSON.stringify(Array.from(notificacoesLidas))); }
function marcarTodasNotificacoesLidas(ids) { let altered = false; ids.forEach(id => { if (id && !notificacoesLidas.has(id)) { notificacoesLidas.add(id); altered = true; } }); if (altered) salvarNotificacoesLidas(); }
function showLoader() { document.getElementById('globalLoader').classList.add('loading'); }
function hideLoader() { document.getElementById('globalLoader').classList.remove('loading'); }
function escapeHtml(str) { if (!str) return ''; const div = document.createElement('div'); div.textContent = str; return div.innerHTML; }
function timeAgo(dateString) { const now = new Date(); const date = new Date(dateString); const diff = Math.floor((now - date) / (1000 * 60 * 60 * 24)); if (diff === 0) return 'Hoje'; if (diff === 1) return 'Ontem'; return 'há ' + diff + ' dias'; }
function getDateLabel(dateStr) { const d = new Date(dateStr); const hoje = new Date(); const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1); if (d.toDateString() === hoje.toDateString()) return 'Hoje'; if (d.toDateString() === ontem.toDateString()) return 'Ontem'; return d.toLocaleDateString('pt-BR'); }
function getUltimaVisita(id) { const ts = localStorage.getItem('ultima_visita_' + id); return ts ? parseInt(ts) : 0; }
function setUltimaVisita(id) { localStorage.setItem('ultima_visita_' + id, Date.now().toString()); }
function isCommentNew(commentDateStr, clienteId) { const commentTime = new Date(commentDateStr).getTime(); const lastVisit = getUltimaVisita(clienteId); if (lastVisit === 0) return false; return commentTime > lastVisit; }

let lastFocusedElement = null;
function openModal(modalId) { const modal = document.getElementById(modalId); if (!modal) return; lastFocusedElement = document.activeElement; modal.classList.add('open'); setTimeout(() => { const firstInput = modal.querySelector('input, textarea, select'); if (firstInput) firstInput.focus(); }, 100); }
function closeModal(modalId) { const modal = document.getElementById(modalId); if (!modal) return; modal.classList.remove('open'); if (lastFocusedElement && document.body.contains(lastFocusedElement)) { lastFocusedElement.focus(); } }

async function checkSession() {
    document.getElementById('loginOverlay').classList.remove('hidden');
    carregarNotificacoesLidas();
    try {
        const { data, error } = await db.from('usuarios').select('*').order('nome');
        if (error) throw error;
        usuariosParaLogin = (data || []).filter(u => (u.status || '').toLowerCase() === 'ativo');
    } catch (e) { document.getElementById('loginMsg').innerHTML = 'Erro de conexão com o banco de dados.'; }
}

function selecionarPerfil(perfil, btnElement) {
    perfilSelecionadoLogin = perfil;
    document.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active')); btnElement.classList.add('active');
    const wrapper = document.getElementById('usuarioSelectWrapper'); const select = document.getElementById('loginUsuarioSelect');
    select.innerHTML = '<option value="">Selecione seu nome...</option>';
    const filtrados = usuariosParaLogin.filter(u => u.perfil === perfil || (perfil === 'Administrador' && u.perfil === 'Admin'));
    if (filtrados.length === 0) { select.innerHTML = `<option value="">Nenhum ${perfil} cadastrado</option>`; } 
    else { filtrados.forEach(u => { select.innerHTML += `<option value="${u.id_usuario}">${escapeHtml(u.nome)}</option>`; }); }
    wrapper.classList.add('visible'); document.getElementById('loginMsg').innerHTML = '';
}

async function handleLogin() {
    const btn = document.getElementById('btnLogin');
    if (btn.disabled) return;
    const idSelecionado = document.getElementById('loginUsuarioSelect').value;
    const msg = document.getElementById('loginMsg');
    if (!perfilSelecionadoLogin) { msg.textContent = 'Passo 1: Escolha um perfil acima.'; return; }
    if (!idSelecionado) { msg.textContent = 'Passo 2: Selecione o seu nome na lista.'; return; }
    btn.classList.add('loading'); btn.disabled = true; msg.innerHTML = '';

    try {
        const userFound = usuariosParaLogin.find(u => u.id_usuario === idSelecionado);
        if (!userFound) throw new Error("Usuário inválido.");
        currentUser = userFound;
        document.getElementById('loginOverlay').classList.add('hidden');
        initAppAfterLogin();
    } catch (err) { msg.innerHTML = `<span style="color: #ef4444; font-size: 13px; font-weight: 600;">Erro ao entrar no sistema.</span>`; } 
    finally { btn.classList.remove('loading'); btn.disabled = false; }
}

function initAppAfterLogin() {
    document.getElementById('sidebar').style.display = 'flex';
    document.getElementById('mainContent').style.display = 'flex';
    configurarPermissoes();
    carregarDadosIniciais();
}

async function configurarPermissoes() {
    const isAdministrador = currentUser.perfil === 'Administrador' || currentUser.perfil === 'Admin';
    const isGerente = currentUser.perfil === 'Gerente';

    document.getElementById('navAdmin').style.display = isAdministrador ? 'flex' : 'none';
    document.getElementById('navMetas').style.display = (isAdministrador || isGerente) ? 'flex' : 'none';
    document.getElementById('textNavInicio').textContent = (isAdministrador || isGerente) ? 'Dashboard Vendas' : 'Início';
    document.getElementById('fabButton').style.display = (!isAdministrador && !isGerente) ? 'flex' : 'none';

    try {
        const { data: all } = await db.from('usuarios').select('*').order('nome');
        todosUsuarios = all || []; todosVendedores = todosUsuarios.filter(u => u.perfil === 'Vendedor');
    } catch (e) { todosUsuarios = []; todosVendedores = []; }

    const hora = new Date().getHours();
    let saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    document.getElementById('sidebarGreeting').textContent = saudacao + ', ' + (currentUser.nome ? currentUser.nome.split(' ')[0] : 'Usuário');
    document.getElementById('sidebarNome').textContent = currentUser.nome || 'Usuário';
    document.getElementById('sidebarAvatar').textContent = currentUser.nome ? currentUser.nome.charAt(0).toUpperCase() : 'U';
    document.getElementById('sidebarPerfil').textContent = currentUser.perfil;
}

async function carregarDadosIniciais() {
    showLoader();
    const [resStatus, resInteresse, resLojas] = await Promise.all([
        db.from('status_orcamento').select('*'),
        db.from('niveis_interesse').select('*'),
        db.from('lojas').select('*')
    ]);
    mapStatusUUID = resStatus.data || [];
    mapInteresseUUID = resInteresse.data || [];
    listaLojas = resLojas.data || [];

    await carregarProdutos();
    await carregarKpisEDashboard();
    await carregarHistoricoFaturamento();
    
    if (currentUser.perfil === 'Administrador' || currentUser.perfil === 'Admin') navigateTo('admin_inicio');
    else navigateTo('inicio');
    hideLoader();
}

async function logout() { currentUser = null; location.reload(); }

async function carregarKpisEDashboard() {
    if (!currentUser) return;
    try {
        let query = db.from('orcamentos').select('id_orcamento, valor_orcado, id_usuario, data_contato, hora_contato, clientes(nome_cliente, whatsapp), status_orcamento(nome)');

        if (currentUser.perfil === 'Vendedor') query = query.eq('id_usuario', currentUser.id_usuario);
        else if (selectedVendedor !== 'todos') query = query.eq('id_usuario', selectedVendedor);

        if (currentDay) {
            const start = new Date(currentYear, currentMonth - 1, currentDay).toISOString();
            const end = new Date(currentYear, currentMonth - 1, currentDay, 23, 59, 59).toISOString();
            query = query.gte('data_criacao', start).lte('data_criacao', end);
        } else if (currentMonth && currentYear) {
            const startDate = new Date(currentYear, currentMonth - 1, 1).toISOString();
            const endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59).toISOString();
            query = query.gte('data_criacao', startDate).lte('data_criacao', endDate);
        }

        const { data, error } = await query;
        if (!error) {
            kpisMensais = (data || []).map(o => ({
                ...o,
                status: o.status_orcamento ? o.status_orcamento.nome : STATUS.CONTATO_INICIAL
            }));
        }
    } catch(e) { kpisMensais = []; }
    
    atualizarBadge();
    const notificacoes = buildNotifications();
    renderNotificationBadge(notificacoes.filter(n => n.id !== null).length);
}

async function atualizarTabelaPaginadaServer() {
    const tbody = document.getElementById('tableBody');
    const pagination = document.getElementById('paginationContainer');
    if (!tbody || !pagination) return;
    
    const isGerente = currentUser.perfil === 'Gerente' || currentUser.perfil === 'Administrador' || currentUser.perfil === 'Admin';
    tbody.innerHTML = `<tr><td colspan="${isGerente ? '7' : '6'}" style="text-align:center; padding:24px;">Carregando dados...</td></tr>`;

    try {
        let query = db.from('orcamentos').select('*, clientes!inner(nome_cliente, whatsapp), usuarios(nome), status_orcamento(nome)', { count: 'exact' });

        if (currentUser.perfil === 'Vendedor') query = query.eq('id_usuario', currentUser.id_usuario);
        else if (selectedVendedor !== 'todos') query = query.eq('id_usuario', selectedVendedor);

        if (searchTerm) query = query.ilike('clientes.nome_cliente', `%${searchTerm}%`);
        if (searchProtocolo) query = query.ilike('protocolo', `%${searchProtocolo}%`);

        if (currentFilter !== 'todos') {
            let searchNomes = [currentFilter];
            if (currentFilter === STATUS.VENDIDO) searchNomes = [STATUS.FECHADO, STATUS.VENDIDO];
            else if (currentFilter === STATUS.PERDIDO) searchNomes = [STATUS.DECLINADO, STATUS.PERDIDO];
            else if (['Contato Inicial', 'Negociação de Valores', 'Aguardando Decisão'].includes(currentFilter)) {
                searchNomes = [currentFilter, STATUS.EM_NEGOCIACAO];
            }
            const uuidsPermitidos = mapStatusUUID.filter(s => searchNomes.includes(s.nome)).map(s => s.id_status);
            if(uuidsPermitidos.length > 0) query = query.in('id_status', uuidsPermitidos);
        }

        if (currentDay) {
            const start = new Date(currentYear, currentMonth - 1, currentDay).toISOString();
            const end = new Date(currentYear, currentMonth - 1, currentDay, 23, 59, 59).toISOString();
            query = query.gte('data_criacao', start).lte('data_criacao', end);
        } else if (currentMonth && currentYear) {
            const startDate = new Date(currentYear, currentMonth - 1, 1).toISOString();
            const endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59).toISOString();
            query = query.gte('data_criacao', startDate).lte('data_criacao', endDate);
        }

        const from = (currentPage - 1) * ITEMS_PER_PAGE;
        const to = from + ITEMS_PER_PAGE - 1;
        query = query.range(from, to).order('data_criacao', { ascending: false });

        const { data: pagina, error, count } = await query;
        if (error) throw error;

        const totalPages = Math.ceil(count / ITEMS_PER_PAGE) || 1;
        if (currentPage > totalPages && totalPages > 0) { currentPage = totalPages; return atualizarTabelaPaginadaServer(); }

        tbody.innerHTML = '';
        if (!pagina || pagina.length === 0) { tbody.innerHTML = `<tr><td colspan="${isGerente ? '7' : '6'}" style="text-align:center; padding:24px;">Nenhum registro encontrado.</td></tr>`; } 
        else {
            pagina.forEach(o => {
                const tr = document.createElement('tr'); tr.className = 'clickable-row'; tr.setAttribute('data-id', o.id_orcamento); tr.style.cursor = 'pointer';
                tr.addEventListener('click', function() { abrirDetalhesCliente(o.id_orcamento); });
                const nome = o.clientes?.nome_cliente || 'Cliente';
                const dataRelativa = timeAgo(o.data_criacao);
                const dataCompleta = o.data_criacao ? new Date(o.data_criacao).toLocaleDateString('pt-BR') : '-';
                const statusTexto = o.status_orcamento ? o.status_orcamento.nome : STATUS.CONTATO_INICIAL; 

                const idNumerico = o.protocolo && o.protocolo.includes('-') ? o.protocolo.split('-')[1] : (o.protocolo || '');
                tr.innerHTML = `
                    <td style="text-align:center; font-family:monospace; font-weight:700; font-size:var(--font-sm); color:var(--brand-blue-dark); white-space:nowrap;">${escapeHtml(idNumerico)}</td>
                    <td><span class="client-name">${escapeHtml(nome)}</span></td>
                    <td>${escapeHtml(o.modelo_colchao || '-')}</td>
                    ${isGerente ? `<td>${escapeHtml(o.usuarios?.nome || '-')}</td>` : ''}
                    <td><span class="status-tag ${classToFormatStatus(statusTexto)}">${escapeHtml(statusTexto)}</span></td>
                    <td title="${dataCompleta}">${dataRelativa}</td>
                    <td style="font-weight:700;">R$ ${parseFloat(o.valor_orcado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                `;
                tbody.appendChild(tr);
            });
        }
        pagination.innerHTML = `<button onclick="changePage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>Anterior</button><span>Página ${currentPage} de ${totalPages}</span><button onclick="changePage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>Próximo</button>`;
    } catch (error) { tbody.innerHTML = `<tr><td colspan="${isGerente ? '6' : '5'}" style="text-align:center; padding:24px; color:#ef4444;">Erro ao carregar dados da tabela.</td></tr>`; }
}

async function exportarCSV() {
    showToast('Gerando relatório...', 'info');
    try {
        let query = db.from('orcamentos').select('*, clientes!inner(nome_cliente, whatsapp), usuarios(nome), status_orcamento(nome)');
        if (currentUser.perfil === 'Vendedor') query = query.eq('id_usuario', currentUser.id_usuario);
        else if (selectedVendedor !== 'todos') query = query.eq('id_usuario', selectedVendedor);
        
        if (currentMonth && currentYear && !currentDay) {
            const start = new Date(currentYear, currentMonth - 1, 1).toISOString();
            const end = new Date(currentYear, currentMonth, 0, 23, 59, 59).toISOString();
            query = query.gte('data_criacao', start).lte('data_criacao', end);
        }
        
        const { data, error } = await query;
        if (error) throw error;
        if(!data || data.length === 0) return showToast('Nenhum dado para exportar.', 'error');

        let csv = 'Data,Cliente,WhatsApp,Produto,Valor,Status,Vendedor\n';
        data.forEach(row => {
            const dataFormatada = new Date(row.data_criacao).toLocaleDateString('pt-BR');
            const nome = `"${(row.clientes?.nome_cliente || '').replace(/"/g, '""')}"`;
            const whats = `"${row.clientes?.whatsapp || ''}"`;
            const prod = `"${(row.modelo_colchao || '').replace(/"/g, '""')}"`;
            const valor = row.valor_orcado || 0;
            const status = row.status_orcamento ? row.status_orcamento.nome : '';
            const vendedor = `"${(row.usuarios?.nome || '').replace(/"/g, '""')}"`;
            csv += `${dataFormatada},${nome},${whats},${prod},${valor},${status},${vendedor}\n`;
        });

        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `relatorio_vendas_${currentMonth}_${currentYear}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Relatório exportado com sucesso!', 'success');
    } catch(e) { showToast('Erro ao exportar relatório.', 'error'); }
}

async function salvarUsuarioAdmin() {
    const nome = document.getElementById('adminModNome').value.trim();
    const email = document.getElementById('adminModEmail').value.trim();
    const loja = document.getElementById('adminModLoja').value;
    const perfil = document.getElementById('adminModPerfil').value;
    const status = document.getElementById('adminModStatus').value;
    const senha = document.getElementById('adminModSenha').value;
    const err = document.getElementById('errAdminUsuario');

    if (!nome || !email || !senha) {
        err.textContent = 'Preencha Nome, E-mail e Senha.';
        return;
    }

    const btn = document.getElementById('btnSalvarUsuarioAdmin');
    btn.classList.add('saving'); btn.disabled = true; err.textContent = '';

    try {
        const { data, error } = await db.functions.invoke('criar-usuario', {
            body: { nome, email, loja, perfil, status, senha }
        });

        if (error) throw new Error(error.message);

        showToast('Usuário criado com sucesso!', 'success');
        closeModal('modalUsuarioAdmin');
        
        const { data: usuarios } = await db.from('usuarios').select('*').order('nome');
        todosUsuarios = usuarios || [];
        renderAdminUsuarios(document.getElementById('mainContent'));
        
    } catch (e) {
        err.textContent = 'Erro: ' + e.message;
    } finally {
        btn.classList.remove('saving');
        btn.disabled = false;
    }
}

function abrirModalUsuarioAdmin(id = null) {
    idUsuarioEmEdicao = id;
    const err = document.getElementById('errAdminUsuario'); if (err) err.textContent = '';
    const title = document.getElementById('modalUsuarioTitle');
    const nomeInput = document.getElementById('adminModNome');
    const emailInput = document.getElementById('adminModEmail');
    const lojaSel = document.getElementById('adminModLoja');
    const perfilSel = document.getElementById('adminModPerfil');
    const statusSel = document.getElementById('adminModStatus');
    const senhaInput = document.getElementById('adminModSenha');

    lojaSel.innerHTML = '<option value="">Selecione a loja...</option>';
    listaLojas.forEach(l => { lojaSel.innerHTML += `<option value="${l.id_loja}">${escapeHtml(l.nome_loja)}</option>`; });

    if (id) {
        const user = todosUsuarios.find(u => u.id_usuario === id);
        title.textContent = 'Editar Usuário';
        nomeInput.value = user.nome || ''; emailInput.value = user.email || '';
        lojaSel.value = user.id_loja || ''; perfilSel.value = user.perfil || 'Vendedor'; statusSel.value = user.status || 'Ativo';
        senhaInput.value = '';
    } else {
        title.textContent = 'Novo Usuário';
        nomeInput.value = ''; emailInput.value = ''; lojaSel.value = ''; perfilSel.value = 'Vendedor'; statusSel.value = 'Ativo';
        senhaInput.value = '';
    }
    openModal('modalUsuarioAdmin');
}

async function carregarProdutos() {
    try {
        const { data, error } = await db.from('produtos').select('produto');
        if (!error && data) {
            todosProdutos = data.map(p => ({ nome: p.produto || '' })).filter(p => p.nome.trim() !== '').sort((a, b) => a.nome.localeCompare(b.nome));
        }
    } catch (e) { }
}

async function carregarHistoricoFaturamento() {
    if (!currentUser || currentUser.perfil !== 'Vendedor') { historicoFaturamento = []; return; }
    const hoje = new Date(); historicoFaturamento = [];
    try {
        const uuidsFechados = mapStatusUUID.filter(s => [STATUS.FECHADO, STATUS.VENDIDO].includes(s.nome)).map(s => s.id_status);

        for (let i = 5; i >= 0; i--) {
            const mes = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1); 
            const ano = mes.getFullYear(); 
            const mesNum = mes.getMonth() + 1;
            const startDate = new Date(ano, mesNum - 1, 1).toISOString(); 
            const endDate = new Date(ano, mesNum, 0, 23, 59, 59).toISOString();
            
            let query = db.from('orcamentos')
                .select('valor_orcado')
                .eq('id_usuario', currentUser.id_usuario)
                .gte('data_criacao', startDate)
                .lte('data_criacao', endDate);
            
            if(uuidsFechados.length > 0) {
                query = query.in('id_status', uuidsFechados);
            }

            const { data } = await query;
            const total = (data || []).reduce((s, o) => s + parseFloat(o.valor_orcado || 0), 0);
            const nomeMes = mes.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''); 
            const anoAbrev = ano.toString().slice(-2);
            historicoFaturamento.push({ mes: nomeMes + '/' + anoAbrev, valor: total });
        }
    } catch(e) { }
}

function atualizarBadge() {
    const pendentes = kpisMensais.filter(o => [STATUS.EM_NEGOCIACAO, STATUS.CONTATO_INICIAL, STATUS.NEGOCIACAO, STATUS.AGUARDANDO].includes(o.status)).length;
    const badge = document.getElementById('badgeAgendaDia');
    if (badge) badge.classList.toggle('visible', pendentes > 0);
}

async function navigateTo(view) {
    previousView = currentView !== 'detalhes_cliente' && currentView !== 'novo_orcamento' ? currentView : previousView;
    currentView = view;
    document.querySelectorAll('.nav-item').forEach(el => { el.classList.remove('active'); el.removeAttribute('aria-current'); });
    const target = document.querySelector(`[data-nav="${view}"]`);
    if (target) { target.classList.add('active'); target.setAttribute('aria-current', 'page'); }
    currentPage = 1;
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    searchTerm = '';
    searchProtocolo = '';
    const searchProtInput = document.getElementById('searchProtocoloInput');
    if (searchProtInput) searchProtInput.value = '';

    if (view === 'inicio') {
        await carregarKpisEDashboard();
        renderInicio();
    }
    else if (view === 'admin_inicio') renderAdminInicio(document.getElementById('mainContent'));
    else if (view === 'admin_usuarios') renderAdminUsuarios(document.getElementById('mainContent'));
    else if (view === 'agenda_dia') {
        await carregarKpisEDashboard();
        renderAgendaDia();
    }
    else if (view === 'clientes') {
        await carregarKpisEDashboard();
        renderClientes();
    }
    else if (view === 'metas') renderMetas();
    else if (view === 'detalhes_cliente') renderDetalhesClientePage();
    else if (view === 'novo_orcamento') renderNovoOrcamentoPage();
    else if (view === 'clientes_lista') await renderClientesLista();
    else if (view === 'ficha_cliente') await renderFichaCliente();
}

function getMetaVendedor(idVendedor) {
    const user = (todosUsuarios && todosUsuarios.length > 0 ? todosUsuarios : todosVendedores).find(u => u.id_usuario === idVendedor);
    return user && user.meta_mensal ? parseFloat(user.meta_mensal) : META_PADRAO;
}
function calcularMetaTotal() {
    if (currentUser.perfil === 'Vendedor') return getMetaVendedor(currentUser.id_usuario);
    return todosVendedores.reduce((s, v) => s + getMetaVendedor(v.id_usuario), 0);
}

function getGamifiedColors(perc) {
    if (perc > 100) return { bg: 'linear-gradient(90deg, #3b82f6, #8b5cf6)', shadow: '0 0 12px rgba(139,92,246,0.5)', iconBg: '#3b82f6', iconSvg: '<svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg>', motive: 'Performance extraordinária!', motiveColor: '#3b82f6' };
    if (perc >= 100) return { bg: 'linear-gradient(90deg, #10b981, #059669)', shadow: '0 0 8px rgba(16,185,129,0.3)', iconBg: '#10b981', iconSvg: '<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>', motive: 'Meta batida!', motiveColor: '#10b981' };
    if (perc >= 80) return { bg: 'linear-gradient(90deg, #10b981, #059669)', shadow: '0 0 6px rgba(16,185,129,0.2)', iconBg: '#10b981', iconSvg: '<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>', motive: 'Quase lá!', motiveColor: '#10b981' };
    if (perc >= 50) return { bg: 'linear-gradient(90deg, #f59e0b, #eab308)', shadow: '0 0 6px rgba(245,158,11,0.25)', iconBg: '#f59e0b', iconSvg: '<svg viewBox="0 0 24 24"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>', motive: 'Em tração, continue!', motiveColor: '#f59e0b' };
    return { bg: 'linear-gradient(90deg, #ef4444, #f97316)', shadow: '0 0 8px rgba(239,68,68,0.3)', iconBg: '#ef4444', iconSvg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>', motive: 'Hora de acelerar!', motiveColor: '#ef4444' };
}

function renderComentariosHtml(comentarios, clienteId) {
    if (!comentarios || comentarios.length === 0) return '<p style="color:var(--text-muted);">Nenhum comentário registrado.</p>';
    const grupos = {};
    comentarios.forEach((c) => {
        const label = getDateLabel(c.data_criacao);
        if (!grupos[label]) grupos[label] = [];
        grupos[label].push(c);
    });
    let html = '';
    Object.keys(grupos).forEach(label => {
        html += `<div class="timeline-group-header"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${escapeHtml(label)}</div>`;
        grupos[label].forEach(c => {
            const isNew = isCommentNew(c.data_criacao, clienteId);
            const tipoLabel = c.tipo === 'Sistema' ? 'Sistema' : c.tipo === 'Perda' ? 'Perda' : 'Comentário';
            const autorNome = c.autor || 'Sistema';
            const autorInicial = autorNome.charAt(0).toUpperCase();
            const podeEditar = (c.tipo === 'Comentário' || c.tipo === 'Perda') && c.autor === currentUser?.nome;
            const horaMinuto = new Date(c.data_criacao).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});

            if (c._editando) {
                html += `<div class="comment-item ${isNew ? 'is-new' : ''}">
                    ${isNew ? '<span class="comment-badge-new">Novo</span>' : ''}
                    <div class="comment-header">
                        <div class="comment-avatar">${escapeHtml(autorInicial)}</div>
                        <span class="comment-author">${escapeHtml(autorNome)}</span>
                        <span class="comment-tipo">${escapeHtml(tipoLabel)}</span>
                    </div>
                    <input type="text" class="comment-edit-input" id="editInput_${c.id_comentario}" value="${escapeHtml(c.texto)}" />
                    <div class="comment-edit-actions">
                        <button class="btn-cancel" onclick="cancelarEdicao()">Cancelar</button>
                        <button class="btn-save" onclick="salvarEdicao(event, '${c.id_comentario}')">Salvar</button>
                    </div>
                </div>`;
            } else {
                html += `<div class="comment-item ${isNew ? 'is-new' : ''}">
                    ${isNew ? '<span class="comment-badge-new">Novo</span>' : ''}
                    ${podeEditar ? `<div class="comment-actions">
                        <button class="btn-edit" title="Editar" onclick="editarComentario('${c.id_comentario}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                        <button class="btn-delete" title="Excluir" onclick="abrirModalExcluirComentario('${c.id_comentario}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 01-2-2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
                    </div>` : ''}
                    <div class="comment-header">
                        <div class="comment-avatar">${escapeHtml(autorInicial)}</div>
                        <span class="comment-author">${escapeHtml(autorNome)}</span>
                        <span class="comment-tipo">${escapeHtml(tipoLabel)}</span>
                    </div>
                    <div class="comment-body">${escapeHtml(c.texto)}</div>
                    <div class="comment-time">${horaMinuto}</div>
                </div>`;
            }
        });
    });
    return html;
}

function editarComentario(id_comentario) {
    const com = clienteAtualParaDetalhes.comentarios;
    com.forEach(c => delete c._editando);
    const index = com.findIndex(c => String(c.id_comentario) === String(id_comentario));
    if (index < 0) return;
    com[index]._editando = true;
    renderDetalhesClientePage();
    setTimeout(() => { const input = document.getElementById('editInput_' + id_comentario); if (input) input.focus(); }, 100);
}

function cancelarEdicao() {
    clienteAtualParaDetalhes.comentarios.forEach(c => delete c._editando);
    renderDetalhesClientePage();
}

async function salvarEdicao(event, id_comentario) {
    event.preventDefault();
    const input = document.getElementById('editInput_' + id_comentario);
    if (!input) return;
    const novoTexto = input.value.trim();
    const btn = event.currentTarget;
    btn.classList.add('saving'); btn.disabled = true;
    try {
        const { error } = await db.from('comentarios').update({ texto: novoTexto }).eq('id_comentario', id_comentario);
        if (error) throw error;
        const index = clienteAtualParaDetalhes.comentarios.findIndex(c => String(c.id_comentario) === String(id_comentario));
        if (index > -1) { clienteAtualParaDetalhes.comentarios[index].texto = novoTexto; delete clienteAtualParaDetalhes.comentarios[index]._editando; }
        showToast('Comentário editado', 'success');
        renderDetalhesClientePage();
    } catch (e) {
        showToast('Erro ao editar comentário.', 'error');
        btn.classList.remove('saving'); btn.disabled = false;
    }
}

function abrirModalExcluirComentario(id_comentario) {
    comentarioParaExcluir = id_comentario;
    openModal('modalExcluirComentario');
}

async function confirmarExclusaoComentario() {
    if (!comentarioParaExcluir) return;
    const btn = document.getElementById('btnConfirmarExclusao');
    btn.classList.add('saving'); btn.disabled = true;
    try {
        const { error } = await db.from('comentarios').delete().eq('id_comentario', comentarioParaExcluir);
        if (error) throw error;
        clienteAtualParaDetalhes.comentarios = clienteAtualParaDetalhes.comentarios.filter(c => String(c.id_comentario) !== String(comentarioParaExcluir));
        closeModal('modalExcluirComentario');
        showToast('Comentário excluído', 'success');
        renderDetalhesClientePage();
    } catch (e) { showToast('Erro ao excluir comentário.', 'error'); } 
    finally { btn.classList.remove('saving'); btn.disabled = false; }
}

function atualizarIndicadorDigitacao() {
    const texto = document.getElementById('novoComentario')?.value || '';
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.classList.toggle('visible', texto.length > 0);
}

async function salvarComentario() {
    if (isSavingComment) return;
    const texto = document.getElementById('novoComentario').value.trim();
    const msg = document.getElementById('comentarioMsg');

    if (!texto) {
        msg.textContent = 'Digite um comentário.';
        msg.style.color = '#ef4444';
        return;
    }

    isSavingComment = true;
    const btn = document.getElementById('btnSalvarTimeline');
    btn.querySelector('.btn-spinner').style.display = 'inline-block';
    btn.querySelector('.btn-text').textContent = 'Salvando...';
    btn.disabled = true; msg.textContent = '';

    try {
        const { error } = await db.from('comentarios').insert([{
            id_orcamento: clienteAtualParaDetalhes.id_orcamento,
            texto: texto, tipo: 'Comentário', autor: currentUser.nome
        }]);

        if (error) throw error;
        document.getElementById('novoComentario').value = '';
        atualizarIndicadorDigitacao();
        showToast('Histórico registrado!', 'success');
        await abrirDetalhesCliente(clienteAtualParaDetalhes.id_orcamento);
    } catch (e) {
        msg.textContent = 'Erro ao salvar: ' + e.message; msg.style.color = '#ef4444';
    } finally {
        isSavingComment = false;
        btn.querySelector('.btn-spinner').style.display = 'none';
        btn.querySelector('.btn-text').innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Registrar Histórico';
        btn.disabled = false;
    }
}

async function salvarObservacaoFixa(id) {
    const texto = document.getElementById('obsFixaCliente').value.trim();
    const loader = document.getElementById('obsSalvaLoader');
    try {
        const { error } = await db.from('orcamentos').update({ observacoes: texto }).eq('id_orcamento', id);
        if (error) throw error;
        
        if (loader) {
            loader.textContent = '✓ Salvo'; loader.style.color = 'var(--accent-green)'; loader.classList.add('visible');
            setTimeout(() => loader.classList.remove('visible'), 2500);
        }
        if (clienteAtualParaDetalhes && String(clienteAtualParaDetalhes.id_orcamento) === String(id)) {
            clienteAtualParaDetalhes.observacoes = texto;
        }
    } catch (e) {
        if (loader) {
            loader.textContent = 'Erro ao salvar'; loader.style.color = '#ef4444'; loader.classList.add('visible');
            setTimeout(() => loader.classList.remove('visible'), 3000);
        }
    }
}

function buildVendedorOptions() {
    let opts = '<option value="todos" ' + (selectedVendedor === 'todos' ? 'selected' : '') + '>Todos os vendedores</option>';
    todosVendedores.forEach(v => { opts += `<option value="${v.id_usuario}" ${selectedVendedor == v.id_usuario ? 'selected' : ''}>${escapeHtml(v.nome)}</option>`; });
    return opts;
}
function buildMonthOptions() {
    let opts = '';
    for (let i = 0; i < 12; i++) {
        const d = new Date(currentYear, i, 1);
        const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const sel = (d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear && !currentDay) ? 'selected' : '';
        opts += `<option value="${val}" ${sel}>${d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</option>`;
    }
    return opts;
}
function buildDayOptions() {
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    let opts = `<option value="todos" ${!currentDay ? 'selected' : ''}>Todos os dias</option>`;
    for (let d = 1; d <= daysInMonth; d++) {
        const sel = currentDay === d ? 'selected' : '';
        opts += `<option value="${d}" ${sel}>Dia ${d}</option>`;
    }
    return opts;
}

function renderFiltrosData(isGerente) {
    return `<div class="filter-group">
        ${isGerente ? `<div class="filter-wrapper"><span class="filter-icon"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></span><select class="vendedor-select" id="vendedorSelect" onchange="filtrarPorVendedor(this.value)" aria-label="Filtrar por vendedor">${buildVendedorOptions()}</select></div>` : ''}
        <div class="filter-wrapper"><span class="filter-icon"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/></svg></span><select class="month-select" id="monthSelect" onchange="changeMonth(this.value)" aria-label="Selecionar mês">${buildMonthOptions()}</select></div>
        <div class="filter-wrapper"><span class="filter-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg></span><select class="day-select" id="daySelect" onchange="changeDay(this.value)" aria-label="Selecionar dia">${buildDayOptions()}</select></div>
    </div>`;
}

async function filtrarPorVendedor(val) { selectedVendedor = val; currentPage = 1; await carregarKpisEDashboard(); atualizarTabelaPaginadaServer(); renderInicio(); }
async function changeMonth(val) { const [year, month] = val.split('-').map(Number); currentYear = year; currentMonth = month; currentDay = null; await carregarKpisEDashboard(); atualizarTabelaPaginadaServer(); renderInicio(); }
async function changeDay(val) { currentDay = val === 'todos' ? null : parseInt(val); await carregarKpisEDashboard(); atualizarTabelaPaginadaServer(); renderInicio(); }

function handleSearch() {
    searchTerm = document.getElementById('searchInput')?.value || '';
    currentPage = 1;
    atualizarTabelaPaginadaServer();
    const tagContainer = document.getElementById('searchTagContainer');
    if (tagContainer) {
        tagContainer.innerHTML = searchTerm ? `<span class="search-tag">🔍 "${escapeHtml(searchTerm)}" <span class="remove-search" onclick="clearSearch()" aria-label="Limpar busca">✕</span></span>` : '';
    }
}
function handleSearchProtocolo() {
    searchProtocolo = document.getElementById('searchProtocoloInput')?.value?.trim() || '';
    currentPage = 1;
    atualizarTabelaPaginadaServer();
}
function clearSearch() {
    searchTerm = '';
    searchProtocolo = '';
    const inp = document.getElementById('searchInput');
    if (inp) inp.value = '';
    const inpProt = document.getElementById('searchProtocoloInput');
    if (inpProt) inpProt.value = '';
    currentPage = 1;
    atualizarTabelaPaginadaServer();
    const tagContainer = document.getElementById('searchTagContainer');
    if (tagContainer) tagContainer.innerHTML = '';
}
function handleSearchClientes() {
    searchTerm = document.getElementById('searchInputClientes')?.value || '';
    renderClientes();
}
function selectFilter(filter) { currentFilter = filter; currentPage = 1; atualizarTabelaPaginadaServer(); }

function buildProdutosOptionsDatalist() {
    if (todosProdutos.length === 0) return '';
    return todosProdutos.map(p => `<option value="${escapeHtml(p.nome)}">`).join('');
}

function renderizarGraficos(total, fechados) {
    const ctxDonut = document.getElementById('donutCanvas');
    if (!ctxDonut) return false;
    
    const orcadosCount = total - fechados;
    
    if(donutChartInstance) { donutChartInstance.destroy(); }
    donutChartInstance = new Chart(ctxDonut, {
        type: 'doughnut',
        data: {
            labels: ['Orçados', 'Fechados'],
            datasets: [{
                data: [orcadosCount, fechados],
                backgroundColor: [
                    getComputedStyle(document.body).getPropertyValue('--chart-blue').trim() || '#3b82f6',
                    getComputedStyle(document.body).getPropertyValue('--chart-green').trim() || '#10b981'
                ],
                borderColor: '#fff',
                borderWidth: 3,
                borderRadius: 6,
                hoverBorderWidth: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: true, cutout: '65%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: getComputedStyle(document.body).getPropertyValue('--tooltip-bg').trim() || '#1e293b',
                    titleColor: getComputedStyle(document.body).getPropertyValue('--tooltip-text').trim() || '#f1f5f9',
                    bodyColor: getComputedStyle(document.body).getPropertyValue('--tooltip-body').trim() || '#cbd5e1',
                    padding: 12, cornerRadius: 8,
                    callbacks: {
                        label: function(ctx) {
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total ? Math.round((ctx.raw / total) * 100) : 0;
                            return ctx.label + ': ' + ctx.raw + ' (' + pct + '%)';
                        }
                    }
                }
            }
        }
    });

    const ctxBar = document.getElementById('barChartCanvas');
    if (ctxBar && historicoFaturamento.length > 0) {
        if(barChartInstance) { barChartInstance.destroy(); }
        barChartInstance = new Chart(ctxBar, {
            type: 'bar',
            data: {
                labels: historicoFaturamento.map(h => h.mes),
                datasets: [{
                    label: 'Vendido',
                    data: historicoFaturamento.map(h => h.valor),
                    backgroundColor: getComputedStyle(document.body).getPropertyValue('--chart-green').trim() || '#10b981',
                    borderRadius: 6, borderSkipped: false, maxBarThickness: 40
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: getComputedStyle(document.body).getPropertyValue('--tooltip-bg').trim() || '#1e293b',
                        titleColor: getComputedStyle(document.body).getPropertyValue('--tooltip-text').trim() || '#f1f5f9',
                        bodyColor: getComputedStyle(document.body).getPropertyValue('--tooltip-body').trim() || '#cbd5e1',
                        padding: 10, cornerRadius: 6,
                        callbacks: {
                            label: function(ctx) { return 'R$ ' + ctx.raw.toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) { return value >= 1000 ? 'R$ ' + (value / 1000).toFixed(0) + 'k' : 'R$ ' + value; },
                            font: { size: 10, family: 'Inter' }, maxTicksLimit: 5
                        },
                        grid: { color: '#e2e8f0' }
                    },
                    x: { grid: { display: false }, ticks: { font: { size: 10, family: 'Inter' }, maxRotation: 45, minRotation: 0 } }
                }
            }
        });
    }
    return true;
}

function tentarRenderizarGraficos(total, fechados, tentativas = 0) {
    if (tentativas > 5) return;
    const donutCanvas = document.getElementById('donutCanvas');
    if (!donutCanvas) { setTimeout(() => tentarRenderizarGraficos(total, fechados, tentativas + 1), 300); return; }
    renderizarGraficos(total, fechados);
}

function buildNotifications() {
    const hoje = new Date().toISOString().split('T')[0];
    const notificacoes = [];
    const isEmAberto = (s) => [STATUS.EM_NEGOCIACAO, STATUS.CONTATO_INICIAL, STATUS.NEGOCIACAO, STATUS.AGUARDANDO].includes(s);
    const agendadosHoje = kpisMensais.filter(o => o.data_contato === hoje && isEmAberto(o.status));
    const atrasados = kpisMensais.filter(o => o.data_contato && o.data_contato < hoje && isEmAberto(o.status));
    agendadosHoje.forEach(o => notificacoes.push({ tipo: 'info', texto: `Contato agendado hoje: <strong>${escapeHtml(o.clientes?.nome_cliente || 'Cliente')}</strong>`, id: o.id_orcamento, data: o.hora_contato || 'horário não definido' }));
    atrasados.forEach(o => notificacoes.push({ tipo: 'critical', texto: `Contato atrasado: <strong>${escapeHtml(o.clientes?.nome_cliente || 'Cliente')}</strong>`, id: o.id_orcamento, data: o.data_contato || 'data não definida' }));
    
    const naoLidas = notificacoes.filter(n => { if (n.id === null) return true; return !notificacoesLidas.has(n.id); });
    if (naoLidas.length === 0) naoLidas.push({ tipo: 'info', texto: 'Nenhum alerta no momento.', id: null, data: '' });
    return naoLidas;
}

function renderNotificationBadge(count) {
    const badge = document.getElementById('notificationBadgeCount');
    if (!badge) return;
    if (count > 0) { badge.textContent = count > 99 ? '99+' : count; badge.classList.add('visible'); }
    else { badge.classList.remove('visible'); }
}

function toggleNotifications() {
    const dropdown = document.getElementById('notificationDropdown');
    const notificacoes = buildNotifications(); 
    const idsParaMarcar = notificacoes.filter(n => n.id !== null).map(n => n.id);
    if (idsParaMarcar.length > 0) {
        marcarTodasNotificacoesLidas(idsParaMarcar);
        const novasNotificacoes = buildNotifications();
        renderizarDropdownNotificacoes(novasNotificacoes);
        renderNotificationBadge(novasNotificacoes.filter(n => n.id !== null).length);
    } else {
        renderizarDropdownNotificacoes(notificacoes);
    }
    dropdown.classList.toggle('open');
    if (dropdown.classList.contains('open')) {
        document.addEventListener('click', function closeNotif(e) {
            const btn = document.getElementById('btnNotification');
            const dd = document.getElementById('notificationDropdown');
            if (btn && dd && !btn.contains(e.target) && !dd.contains(e.target)) {
                dd.classList.remove('open'); document.removeEventListener('click', closeNotif);
            }
        }, { once: true });
    }
}

function renderizarDropdownNotificacoes(notificacoes) {
    const dropdown = document.getElementById('notificationDropdown');
    let html = '<div class="notif-header">Central de Alertas</div>';
    notificacoes.forEach(n => {
        const dotClass = n.tipo === 'critical' ? 'critical' : n.tipo === 'warning' ? 'warning' : 'info';
        const onclick = n.id ? `onclick="marcarNotificacaoLida('${n.id}'); abrirDetalhesCliente('${n.id}'); document.getElementById('notificationDropdown').classList.remove('open');"` : '';
        html += `<div class="notif-item" ${onclick} style="${n.id ? '' : 'cursor:default;'}"><span class="notif-dot ${dotClass}"></span><div style="flex:1;"><div>${n.texto}</div><div style="font-size:10px; color:var(--text-muted);">${escapeHtml(n.data)}</div></div></div>`;
    });
    dropdown.innerHTML = html;
}

function classToFormatStatus(status) {
    const map = { 'Contato Inicial': 'contato-inicial', 'Negociação de Valores': 'negociacao-valores', 'Aguardando Decisão': 'aguardando-decisao', 'Vendido': 'vendido', 'Fechado': 'fechado', 'Perdido': 'perdido', 'Declinado': 'declinado', 'Pós-Venda': 'pos-venda', 'Em Negociação': 'em-atendimento' };
    return map[status] || 'em-atendimento';
}

function renderInicio() {
    const main = document.getElementById('mainContent');
    const dados = kpisMensais;
    const total = dados.length;
    const fechadosArr = dados.filter(o => o.status === STATUS.FECHADO || o.status === STATUS.VENDIDO);
    const fechados = fechadosArr.length;
    const negociacao = dados.filter(o => [STATUS.EM_NEGOCIACAO, STATUS.CONTATO_INICIAL, STATUS.NEGOCIACAO, STATUS.AGUARDANDO].includes(o.status)).length;
    const valorVendido = fechadosArr.reduce((s, o) => s + parseFloat(o.valor_orcado || 0), 0);
    const conversao = total ? Math.round((fechados / total) * 100) : 0;
    const metaAtual = calcularMetaTotal();
    const percMetaExato = metaAtual ? Math.round((valorVendido / metaAtual) * 100) : 0;

    const isGerente = currentUser.perfil === 'Gerente' || currentUser.perfil === 'Administrador' || currentUser.perfil === 'Admin';
    const gamified = getGamifiedColors(percMetaExato);

    const headerHtml = `<header class="dashboard-header"><h1>${isGerente ? 'Dashboard Vendas' : 'Dashboard do Vendedor'}</h1><div class="header-controls">${renderFiltrosData(isGerente)}<div class="header-notification-area"><button class="btn-notification" id="btnNotification" onclick="event.stopPropagation(); toggleNotifications();" aria-label="Notificações"><svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg><span class="notification-badge" id="notificationBadgeCount"></span></button></div></div></header>`;
    const progressHtml = `<div class="gamified-progress-card"><div class="progress-icon" style="background:${gamified.iconBg}; box-shadow:${gamified.shadow};">${gamified.iconSvg}</div><div class="progress-info"><h3>Atingimento de Meta</h3><p class="progress-subtitle">R$ ${valorVendido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ ${metaAtual.toLocaleString('pt-BR')}</p></div><div class="progress-bar-outer"><div class="progress-bar-inner-gamified" style="width:${Math.min(100, percMetaExato)}%; background:${gamified.bg}; box-shadow:${gamified.shadow};"><span class="progress-percent">${percMetaExato > 100 ? '100+' : percMetaExato}%</span></div></div><div class="progress-motive-text" style="color:${gamified.motiveColor};">${gamified.motive}</div></div>`;
    const kpiHtml = `<div class="kpi-card"><div class="kpi-label-row"><span class="kpi-dot blue"></span><span class="kpi-label">Oportunidades Geradas</span></div><div class="kpi-value">${total}</div></div><div class="kpi-card"><div class="kpi-label-row"><span class="kpi-dot orange"></span><span class="kpi-label">Em Tratativa</span></div><div class="kpi-value">${negociacao}</div></div><div class="kpi-card"><div class="kpi-label-row"><span class="kpi-dot green"></span><span class="kpi-label">Taxa de Conversão</span></div><div class="kpi-value">${conversao}%</div></div><div class="kpi-card vendido-highlight"><div class="kpi-label-row"><span class="kpi-dot green"></span><span class="kpi-label">Vendas Fechadas</span></div><div class="kpi-value">R$ ${valorVendido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div></div>`;

    const donutHtml = `<div class="chart-card"><h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Aproveitamento</h3><div class="donut-wrapper"><canvas id="donutCanvas" width="200" height="200"></canvas></div><div class="donut-legend"><div style="display:flex; align-items:center; gap:8px;"><span class="legend-color orcados"></span> Orçados <strong>${total}</strong></div><div style="display:flex; align-items:center; gap:8px;"><span class="legend-color fechados"></span> Fechados <strong>${fechados}</strong></div></div></div>`;

    let barChartHtml = '';
    if (!isGerente) {
        if (historicoFaturamento.length > 0) {
            barChartHtml = `<div class="chart-card"><h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg> Evolução Mensal</h3><div class="bar-chart-wrapper"><canvas id="barChartCanvas"></canvas></div></div>`;
        } else {
            barChartHtml = `<div class="chart-card"><h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg> Evolução Mensal</h3><div style="display:flex; align-items:center; justify-content:center; height:200px; color:var(--text-muted);">Sem dados de faturamento no período.</div></div>`;
        }
    }

    let rankingHtml = '';
    if (isGerente) {
        if (todosVendedores.length > 0) {
            const maxValor = Math.max(1, ...todosVendedores.map(v => dados.filter(o => o.id_usuario === v.id_usuario && (o.status === STATUS.FECHADO || o.status === STATUS.VENDIDO)).reduce((s, o) => s + parseFloat(o.valor_orcado || 0), 0)));
            const ranking = todosVendedores.map(v => {
                const vendido = dados.filter(o => o.id_usuario === v.id_usuario && (o.status === STATUS.FECHADO || o.status === STATUS.VENDIDO)).reduce((s, o) => s + parseFloat(o.valor_orcado || 0), 0);
                return { nome: v.nome, vendido, pct: maxValor ? (vendido / maxValor) * 100 : 0 };
            }).sort((a, b) => b.vendido - a.vendido);
            rankingHtml = `<div class="chart-card"><h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg> Top Vendedores</h3><ul class="ranking-list">${ranking.map((r, i) => `<li class="ranking-item"><span class="ranking-pos">#${i + 1}</span><span class="ranking-nome">${escapeHtml(r.nome)}</span><div class="ranking-bar-outer"><div class="ranking-bar-inner" style="width:${r.pct}%;"><span>${Math.round(r.pct)}%</span></div></div><span class="ranking-valor">R$ ${r.vendido.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span></li>`).join('')}</ul></div>`;
        } else {
            rankingHtml = `<div class="chart-card"><h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg> Top Vendedores</h3><div style="display:flex; align-items:center; justify-content:center; height:200px; color:var(--text-muted);">Nenhum vendedor cadastrado.</div></div>`;
        }
    }

    const top5 = {};
    fechadosArr.forEach(o => { const m = (o.modelo_colchao || 'Sem modelo').trim(); if (!top5[m]) top5[m] = { nome: m, count: 0 }; top5[m].count++; });
    const top5Ordenado = Object.values(top5).sort((a, b) => b.count - a.count).slice(0, 5);
    const top5Html = top5Ordenado.map((p, i) => `<li><span class="top5-rank">${i + 1}</span><span style="flex:1;">${escapeHtml(p.nome)}</span></li>`).join('') || '<li style="justify-content:center; color:var(--text-muted);">Nenhuma venda fechada</li>';

    const colVendedor = isGerente ? '<th>Vendedor</th>' : '';
    const searchTagHtml = searchTerm ? `<span class="search-tag">🔍 "${escapeHtml(searchTerm)}" <span class="remove-search" onclick="clearSearch()" aria-label="Limpar busca">✕</span></span>` : '';

    const tabelaHtml = `<div class="table-card"><div class="table-card-header"><h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg> Carteira de Negociações</h3><div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
    <div id="searchTagContainer">${searchTagHtml}</div>
    <input type="text" class="search-input" placeholder="Buscar cliente..." id="searchInput" onchange="handleSearch()" onkeyup="if(event.key === 'Enter') handleSearch()" value="${escapeHtml(searchTerm)}" aria-label="Buscar cliente">
    <input type="text" class="search-input" placeholder="Buscar protocolo..." id="searchProtocoloInput" onchange="handleSearchProtocolo()" onkeyup="if(event.key === 'Enter') handleSearchProtocolo()" value="${escapeHtml(searchProtocolo)}" aria-label="Buscar por protocolo" style="width:160px;">
    <select class="form-input" style="width:auto; padding:8px 16px; border-radius:20px; font-size:var(--font-sm);" id="listFilterSelect" onchange="selectFilter(this.value)" aria-label="Filtrar por status">
        <option value="todos" ${currentFilter === 'todos' ? 'selected' : ''}>Todos</option>
        <option value="Contato Inicial" ${currentFilter === STATUS.CONTATO_INICIAL ? 'selected' : ''}>Contato Inicial</option>
        <option value="Negociação de Valores" ${currentFilter === STATUS.NEGOCIACAO ? 'selected' : ''}>Negociação de Valores</option>
        <option value="Aguardando Decisão" ${currentFilter === STATUS.AGUARDANDO ? 'selected' : ''}>Aguardando Decisão</option>
        <option value="Vendido" ${currentFilter === STATUS.VENDIDO ? 'selected' : ''}>Vendido</option>
        <option value="Perdido" ${currentFilter === STATUS.PERDIDO ? 'selected' : ''}>Perdido</option>
        <option value="Pós-Venda" ${currentFilter === STATUS.POS_VENDA ? 'selected' : ''}>Pós-Venda</option>
    </select>
    </div></div><table><thead><tr><th style="width:90px;">Protocolo</th><th>Cliente</th><th>Produto</th>${colVendedor}<th>Status</th><th>Data</th><th>Valor</th></tr></thead><tbody id="tableBody"></tbody></table><div class="pagination" id="paginationContainer"></div></div>`;

    let chartsRowHtml = '';
    if (isGerente) {
        chartsRowHtml = `<section class="charts-row">${donutHtml}${rankingHtml}<div class="chart-card"><h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg> Mais Vendidos</h3><ul class="top5-list">${top5Html}</ul></div></section>`;
    } else {
        const barrasOuVazio = barChartHtml || `<div class="chart-card"><h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg> Evolução Mensal</h3><div style="display:flex; align-items:center; justify-content:center; height:200px; color:var(--text-muted);">Dados insuficientes para o gráfico.</div></div>`;
        chartsRowHtml = `<section class="charts-row-triplo">${donutHtml}${barrasOuVazio}<div class="chart-card"><h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg> Mais Vendidos</h3><ul class="top5-list">${top5Html}</ul></div></section>`;
    }

    main.innerHTML = `${headerHtml}${progressHtml}<section class="kpi-row">${kpiHtml}</section>${chartsRowHtml}${tabelaHtml}`;

    requestAnimationFrame(() => { tentarRenderizarGraficos(total, fechados); });
    atualizarTabelaPaginadaServer();
}

function renderAgendaDia() {
    const hoje = new Date().toISOString().split('T')[0];
    const agendados = kpisMensais.filter(o => { return o.data_contato === hoje && [STATUS.EM_NEGOCIACAO, STATUS.CONTATO_INICIAL, STATUS.NEGOCIACAO, STATUS.AGUARDANDO].includes(o.status); });
    const isGerente = currentUser.perfil === 'Gerente' || currentUser.perfil === 'Administrador' || currentUser.perfil === 'Admin';
    let html = `<header class="dashboard-header"><h1>Agenda do Dia</h1><div class="header-controls">${isGerente ? `<div class="filter-wrapper"><span class="filter-icon"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></span><select class="vendedor-select" id="vendedorSelectAgenda" onchange="filtrarPorVendedor(this.value)">${buildVendedorOptions()}</select></div>` : ''}<div class="filter-wrapper"><span class="filter-icon"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/></svg></span><select class="month-select" onchange="changeMonth(this.value)">${buildMonthOptions()}</select></div><div class="filter-wrapper"><span class="filter-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg></span><select class="day-select" onchange="changeDay(this.value)">${buildDayOptions()}</select></div><div class="header-notification-area"><button class="btn-notification" id="btnNotification" onclick="event.stopPropagation(); toggleNotifications();" aria-label="Notificações"><svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg><span class="notification-badge" id="notificationBadgeCount"></span></button></div></div></header>`;
    if (agendados.length === 0) { html += '<div class="chart-card" style="text-align:center; padding:48px; color:var(--text-muted);">Nenhum contato agendado para hoje.</div>'; }
    else {
        const colVendedorAgenda = isGerente ? '<th>Vendedor</th>' : '';
        html += `<div class="table-card"><table><thead><tr><th>Cliente</th><th>WhatsApp</th><th>Motivo do Contato</th><th>Produto</th>${colVendedorAgenda}<th>Horário</th><th>Ação</th></tr></thead><tbody>`;
        agendados.forEach(o => {
            const nome = escapeHtml(o.clientes?.nome_cliente || 'Cliente');
            const whats = (o.clientes?.whatsapp || '').replace(/\D/g, '');
            const motivo = escapeHtml(o.observacao_agendamento || '-');
            html += `<tr class="clickable-row" data-id="${o.id_orcamento}"><td><span class="client-name">${nome}</span></td><td>${escapeHtml(o.clientes?.whatsapp || '-')}</td><td style="font-size:var(--font-xs); color:var(--text-secondary);">${motivo}</td><td>${escapeHtml(o.modelo_colchao || '-')}</td>${isGerente ? `<td>${escapeHtml(o.usuarios?.nome || '-')}</td>` : ''}<td>${escapeHtml(o.hora_contato || '-')}</td><td><a href="https://wa.me/55${whats}" target="_blank" class="btn-whatsapp-full" style="padding:8px 14px; font-size:12px;" onclick="event.stopPropagation()">Ligar</a></td></tr>`;
        });
        html += '</tbody></table></div>';
    }
    document.getElementById('mainContent').innerHTML = html;
    document.querySelectorAll('.table-card tbody tr.clickable-row').forEach(row => { row.addEventListener('click', function() { const id = this.getAttribute('data-id'); if (id) abrirDetalhesCliente(id); }); });
}

// legacy – kept for compatibility but redirects to new page
function renderClientes() { navigateTo('clientes_lista'); }

// Helper: detect the real PK field of the clientes table
async function detectClientePK() {
    if (window._clientePK) return window._clientePK;
    const { data, error } = await db.from('clientes').select('*').limit(1);
    if (error || !data || data.length === 0) {
        // Try common names
        for (const candidate of ['id_cliente','id','uuid']) {
            const probe = await db.from('clientes').select(candidate).limit(1);
            if (!probe.error) { window._clientePK = candidate; return candidate; }
        }
        return 'id'; // last resort
    }
    const row = data[0];
    for (const candidate of ['id_cliente','id','uuid']) {
        if (candidate in row) { window._clientePK = candidate; return candidate; }
    }
    // fallback: first key that looks like an id
    const pk = Object.keys(row).find(k => k.toLowerCase().includes('id')) || Object.keys(row)[0];
    window._clientePK = pk;
    return pk;
}

async function renderClientesLista() {
    const main = document.getElementById('mainContent');
    main.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">Carregando clientes...</div>';
    try {
        const pk = await detectClientePK();
        const isVendedor = currentUser.perfil === 'Vendedor';

        let clienteIds = null;
        if (isVendedor) {
            // Buscar apenas clientes vinculados a orçamentos do vendedor logado
            const { data: orcsVendedor, error: erroOrcs } = await db
                .from('orcamentos')
                .select('id_cliente')
                .eq('id_usuario', currentUser.id_usuario);
            if (erroOrcs) throw erroOrcs;
            const ids = [...new Set((orcsVendedor || []).map(o => o.id_cliente).filter(Boolean))];
            if (ids.length === 0) {
                main.innerHTML = `
                    <header class="dashboard-header"><h1>Clientes</h1></header>
                    <div class="table-card" style="text-align:center;padding:48px;color:var(--text-muted);">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:12px;opacity:.4;"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        <p style="font-size:var(--font-md);font-weight:600;margin-bottom:6px;">Nenhum cliente encontrado</p>
                        <p style="font-size:var(--font-sm);">Você ainda não possui clientes vinculados a orçamentos seus.</p>
                    </div>`;
                return;
            }
            clienteIds = ids;
        }

        let query = db.from('clientes')
            .select(`${pk}, nome_cliente, whatsapp, cpf, email, id_cliente_codigo, orcamentos(id_orcamento, data_criacao, id_usuario, usuarios(nome), status_orcamento(nome))`)
            .order('nome_cliente');

        if (isVendedor && clienteIds) {
            query = query.in(pk, clienteIds);
        }

        const { data: clientes, error } = await query;
        if (error) throw error;
        // Normalise: expose pkValue as c.pkVal for all downstream use
        (clientes || []).forEach(c => { c._pk = c[pk]; });

        const isGerente = currentUser.perfil === 'Gerente' || currentUser.perfil === 'Administrador' || currentUser.perfil === 'Admin';

        // build search state
        const busca = (window._clienteBusca || '').toLowerCase();

        let lista = clientes || [];
        if (busca) lista = lista.filter(c =>
            (c.nome_cliente || '').toLowerCase().includes(busca) ||
            (c.cpf || '').includes(busca) ||
            (c.email || '').toLowerCase().includes(busca) ||
            (c.whatsapp || '').includes(busca) ||
            (c.id_cliente_codigo || '').toLowerCase().includes(busca)
        );

        const rows = lista.map(c => {
            const orcs = c.orcamentos || [];
            // sort by date desc
            orcs.sort((a,b) => new Date(b.data_criacao) - new Date(a.data_criacao));
            const ultimoOrc = orcs[0];
            const ultimoContato = ultimoOrc ? new Date(ultimoOrc.data_criacao).toLocaleDateString('pt-BR') : '-';
            const vendedor = ultimoOrc?.usuarios?.nome || '-';
            const codigo = escapeHtml(c.id_cliente_codigo || String(c._pk || '').slice(0,8) || '-');

            return `<tr>
                <td><span class="cliente-id-badge">${codigo}</span></td>
                <td><span class="client-name" onclick="abrirFichaCliente('${c._pk}')" style="cursor:pointer;">${escapeHtml(c.nome_cliente || '-')}</span></td>
                <td style="color:var(--text-secondary);">${escapeHtml(c.email || '-')}</td>
                <td>${escapeHtml(c.whatsapp || '-')}</td>
                ${isGerente ? `<td>${escapeHtml(vendedor)}</td>` : ''}
                <td>${ultimoContato}</td>
                <td>
                    <div style="display:flex;gap:4px;align-items:center;">
                        <button class="btn-action-icon" title="Ver ficha" onclick="abrirFichaCliente('${c._pk}')">
                            <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </button>
                        <button class="btn-action-icon" title="Editar" onclick="abrirModalEditarCliente('${c._pk}')">
                            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        ${!isVendedor ? `<button class="btn-action-icon danger" title="Excluir" onclick="abrirModalExcluirCliente('${c._pk}','${escapeHtml(c.nome_cliente || '')}')">
                            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                        </button>` : ''}
                        <button class="btn-action-icon green" title="Criar negócio" onclick="abrirModalCriarNegocio('${c._pk}','${escapeHtml(c.nome_cliente || '')}','${escapeHtml(c.cpf || '')}','${escapeHtml(c.whatsapp || '')}','${escapeHtml(c.email || '')}')">
                            <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');

        const emptyRow = `<tr><td colspan="${isGerente ? 7 : 6}" style="text-align:center;padding:32px;color:var(--text-muted);">Nenhum cliente encontrado.</td></tr>`;

        main.innerHTML = `
            <header class="dashboard-header">
                <h1>Clientes</h1>
                <div class="header-controls">
                    <div class="header-notification-area">
                        <button class="btn-notification" onclick="event.stopPropagation();toggleNotifications();" aria-label="Notificações">
                            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
                            <span class="notification-badge" id="notificationBadgeCount"></span>
                        </button>
                    </div>
                </div>
            </header>
            <div class="table-card">
                <div class="clientes-header-bar">
                    <div class="clientes-search-row">
                        <input type="text" class="search-input" placeholder="Buscar por nome, CPF, e-mail..." id="inputBuscaClientes" value="${escapeHtml(window._clienteBusca || '')}" oninput="filtrarClientesLista(this.value)" style="width:260px;">
                    </div>
                    <span style="font-size:var(--font-xs);color:var(--text-muted);">${lista.length} cliente${lista.length !== 1 ? 's' : ''}</span>
                </div>
                <div style="overflow-x:auto;">
                <table>
                    <thead><tr>
                        <th style="width:100px;">ID</th>
                        <th>Nome / Razão Social</th>
                        <th>E-mail</th>
                        <th>Telefone</th>
                        ${isGerente ? '<th>Vendedor</th>' : ''}
                        <th>Último Contato</th>
                        <th style="width:130px;">Ações</th>
                    </tr></thead>
                    <tbody>${rows || emptyRow}</tbody>
                </table>
                </div>
            </div>`;

        // rebind notification badge
        renderNotificationBadge && renderNotificationBadge(buildNotifications().filter(n=>n.id!==null).length);
    } catch(e) {
        main.innerHTML = `<div style="padding:40px;text-align:center;color:#ef4444;">Erro ao carregar clientes: ${escapeHtml(e.message)}</div>`;
    }
}

function filtrarClientesLista(val) {
    window._clienteBusca = val;
    renderClientesLista();
}

async function abrirFichaCliente(idCliente) {
    clienteSelecionadoParaAcao = idCliente;
    previousView = currentView;
    currentView = 'ficha_cliente';
    await renderFichaCliente();
}

async function renderFichaCliente() {
    const main = document.getElementById('mainContent');
    main.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">Carregando ficha...</div>';
    try {
        const pk = await detectClientePK();
        const { data: c, error } = await db.from('clientes')
            .select('*')
            .eq(pk, clienteSelecionadoParaAcao)
            .single();
        if (error || !c) throw new Error('Cliente não encontrado');
        c._pk = c[pk];

        const { data: orcs } = await db.from('orcamentos')
            .select('id_orcamento, protocolo, data_criacao, valor_orcado, modelo_colchao, status_orcamento(nome), usuarios(nome)')
            .eq('id_cliente', c._pk)
            .order('data_criacao', { ascending: false })
            .limit(20);

        const codigo = escapeHtml(c.id_cliente_codigo || String(c._pk || '').slice(0,8) || '-');
        const orcsHtml = (orcs || []).length === 0
            ? '<p style="color:var(--text-muted);padding:16px 0;">Nenhum orçamento vinculado.</p>'
            : (orcs || []).map(o => {
                const st = o.status_orcamento?.nome || '-';
                const stClass = classToFormatStatus(st);
                const idNum = o.protocolo && o.protocolo.includes('-') ? o.protocolo.split('-')[1] : (o.protocolo || o.id_orcamento?.slice(0,8));
                return `<div class="orc-mini-card" onclick="abrirDetalhesCliente('${o.id_orcamento}')">
                    <span class="orc-mini-num">${escapeHtml(String(idNum))}</span>
                    <div class="orc-mini-info">
                        <div style="font-weight:600;font-size:var(--font-sm);margin-bottom:2px;">${escapeHtml(o.modelo_colchao || '-')}</div>
                        <div style="font-size:var(--font-xs);color:var(--text-muted);">${new Date(o.data_criacao).toLocaleDateString('pt-BR')} · ${escapeHtml(o.usuarios?.nome || '-')}</div>
                    </div>
                    <span class="status-tag ${stClass}" style="font-size:10px;">${escapeHtml(st)}</span>
                    <span class="orc-mini-valor">R$ ${parseFloat(o.valor_orcado||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
                </div>`;
            }).join('');

        main.innerHTML = `
            <header class="dashboard-header">
                <div style="display:flex;align-items:center;gap:16px;">
                    <button class="btn-voltar" onclick="navigateTo('clientes_lista')">← Voltar</button>
                    <h1>${escapeHtml(c.nome_cliente || 'Cliente')}</h1>
                    <span class="cliente-id-badge">${codigo}</span>
                </div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;">
                    <button class="btn-primary-action" onclick="abrirModalEditarCliente('${c._pk}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        Editar
                    </button>
                    <button class="btn-primary-action" style="background:var(--accent-green);" onclick="abrirModalCriarNegocio('${c._pk}','${escapeHtml(c.nome_cliente||'')}','${escapeHtml(c.cpf||'')}','${escapeHtml(c.whatsapp||'')}','${escapeHtml(c.email||'')}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Criar Negócio
                    </button>
                    ${currentUser.perfil !== 'Vendedor' ? `<button class="btn-danger-ghost" onclick="abrirModalExcluirCliente('${c._pk}','${escapeHtml(c.nome_cliente||'')}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>
                        Excluir
                    </button>` : ''}
                </div>
            </header>
            <div class="ficha-grid">
                <aside class="ficha-side">
                    <div class="info-card">
                        <h4 class="info-card-title">
                            <svg class="info-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            Dados do Cliente
                        </h4>
                        <div class="ficha-data-row"><span class="ficha-label">ID</span><span class="ficha-value"><span class="cliente-id-badge">${codigo}</span></span></div>
                        <div class="ficha-data-row"><span class="ficha-label">Nome</span><span class="ficha-value">${escapeHtml(c.nome_cliente||'-')}</span></div>
                        <div class="ficha-data-row"><span class="ficha-label">CPF / CNPJ</span><span class="ficha-value">${escapeHtml(c.cpf||'-')}</span></div>
                        <div class="ficha-data-row"><span class="ficha-label">E-mail</span><span class="ficha-value">${escapeHtml(c.email||'-')}</span></div>
                        <div class="ficha-data-row"><span class="ficha-label">WhatsApp</span><span class="ficha-value">${escapeHtml(c.whatsapp||'-')}</span></div>
                        <div class="ficha-data-row"><span class="ficha-label">Orçamentos</span><span class="ficha-value" style="font-weight:700;">${(orcs||[]).length}</span></div>
                    </div>
                    ${c.whatsapp ? `<a href="https://wa.me/55${(c.whatsapp||'').replace(/\D/g,'')}" target="_blank" class="btn-whatsapp-full">
                        <svg class="btn-whatsapp-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        Iniciar Conversa WhatsApp
                    </a>` : ''}
                </aside>
                <div class="info-card">
                    <h4 class="info-card-title" style="margin-bottom:16px;">
                        <svg class="info-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        Últimos Orçamentos
                    </h4>
                    <div style="display:flex;flex-direction:column;gap:10px;">${orcsHtml}</div>
                </div>
            </div>`;
    } catch(e) {
        main.innerHTML = `<div style="padding:40px;text-align:center;color:#ef4444;">Erro ao carregar ficha: ${escapeHtml(e.message)}</div>`;
    }
}

function abrirModalEditarCliente(idCliente) {
    // Find client in the DOM or re-fetch
    document.getElementById('editClienteId').value = idCliente;
    document.getElementById('errEditNome').textContent = '';
    document.getElementById('errEditCpf').textContent = '';
    document.getElementById('errEditTel').textContent = '';
    document.getElementById('errEditEmail').textContent = '';
    // Remove aviso anterior se existir
    const avisoAnterior = document.getElementById('avisoEdicaoCliente');
    if (avisoAnterior) avisoAnterior.remove();
    // Load from DB
    detectClientePK().then(pk => db.from('clientes').select('*').eq(pk, idCliente).single()).then(({data, error}) => {
        if (error || !data) { showToast('Erro ao carregar cliente.','error'); return; }
        const isVendedor = currentUser.perfil === 'Vendedor';
        const campoNome = document.getElementById('editClienteNome');
        const campoCpf = document.getElementById('editClienteCpf');
        campoNome.value = data.nome_cliente || '';
        campoCpf.value = data.cpf || '';
        document.getElementById('editClienteTel').value = data.whatsapp || '';
        document.getElementById('editClienteEmail').value = data.email || '';
        if (isVendedor) {
            campoNome.disabled = true;
            campoCpf.disabled = true;
            // Inserir aviso visual no modal
            const aviso = document.createElement('div');
            aviso.id = 'avisoEdicaoCliente';
            aviso.style.cssText = 'background:#fef3c7;border:1px solid #fcd34d;color:#92400e;padding:10px 14px;border-radius:8px;font-size:var(--font-xs);font-weight:600;margin-top:10px;display:flex;align-items:center;gap:8px;';
            aviso.innerHTML = '⚠️ Você só pode editar e-mail e telefone. Nome e CPF estão bloqueados.';
            document.getElementById('modalEditarCliente').querySelector('.modal-btns').before(aviso);
        } else {
            campoNome.disabled = false;
            campoCpf.disabled = false;
        }
        openModal('modalEditarCliente');
    });
}

async function salvarEdicaoCliente() {
    const id = document.getElementById('editClienteId').value;
    const isVendedor = currentUser.perfil === 'Vendedor';
    const nome = document.getElementById('editClienteNome').value.trim();
    const cpfRaw = document.getElementById('editClienteCpf').value.replace(/\D/g,'');
    const tel = document.getElementById('editClienteTel').value.trim();
    const email = document.getElementById('editClienteEmail').value.trim();
    let valid = true;
    document.getElementById('errEditNome').textContent = '';
    document.getElementById('errEditCpf').textContent = '';
    document.getElementById('errEditTel').textContent = '';
    if (!isVendedor && !nome) { document.getElementById('errEditNome').textContent = 'Obrigatório'; valid = false; }
    if (!isVendedor && !cpfRaw) { document.getElementById('errEditCpf').textContent = 'Obrigatório'; valid = false; }
    if (!tel) { document.getElementById('errEditTel').textContent = 'Obrigatório'; valid = false; }
    if (!valid) return;

    const pk = await detectClientePK();

    let updatePayload = { whatsapp: tel, email };

    if (!isVendedor) {
        // Verificar unicidade de CPF para perfis com permissão de editar
        const { data: dup } = await db.from('clientes').select(pk).eq('cpf', cpfRaw).neq(pk, id).maybeSingle();
        if (dup) { document.getElementById('errEditCpf').textContent = 'CPF/CNPJ já pertence a outro cliente.'; return; }
        updatePayload.nome_cliente = nome;
        updatePayload.cpf = cpfRaw;
    }

    const btn = document.getElementById('btnSalvarEditCliente');
    btn.classList.add('saving'); btn.disabled = true;
    try {
        const { error } = await db.from('clientes').update(updatePayload).eq(pk, id);
        if (error) throw error;
        showToast('Cliente atualizado com sucesso!', 'success');
        closeModal('modalEditarCliente');
        // refresh current view
        if (currentView === 'ficha_cliente') await renderFichaCliente();
        else await renderClientesLista();
    } catch(e) { showToast('Erro ao salvar: ' + e.message, 'error'); }
    finally { btn.classList.remove('saving'); btn.disabled = false; }
}

function abrirModalExcluirCliente(idCliente, nomeCliente) {
    clienteSelecionadoParaAcao = idCliente;
    document.getElementById('nomeClienteExcluir').textContent = nomeCliente;
    document.getElementById('errExcluirCliente').textContent = '';
    document.getElementById('avisoExcluirCliente').textContent = 'Atenção: se este cliente possuir orçamentos vinculados, a exclusão será bloqueada. Considere apenas editar o cadastro.';
    openModal('modalExcluirCliente');
}

async function confirmarExcluirCliente() {
    if (currentUser.perfil === 'Vendedor') {
        showToast('Você não tem permissão para excluir clientes.', 'error');
        closeModal('modalExcluirCliente');
        return;
    }
    const id = clienteSelecionadoParaAcao;
    if (!id) return;
    const btn = document.getElementById('btnConfirmarExcluirCliente');
    btn.classList.add('saving'); btn.disabled = true;
    try {
        // Check for linked budgets
        const pk = await detectClientePK(); const { count, error: ce } = await db.from('orcamentos').select('*', {count:'exact',head:true}).eq('id_cliente', id);
        if (ce) throw ce;
        if (count > 0) {
            document.getElementById('errExcluirCliente').textContent = `Não é possível excluir: cliente possui ${count} orçamento(s) vinculado(s).`;
            return;
        }
        const { error } = await db.from('clientes').delete().eq(pk, id);
        if (error) throw error;
        showToast('Cliente excluído com sucesso.', 'success');
        closeModal('modalExcluirCliente');
        clienteSelecionadoParaAcao = null;
        await renderClientesLista();
    } catch(e) { showToast('Erro ao excluir: ' + e.message, 'error'); }
    finally { btn.classList.remove('saving'); btn.disabled = false; }
}

function abrirModalCriarNegocio(idCliente, nomeCliente, cpf, tel, email) {
    clienteParaOrcamento = { id: idCliente, nome: nomeCliente, cpf, tel, email };
    document.getElementById('nomeClienteNegocio').textContent = nomeCliente;
    openModal('modalCriarNegocio');
}

function irParaNovoOrcamentoComCliente() {
    closeModal('modalCriarNegocio');
    navigateTo('novo_orcamento');
    // Pre-fill after render
    setTimeout(() => {
        if (!clienteParaOrcamento) return;
        const nome = document.getElementById('modNome');
        const cpf = document.getElementById('modCpf');
        const tel = document.getElementById('modWhats');
        if (nome) nome.value = clienteParaOrcamento.nome || '';
        if (cpf) cpf.value = clienteParaOrcamento.cpf || '';
        if (tel) tel.value = clienteParaOrcamento.tel || '';
        clienteParaOrcamento = null;
    }, 300);
}

function renderMetas() {
    let html = '<header class="dashboard-header"><div style="display:flex; align-items:center; gap:16px;"><button class="btn-voltar" onclick="navigateTo(\'admin_inicio\')">← Voltar</button><h1>Gestão de Metas</h1></div></header><div class="table-card"><table><thead><tr><th>Vendedor</th><th>Meta Atual (R$)</th><th>Ações</th></tr></thead><tbody>';
    todosVendedores.forEach(v => {
        const meta = getMetaVendedor(v.id_usuario);
        html += `<tr><td><strong>${escapeHtml(v.nome)}</strong></td><td>R$ ${meta.toLocaleString('pt-BR')}</td><td><button class="btn-salvar-modal" style="padding:6px 12px; font-size:11px; background:var(--card-bg); border:1px solid var(--border-light); color:var(--text-primary);" onclick="abrirModalMeta('${v.id_usuario}', '${escapeHtml(v.nome)}', ${meta})">Editar Meta</button></td></tr>`;
    });
    html += '</tbody></table></div>'; document.getElementById('mainContent').innerHTML = html;
}

async function abrirDetalhesCliente(id) {
    if (!id) { showToast('Erro: Orçamento não encontrado.', 'error'); return; }
    try {
        showLoader();
        const { data, error } = await db.from('orcamentos')
            .select('*, clientes(nome_cliente, whatsapp, cpf), usuarios(nome), status_orcamento(nome), niveis_interesse(nome)')
            .eq('id_orcamento', id).single();
            
        if (error || !data) throw new Error('Orçamento não encontrado.');
        
        data.status = data.status_orcamento ? data.status_orcamento.nome : STATUS.CONTATO_INICIAL;
        data.interesse = data.niveis_interesse ? data.niveis_interesse.nome : null;

        clienteAtualParaDetalhes = data;
        
        const { data: comentarios, error: erroComent } = await db.from('comentarios').select('*').eq('id_orcamento', id).order('data_criacao', { ascending: true });
        if (erroComent) throw erroComent;
        clienteAtualParaDetalhes.comentarios = comentarios || [];
        
        previousView = currentView; currentView = 'detalhes_cliente'; setUltimaVisita(id); renderDetalhesClientePage();
    } catch (e) { showToast('Erro ao carregar cliente.', 'error'); } 
    finally { hideLoader(); }
}

function renderDetalhesClientePage() {
    if (!clienteAtualParaDetalhes) { navigateTo(previousView); return; }
    const orc = clienteAtualParaDetalhes; const id = orc.id_orcamento;
    const isGerente = currentUser.perfil === 'Gerente' || currentUser.perfil === 'Administrador' || currentUser.perfil === 'Admin';
    const main = document.getElementById('mainContent');
    let actionsHtml = '';
    const isOpenStatus = [STATUS.EM_NEGOCIACAO, STATUS.CONTATO_INICIAL, STATUS.NEGOCIACAO, STATUS.AGUARDANDO].includes(orc.status);
    
    if (isOpenStatus && !isGerente) {
        actionsHtml += `<button class="btn-primary-action" onclick="abrirConfirmaFechamento('${orc.id_orcamento}')">Fechar Venda</button>`;
        actionsHtml += `<button class="btn-danger-ghost" onclick="abrirMotivoPerda('${orc.id_orcamento}')">Perder Venda</button>`;
    }
    
    const comentarios = clienteAtualParaDetalhes.comentarios || []; const comentariosHtml = renderComentariosHtml(comentarios, id);
    const statusClass = classToFormatStatus(orc.status);
    const interesse = escapeHtml(orc.interesse || '-');
    const interesseColor = orc.interesse === 'Alta' ? '#10b981' : orc.interesse === 'Média' ? '#f59e0b' : orc.interesse === 'Baixa' ? '#ef4444' : '#94a3b8';
    const dataCriacao = orc.data_criacao ? new Date(orc.data_criacao).toLocaleDateString('pt-BR') : '-';
    const ultimoContato = comentarios.length > 0 ? new Date(comentarios[comentarios.length - 1].data_criacao).toLocaleDateString('pt-BR') : '-';
    const whats = (orc.clientes?.whatsapp || '').replace(/\D/g, '');

    main.innerHTML = `<header class="dashboard-header"><div style="display:flex; align-items:center; gap:16px;"><button class="btn-voltar" onclick="voltarDetalhes()">← Voltar</button><h1>${escapeHtml(orc.clientes?.nome_cliente || 'Cliente')}</h1>${orc.protocolo ? `<span style="font-size:var(--font-sm); font-family:monospace; background:#eff6ff; color:var(--brand-blue-dark); padding:4px 10px; border-radius:6px; font-weight:700; border:1px solid #bfdbfe;">${escapeHtml(orc.protocolo)}</span>` : ''}</div><div style="display:flex; gap:12px; flex-wrap:wrap;">${actionsHtml}</div></header>
    <div class="detalhes-page-grid">
        <div class="info-card">
            <h4 class="info-card-title"><svg class="info-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg> Dados do Cliente</h4>
            <div class="info-group">
                <div class="info-row"><span class="info-label">Protocolo / ID</span><span class="info-value" style="font-family: monospace; background: #f1f5f9; padding: 2px 8px; border-radius: 6px; font-weight: 700; color: var(--brand-blue-dark);">${escapeHtml(orc.protocolo || orc.id_orcamento || '-')}</span></div>
                <div class="info-row"><span class="info-label">Status</span><span class="info-value"><span class="status-tag ${statusClass}">${escapeHtml(orc.status)}</span></span></div>
                <div class="info-row"><span class="info-label">Interesse</span><span class="info-value"><svg class="interesse-svg" width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="${interesseColor}"/></svg>${interesse}</span></div>
                <div class="info-row"><span class="info-label">CPF</span><span class="info-value">${escapeHtml(orc.clientes?.cpf || '-')}</span></div>
            </div>
            <div class="info-group">
                <div class="info-row"><span class="info-label">Produto</span><span class="info-value">${escapeHtml(orc.modelo_colchao || '-')}</span></div>
                <div class="info-row"><span class="info-label">Valor Orçado</span><span class="info-value" style="color:var(--accent-green-dark); font-weight:800; font-size:var(--font-md);">R$ ${escapeHtml(parseFloat(orc.valor_orcado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }))}</span></div>
                ${orc.forma_pagamento ? `<div class="info-row"><span class="info-label">Forma de Pagamento</span><span class="info-value" style="font-weight:600;">${escapeHtml(orc.forma_pagamento)}</span></div>` : ''}
                ${orc.data_entrega ? `<div class="info-row"><span class="info-label">Data de Entrega</span><span class="info-value" style="font-weight:600; color:var(--brand-blue);">${new Date(orc.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}</span></div>` : ''}
            </div>
            <div class="info-group">
                <div class="info-row"><span class="info-label">WhatsApp</span><span class="info-value" style="font-weight:600;">${escapeHtml(orc.clientes?.whatsapp || '-')}</span></div>
                <div class="info-row"><span class="info-label">Criado em</span><span class="info-value">${dataCriacao}</span></div>
                <div class="info-row"><span class="info-label">Último Contato</span><span class="info-value">${ultimoContato}</span></div>
                ${isGerente ? `<div class="info-row"><span class="info-label">Vendedor</span><span class="info-value">${escapeHtml(orc.usuarios?.nome || '-')}</span></div>` : ''}
            </div>
            <div class="info-group">
                <label style="display:flex; align-items:center; font-size: var(--font-xs); font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Observações Fixas<span id="obsSalvaLoader" class="auto-save-indicator">✓ Salvo</span></label>
                <textarea id="obsFixaCliente" class="form-input" rows="3" placeholder="Ex: Cliente prefere contato de manhã..." onblur="salvarObservacaoFixa('${orc.id_orcamento}')">${escapeHtml(orc.observacoes || '')}</textarea>
            </div>
            <a href="https://wa.me/55${whats}" target="_blank" class="btn-whatsapp-full"><svg class="btn-whatsapp-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> Iniciar Conversa WhatsApp</a>
            </div>
            <div class="info-card">
                <h4 class="info-card-title"><svg class="info-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Agendar Contato</h4>
                <div class="schedule-form-grid">
                    <div class="form-group"><label>Data *</label><input type="date" id="agendarData" value="${escapeHtml(orc.data_contato || '')}" class="form-input"></div>
                    <div class="form-group"><label>Horário</label><input type="time" id="agendarHora" value="${escapeHtml(orc.hora_contato || '')}" class="form-input"></div>
                </div>
                <div class="form-group" style="margin-top:16px;"><label>Tipo de Contato *</label><select id="agendarTipo" class="form-input"><option value="">Selecionar...</option><optgroup label="Vendas"><option value="Apresentação de Campanha/Promoção">Apresentação de Campanha/Promoção</option><option value="Reativação de Contato Antigo">Reativação de Contato Antigo</option><option value="Acompanhamento de Orçamento">Acompanhamento de Orçamento</option><option value="Virada de Tabela">Virada de Tabela</option><option value="Quebra de Objeção">Quebra de Objeção</option><option value="Cross-sell (Venda Cruzada)">Cross-sell (Venda Cruzada)</option></optgroup><optgroup label="Pós-Venda"><option value="Alinhamento Logístico">Alinhamento Logístico</option><option value="Acompanhamento de Adaptação (Pós-Entrega)">Acompanhamento de Adaptação (Pós-Entrega)</option><option value="Assistência Técnica">Assistência Técnica</option></optgroup></select><div class="field-error" id="agendarTipoErro"></div></div>
                <div class="form-group" style="margin-top:16px; flex:1; display:flex; flex-direction:column;"><label>Observações / Lembrete</label><textarea id="agendarObservacao" rows="4" style="flex:1; resize:none;" class="form-input" placeholder="Detalhes contextuais para o próximo contato..."></textarea></div>
                <button class="btn-primary-action" id="btnConfirmarAgendamento" onclick="agendarContato()" style="width:100%; margin-top:20px; justify-content:center; padding:14px; border-radius: 10px;"><span class="btn-spinner" style="display:none; width:16px; height:16px;"></span><span class="btn-text">Confirmar Agendamento</span></button>
                <div class="field-error" id="agendarMsg" style="text-align:center; margin-top:8px;"></div>
            </div>
        </div>
        <div class="info-card" style="margin-top:24px;">
            <h4 class="info-card-title" style="margin-bottom:20px;"><svg class="info-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Comentários e Histórico</h4>
            <div id="listaComentarios" style="margin-bottom:16px; max-height:400px; overflow-y:auto; padding-right:8px;">${comentariosHtml}</div>
            <div style="background:var(--bg-body); padding:16px; border-radius:12px; border:1px solid var(--border-light);">
                <label style="font-size:var(--font-xs); font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px; display:block;">Adicionar Comentário</label>
                <textarea id="novoComentario" rows="3" class="form-input" style="background:var(--card-bg);" placeholder="Registre aqui observações, ligações ou anotações sobre este cliente..." oninput="atualizarIndicadorDigitacao()"></textarea>
                <div class="typing-indicator" id="typingIndicator">Mensagem sendo redigida...</div>
                <div style="margin-top:12px; display:flex; align-items:center; justify-content:space-between;">
                    <div class="field-error" id="comentarioMsg"></div>
                    <button class="btn-salvar-timeline" id="btnSalvarTimeline" style="padding:10px 20px; border-radius:8px;" onclick="salvarComentario()"><span class="btn-spinner" style="display:none; width:16px; height:16px; border-color:rgba(255,255,255,0.3); border-top-color:#fff;"></span><span class="btn-text" style="display:flex; align-items:center; gap:6px;"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Registrar Histórico</span></button>
                </div>
            </div>
        </div>`;
}

function abrirModalMeta(id, nome, valorAtual) {
    idMetaEdicao = id; document.getElementById('inputMetaValor').value = 'R$ ' + valorAtual.toLocaleString('pt-BR');
    document.getElementById('errMeta').textContent = ''; openModal('modalEditarMeta'); document.getElementById('inputMetaValor').focus();
}

async function salvarNovaMeta() {
    const raw = document.getElementById('inputMetaValor').value.replace(/[^\d,]/g, '').replace(',', '.'); const valor = parseFloat(raw);
    if (!valor || valor <= 0) { document.getElementById('errMeta').textContent = 'Valor inválido.'; return; }
    const btn = document.getElementById('btnSalvarMeta'); btn.classList.add('saving'); btn.disabled = true;
    try {
        const { error } = await db.from('usuarios').update({ meta_mensal: Math.round(valor) }).eq('id_usuario', idMetaEdicao);
        if (error) throw new Error(error.message);
        const userIndex = todosUsuarios.findIndex(u => u.id_usuario === idMetaEdicao); if (userIndex > -1) todosUsuarios[userIndex].meta_mensal = Math.round(valor);
        const vendIndex = todosVendedores.findIndex(v => v.id_usuario === idMetaEdicao); if (vendIndex > -1) todosVendedores[vendIndex].meta_mensal = Math.round(valor);
        if (idMetaEdicao === currentUser.id_usuario) currentUser.meta_mensal = Math.round(valor);
        closeModal('modalEditarMeta'); showToast('Meta atualizada com sucesso', 'success'); renderMetas();
    } catch (e) { document.getElementById('errMeta').textContent = 'Erro ao salvar: ' + e.message; } 
    finally { btn.classList.remove('saving'); btn.disabled = false; }
}

function formatCurrency(value) { let num = value.replace(/\D/g, ''); num = (parseInt(num) || 0).toString(); return 'R$ ' + parseInt(num.slice(0, -2) || '0').toLocaleString('pt-BR') + ',' + num.slice(-2).padStart(2, '0'); }
function parseCurrency(value) { return parseFloat(value.replace(/[^\d,]/g, '').replace(',', '.')) || 0; }

function adicionarProdutoRow() {
    const container = document.getElementById('produtosContainer'); const datalistHtml = `<datalist id="produtosList">${buildProdutosOptionsDatalist()}</datalist>`;
    const row = document.createElement('div'); row.className = 'produto-row';
    row.innerHTML = `<input type="text" class="form-input prod-nome" list="produtosList" placeholder="Nome do produto" style="cursor: pointer;" onchange="validarProdutoSelecionado(this)">${datalistHtml}<input type="text" class="form-input prod-valor" placeholder="R$ 0,00" inputmode="decimal" oninput="this.value = formatCurrency(this.value); calcTotalModal();"><button type="button" class="btn-remove-item" onclick="removerProdutoRow(this)" aria-label="Remover item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button><span class="prod-check" style="display:none; color:green; margin-left:4px;">✓</span>`;
    container.appendChild(row); atualizarBotoesLixeira();
}

function validarProdutoSelecionado(input) {
    const checkSpan = input.parentElement.querySelector('.prod-check');
    const produtoDigitado = input.value.trim();
    const produtoExiste = todosProdutos.some(p => p.nome.toLowerCase() === produtoDigitado.toLowerCase());
    if (produtoExiste && produtoDigitado !== '') {
        checkSpan.style.display = 'inline';
        input.style.borderColor = '#10b981';
    } else {
        checkSpan.style.display = 'none';
        input.style.borderColor = 'var(--border-light)';
    }
}

function removerProdutoRow(btn) { btn.parentElement.remove(); calcTotalModal(); atualizarBotoesLixeira(); }
function atualizarBotoesLixeira() { const btns = document.getElementById('produtosContainer').querySelectorAll('.btn-remove-item'); if (btns.length === 1) { btns[0].style.opacity = '0.3'; btns[0].style.pointerEvents = 'none'; } else { btns.forEach(b => { b.style.opacity = '1'; b.style.pointerEvents = 'auto'; }); } }
function calcTotalModal() { let total = 0; document.querySelectorAll('.prod-valor').forEach(inp => { total += parseCurrency(inp.value); }); document.getElementById('displayTotalModal').textContent = 'R$ ' + total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }); return total; }

function abrirNovoOrcamento() { if (currentUser?.perfil !== 'Vendedor') return; navigateTo('novo_orcamento'); }

async function gerarProtocoloOrcamento() {
    const { data, error } = await db.from('orcamentos')
        .select('protocolo')
        .order('data_criacao', { ascending: false })
        .limit(1);
    if (error || !data || data.length === 0) return '1000';
    const ultimo = data[0].protocolo;
    if (!ultimo) return `${Math.floor(Math.random() * 9000) + 1000}`;
    // Suporta tanto formato antigo "ORC-XXXX" quanto novo "XXXX"
    const numStr = ultimo.includes('-') ? ultimo.split('-')[1] : ultimo;
    const num = parseInt(numStr);
    if (isNaN(num)) return `${Math.floor(Math.random() * 9000) + 1000}`;
    return `${num + 1}`;
}

async function verificarClientePorCpf(cpf, telefone) {
    if (!cpf) return { existe: false, cliente: null, avisoTelefone: null };
    const { data: clientePorCpf } = await db.from('clientes')
        .select('*')
        .eq('cpf', cpf)
        .maybeSingle();
    if (clientePorCpf) { const pk2 = await detectClientePK(); clientePorCpf.id_cliente = clientePorCpf[pk2]; return { existe: true, cliente: clientePorCpf, avisoTelefone: null }; }
    if (telefone) {
        const { data: clientePorTel } = await db.from('clientes')
            .select('*')
            .eq('whatsapp', telefone)
            .not('cpf', 'eq', cpf || '')
            .maybeSingle();
        if (clientePorTel) return { existe: false, cliente: null, avisoTelefone: `Atenção: o telefone ${telefone} pertence a ${clientePorTel.nome_cliente} (CPF diferente). Deseja continuar?` };
    }
    return { existe: false, cliente: null, avisoTelefone: null };
}

async function validarCPF() {
    const cpfInput = document.getElementById('modCpf');
    const errSpan = document.getElementById('errCpf');
    let cpf = cpfInput.value.replace(/\D/g, '');
    if (cpf.length !== 11) { errSpan.textContent = 'CPF deve ter 11 dígitos'; return false; }
    errSpan.textContent = '';
    const { data: existing } = await db.from('clientes')
        .select('*')
        .eq('cpf', cpf)
        .maybeSingle();
    if (existing) {
        errSpan.textContent = `⚠️ CPF já pertence a ${existing.nome_cliente}. O orçamento será vinculado a este cliente.`;
        return false;
    }
    return true;
}

function renderNovoOrcamentoPage() {
    const main = document.getElementById('mainContent');
    carregarProdutos();
    const hoje = new Date().toISOString().split('T')[0];

    main.innerHTML = `
        <header class="dashboard-header">
            <div style="display:flex; align-items:center; gap:16px;">
                <button class="btn-voltar" onclick="navigateTo(previousView)">← Voltar</button>
                <h1>Novo Orçamento</h1>
            </div>
        </header>
        <div class="novo-orcamento-grid">
            <div class="novo-orcamento-section">
                <h4 class="novo-orcamento-title">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    Dados do Cliente
                </h4>
                <div class="form-group" style="margin-bottom: 16px;"><label for="modNome">Nome do Cliente *</label><input type="text" id="modNome" class="form-input" placeholder="Nome completo" onblur="validateField('modNome','errNome')"><div class="field-error" id="errNome"></div></div>
                <div class="form-group" style="margin-bottom: 16px;"><label for="modCpf">CPF *</label><input type="text" id="modCpf" class="form-input" placeholder="000.000.000-00" onblur="validarCPF()"><div class="field-error" id="errCpf"></div></div>
                <div class="form-group" style="margin-bottom: 16px;"><label for="modWhats">WhatsApp *</label><input type="tel" id="modWhats" class="form-input" placeholder="(XX) XXXXX-XXXX" onblur="validateField('modWhats','errWhats')"><div class="field-error" id="errWhats"></div></div>
                <div class="form-group" style="margin-bottom: 16px;"><label for="modEmail">E-mail</label><input type="email" id="modEmail" class="form-input" placeholder="cliente@email.com"></div>
                <div class="form-group" style="margin-bottom: 16px;"><label for="modOrigem">Origem do Lead</label><select id="modOrigem" class="form-input"><option value="">Selecionar...</option><option value="Instagram">Instagram / Redes Sociais</option><option value="WhatsApp">WhatsApp (Busca Orgânica)</option><option value="Indicação">Indicação</option><option value="Passou na Loja">Passou na Loja Física</option><option value="Panfleto">Panfleto / Ação Externa</option><option value="Outros">Outros</option></select></div>
                <div class="form-group" style="margin-bottom: 16px;"><label for="modInteresse">Nível de Interesse</label><select id="modInteresse" class="form-input"><option value="">Selecionar...</option><option value="Alta">Alta</option><option value="Média">Média</option><option value="Baixa">Baixa</option></select></div>
                <div class="form-group"><label for="modObservacoes">Observações Iniciais</label><textarea id="modObservacoes" class="form-input" rows="4" style="resize:vertical;"></textarea></div>
            </div>
            <div style="display:flex; flex-direction: column; gap: 24px;">
                <div class="novo-orcamento-section">
                    <h4 class="novo-orcamento-title">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                            <line x1="3" y1="6" x2="21" y2="6"></line>
                            <path d="M16 10a4 4 0 0 1-8 0"></path>
                        </svg>
                        Itens do Orçamento *
                    </h4>
                    <p style="font-size:var(--font-xs); color:var(--text-muted); margin-bottom:8px;">Digite o nome do produto e o valor. Clique no ícone de check para confirmar.</p>
                    <div class="produtos-list" id="produtosContainer"></div>
                    <button type="button" class="btn-add-item" onclick="adicionarProdutoRow()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Adicionar outro produto</button>
                    <div class="field-error" id="errItens"></div>
                    <div class="total-modal-box" style="margin-top: 16px; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; padding: 12px 16px; border-radius: 8px; border: 1px solid var(--border-light);"><span style="font-weight: 600; color: var(--text-secondary);">Total Calculado:</span><span class="valor-total" id="displayTotalModal" style="font-size: 1.25rem; font-weight: 800; color: var(--accent-green-dark);">R$ 0,00</span></div>
                </div>
                <div class="novo-orcamento-section">
                    <h4 class="novo-orcamento-title">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                        Data do Orçamento e Agendamento
                    </h4>
                    <div class="schedule-form-grid">
                        <div class="form-group"><label>Data do Orçamento *</label><input type="date" id="modDataOrcamento" class="form-input" value="${hoje}" onblur="validateField('modDataOrcamento','errDataOrc')"><div class="field-error" id="errDataOrc"></div></div>
                        <div class="form-group"><label>Data do Próximo Contato *</label><input type="date" id="modDataContato" class="form-input" onblur="validateField('modDataContato','errDataContato')"><div class="field-error" id="errDataContato"></div></div>
                        <div class="form-group"><label>Horário do Contato *</label><input type="time" id="modHoraContato" class="form-input" onblur="validateField('modHoraContato','errHoraContato')"><div class="field-error" id="errHoraContato"></div></div>
                    </div>
                </div>
            </div>
        </div>
        <div style="display:flex; justify-content: flex-end; gap: 16px; margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border-light);">
            <button class="btn-cancelar-modal" style="flex:none; width: auto;" onclick="navigateTo(previousView)">Cancelar</button>
            <button class="btn-salvar-modal" id="btnSalvarOrcamento" style="flex:none; width: auto; min-width: 200px;" onclick="salvarOrcamento()"><span class="btn-spinner"></span><span class="btn-text">Salvar Orçamento</span></button>
        </div>
        <p class="msg" id="modalMsg" style="text-align: right; margin-top:12px;"></p>
    `;
    adicionarProdutoRow();
    calcTotalModal();
    document.getElementById('modNome').focus();
}

async function salvarOrcamento() {
    if (salvandoOrcamento) return;
    salvandoOrcamento = true;
    const btn = document.getElementById('btnSalvarOrcamento');
    btn.classList.add('saving');
    btn.disabled = true;
    
    try {
        const nome = document.getElementById('modNome').value.trim();
        const cpf = document.getElementById('modCpf').value.replace(/\D/g, '');
        const whats = document.getElementById('modWhats').value.trim();
        const origem = document.getElementById('modOrigem').value;
        const interesse = document.getElementById('modInteresse').value;
        const observacoes = document.getElementById('modObservacoes').value;
        const dataOrcamento = document.getElementById('modDataOrcamento').value;
        const dataContato = document.getElementById('modDataContato').value;
        const horaContato = document.getElementById('modHoraContato').value;
        
        let valid = true;
        if (!nome) { document.getElementById('errNome').textContent = 'Obrigatório'; valid = false; }
        if (!cpf || cpf.length !== 11) { document.getElementById('errCpf').textContent = 'CPF inválido'; valid = false; }
        if (!whats) { document.getElementById('errWhats').textContent = 'Obrigatório'; valid = false; }
        if (!dataOrcamento) { document.getElementById('errDataOrc').textContent = 'Obrigatório'; valid = false; }
        if (!dataContato) { document.getElementById('errDataContato').textContent = 'Obrigatório'; valid = false; }
        if (!horaContato) { document.getElementById('errHoraContato').textContent = 'Obrigatório'; valid = false; }
        
        const produtoRows = document.querySelectorAll('.produto-row');
        if (produtoRows.length === 0) {
            document.getElementById('errItens').textContent = 'Adicione pelo menos um produto';
            valid = false;
        } else {
            let hasEmpty = false;
            produtoRows.forEach(row => {
                const nomeProd = row.querySelector('.prod-nome').value.trim();
                const valorProd = parseCurrency(row.querySelector('.prod-valor').value);
                if (!nomeProd || valorProd <= 0) hasEmpty = true;
            });
            if (hasEmpty) {
                document.getElementById('errItens').textContent = 'Preencha nome e valor de todos os produtos';
                valid = false;
            }
        }
        
        if (!valid) { 
            showToast('Preencha todos os campos obrigatórios', 'error'); 
            salvandoOrcamento = false;
            btn.classList.remove('saving');
            btn.disabled = false;
            return; 
        }
        
        const { existe, cliente, avisoTelefone } = await verificarClientePorCpf(cpf, whats);
        let idCliente = null;
        
        if (existe) {
            idCliente = cliente.id_cliente;
            showToast(`Cliente já existe: ${cliente.nome_cliente}. Orçamento será vinculado.`, 'info');
        } else {
            if (avisoTelefone) {
                const continuar = confirm(avisoTelefone + '\nDeseja continuar com o novo cadastro?');
                if (!continuar) {
                    salvandoOrcamento = false;
                    btn.classList.remove('saving');
                    btn.disabled = false;
                    return;
                }
            }
            // Generate sequential client code CLI-XXXXXX
            const { data: lastCli } = await db.from('clientes').select('id_cliente_codigo').order('id_cliente_codigo', {ascending:false, nullsFirst:false}).limit(1);
            let nextCodigo = 'CLI-000001';
            if (lastCli && lastCli[0] && lastCli[0].id_cliente_codigo) {
                const lastNum = parseInt((lastCli[0].id_cliente_codigo || '').replace(/\D/g,'')) || 0;
                nextCodigo = 'CLI-' + String(lastNum + 1).padStart(6, '0');
            }
            const emailOrc = document.getElementById('modEmail') ? document.getElementById('modEmail').value.trim() : '';
            const pkIns = await detectClientePK();
            const { data: newCliente, error: errClient } = await db.from('clientes')
                .insert([{ nome_cliente: nome, whatsapp: whats, cpf: cpf, email: emailOrc || null, id_cliente_codigo: nextCodigo }])
                .select(pkIns)
                .single();
            if (errClient) throw new Error('Erro ao criar cliente: ' + errClient.message);
            idCliente = newCliente[pkIns];
        }
        
        const produtosList = [];
        let valorTotal = 0;
        produtoRows.forEach(row => {
            const nomeProd = row.querySelector('.prod-nome').value.trim();
            const valorProd = parseCurrency(row.querySelector('.prod-valor').value);
            produtosList.push({ nome: nomeProd, valor: valorProd });
            valorTotal += valorProd;
        });
        
        const protocolo = await gerarProtocoloOrcamento();
        const statusInicial = mapStatusUUID.find(s => s.nome === STATUS.CONTATO_INICIAL);
        const idStatus = statusInicial ? statusInicial.id_status : null;
        let idInteresse = null;
        if (interesse) {
            const nivel = mapInteresseUUID.find(n => n.nome === interesse);
            idInteresse = nivel ? nivel.id_nivel : null;
        }
        
        let dataCriacaoFinal = dataOrcamento;
        const hojeData = new Date().toISOString().split('T')[0];
        if (dataOrcamento === hojeData) {
            dataCriacaoFinal = new Date().toISOString(); 
        } else {
            dataCriacaoFinal = `${dataOrcamento}T12:00:00.000Z`; 
        }
        
        const payload = {
            id_cliente: idCliente,
            id_usuario: currentUser.id_usuario,
            id_status: idStatus,
            id_nivel_interesse: idInteresse,
            valor_orcado: valorTotal,
            modelo_colchao: produtosList.map(p => p.nome).join(', '),
            data_criacao: dataCriacaoFinal,
            data_contato: dataContato,
            hora_contato: horaContato,
            observacoes: observacoes,
            origem: origem,
            protocolo: protocolo,
        };
        
        const { data: newOrc, error: errOrc } = await db.from('orcamentos')
            .insert(payload)
            .select('id_orcamento')
            .single();
        if (errOrc) throw errOrc;
        
        await db.from('comentarios').insert([{
            id_orcamento: newOrc.id_orcamento,
            texto: `Orçamento criado via sistema. Produtos: ${produtosList.map(p => p.nome).join(', ')}. Valor total: R$ ${valorTotal.toFixed(2)}. Próximo contato agendado para ${dataContato} às ${horaContato}.`,
            tipo: 'Sistema',
            autor: currentUser.nome
        }]);
        
        showToast(`Orçamento ${protocolo} salvo com sucesso!`, 'success');
        navigateTo(previousView);
    } catch (error) {
        console.error(error);
        let errMsg = error.message;
        if (errMsg && (errMsg.includes('duplicate key') || errMsg.includes('unique constraint'))) {
            errMsg = 'Conflito na geração do protocolo. Por favor, tente clicar em salvar novamente.';
        }
        showToast('Erro ao salvar orçamento: ' + errMsg, 'error');
    } finally {
        btn.classList.remove('saving');
        btn.disabled = false;
        salvandoOrcamento = false;
    }
}

function abrirMotivoPerda(id) { idOrcamentoParaPerder = id; openModal('modalMotivoPerda'); }
async function confirmarPerda(event) {
    if (isConfirmingPerda) return;
    const motivoSelect = document.getElementById('motivoPerdaSelect');
    const motivoDetalhes = document.getElementById('motivoPerda').value.trim();
    const motivo = motivoSelect.value;
    if (!motivo) { document.getElementById('errMotivo').textContent = 'Selecione o motivo principal.'; return; }
    const btn = event.currentTarget;
    btn.classList.add('saving'); btn.disabled = true; isConfirmingPerda = true;
    try {
        const statusPerdido = mapStatusUUID.find(s => s.nome === STATUS.PERDIDO);
        if (!statusPerdido) throw new Error('Status "Perdido" não encontrado');
        const { error } = await db.from('orcamentos').update({ id_status: statusPerdido.id_status }).eq('id_orcamento', idOrcamentoParaPerder);
        if (error) throw error;
        const comentario = `Venda perdida. Motivo: ${motivo}${motivoDetalhes ? ' - Detalhes: ' + motivoDetalhes : ''}`;
        await db.from('comentarios').insert([{ id_orcamento: idOrcamentoParaPerder, texto: comentario, tipo: 'Perda', autor: currentUser.nome }]);
        showToast('Venda registrada como perdida.', 'success');
        closeModal('modalMotivoPerda');
        if (currentView === 'detalhes_cliente') await abrirDetalhesCliente(idOrcamentoParaPerder);
        else navigateTo(currentView);
    } catch (e) { showToast('Erro ao registrar perda: ' + e.message, 'error'); }
    finally { btn.classList.remove('saving'); btn.disabled = false; isConfirmingPerda = false; }
}

function abrirConfirmaFechamento(id) {
    idOrcamentoParaPerder = id;
    // Reset modal fields
    const formaPag = document.getElementById('fechamentoFormaPagamento');
    const dataEntrega = document.getElementById('fechamentoDataEntrega');
    const errPag = document.getElementById('errFormaPagamento');
    const errData = document.getElementById('errDataEntrega');
    if (formaPag) formaPag.value = '';
    if (dataEntrega) dataEntrega.value = '';
    if (errPag) errPag.textContent = '';
    if (errData) errData.textContent = '';
    openModal('modalConfirmaFechamento');
    const btn = document.getElementById('btnConfirmaFechar');
    btn.querySelector('.btn-spinner').style.display = 'none';
    btn.querySelector('.btn-text').textContent = 'Confirmar Fechamento';
    btn.disabled = false;
    btn.onclick = async () => { await confirmarFechamento(id); };
}
async function confirmarFechamento(id) {
    const formaPagamento = document.getElementById('fechamentoFormaPagamento').value;
    const dataEntrega = document.getElementById('fechamentoDataEntrega').value;
    const errPag = document.getElementById('errFormaPagamento');
    const errData = document.getElementById('errDataEntrega');
    let valid = true;
    errPag.textContent = '';
    errData.textContent = '';
    if (!formaPagamento) { errPag.textContent = 'Selecione a forma de pagamento.'; valid = false; }
    if (!dataEntrega) { errData.textContent = 'Selecione a data de entrega.'; valid = false; }
    if (!valid) return;

    const btn = document.getElementById('btnConfirmaFechar');
    btn.querySelector('.btn-spinner').style.display = 'inline-block';
    btn.querySelector('.btn-text').textContent = 'Salvando...';
    btn.disabled = true;

    try {
        const statusFechado = mapStatusUUID.find(s => s.nome === STATUS.FECHADO);
        if (!statusFechado) throw new Error('Status "Fechado" não encontrado');
        const { error } = await db.from('orcamentos').update({
            id_status: statusFechado.id_status,
            forma_pagamento: formaPagamento,
            data_entrega: dataEntrega
        }).eq('id_orcamento', id);
        if (error) throw error;

        // Calcular data de confirmação de recebimento (dia da entrega ou +1 dia)
        const dataEntregaObj = new Date(dataEntrega + 'T00:00:00');
        const dataConfirmacao = dataEntrega; // contato no dia da entrega
        const dataEntregaFormatada = dataEntregaObj.toLocaleDateString('pt-BR');

        // Registrar comentário de fechamento
        await db.from('comentarios').insert([{
            id_orcamento: id,
            texto: `Venda fechada com sucesso! Forma de pagamento: ${formaPagamento}. Entrega prevista para: ${dataEntregaFormatada}.`,
            tipo: 'Sistema',
            autor: currentUser.nome
        }]);

        // Criar agendamento automático de confirmação de recebimento
        await db.from('orcamentos').update({
            data_contato: dataConfirmacao,
            hora_contato: '09:00',
            observacao_agendamento: `Confirmação de recebimento - Entrega prevista para ${dataEntregaFormatada}`
        }).eq('id_orcamento', id);

        await db.from('comentarios').insert([{
            id_orcamento: id,
            texto: `Agendamento automático criado: Confirmação de recebimento para ${dataEntregaFormatada} às 09:00.`,
            tipo: 'Sistema',
            autor: currentUser.nome
        }]);

        showToast('Venda fechada! Agendamento de confirmação criado automaticamente.', 'success');
        closeModal('modalConfirmaFechamento');
        if (currentView === 'detalhes_cliente') await abrirDetalhesCliente(id);
        else navigateTo(currentView);
    } catch (e) {
        showToast('Erro ao fechar venda: ' + e.message, 'error');
        btn.querySelector('.btn-spinner').style.display = 'none';
        btn.querySelector('.btn-text').textContent = 'Confirmar Fechamento';
        btn.disabled = false;
    }
}

async function agendarContato() {
    const data = document.getElementById('agendarData').value;
    const hora = document.getElementById('agendarHora').value;
    const tipo = document.getElementById('agendarTipo').value;
    const obs = document.getElementById('agendarObservacao')?.value?.trim() || '';
    const tipoErro = document.getElementById('agendarTipoErro');
    
    if (!data) return showToast('Selecione uma data para o agendamento.', 'error');
    if (!tipo) { tipoErro.textContent = 'Selecione o tipo de contato.'; document.getElementById('agendarTipo').style.borderColor = '#ef4444'; return; }
    else { tipoErro.textContent = ''; document.getElementById('agendarTipo').style.borderColor = 'var(--border-light)'; }
    
    const btn = document.getElementById('btnConfirmarAgendamento');
    btn.querySelector('.btn-spinner').style.display = 'inline-block'; btn.querySelector('.btn-text').textContent = 'Salvando...'; btn.disabled = true;
    try {
        const { error: err1 } = await db.from('orcamentos').update({ data_contato: data, hora_contato: hora, observacao_agendamento: obs }).eq('id_orcamento', clienteAtualParaDetalhes.id_orcamento);
        if (err1) throw new Error(err1.message);
        
        const dataFormatada = new Date(data + 'T00:00:00').toLocaleDateString('pt-BR');
        let texto = `Retorno agendado para ${dataFormatada}${hora ? ' às ' + hora : ''} • ${tipo}`;
        if (obs) texto += `\nLembrete: ${obs}`;
        
        const { error: err2 } = await db.from('comentarios').insert([{ id_orcamento: clienteAtualParaDetalhes.id_orcamento, texto: texto, tipo: 'Sistema', autor: currentUser.nome }]);
        if (err2) throw new Error(err2.message);
        
        showToast('Agendamento confirmado!', 'success'); await abrirDetalhesCliente(clienteAtualParaDetalhes.id_orcamento);
    } catch (e) { showToast('Erro ao agendar: ' + e.message, 'error'); } 
    finally { btn.querySelector('.btn-spinner').style.display = 'none'; btn.querySelector('.btn-text').textContent = 'Confirmar Agendamento'; btn.disabled = false; }
}

function voltarDetalhes() { currentView = previousView; navigateTo(currentView); }
function changePage(page) { currentPage = page; atualizarTabelaPaginadaServer(); }

function validateField(idInput, idErro) { const el = document.getElementById(idInput); const err = document.getElementById(idErro); if (!el || !err) return; const val = el.value.trim(); if (!val) { err.textContent = 'Obrigatório'; el.style.borderColor = '#ef4444'; return false; } else { err.textContent = ''; el.style.borderColor = 'var(--border-light)'; return true; } }

function renderAdminInicio(main) {
    const isGerente = currentUser.perfil === 'Gerente' || currentUser.perfil === 'Administrador' || currentUser.perfil === 'Admin';
    if (!isGerente) return;
    const totalUsuarios = todosUsuarios.length; const ativos = todosUsuarios.filter(u => u.status === 'Ativo').length; const totalVendedores = todosVendedores.length;
    main.innerHTML = `<header class="dashboard-header"><h1>Painel Administrativo</h1></header>
    <div class="action-grid" style="margin-bottom: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div class="action-btn-card" onclick="navigateTo('admin_usuarios')" style="background: var(--card-bg); border: 1px solid var(--border-light); padding: 24px; border-radius: var(--radius-md); cursor: pointer; transition: all 0.2s;"><div class="icon-wrapper" style="color: var(--brand-blue); margin-bottom: 12px;"><svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" fill="none" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87m-4-12a4 4 0 010 7.75"/></svg></div><h4 style="font-weight: 700; margin-bottom: 4px;">Gerenciar Usuários</h4><p style="font-size: var(--font-sm); color: var(--text-muted);">Adicionar, editar ou inativar acessos</p></div>
        <div class="action-btn-card" onclick="navigateTo('metas')" style="background: var(--card-bg); border: 1px solid var(--border-light); padding: 24px; border-radius: var(--radius-md); cursor: pointer; transition: all 0.2s;"><div class="icon-wrapper" style="color: var(--brand-blue); margin-bottom: 12px;"><svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" fill="none" stroke-width="2"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg></div><h4 style="font-weight: 700; margin-bottom: 4px;">Gestão de Metas</h4><p style="font-size: var(--font-sm); color: var(--text-muted);">Definir metas mensais por vendedor</p></div>
    </div>
    <div class="kpi-row">
        <div class="kpi-card"><div class="kpi-label-row"><span class="kpi-dot blue"></span><span class="kpi-label">Total de Usuários</span></div><div class="kpi-value">${totalUsuarios}</div></div>
        <div class="kpi-card"><div class="kpi-label-row"><span class="kpi-dot green"></span><span class="kpi-label">Usuários Ativos</span></div><div class="kpi-value">${ativos}</div></div>
        <div class="kpi-card"><div class="kpi-label-row"><span class="kpi-dot orange"></span><span class="kpi-label">Vendedores</span></div><div class="kpi-value">${totalVendedores}</div></div>
    </div>`;
}

function renderAdminUsuarios(main) {
    let html = `<header class="dashboard-header"><div style="display:flex; align-items:center; gap:16px;"><button class="btn-voltar" onclick="navigateTo('admin_inicio')">← Voltar</button><h1>Gerenciar Usuários</h1></div><button class="btn-primary-action" onclick="abrirModalUsuarioAdmin()"><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Novo Usuário</button></header><div class="table-card"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Ações</th></tr></thead><tbody>`;
    if (todosUsuarios.length === 0) {
        html += `<tr><td colspan="5" style="text-align:center; padding:24px;">Nenhum usuário encontrado.</td></tr>`;
    } else {
        todosUsuarios.forEach(u => {
            const statusClass = u.status === 'Ativo' ? 'status-tag vendido' : 'status-tag perdido';
            html += `<tr>
                <td><strong>${escapeHtml(u.nome)}</strong></td>
                <td>${escapeHtml(u.email || '-')}</td>
                <td>${escapeHtml(u.perfil)}</td>
                <td><span class="${statusClass}">${escapeHtml(u.status || 'Ativo')}</span></td>
                <td><div style="display:flex; gap:8px;">
                    <button class="btn-salvar-modal" style="padding:6px 12px; font-size:11px; background:var(--card-bg); border:1px solid var(--border-light); color:var(--text-primary);" onclick="abrirModalUsuarioAdmin('${u.id_usuario}')">Editar</button>
                    ${u.id_usuario !== currentUser.id_usuario ? `<button class="btn-danger-ghost" style="padding:6px 12px; font-size:11px;" onclick="abrirModalExcluirUsuarioAdmin('${u.id_usuario}', '${escapeHtml(u.nome)}')">Excluir</button>` : ''}
                </div></td>
            </tr>`;
        });
    }
    html += `</tbody></table></div>`;
    main.innerHTML = html;
}

function abrirModalExcluirUsuarioAdmin(id, nome) {
    idUsuarioEmEdicao = id;
    document.getElementById('nomeUsuarioExcluir').innerText = nome;
    openModal('modalExcluirUsuarioAdmin');
}

async function confirmarExclusaoUsuario() {
    if (!idUsuarioEmEdicao) return;
    const btn = document.getElementById('btnConfirmarExclusaoUsuario');
    btn.classList.add('saving'); btn.disabled = true;
    try {
        const { count, error: countError } = await db.from('orcamentos')
            .select('*', { count: 'exact', head: true })
            .eq('id_usuario', idUsuarioEmEdicao);
        if (countError) throw countError;
        if (count > 0) {
            showToast(`Não é possível excluir: usuário possui ${count} orçamento(s). Inative-o em vez disso.`, 'error');
            closeModal('modalExcluirUsuarioAdmin');
            return;
        }
        const { error } = await db.from('usuarios').delete().eq('id_usuario', idUsuarioEmEdicao);
        if (error) throw error;
        showToast('Usuário excluído com sucesso.', 'success');
        closeModal('modalExcluirUsuarioAdmin');
        const { data: usuarios } = await db.from('usuarios').select('*').order('nome');
        todosUsuarios = usuarios || [];
        todosVendedores = todosUsuarios.filter(u => u.perfil === 'Vendedor');
        renderAdminUsuarios(document.getElementById('mainContent'));
    } catch (e) {
        showToast('Erro ao excluir: ' + e.message, 'error');
    } finally {
        btn.classList.remove('saving'); btn.disabled = false;
        idUsuarioEmEdicao = null;
    }
}

function marcarNotificacaoLida(id) {
    if (id && !notificacoesLidas.has(id)) {
        notificacoesLidas.add(id);
        salvarNotificacoesLidas();
        renderNotificationBadge(buildNotifications().filter(n => n.id !== null).length);
    }
}

function toggleTheme() {
    document.body.classList.toggle('dark');
    localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
    if (donutChartInstance) { donutChartInstance.destroy(); donutChartInstance = null; }
    if (barChartInstance) { barChartInstance.destroy(); barChartInstance = null; }
    if (currentView === 'inicio') renderInicio();
    else if (currentView === 'admin_inicio') renderAdminInicio(document.getElementById('mainContent'));
    else if (currentView === 'admin_usuarios') renderAdminUsuarios(document.getElementById('mainContent'));
    else if (currentView === 'detalhes_cliente') renderDetalhesClientePage();
    else if (currentView === 'novo_orcamento') renderNovoOrcamentoPage();
    else if (currentView === 'clientes_lista') renderClientesLista();
    else if (currentView === 'ficha_cliente') renderFichaCliente();
}

(function() {
    if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark');
})();

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const modais = ['modalMotivoPerda', 'modalConfirmaFechamento', 'modalEditarMeta', 'modalExcluirComentario', 'modalUsuarioAdmin', 'modalExcluirUsuarioAdmin', 'modalEditarCliente', 'modalExcluirCliente', 'modalCriarNegocio'];
        for (const id of modais) {
            if (document.getElementById(id) && document.getElementById(id).classList.contains('open')) {
                closeModal(id);
                break;
            }
        }
        document.getElementById('notificationDropdown').classList.remove('open');
    }
});

document.getElementById('hamburgerBtn').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('open');
    if (sidebar.classList.contains('open')) sidebar.querySelector('.nav-item.active')?.focus();
});

document.getElementById('sidebarOverlay').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('open');
});

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            document.getElementById('sidebar').classList.remove('open');
            document.getElementById('sidebarOverlay').classList.remove('open');
        }
    });
});

checkSession();
