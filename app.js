        const SUPABASE_URL = 'https://blumqkxwasdbyozdvrsp.supabase.co';
        const SUPABASE_ANON_KEY = 'sb_publishable_kvVacObZ3ERPqc9MjOIoWw_aRZeYeIn';
        const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        
        const META_PADRAO = 50000;
        const ITEMS_PER_PAGE = 10;

        const STATUS = {
	CONTATO_INICIAL: 'Contato Inicial',
  	NEGOCIACAO: 'Negociação',
    	EM_FECHAMENTO: 'Em Fechamento',
    	FECHADO: 'Fechado',
    	PERDIDO: 'Perdido'
        };

        // O nosso Cofre (Estado Global da Aplicação)
            const AppState = {
                usuarioLogado: null,
                kpisMensais: [],
                filtros: {
                    vendedor: 'todos',
                    loja: 'todas',
                    mes: new Date().getMonth() + 1,
                    ano: new Date().getFullYear(),
                    dia: null,
                    status: 'todos',
                    busca: ''
                },
                ui: {
                    viewAtual: 'inicio',
                    viewAnterior: 'inicio',
                    paginaAtual: 1
                },
                contextoVenda: {
                    clienteAtual: null,          // Substitui AppState.contextoVenda.clienteAtual
                    clienteParaAcao: null,       // Substitui clienteSelecionadoParaAcao
                    orcamentoParaPerder: null    // Substitui idOrcamentoParaPerder
                }
            };

        // --- GUARDIÕES DO ESTADO ---
        
        function setUsuarioLogado(usuario) {
            if (usuario && usuario.status?.toLowerCase() !== 'ativo') {
                console.error("Tentativa de logar usuário inativo barrada pelo estado.");
                return false;
            }
            AppState.usuarioLogado = usuario;
            return true;
        }
        
        function setClienteAtual(clienteData) {
            AppState.contextoVenda.clienteAtual = clienteData;
        }
        
        function setFiltroMes(mes, ano) {
            AppState.filtros.mes = mes;
            AppState.filtros.ano = ano;
            AppState.filtros.dia = null; // Resetar o dia ao mudar o mês
        }

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
        let kanbanAtivo = false;
        let previousView = 'inicio';
        let currentMonth = new Date().getMonth() + 1;
        let currentYear = new Date().getFullYear();
        let currentDay = null;
        let currentPage = 1;
        let searchTerm = '';
        let searchProtocolo = '';
        let selectedVendedor = 'todos';
        let selectedLoja = 'todas';
        
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
        let isSavingComment = false;
        let isConfirmingPerda = false;
        let notificacoesLidas = new Set();
        let notificacoesBanco = []; 

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
            carregarNotificacoesLidas();
            try {
                // 1. Verifica se já existe um passe (token) seguro no navegador
                const { data: { session }, error: sessionError } = await db.auth.getSession();
                if (sessionError) throw sessionError;
                if (session && session.user) {
                    // 2. Se o passe for válido, vamos buscar o perfil correspondente
                    const { data: userProfile, error: profileError } = await db
                        .from('usuarios')
                        .select('*')
                        .eq('email', session.user.email)
                        .single();
                    if (profileError || !userProfile || userProfile.status?.toLowerCase() !== 'ativo') {
                        // Se a conta foi desativada ou não existe mais na tabela, forçamos a saída
                        await logout();
                        return;
                    }
                    // 3. Tudo em ordem: esconde o ecrã de login e arranca com a dashboard
                    currentUser = userProfile;
                    document.getElementById('loginOverlay').classList.add('hidden');
                    initAppAfterLogin();
                } else {
                    // Se não houver sessão, garante que o ecrã de login fica visível
                    document.getElementById('loginOverlay').classList.remove('hidden');
                }
            } catch (e) {
                console.error("Erro na verificação de segurança:", e);
                document.getElementById('loginMsg').innerHTML = 'Falha ao verificar o acesso seguro.';
                document.getElementById('loginOverlay').classList.remove('hidden');
            }
        }

        async function handleLogin() {
            const btn = document.getElementById('btnLogin');
            if (btn.disabled) return;
            // 1. Captura os valores dos novos campos
            const email = document.getElementById('loginEmail').value.trim();
            const senha = document.getElementById('loginSenha').value;
            const msg = document.getElementById('loginMsg');
            if (!email || !senha) {
                msg.textContent = 'Preencha seu e-mail e senha.';
                return;
            }
            btn.classList.add('loading');
            btn.disabled = true;
            msg.innerHTML = '';
            try {
                // 2. Validação real de identidade com o Supabase
                const { data: authData, error: authError } = await db.auth.signInWithPassword({
                    email: email,
                    password: senha
                });
                if (authError) throw new Error("E-mail ou senha incorretos.");
                // 3. Busca o papel (perfil) do usuário na tabela do banco
                const { data: userProfile, error: profileError } = await db
                    .from('usuarios')
                    .select('*')
                    .eq('email', authData.user.email)
                    .single();
                if (profileError || !userProfile) throw new Error("Perfil não encontrado no sistema.");
                if (userProfile.status?.toLowerCase() !== 'ativo') throw new Error("Usuário inativo.");
                // 4. Libera o acesso e inicia a dashboard
                currentUser = userProfile;
                document.getElementById('loginOverlay').classList.add('hidden');
                initAppAfterLogin();
            } catch (err) {
                msg.innerHTML = `<span style="color: #ef4444; font-size: 13px; font-weight: 600;">${err.message}</span>`;
            } finally {
                btn.classList.remove('loading');
                btn.disabled = false;
            }
        }

        let _notifChannel = null; // referência global para poder destruir no logout

        function initAppAfterLogin() {
            document.getElementById('sidebar').style.display = 'flex';
            document.getElementById('mainContent').style.display = 'flex';
            configurarPermissoes();
            carregarDadosIniciais();
            iniciarSubscriptionNotificacoes();
        }

        function iniciarSubscriptionNotificacoes() {
            // Destrói canal anterior se houver (ex: re-login sem reload)
            if (_notifChannel) { db.removeChannel(_notifChannel); _notifChannel = null; }

            _notifChannel = db
                .channel('notificacoes-realtime-' + currentUser.id_usuario)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'notificacoes',
                        filter: `id_usuario=eq.${currentUser.id_usuario}`
                    },
                    (payload) => {
                        // Só processa se a notificação ainda não estiver na lista (idempotência)
                        const jaExiste = notificacoesBanco.some(n => String(n.id) === String(payload.new.id));
                        if (jaExiste) return;

                        notificacoesBanco.push(payload.new);
                        const notificacoes = buildNotifications();
                        renderNotificationBadge(notificacoes.length);

                        // Atualiza o dropdown se ele estiver aberto no momento
                        const dropdown = document.getElementById('notificationDropdown');
                        if (dropdown && dropdown.classList.contains('open')) {
                            renderNotificationsDropdown();
                        }
                    }
                )
                .subscribe();
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

        async function logout() {
            // Encerra a subscription de notificações antes de sair
            if (_notifChannel) { db.removeChannel(_notifChannel); _notifChannel = null; }
            // Destrói a sessão real no Supabase antes de limpar a tela
            await db.auth.signOut();
            currentUser = null;
            location.reload();
        }

     async function carregarKpisEDashboard() {
            if (!currentUser) return;
            // NOVO CÓDIGO LEVE E ESCALÁVEL
            const isAdmin = currentUser.perfil === 'Administrador' || currentUser.perfil === 'Admin';
            try {
                // Chama a função direto no banco, passando apenas os filtros
                const { data: kpisData, error: rpcError } = await db.rpc('calcular_kpis_dashboard', {
                    p_mes: currentMonth,
                    p_ano: currentYear,
                    p_id_usuario: currentUser.id_usuario,
                    p_perfil: (currentUser.perfil || '').toLowerCase() === 'terminal' ? 'Gerente' : currentUser.perfil,
                    p_id_loja: currentUser.id_loja
                });
                if (rpcError) throw rpcError;
                // Salvamos o resultado mastigado no objeto global
                AppState.kpisMensaisResumo = kpisData;

	// --- NOVA BUSCA DETALHADA PARA GRÁFICOS E NOTIFICAÇÕES ---
                let queryDetalhes = db.from('orcamentos')
                    .select('id_orcamento, id_usuario, valor_orcado, modelo_colchao, data_criacao, data_contato, hora_contato, ligacao_confirmada, clientes(nome_cliente), status_orcamento(nome)');

                const start = new Date(currentYear, currentMonth - 1, 1).toISOString();
                const end = new Date(currentYear, currentMonth, 0, 23, 59, 59).toISOString();
                queryDetalhes = queryDetalhes.gte('data_criacao', start).lte('data_criacao', end);

                if (currentUser.perfil === 'Gerente' || (currentUser.perfil || '').toLowerCase() === 'terminal') {
                    const ids = todosVendedores.filter(v => v.id_loja === currentUser.id_loja).map(v => v.id_usuario);
                    if (ids.length > 0) queryDetalhes = queryDetalhes.in('id_usuario', ids);
                    if (selectedVendedor !== 'todos') queryDetalhes = queryDetalhes.eq('id_usuario', selectedVendedor);
                } else if (currentUser.perfil === 'Vendedor') {
                    queryDetalhes = queryDetalhes.eq('id_usuario', currentUser.id_usuario);
                } else {
                    if (selectedVendedor !== 'todos') {
                        queryDetalhes = queryDetalhes.eq('id_usuario', selectedVendedor);
                    } else if (selectedLoja !== 'todas') {
                        const ids = todosVendedores.filter(v => v.id_loja === selectedLoja).map(v => v.id_usuario);
                        if (ids.length > 0) queryDetalhes = queryDetalhes.in('id_usuario', ids);
                    }
                }

                const { data: detalhesData } = await queryDetalhes;
                kpisMensais = (detalhesData || []).map(o => ({
                    ...o,
                    status: o.status_orcamento ? o.status_orcamento.nome : 'Contato Inicial'
                }));

                // --------------------------------------------------------

                // ---- INÍCIO DA BUSCA DE ALERTAS NO BANCO ----
                const { data: notifs, error: errNotif } = await db
                    .from('notificacoes')
                    .select('*')
                    .eq('id_usuario', currentUser.id_usuario)
                    .eq('lida', false);
                
                if (!errNotif) {
                    notificacoesBanco = notifs || [];
                }
                // ---- FIM DA BUSCA DE ALERTAS NO BANCO ----

            } catch(e) { 
                kpisMensais = []; 
                notificacoesBanco = []; 
            }

            atualizarBadge();
            const notificacoes = buildNotifications();
            renderNotificationBadge(notificacoes.length);
        }

        async function atualizarTabelaPaginadaServer() {
            const tbody = document.getElementById('tableBody');
            const pagination = document.getElementById('paginationContainer');
            if (!tbody || !pagination) return;
            
            const isGerente = currentUser.perfil === 'Gerente' || currentUser.perfil === 'Administrador' || currentUser.perfil === 'Admin';
            tbody.innerHTML = `<tr><td colspan="${isGerente ? '7' : '6'}" style="text-align:center; padding:24px;">Carregando dados...</td></tr>`;

            try {
                let query = db.from('orcamentos')
                    .select('*, clientes!inner(nome_cliente, whatsapp), usuarios!inner(nome, id_loja), status_orcamento(nome)', { count: 'exact' });
            
                // Regra de Ferro: Se for Gerente, obriga a loja a ser a dele E o vendedor a existir
                if (currentUser.perfil === 'Gerente') {
                    query = query.eq('usuarios.id_loja', currentUser.id_loja);
                    if (selectedVendedor !== 'todos') query = query.eq('id_usuario', selectedVendedor);
                } else if (currentUser.perfil === 'Vendedor') {
                    query = query.eq('id_usuario', currentUser.id_usuario);
                } else if ((currentUser.perfil || '').toLowerCase() === 'terminal') {
                    query = query.eq('usuarios.id_loja', currentUser.id_loja);
                    if (window._terminalVendedorFiltro && window._terminalVendedorFiltro !== 'todos') {
                        query = query.eq('id_usuario', window._terminalVendedorFiltro);
                    }
                } else {
                    if (selectedVendedor !== 'todos') {
                        query = query.eq('id_usuario', selectedVendedor);
                    } else if (selectedLoja !== 'todas') {
                        const idsLoja = todosVendedores.filter(v => v.id_loja === selectedLoja).map(v => v.id_usuario);
                        if (idsLoja.length > 0) query = query.in('id_usuario', idsLoja);
                    }
                }

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

                /* 
                 // FILTRO DE MÊS E DIA ATIVADO PARA A CARTEIRA DE NEGOCIAÇÕES
	if (currentDay) {
   	 const start = new Date(currentYear, currentMonth - 1, currentDay).toISOString();
    	const end = new Date(currentYear, currentMonth - 1, currentDay, 23, 59, 59).toISOString();
    	query = query.gte('data_criacao', start).lte('data_criacao', end);
	} else if (currentMonth && currentYear) {
   	  const startDate = new Date(currentYear, currentMonth - 1, 1).toISOString();
  	  const endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59).toISOString();
  	  query = query.gte('data_criacao', startDate).lte('data_criacao', endDate);
	}

                */

                const from = (currentPage - 1) * ITEMS_PER_PAGE;
                const to = from + ITEMS_PER_PAGE - 1;
                query = query.range(from, to).order('data_criacao', { ascending: false });

                const { data: pagina, error, count } = await query;
                if (error) throw error;

                const totalPages = Math.ceil(count / ITEMS_PER_PAGE) || 1;
                if (currentPage > totalPages && totalPages > 0) { currentPage = totalPages; return atualizarTabelaPaginadaServer(); }

                tbody.innerHTML = '';
                if (!pagina || pagina.length === 0) {
                    const trVazio = document.createElement('tr');
                    const tdVazio = document.createElement('td');
                    tdVazio.colSpan = isGerente ? 7 : 6;
                    tdVazio.style.cssText = 'text-align:center; padding:24px;';
                    tdVazio.textContent = 'Nenhum registro encontrado.';
                    trVazio.appendChild(tdVazio);
                    tbody.appendChild(trVazio);
                } else {
                    const frag = document.createDocumentFragment();
                    pagina.forEach(o => {
                        const nome = o.clientes?.nome_cliente || 'Cliente';
                        const dataRelativa = timeAgo(o.data_criacao);
                        const dataCompleta = o.data_criacao ? new Date(o.data_criacao).toLocaleDateString('pt-BR') : '-';
                        const statusTexto = o.status_orcamento ? o.status_orcamento.nome : STATUS.CONTATO_INICIAL;
                        const idNumerico = o.protocolo && o.protocolo.includes('-') ? o.protocolo.split('-')[1] : (o.protocolo || '');
                        const produtos = o.modelo_colchao ? o.modelo_colchao.split(',').map(p => p.trim()).filter(Boolean) : [];
                        const qtdExtra = produtos.length - 1;

                        const tr = document.createElement('tr');
                        tr.className = 'clickable-row';
                        tr.dataset.id = o.id_orcamento;
                        tr.style.cursor = 'pointer';
                        tr.addEventListener('click', () => abrirDetalhesCliente(o.id_orcamento));

                        // td protocolo
                        const tdProto = document.createElement('td');
                        tdProto.style.cssText = 'text-align:center; font-family:monospace; font-weight:700; font-size:var(--font-sm); color:var(--brand-blue-dark); white-space:nowrap;';
                        tdProto.textContent = idNumerico;

                        // td cliente
                        const tdCliente = document.createElement('td');
                        const spanCliente = document.createElement('span');
                        spanCliente.className = 'client-name';
                        spanCliente.textContent = nome;
                        tdCliente.appendChild(spanCliente);

                        // td produto (com accordion opcional)
                        const tdProd = document.createElement('td');
                        tdProd.style.cssText = 'line-height:1.4; font-size:var(--font-xs); color:var(--text-secondary); max-width:200px; white-space:normal;';
                        tdProd.textContent = produtos.length > 0 ? produtos[0] : '-';
                        if (qtdExtra > 0) {
                            const btnExp = document.createElement('button');
                            btnExp.className = 'btn-expand-produtos';
                            btnExp.innerHTML = `+ ${qtdExtra} item${qtdExtra > 1 ? 'ns' : ''} <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="6 9 12 15 18 9"/></svg>`;
                            btnExp.addEventListener('click', e => toggleAccordion(e, o.id_orcamento));
                            tdProd.insertBefore(document.createElement('br'), null);
                            tdProd.appendChild(btnExp);
                        }

                        // td vendedor (só gerente)
                        const tdVend = document.createElement('td');
                        if (isGerente) tdVend.textContent = o.usuarios?.nome || '-';

                        // td status
                        const tdStatus = document.createElement('td');
                        const spanStatus = document.createElement('span');
                        spanStatus.className = `status-tag ${classToFormatStatus(statusTexto)}`;
                        spanStatus.textContent = statusTexto;
                        tdStatus.appendChild(spanStatus);

                        // td data
                        const tdData = document.createElement('td');
                        tdData.title = dataCompleta;
                        tdData.textContent = dataRelativa;

                        // td valor
                        const tdValor = document.createElement('td');
                        tdValor.style.fontWeight = '700';
                        tdValor.textContent = `R$ ${parseFloat(o.valor_orcado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

                        tr.appendChild(tdProto);
                        tr.appendChild(tdCliente);
                        tr.appendChild(tdProd);
                        if (isGerente) tr.appendChild(tdVend);
                        tr.appendChild(tdStatus);
                        tr.appendChild(tdData);
                        tr.appendChild(tdValor);
                        frag.appendChild(tr);

                        // Linha accordion (só se tiver itens extras)
                        if (qtdExtra > 0) {
                            const trAcc = document.createElement('tr');
                            trAcc.id = `acc-${o.id_orcamento}`;
                            trAcc.className = 'accordion-row';
                            const tdAcc = document.createElement('td');
                            tdAcc.colSpan = isGerente ? 7 : 6;
                            tdAcc.style.cssText = 'padding:0; border-bottom:none;';
                            const divAcc = document.createElement('div');
                            divAcc.className = 'accordion-inner';
                            const strong = document.createElement('strong');
                            strong.textContent = 'Todos os itens do protocolo:';
                            const ul = document.createElement('ul');
                            ul.style.marginTop = '8px';
                            produtos.forEach(p => {
                                const li = document.createElement('li');
                                const bullet = document.createElement('span');
                                bullet.style.cssText = 'color:var(--brand-blue); font-weight:bold;';
                                bullet.textContent = '•';
                                li.appendChild(bullet);
                                li.appendChild(document.createTextNode(' ' + p));
                                ul.appendChild(li);
                            });
                            divAcc.appendChild(strong);
                            divAcc.appendChild(ul);
                            tdAcc.appendChild(divAcc);
                            trAcc.appendChild(tdAcc);
                            frag.appendChild(trAcc);
                        }
                    });
                    tbody.appendChild(frag);
                }

                // Paginação
                const fragPag = document.createDocumentFragment();
                const btnAnterior = document.createElement('button');
                btnAnterior.textContent = 'Anterior';
                btnAnterior.disabled = currentPage <= 1;
                btnAnterior.addEventListener('click', () => changePage(currentPage - 1));
                const spanPag = document.createElement('span');
                spanPag.textContent = `Página ${currentPage} de ${totalPages}`;
                const btnProximo = document.createElement('button');
                btnProximo.textContent = 'Próximo';
                btnProximo.disabled = currentPage >= totalPages;
                btnProximo.addEventListener('click', () => changePage(currentPage + 1));
                fragPag.appendChild(btnAnterior);
                fragPag.appendChild(spanPag);
                fragPag.appendChild(btnProximo);
                pagination.innerHTML = '';
                pagination.appendChild(fragPag);
            } catch (error) { tbody.innerHTML = `<tr><td colspan="${isGerente ? '6' : '5'}" style="text-align:center; padding:24px; color:#ef4444;">Erro ao carregar dados da tabela.</td></tr>`; }
        }

        async function exportarCSV() {
            showToast('Gerando relatório...', 'info');
            try {
                let query = db.from('orcamentos').select('*, clientes!inner(nome_cliente, whatsapp), usuarios(nome), status_orcamento(nome)');
                if (currentUser.perfil === 'Vendedor') query = query.eq('id_usuario', currentUser.id_usuario);
                else if ((currentUser.perfil || '').toLowerCase() === 'terminal') query = query.eq('usuarios.id_loja', currentUser.id_loja);
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

            if (!nome || !email) {
                err.textContent = 'Preencha Nome e E-mail.';
                return;
            }
            if (!senha && !idUsuarioEmEdicao) {
                err.textContent = 'Defina uma senha inicial para o novo usuário.';
                return;
            }
            if (!loja) {
                err.textContent = 'Selecione a Loja Base do usuário.';
                return;
            }

            const btn = document.getElementById('btnSalvarUsuarioAdmin');
            btn.classList.add('saving'); btn.disabled = true; err.textContent = '';

            try {
                if (idUsuarioEmEdicao) {
                    // EDICAO: atualiza direto na tabela usuarios
                    const updatePayload = { nome, email, id_loja: loja, perfil, status };
                    const { error: updateError } = await db.from('usuarios')
                        .update(updatePayload)
                        .eq('id_usuario', idUsuarioEmEdicao);
                    if (updateError) throw updateError;
                    showToast('Usuário atualizado com sucesso!', 'success');
                } else {
                    // CRIACAO: chama Edge Function que cria no Auth + insere em usuarios
                    const payload = { nome, email, loja, perfil, status, senha };
                    console.log("Payload sendo enviado para a Edge Function:", JSON.stringify(payload));
                    const { data, error } = await db.functions.invoke('criar-usuario', {
                        body: payload
                    });
                    if (error) throw new Error(error.message);
                    showToast('Usuário criado com sucesso!', 'success');
                }

                idUsuarioEmEdicao = null;
                closeModal('modalUsuarioAdmin');

                const { data: usuarios } = await db.from('usuarios').select('*').order('nome');
                todosUsuarios = usuarios || [];
                todosVendedores = todosUsuarios.filter(u => u.perfil === 'Vendedor');
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
        const { data, error } = await db.from('produtos').select('id_produto, codigo, nome_produto').order('nome_produto');
        if (error) {
            console.error('Supabase erro em produtos:', error.code, error.message, error.details, error.hint);
            showToast('Erro ao carregar produtos: ' + (error.message || error.code), 'error');
            return;
        }
        if (data) {
            todosProdutos = data.map(p => ({
                id_produto: p.id_produto,
                codigo: p.codigo || '',
                nome: p.nome_produto || ''
            })).filter(p => p.nome.trim() !== '');
            console.log('Produtos carregados:', todosProdutos.length);
        }
    } catch (e) {
        console.error('Erro ao carregar tabela de produtos:', e);
        showToast('Erro inesperado ao carregar produtos', 'error');
    }
}

        async function carregarHistoricoFaturamento() {
            if (!currentUser || (currentUser.perfil !== 'Vendedor' && (currentUser.perfil || '').toLowerCase() !== 'terminal')) { historicoFaturamento = []; return; }
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

        function atualizarBadge() {
            const pendentes = kpisMensais.filter(o => [STATUS.CONTATO_INICIAL, STATUS.NEGOCIACAO, STATUS.EM_FECHAMENTO].includes(o.status)).length;
            const badge = document.getElementById('badgeAgendaDia');
            if (badge) badge.classList.toggle('visible', pendentes > 0);
        }

        async function navigateTo(view) {
   	 // Limpa rolagem infinita de clientes ao sair da página
  	  if (currentView === 'clientes_lista' && view !== 'clientes_lista') {
        if (_clientes.observer) { _clientes.observer.disconnect(); _clientes.observer = null; }
    	    window._clientesCache = null;
  	  }
    
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

	    // --- ROTEAMENTO ---
 	   if (view === 'inicio') {
 	       await carregarKpisEDashboard();
  	      renderInicio();
 	   }
 	   else if (view === 'carteira') {
  	      await carregarKpisEDashboard(); // Garante que os dados mais novos venham do banco
        	renderCarteiraPage();           // Chama a nova página do Kanban que criamos
    	}
    	else if (view === 'admin_inicio') renderAdminInicio(document.getElementById('mainContent'));
    	else if (view === 'admin_usuarios') renderAdminUsuarios(document.getElementById('mainContent'));
    	else if (view === 'agenda_dia') {
        	await renderAgendaDia();
    	}
    	else if (view === 'clientes') {
        	await carregarKpisEDashboard();
        	renderClientes();
    	}
    	else if (view === 'metas') renderMetas();
    	else if (view === 'detalhes_cliente') {
        	const fab = document.getElementById('fabButton');
        	if (fab) fab.style.display = 'none';
        	renderDetalhesClientePage();
    	}
    	else if (view === 'novo_orcamento') renderNovoOrcamentoPage();
    	else if (view === 'clientes_lista') await renderClientesLista();
    	else if (view === 'ficha_cliente') await renderFichaCliente();
        else if (view === 'estoque') await renderEstoque();
	}

        function getMetaVendedor(idVendedor) {
            const user = (todosUsuarios && todosUsuarios.length > 0 ? todosUsuarios : todosVendedores).find(u => u.id_usuario === idVendedor);
            return user && user.meta_mensal ? parseFloat(user.meta_mensal) : META_PADRAO;
        }
        
       function calcularMetaTotal() {
            if (currentUser.perfil === 'Vendedor') return getMetaVendedor(currentUser.id_usuario);
            if ((currentUser.perfil || '').toLowerCase() === 'terminal') return todosVendedores.filter(v => v.id_loja === currentUser.id_loja).reduce((s, v) => s + getMetaVendedor(v.id_usuario), 0);
            
            let filtrados = todosVendedores;
            if (currentUser.perfil === 'Gerente') {
                filtrados = todosVendedores.filter(v => v.id_loja === currentUser.id_loja);
                if (selectedVendedor !== 'todos') filtrados = filtrados.filter(v => v.id_usuario === selectedVendedor);
            } else {
                if (selectedVendedor !== 'todos') {
                    filtrados = todosVendedores.filter(v => v.id_usuario === selectedVendedor);
                } else if (selectedLoja !== 'todas') {
                    filtrados = todosVendedores.filter(v => v.id_loja === selectedLoja);
                }
            }
            
            return filtrados.reduce((s, v) => s + getMetaVendedor(v.id_usuario), 0);
        }

        function getGamifiedColors(perc) {
            if (perc > 100) return { bg: 'linear-gradient(90deg, #3b82f6, #8b5cf6)', shadow: '0 0 12px rgba(139,92,246,0.5)', iconBg: '#3b82f6', iconSvg: '<svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg>', motive: 'Performance extraordinária!', motiveColor: '#3b82f6' };
            if (perc >= 100) return { bg: 'linear-gradient(90deg, #10b981, #059669)', shadow: '0 0 8px rgba(16,185,129,0.3)', iconBg: '#10b981', iconSvg: '<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>', motive: 'Meta batida!', motiveColor: '#10b981' };
            if (perc >= 80) return { bg: 'linear-gradient(90deg, #10b981, #059669)', shadow: '0 0 6px rgba(16,185,129,0.2)', iconBg: '#10b981', iconSvg: '<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>', motive: 'Quase lá!', motiveColor: '#10b981' };
            if (perc >= 50) return { bg: 'linear-gradient(90deg, #f59e0b, #eab308)', shadow: '0 0 6px rgba(245,158,11,0.25)', iconBg: '#f59e0b', iconSvg: '<svg viewBox="0 0 24 24"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>', motive: 'Em tração, continue!', motiveColor: '#f59e0b' };
            return { bg: 'linear-gradient(90deg, #ef4444, #f97316)', shadow: '0 0 8px rgba(239,68,68,0.3)', iconBg: '#ef4444', iconSvg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>', motive: 'Hora de acelerar!', motiveColor: '#ef4444' };
        }

        function renderComentariosHtml(comentarios, clienteId) {
            // REMOVIDO O FILTRO QUE BARRAVA O TIPO 'SISTEMA'
            const listaComentarios = comentarios || [];
            const frag = document.createDocumentFragment();

            if (listaComentarios.length === 0) {
                const p = document.createElement('p');
                p.style.color = 'var(--text-muted)';
                p.textContent = 'Nenhum comentário registrado.';
                frag.appendChild(p);
                return frag;
            }

            const grupos = {};
            listaComentarios.forEach(c => {
                const label = getDateLabel(c.data_criacao);
                if (!grupos[label]) grupos[label] = [];
                grupos[label].push(c);
            });

            Object.keys(grupos).forEach(label => {
                // Header do grupo (data)
                const groupHeader = document.createElement('div');
                groupHeader.className = 'timeline-group-header';
                groupHeader.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
                groupHeader.appendChild(document.createTextNode(' ' + label));
                frag.appendChild(groupHeader);

                grupos[label].forEach(c => {
                    const isNew = isCommentNew(c.data_criacao, clienteId);
                    const tipoLabel = c.tipo === 'Sistema' ? 'Sistema' : c.tipo === 'Perda' ? 'Perda' : 'Comentário';
                    const autorNome = c.autor || 'Sistema';
                    const autorInicial = autorNome.charAt(0).toUpperCase();
                    const podeEditar = (c.tipo === 'Comentário' || c.tipo === 'Perda') && c.autor === currentUser?.nome;
                    const horaMinuto = new Date(c.data_criacao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                    const item = document.createElement('div');
                    item.className = `comment-item${isNew ? ' is-new' : ''}`;

                    if (isNew) {
                        const badge = document.createElement('span');
                        badge.className = 'comment-badge-new';
                        badge.textContent = 'Novo';
                        item.appendChild(badge);
                    }

                    if (c._editando) {
                        // Modo edição
                        const header = document.createElement('div');
                        header.className = 'comment-header';
                        const avatar = document.createElement('div');
                        avatar.className = 'comment-avatar';
                        avatar.textContent = autorInicial;
                        const spanAutor = document.createElement('span');
                        spanAutor.className = 'comment-author';
                        spanAutor.textContent = autorNome;
                        const spanTipo = document.createElement('span');
                        spanTipo.className = 'comment-tipo';
                        spanTipo.textContent = tipoLabel;
                        header.appendChild(avatar);
                        header.appendChild(spanAutor);
                        header.appendChild(spanTipo);

                        const input = document.createElement('input');
                        input.type = 'text';
                        input.className = 'comment-edit-input';
                        input.id = `editInput_${c.id_comentario}`;
                        input.value = c.texto;

                        const editActions = document.createElement('div');
                        editActions.className = 'comment-edit-actions';
                        const btnCancel = document.createElement('button');
                        btnCancel.className = 'btn-cancel';
                        btnCancel.textContent = 'Cancelar';
                        btnCancel.addEventListener('click', cancelarEdicao);
                        const btnSave = document.createElement('button');
                        btnSave.className = 'btn-save';
                        btnSave.textContent = 'Salvar';
                        btnSave.addEventListener('click', e => salvarEdicao(e, c.id_comentario));
                        editActions.appendChild(btnCancel);
                        editActions.appendChild(btnSave);

                        item.appendChild(header);
                        item.appendChild(input);
                        item.appendChild(editActions);
                    } else {
                        // Modo leitura
                        if (podeEditar) {
                            const actions = document.createElement('div');
                            actions.className = 'comment-actions';
                            const btnEdit = document.createElement('button');
                            btnEdit.className = 'btn-edit';
                            btnEdit.title = 'Editar';
                            btnEdit.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
                            btnEdit.addEventListener('click', () => editarComentario(c.id_comentario));
                            const btnDel = document.createElement('button');
                            btnDel.className = 'btn-delete';
                            btnDel.title = 'Excluir';
                            btnDel.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 01-2-2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`;
                            btnDel.addEventListener('click', () => abrirModalExcluirComentario(c.id_comentario));
                            actions.appendChild(btnEdit);
                            actions.appendChild(btnDel);
                            item.appendChild(actions);
                        }

                        const header = document.createElement('div');
                        header.className = 'comment-header';
                        const avatar = document.createElement('div');
                        avatar.className = 'comment-avatar';
                        avatar.textContent = autorInicial;
                        const spanAutor = document.createElement('span');
                        spanAutor.className = 'comment-author';
                        spanAutor.textContent = autorNome;
                        const spanTipo = document.createElement('span');
                        spanTipo.className = 'comment-tipo';
                        spanTipo.textContent = tipoLabel;
                        header.appendChild(avatar);
                        header.appendChild(spanAutor);
                        header.appendChild(spanTipo);

                        const body = document.createElement('div');
                        body.className = 'comment-body';
                        body.textContent = c.texto; // .textContent = zero risco XSS

                        const time = document.createElement('div');
                        time.className = 'comment-time';
                        time.textContent = horaMinuto;

                        item.appendChild(header);
                        item.appendChild(body);
                        item.appendChild(time);
                    }

                    frag.appendChild(item);
                });
            });

            return frag;
        }

        function editarComentario(id_comentario) {
            const com = AppState.contextoVenda.clienteAtual.comentarios;
            com.forEach(c => delete c._editando);
            const index = com.findIndex(c => String(c.id_comentario) === String(id_comentario));
            if (index < 0) return;
            com[index]._editando = true;
            renderDetalhesClientePage();
            setTimeout(() => { const input = document.getElementById('editInput_' + id_comentario); if (input) input.focus(); }, 100);
        }

        function cancelarEdicao() {
            AppState.contextoVenda.clienteAtual.comentarios.forEach(c => delete c._editando);
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
                const index = AppState.contextoVenda.clienteAtual.comentarios.findIndex(c => String(c.id_comentario) === String(id_comentario));
                if (index > -1) { AppState.contextoVenda.clienteAtual.comentarios[index].texto = novoTexto; delete AppState.contextoVenda.clienteAtual.comentarios[index]._editando; }
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
                AppState.contextoVenda.clienteAtual.comentarios = AppState.contextoVenda.clienteAtual.comentarios.filter(c => String(c.id_comentario) !== String(comentarioParaExcluir));
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
                // 1. Salva o comentário no banco
                const { error } = await db.from('comentarios').insert([{
                    id_orcamento: AppState.contextoVenda.clienteAtual.id_orcamento,
                    texto: texto, tipo: 'Comentário', autor: currentUser.nome
                }]);

                if (error) throw error;

                // --- INÍCIO DA MELHORIA: NOTIFICAÇÃO DO GERENTE ---
                if (currentUser.perfil === 'Gerente') {
                    try {
                        const orcamento = AppState.contextoVenda.clienteAtual;
                        
                        // Garante que o gerente não está disparando alerta para si mesmo
                        if (orcamento && orcamento.id_usuario !== currentUser.id_usuario) {
                            
                            // Grava o alerta na tabela 'notificacoes'
                            await db.from('notificacoes').insert([{
                                id_usuario: orcamento.id_usuario, // Destinatário: Vendedor
                                texto: `${currentUser.nome} fez um comentário`,
                                tipo: 'comentario_gerente',
                                id_referencia: orcamento.id_orcamento,
                                id_cliente: orcamento.id_cliente,
                                lida: false
                            }]);
                        }
                    } catch (e) {
                        console.error('Erro ao gerar notificação de comentário do gerente:', e);
                    }
                }
                // --- FIM DA MELHORIA ---

                document.getElementById('novoComentario').value = '';
                atualizarIndicadorDigitacao();
                showToast('Histórico registrado!', 'success');

                // Recarrega apenas os comentários do banco para atualizar a timeline
                // sem bloquear toda a interface (evita congelamento do botão Voltar)
                try {
                    const { data: novosComentarios } = await db.from('comentarios')
                        .select('*')
                        .eq('id_orcamento', AppState.contextoVenda.clienteAtual.id_orcamento)
                        .order('data_criacao', { ascending: true });
                    if (novosComentarios) {
                        AppState.contextoVenda.clienteAtual.comentarios = novosComentarios;
                    }
                } catch (_) { /* se falhar, mantém o estado anterior */ }
                renderDetalhesClientePage();
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
                if (AppState.contextoVenda.clienteAtual && String(AppState.contextoVenda.clienteAtual.id_orcamento) === String(id)) {
                    AppState.contextoVenda.clienteAtual.observacoes = texto;
                }
            } catch (e) {
                if (loader) {
                    loader.textContent = 'Erro ao salvar'; loader.style.color = '#ef4444'; loader.classList.add('visible');
                    setTimeout(() => loader.classList.remove('visible'), 3000);
                }
            }
        }

        // ─── AJUSTAR PROPOSTA ────────────────────────────────────────────────

        /** Monta as <option> do select de produtos para o modal de ajuste */
        function _ajusteBuildSelectOpts(valorSelecionado) {
            let opts = '<option value="">Selecione um produto</option>';
            todosProdutos.forEach(p => {
                const texto = p.codigo ? `${p.codigo} - ${p.nome}` : p.nome;
                const sel = texto === valorSelecionado ? ' selected' : '';
                opts += `<option value="${escapeHtml(texto)}"${sel}>${escapeHtml(texto)}</option>`;
            });
            return opts;
        }

        /** Recalcula o total somando todos os inputs .ajuste-input-por */
        function ajusteRecalcularTotal() {
            let total = 0;
            document.querySelectorAll('#ajusteProdutosContainer .ajuste-input-por').forEach(inp => {
                total += parseCurrency(inp.value);
            });
            const el = document.getElementById('ajusteDisplayTotal');
            if (el) el.textContent = 'R$ ' + total.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            return total;
        }

        /** Atualiza visibilidade dos botões de lixeira no modal de ajuste */
        function _ajusteAtualizarLixeiras() {
            const btns = document.querySelectorAll('#ajusteProdutosContainer .btn-remove-item');
            const disable = btns.length === 1;
            btns.forEach(b => { b.style.opacity = disable ? '0.3' : '1'; b.style.pointerEvents = disable ? 'none' : 'auto'; });
        }

        /** Cria e appenda uma linha de produto ao container do modal de ajuste */
        function ajusteAdicionarLinha(nomePre = '', valorDePre = '', valorPorPre = '') {
            const container = document.getElementById('ajusteProdutosContainer');
            const row = document.createElement('div');
            row.className = 'produto-row';
            row.innerHTML = `
                <div class="produto-row-top">
                    <select class="form-input prod-nome">
                        ${_ajusteBuildSelectOpts(nomePre)}
                    </select>
                    <button type="button" class="btn-remove-item" onclick="this.closest('.produto-row').remove(); ajusteRecalcularTotal(); _ajusteAtualizarLixeiras();" title="Remover item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                </div>
                <div class="produto-row-bottom">
                    <div>
                        <div class="produto-row-label">De</div>
                        <input type="text" class="form-input input-de font-data ajuste-input-de" placeholder="R$ 0,00" inputmode="decimal"
                            value="${escapeHtml(valorDePre)}"
                            oninput="this.value = formatCurrency(this.value);">
                    </div>
                    <div>
                        <div class="produto-row-label">Por</div>
                        <input type="text" class="form-input input-por font-data ajuste-input-por" placeholder="R$ 0,00" inputmode="decimal"
                            value="${escapeHtml(valorPorPre)}"
                            oninput="this.value = formatCurrency(this.value); ajusteRecalcularTotal();">
                    </div>
                </div>`;
            container.appendChild(row);
            _ajusteAtualizarLixeiras();
            ajusteRecalcularTotal();
        }

        /** Abre o modal populando as linhas com base nos dados atuais do orçamento */
        function abrirAjusteProposta() {
            const orc = AppState.contextoVenda.clienteAtual;
            if (!orc) return;

            const isVendedor = currentUser.perfil === 'Vendedor';
            const isOpenStatus = [STATUS.CONTATO_INICIAL, STATUS.NEGOCIACAO, STATUS.EM_FECHAMENTO].includes(orc.status);
            const isGerente = currentUser.perfil === 'Gerente' || currentUser.perfil === 'Administrador' || currentUser.perfil === 'Admin';

            // Trava de segurança para Vendedor em orçamentos fechados/perdidos
            if (isVendedor && !isOpenStatus) {
                showToast('Propostas fechadas ou perdidas não podem ser editadas.', 'error');
                return;
            }

            // Limpa container e campos
            document.getElementById('ajusteProdutosContainer').innerHTML = '';
            document.getElementById('ajusteMotivo').value = '';
            document.getElementById('ajustePropostaMsg').textContent = '';

            // Subtitle contextual
            const alertaStatus = (!isOpenStatus && isGerente)
                ? `⚠️ Atenção: este orçamento está "${orc.status}". A alteração ficará registrada no histórico.`
                : `Editando proposta · ${escapeHtml(orc.clientes?.nome_cliente || 'cliente')} · ${escapeHtml(orc.status)}`;
            document.getElementById('ajustePropostaSubtitle').textContent = alertaStatus;

            // Workaround: reconstrói linhas a partir da string modelo_colchao
            const produtosStr = orc.modelo_colchao || '';
            const produtos = produtosStr.split(',').map(p => p.trim()).filter(Boolean);
            const valorTotal = parseFloat(orc.valor_orcado || 0);
            const umSoProduto = produtos.length === 1;

            if (produtos.length === 0) {
                // Nenhum produto salvo: cria linha em branco
                ajusteAdicionarLinha();
            } else {
                produtos.forEach((nome, i) => {
                    // Se só há 1 produto, pré-popula o "POR" com o total
                    const valorPor = (umSoProduto && i === 0)
                        ? 'R$ ' + valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                        : '';
                    ajusteAdicionarLinha(nome, '', valorPor);
                });
            }

            openModal('modalAjusteProposta');
        }

        /** Persiste as alterações no Supabase e atualiza estado local */
        async function salvarAjusteProposta() {
            const orc = AppState.contextoVenda.clienteAtual;
            if (!orc) return;

            const container = document.getElementById('ajusteProdutosContainer');
            const rows = container.querySelectorAll('.produto-row');
            const msgEl = document.getElementById('ajustePropostaMsg');
            msgEl.textContent = '';

            // Coleta produtos e valores
            const itens = [];
            let valorTotal = 0;
            let valido = true;

            rows.forEach(row => {
                const nome = (row.querySelector('.prod-nome')?.value || '').trim();
                const por  = parseCurrency(row.querySelector('.ajuste-input-por')?.value || '0');
                if (nome) {
                    itens.push({ nome, por });
                    valorTotal += por;
                } else {
                    valido = false;
                }
            });

            if (!valido || itens.length === 0) {
                msgEl.textContent = 'Selecione um produto em todas as linhas antes de salvar.';
                msgEl.style.color = '#ef4444';
                return;
            }

            const novosProdutos = itens.map(i => i.nome).join(', ');
            const motivo        = document.getElementById('ajusteMotivo').value.trim();

            // Valores antigos para auditoria
            const valorAntigo    = parseFloat(orc.valor_orcado || 0);
            const valorAntigoFmt = valorAntigo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const valorNovoFmt   = valorTotal.toLocaleString('pt-BR',  { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            // Spinner
            const btn = document.getElementById('btnSalvarAjuste');
            btn.querySelector('.btn-spinner').style.display = 'inline-block';
            btn.querySelector('.btn-text').textContent = 'Salvando...';
            btn.disabled = true;

            try {
                // 1. UPDATE orcamentos
                const { error: errUpdate } = await db
                    .from('orcamentos')
                    .update({ modelo_colchao: novosProdutos, valor_orcado: valorTotal })
                    .eq('id_orcamento', orc.id_orcamento);
                if (errUpdate) throw errUpdate;

                // 2. INSERT auditoria na timeline (formato rico com timestamp)
                const dataHoraAtual = new Date().toLocaleString('pt-BR', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });
                const linhaMotivo = motivo ? `📝 Motivo: ${motivo}` : '';
                const textoAuditoria = [
                    `🔄 Proposta Atualizada na Mesa`,
                    `💰 Valor: de R$ ${valorAntigoFmt} para R$ ${valorNovoFmt}`,
                    `🛏️ Itens: ${novosProdutos}`,
                    linhaMotivo,
                    ``,
                    `🕐 Ajuste realizado em ${dataHoraAtual}`
                ].filter(l => l !== undefined && !(l === '' && !linhaMotivo)).join('\n').replace(/\n\n+$/, '');

                const { error: errLog } = await db.from('comentarios').insert([{
                    id_orcamento: orc.id_orcamento,
                    texto: textoAuditoria,
                    tipo: 'Sistema',
                    autor: currentUser.nome
                }]);
                if (errLog) console.warn('Auditoria falhou (proposta já salva):', errLog);

                // 3. Atualiza estado local
                AppState.contextoVenda.clienteAtual.modelo_colchao = novosProdutos;
                AppState.contextoVenda.clienteAtual.valor_orcado   = valorTotal;

                // Recarrega comentários para refletir o log na timeline
                try {
                    const { data: novosComentarios } = await db
                        .from('comentarios')
                        .select('*')
                        .eq('id_orcamento', orc.id_orcamento)
                        .order('data_criacao', { ascending: true });
                    if (novosComentarios) AppState.contextoVenda.clienteAtual.comentarios = novosComentarios;
                } catch (_) { /* mantém estado anterior */ }

                showToast('Proposta ajustada com sucesso!', 'success');
                closeModal('modalAjusteProposta');
                renderDetalhesClientePage();

            } catch (e) {
                msgEl.textContent = 'Erro ao salvar: ' + (e.message || e);
                msgEl.style.color = '#ef4444';
            } finally {
                btn.querySelector('.btn-spinner').style.display = 'none';
                btn.querySelector('.btn-text').textContent = 'Salvar Alteração';
                btn.disabled = false;
            }
        }

        // ─── FIM AJUSTAR PROPOSTA ─────────────────────────────────────────────

        function buildLojaOptions() {
            let opts = `<option value="todas">Todas as lojas</option>`;
            listaLojas.slice().sort((a,b) => a.nome_loja.localeCompare(b.nome_loja)).forEach(l => {
                opts += `<option value="${l.id_loja}" ${selectedLoja === l.id_loja ? 'selected' : ''}>${escapeHtml(l.nome_loja)}</option>`;
            });
            return opts;
        }

        function buildVendedorOptions() {
            let filtrados = todosVendedores;
            if (currentUser.perfil === 'Gerente') {
                filtrados = todosVendedores.filter(v => v.id_loja === currentUser.id_loja);
            } else if (selectedLoja !== 'todas') {
                filtrados = todosVendedores.filter(v => v.id_loja === selectedLoja);
            }
            let opts = '<option value="todos" ' + (selectedVendedor === 'todos' ? 'selected' : '') + '>Todos os vendedores</option>';
            filtrados.forEach(v => { opts += `<option value="${v.id_usuario}" ${selectedVendedor == v.id_usuario ? 'selected' : ''}>${escapeHtml(v.nome)}</option>`; });
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
            const isAdmin = currentUser.perfil === 'Administrador' || currentUser.perfil === 'Admin';
            return `<div class="filter-group">
                ${isAdmin ? `<div class="filter-wrapper"><span class="filter-icon"><svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></span><select class="vendedor-select" id="lojaSelect" onchange="filtrarPorLoja(this.value)" aria-label="Filtrar por loja">${buildLojaOptions()}</select></div>` : ''}
                ${isGerente ? `<div class="filter-wrapper"><span class="filter-icon"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></span><select class="vendedor-select" id="vendedorSelect" onchange="filtrarPorVendedor(this.value)" aria-label="Filtrar por vendedor">${buildVendedorOptions()}</select></div>` : ''}
                <div class="filter-wrapper"><span class="filter-icon"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/></svg></span><select class="month-select" id="monthSelect" onchange="changeMonth(this.value)" aria-label="Selecionar mês">${buildMonthOptions()}</select></div>
                <div class="filter-wrapper"><span class="filter-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg></span><select class="day-select" id="daySelect" onchange="changeDay(this.value)" aria-label="Selecionar dia">${buildDayOptions()}</select></div>
            </div>`;
        }

       async function filtrarPorLoja(val) { 
    selectedLoja = val; 
    selectedVendedor = 'todos'; 
    currentPage = 1; 
    await carregarKpisEDashboard(); 
    
    if (currentView === 'carteira') {
        renderCarteiraPage();
    } else if (currentView === 'inicio') {
        renderInicio();
    } 
}

async function filtrarPorVendedor(val) { 
    selectedVendedor = val; 
    currentPage = 1; 
    await carregarKpisEDashboard(); 
    
    if (currentView === 'carteira') {
        renderCarteiraPage();
    } else if (currentView === 'inicio') {
        renderInicio();
    } 
}
        async function changeMonth(val) { 
    const [year, month] = val.split('-').map(Number); 
    currentYear = year; 
    currentMonth = month; 
    currentDay = null; 
    await carregarKpisEDashboard(); 

    if (currentView === 'carteira') {
        renderCarteiraPage();
    } else if (currentView === 'inicio') {
        renderInicio();
    } 
}

async function changeDay(val) { 
    currentDay = val === 'todos' ? null : parseInt(val); 
    await carregarKpisEDashboard(); 

    if (currentView === 'carteira') {
        renderCarteiraPage();
    } else if (currentView === 'inicio') {
        renderInicio();
    } 
}

        function handleSearch() {
    searchTerm = document.getElementById('searchInput')?.value || '';
    currentPage = 1;
    const tagContainer = document.getElementById('searchTagContainer');
    if (tagContainer) {
        tagContainer.innerHTML = searchTerm ? `<span class="search-tag">🔍 "${escapeHtml(searchTerm)}" <span class="remove-search" onclick="clearSearch()" aria-label="Limpar busca">✕</span></span>` : '';
    }
    
    // Atualiza apenas a tela ativa
    if (currentView === 'carteira') {
        renderKanbanBoard();
    } else if (currentView === 'inicio') {
        atualizarTabelaPaginadaServer();
    }
}

function handleSearchProtocolo() {
    searchProtocolo = document.getElementById('searchProtocoloInput')?.value?.trim() || '';
    currentPage = 1;
    
    if (currentView === 'carteira') {
        renderKanbanBoard();
    } else if (currentView === 'inicio') {
        atualizarTabelaPaginadaServer();
    }
}

function clearSearch() {
    searchTerm = '';
    searchProtocolo = '';
    const inp = document.getElementById('searchInput');
    if (inp) inp.value = '';
    const inpProt = document.getElementById('searchProtocoloInput');
    if (inpProt) inpProt.value = '';
    currentPage = 1;
    const tagContainer = document.getElementById('searchTagContainer');
    if (tagContainer) tagContainer.innerHTML = '';
    
    if (currentView === 'carteira') {
        renderKanbanBoard();
    } else if (currentView === 'inicio') {
        atualizarTabelaPaginadaServer();
    }
}

function selectFilter(filter) { 
    currentFilter = filter; 
    currentPage = 1; 
    
    if (currentView === 'carteira') {
        renderKanbanBoard();
    } else if (currentView === 'inicio') {
        atualizarTabelaPaginadaServer();
    }
}

        function buildProdutosOptionsDatalist() {
            if (todosProdutos.length === 0) return '';
            return todosProdutos.map(p => {
                const textoDisplay = p.codigo ? `${p.codigo} - ${p.nome}` : p.nome;
                return `<option value="${escapeHtml(textoDisplay)}">`;
            }).join('');
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
            const isEmAberto = (s) => ![STATUS.PERDIDO, STATUS.DECLINADO].includes(s);
            
            const agendadosHoje = kpisMensais.filter(o => o.data_contato === hoje && isEmAberto(o.status));
                        
            // Notificações de agenda
            agendadosHoje.forEach(o => notificacoes.push({ tipo: 'info', texto: `Contato agendado hoje: <strong>${escapeHtml(o.clientes?.nome_cliente || 'Cliente')}</strong>`, id: o.id_orcamento, data: o.hora_contato || 'horário não definido' }));
            
            
            // --- INÍCIO DA MELHORIA: INJETAR ALERTAS DO BANCO ---
            notificacoesBanco.forEach(n => {
                notificacoes.push({
                    tipo: 'comentario_gerente',
                    texto: n.texto,
                    id: n.id_referencia, // ID do orçamento para redirecionar
                    id_notif: n.id,      // ID da notificação para marcar como lida
                    data: 'Novo comentário do gerente'
                });
            });
            // --- FIM DA MELHORIA ---

            // Filtra as não lidas (somente notificações com id real)
            const naoLidas = notificacoes.filter(n => { 
                if (n.id === null || n.id === undefined) return false; 
                if (n.tipo === 'comentario_gerente') return true; // Já vêm filtradas como lida=false do banco
                return !notificacoesLidas.has(n.id); 
            });

            // Retorna as não lidas reais; o dropdown trata a lista vazia separadamente
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
            // Marca como lidas as notificações de agenda (localStorage) ao abrir
            const idsAgenda = notificacoes.filter(n => n.tipo !== 'comentario_gerente' && n.id).map(n => n.id);
            if (idsAgenda.length > 0) {
                marcarTodasNotificacoesLidas(idsAgenda);
            }
            // Renderiza com a lista atual (antes de marcar, para mostrar o que havia)
            renderizarDropdownNotificacoes(notificacoes);
            // Após marcar, zera o badge das notificações de agenda
            const restantes = buildNotifications();
            renderNotificationBadge(restantes.length);

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

            if (!notificacoes || notificacoes.length === 0) {
                html += '<div class="notif-empty">✓ Nenhum alerta no momento.</div>';
                dropdown.innerHTML = html;
                return;
            }
            
            notificacoes.forEach(n => {
                let dotClass = 'info';
                let onclick = '';
                
                if (n.tipo === 'critical') dotClass = 'critical';
                else if (n.tipo === 'warning') dotClass = 'warning';
                else if (n.tipo === 'comentario_gerente') dotClass = 'warning';

                if (n.tipo === 'comentario_gerente') {
                    onclick = `onclick="marcarNotificacaoBancoLida('${n.id_notif}', '${n.id}'); document.getElementById('notificationDropdown').classList.remove('open');"`;
                } else if (n.id) {
                    onclick = `onclick="marcarNotificacaoLida('${n.id}'); abrirDetalhesCliente('${n.id}'); document.getElementById('notificationDropdown').classList.remove('open');"`;
                }

                html += `<div class="notif-item" ${onclick} style="cursor:pointer;">
                            <span class="notif-dot ${dotClass}"></span>
                            <div style="flex:1;">
                                <div>${n.texto}</div>
                                <div style="font-size:10px; color:var(--text-muted);">${escapeHtml(n.data)}</div>
                            </div>
                         </div>`;
            });
            dropdown.innerHTML = html;
        }

        // Nova função auxiliar: marca a notificação do gerente como lida no Supabase e abre o cliente
        async function marcarNotificacaoBancoLida(idNotif, idOrcamento) {
            try {
                // Atualiza o status no banco de dados
                await db.from('notificacoes').update({ lida: true }).eq('id', idNotif);
                
                // Remove da lista local para atualizar o badge sem precisar de F5
                notificacoesBanco = notificacoesBanco.filter(n => String(n.id) !== String(idNotif));
                
                // Recalcula o badge de notificações
                const novasNotifs = buildNotifications();
                renderNotificationBadge(novasNotifs.length);
                
                // Abre a tela do orçamento
                abrirDetalhesCliente(idOrcamento);
            } catch (e) {
                console.error('Erro ao processar notificação:', e);
                // Se der erro no banco, abre o orçamento mesmo assim (fallback)
                abrirDetalhesCliente(idOrcamento);
            }
        }

        function classToFormatStatus(status) {
          const map = { 
           'Contato Inicial': 'contato-inicial', 
           'Negociação': 'negociacao-valores',  
           'Em Fechamento': 'aguardando-decisao', 
           'Fechado': 'fechado', 
           'Perdido': 'perdido' 
     };
    return map[status] || 'em-atendimento';
  }

        function renderInicio() {
    const main = document.getElementById('mainContent');
    const isGerente = currentUser.perfil === 'Gerente' || currentUser.perfil === 'Administrador' || currentUser.perfil === 'Admin';

    // 1. FILTRO CIRÚRGICO: Pega apenas o que é do mês/dia vigente
    const dados = kpisMensais.filter(o => {
        if (!o.data_criacao) return false;
        
        const dataOrc = o.data_criacao.split('T')[0]; 
        const [ano, mes, dia] = dataOrc.split('-');
        
        const isMesAnoCorreto = (parseInt(mes) === parseInt(currentMonth)) && (parseInt(ano) === parseInt(currentYear));
        
        if (currentDay) {
            return isMesAnoCorreto && (parseInt(dia) === parseInt(currentDay));
        }
        return isMesAnoCorreto;
    });

    // 2. CÁLCULOS — pega os dados já calculados do nosso estado
    const resumo = AppState.kpisMensaisResumo || {};
    const total = resumo.total_oportunidades || 0;
    const fechados = resumo.vendas_fechadas_qtd || 0;
    const negociacao = resumo.em_tratativa || 0;
    const valorVendido = resumo.vendas_fechadas_valor || 0;
    const fechadosArr = dados.filter(o => o.status === STATUS.FECHADO || o.status === 'Vendido');
    const conversao = total ? Math.round((fechados / total) * 100) : 0;
    const metaAtual = calcularMetaTotal();
    const percMetaExato = metaAtual ? Math.round((valorVendido / metaAtual) * 100) : 0;
    const gamified = getGamifiedColors(percMetaExato);

    // 3. UI/UX: RÓTULO DE PERÍODO CLARO PARA O USUÁRIO
    const nomeMesSelecionado = new Date(currentYear, currentMonth - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const labelPeriodo = currentDay ? `Resultados de ${currentDay} de ${nomeMesSelecionado}` : `Resultados de ${nomeMesSelecionado}`;

    // 4. HEADER HTML BEM FECHADO E ISOLADO
    const headerHtml = `
    <header class="dashboard-header">
        <div style="display: flex; flex-direction: column; gap: 4px;">
            <h1 style="margin: 0;">${isGerente ? 'Dashboard Vendas' : 'Dashboard do Vendedor'}</h1>
            <span style="font-size: 13px; color: var(--text-muted); font-weight: 500; text-transform: capitalize;">${labelPeriodo}</span>
        </div>
        <div class="header-controls">
            ${renderFiltrosData(isGerente)}
            <div class="header-notification-area">
                <button class="btn-notification" id="btnNotification" onclick="event.stopPropagation(); toggleNotifications();" aria-label="Notificações">
                    <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
                    <span class="notification-badge" id="notificationBadgeCount"></span>
                </button>
            </div>
        </div>
    </header>`;

    // 5. CARDS E GRÁFICOS
    const progressHtml = `<div class="gamified-progress-card"><div class="progress-icon" style="background:${gamified.iconBg}; box-shadow:${gamified.shadow};">${gamified.iconSvg}</div><div class="progress-info"><h3>Atingimento de Meta</h3><p class="progress-subtitle">R$ ${valorVendido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R$ ${metaAtual.toLocaleString('pt-BR')}</p></div><div class="progress-bar-outer"><div class="progress-bar-inner-gamified" style="width:${Math.min(100, percMetaExato)}%; background:${gamified.bg}; box-shadow:${gamified.shadow};"><span class="progress-percent">${percMetaExato > 100 ? '100+' : percMetaExato}%</span></div></div><div class="progress-motive-text" style="color:${gamified.motiveColor};">${gamified.motive}</div></div>`;
    
    const kpiHtml = `<div class="kpi-card"><div class="kpi-label-row"><span class="kpi-dot blue"></span><span class="kpi-label">Oportunidades Geradas</span></div><div class="kpi-value">${total}</div></div><div class="kpi-card"><div class="kpi-label-row"><span class="kpi-dot orange"></span><span class="kpi-label">Em Tratativa</span></div><div class="kpi-value">${negociacao}</div></div><div class="kpi-card"><div class="kpi-label-row"><span class="kpi-dot green"></span><span class="kpi-label">Taxa de Conversão</span></div><div class="kpi-value">${conversao}%</div></div><div class="kpi-card vendido-highlight"><div class="kpi-label-row"><span class="kpi-dot green"></span><span class="kpi-label">Vendas Fechadas</span></div><div class="kpi-value">R$ ${valorVendido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div></div>`;
    
    const donutHtml = `<div class="chart-card"><h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Aproveitamento</h3><div class="donut-wrapper"><canvas id="donutCanvas" width="200" height="200"></canvas></div><div class="donut-legend"><div style="display:flex; align-items:center; gap:8px;"><span class="legend-color orcados"></span> Orçados <strong>${total}</strong></div><div style="display:flex; align-items:center; gap:8px;"><span class="legend-color fechados"></span> Fechados <strong>${fechados}</strong></div></div></div>`;

    let barChartHtml = '';

    if (historicoFaturamento.length > 0) {
        barChartHtml = `<div class="chart-card" style="display:flex; flex-direction:column;"><h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg> Evolução Mensal</h3><div class="bar-chart-wrapper"><canvas id="barChartCanvas"></canvas></div></div>`;
    }
    
    let rankingHtml = '';
                if (isGerente) {
                    let vendedoresRanking = todosVendedores;
                    if (currentUser.perfil === 'Gerente') {
                        vendedoresRanking = todosVendedores.filter(v => v.id_loja === currentUser.id_loja);
                    } else if (selectedLoja !== 'todas') {
                        vendedoresRanking = todosVendedores.filter(v => v.id_loja === selectedLoja);
                    }
                
                    if (vendedoresRanking.length > 0) {
                        const ranking = vendedoresRanking.map(v => {
                            const vendido = dados.filter(o => o.id_usuario === v.id_usuario && (o.status === STATUS.FECHADO || o.status === STATUS.VENDIDO)).reduce((s, o) => s + parseFloat(o.valor_orcado || 0), 0);
                            const meta = parseFloat(v.meta_mensal || 0);
                            // pct = % da meta individual; se sem meta, usa ranking relativo (max=100)
                            const pct = meta > 0 ? Math.min((vendido / meta) * 100, 100) : 0;
                            return { nome: v.nome, vendido, meta, pct };
                        }).sort((a, b) => b.vendido - a.vendido);

                        // cores da barra por atingimento
                        const barColor = pct => {
                            if (pct >= 100) return 'linear-gradient(90deg,#059669,#10b981)';
                            if (pct >= 70)  return 'linear-gradient(90deg,#2563eb,#6366f1)';
                            if (pct >= 40)  return 'linear-gradient(90deg,#f59e0b,#fbbf24)';
                            return 'linear-gradient(90deg,#ef4444,#f87171)';
                        };
                        const posClass = i => i === 0 ? 'pos-1' : i === 1 ? 'pos-2' : i === 2 ? 'pos-3' : '';
                        const posLabel = i => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`;

                        rankingHtml = `<div class="chart-card"><h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg> Top Vendedores</h3><ul class="ranking-list">${ranking.map((r, i) => `
                            <li class="ranking-item">
                                <div class="ranking-item-top">
                                    <span class="ranking-pos ${posClass(i)}">${posLabel(i)}</span>
                                    <span class="ranking-nome">${escapeHtml(r.nome)}</span>
                                    <span class="ranking-valor">R$\u00a0${r.vendido.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span>
                                    <span class="ranking-pct-label">${r.meta > 0 ? Math.round(r.pct) + '%' : '–'}</span>
                                </div>
                                <div class="ranking-bar-outer">
                                    <div class="ranking-bar-inner" style="width:${r.pct}%; background:${barColor(r.pct)};"></div>
                                </div>
                            </li>`).join('')}</ul></div>`;
                    } else {
                        rankingHtml = `<div class="chart-card"><h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg> Top Vendedores</h3><div style="display:flex; align-items:center; justify-content:center; height:200px; color:var(--text-muted);">Nenhum vendedor encontrado para esta loja.</div></div>`;
                    }
                }

            const top5 = {};
            // Usa fechadosArr para contar apenas o que realmente foi vendido e fechado
        fechadosArr.forEach(o => {
            const modelosStr = (o.modelo_colchao || '').trim();
            if (!modelosStr || modelosStr === 'Sem modelo') return;
            
            const listaProdutos = modelosStr.split(',').map(p => p.trim()).filter(Boolean);
            listaProdutos.forEach(m => {
                if (!top5[m]) top5[m] = { nome: m, count: 0 };
                top5[m].count++;
            });
        });
        
        const top5Ordenado = Object.values(top5).sort((a, b) => b.count - a.count).slice(0, 5);
        
        // Trocado de 'orç.' para 'unid.' para fazer sentido com Vendas Fechadas
        const top5Html = top5Ordenado.map((p, i) => {
           
        // Limpa códigos numéricos ou alfanuméricos (ex: 5014020 - ou TR00107 - )
        const nomeLimpo = p.nome.replace(/^[a-zA-Z0-9]+\s*-\s*/, '').toLowerCase();
            
            return `
            <li>
                <span class="top5-rank">${i + 1}</span>
                <span style="flex:1; font-size: 13px; font-weight: 500; text-transform: capitalize; padding-right: 8px; line-height: 1.4;" title="${escapeHtml(p.nome)}">
                    ${escapeHtml(nomeLimpo)}
                </span>
                <span style="font-size:11px; font-weight:700; color:var(--brand-blue-dark); background:#eff6ff; border: 1px solid #bfdbfe; padding:2px 8px; border-radius:12px; flex-shrink: 0;">
                    ${p.count} unid.
                </span>
            </li>
        `}).join('') || '<li style="justify-content:center; color:var(--text-muted);">Nenhuma venda fechada</li>';
        
        const colVendedor = isGerente ? '<th>Vendedor</th>' : '';
        const searchTagHtml = searchTerm ? `<span class="search-tag">🔍 "${escapeHtml(searchTerm)}" <span class="remove-search" onclick="clearSearch()" aria-label="Limpar busca">✕</span></span>` : '';
            const tabelaHtml = `
            <div class="table-card">
              <div class="table-card-header">
                <h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg> Carteira de Negociações</h3>
                <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                  <div id="searchTagContainer">${searchTagHtml}</div>
                  <input type="text" class="search-input" placeholder="Buscar cliente..." id="searchInput" onchange="handleSearch()" onkeyup="if(event.key === 'Enter') handleSearch()" value="${escapeHtml(searchTerm)}" aria-label="Buscar cliente">
                  <input type="text" class="search-input" placeholder="Buscar protocolo..." id="searchProtocoloInput" onchange="handleSearchProtocolo()" onkeyup="if(event.key === 'Enter') handleSearchProtocolo()" value="${escapeHtml(searchProtocolo)}" aria-label="Buscar por protocolo" style="width:160px;">
                  <select class="form-input" style="width:auto; padding:8px 16px; border-radius:20px; font-size:var(--font-sm);" id="listFilterSelect" onchange="selectFilter(this.value)" aria-label="Filtrar por status">
                     <option value="todos" ${currentFilter === 'todos' ? 'selected' : ''}>Todos</option>
                     <option value="Contato Inicial" ${currentFilter === STATUS.CONTATO_INICIAL ? 'selected' : ''}>Contato Inicial</option>
                     <option value="Negociação" ${currentFilter === STATUS.NEGOCIACAO ? 'selected' : ''}>Negociação</option>
                     <option value="Em Fechamento" ${currentFilter === STATUS.EM_FECHAMENTO ? 'selected' : ''}>Em Fechamento</option>
                    <option value="Fechado" ${currentFilter === STATUS.FECHADO ? 'selected' : ''}>Fechado</option>
                    <option value="Perdido" ${currentFilter === STATUS.PERDIDO ? 'selected' : ''}>Perdido</option>
                </select> 
                        
                </div>
              </div>
              <div id="tabelaCarteiraWrapper">
                <table><thead><tr><th style="width:90px;">Protocolo</th><th>Cliente</th><th>Produto</th>${colVendedor}<th>Status</th><th>Data</th><th>Valor</th></tr></thead><tbody id="tableBody"></tbody></table>
                <div class="pagination" id="paginationContainer"></div>
              </div>
            </div>`;

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
            renderNotificationBadge(buildNotifications().length);

        }

			async function renderCarteiraPage() {
			    const main = document.getElementById('mainContent');
			    const isGerente = currentUser.perfil === 'Gerente' || currentUser.perfil === 'Administrador' || currentUser.perfil === 'Admin';
			
			    main.innerHTML = `
			        <header class="dashboard-header">
			            <div style="display: flex; flex-direction: column; gap: 4px;">
			                <h1 style="margin: 0;">Pipeline de Vendas</h1>
			                <span style="font-size: 13px; color: var(--text-muted); font-weight: 500;">Visão Geral do Funil</span>
			            </div>
			            <div class="header-controls">
			                ${renderFiltrosData(isGerente)}
			                <div class="header-notification-area">
			                    <button class="btn-notification" id="btnNotification" onclick="event.stopPropagation(); toggleNotifications();" aria-label="Notificações">
			                        <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
			                        <span class="notification-badge" id="notificationBadgeCount"></span>
			                    </button>
			                </div>
			            </div>
			        </header>
			
			        <div style="margin-bottom: 16px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
			            <div id="searchTagContainer"></div>
			            <input type="text" class="search-input" placeholder="Buscar cliente..." id="searchInput" onchange="handleSearch()" onkeyup="if(event.key === 'Enter') handleSearch()" value="${escapeHtml(searchTerm)}">
			            <input type="text" class="search-input" placeholder="Buscar protocolo..." id="searchProtocoloInput" onchange="handleSearchProtocolo()" onkeyup="if(event.key === 'Enter') handleSearchProtocolo()" value="${escapeHtml(searchProtocolo)}" style="width:160px;">
			            <select class="form-input" style="width:auto; padding:8px 16px; border-radius:20px; font-size:var(--font-sm);" id="listFilterSelect" onchange="selectFilter(this.value)">
			                 <option value="todos" ${currentFilter === 'todos' ? 'selected' : ''}>Todos os Status</option>
			                 <option value="Contato Inicial" ${currentFilter === STATUS.CONTATO_INICIAL ? 'selected' : ''}>Contato Inicial</option>
			                 <option value="Negociação" ${currentFilter === STATUS.NEGOCIACAO ? 'selected' : ''}>Negociação</option>
			                 <option value="Em Fechamento" ${currentFilter === STATUS.EM_FECHAMENTO ? 'selected' : ''}>Em Fechamento</option>
			                 <option value="Fechado" ${currentFilter === STATUS.FECHADO ? 'selected' : ''}>Fechado</option>
			                 <option value="Perdido" ${currentFilter === STATUS.PERDIDO ? 'selected' : ''}>Perdido</option>
			            </select>
			        </div>
			
			        <div id="kanbanBoard" class="active"></div>
			    `;
			
			    await renderKanbanBoard();
			    renderNotificationBadge(buildNotifications().length);
			}

        function obterSemanaAtual() {
            const hoje = new Date();
            const diaSemana = hoje.getDay(); // 0 = Domingo
            const diffSegunda = diaSemana === 0 ? -6 : 1 - diaSemana;
            const segunda = new Date(hoje);
            segunda.setDate(hoje.getDate() + diffSegunda);
            segunda.setHours(0, 0, 0, 0);
            const domingo = new Date(segunda);
            domingo.setDate(segunda.getDate() + 6);
            domingo.setHours(23, 59, 59, 999);
            return { inicio: segunda, fim: domingo };
        }

        window.addEventListener('focus', async () => {
            if (currentView === 'agenda_dia') await renderAgendaDia();
        });

        async function renderAgendaDia() {
            showLoader();
            const { inicio, fim } = obterSemanaAtual();
            const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
            const hojeStr = hoje.toISOString().split('T')[0];
            const inicioStr = inicio.toISOString().split('T')[0];

            // Estado do toggle (persistido na sessão)
            if (typeof window._agendaFiltro === 'undefined') window._agendaFiltro = 'pendentes';

            let agendados = [];
            let realizados = [];

            try {
                // Query direta e independente — não depende mais de kpisMensais
                let query = db.from('orcamentos')
                    .select('id_orcamento, valor_orcado, id_usuario, data_contato, hora_contato, observacao_agendamento, modelo_colchao, ligacao_confirmada, clientes(nome_cliente, whatsapp), status_orcamento(nome), usuarios(nome, id_loja)')
                    .not('data_contato', 'is', null)
                    .not('id_status', 'is', null);

                // Regras de visibilidade por perfil
                if (currentUser.perfil === 'Vendedor') {
                    query = query.eq('id_usuario', currentUser.id_usuario);
                } else if (currentUser.perfil === 'Gerente' || (currentUser.perfil || '').toLowerCase() === 'terminal') {
                    query = query.eq('usuarios.id_loja', currentUser.id_loja);
                    if (selectedVendedor !== 'todos') query = query.eq('id_usuario', selectedVendedor);
                } else {
                    // Administrador
                    if (selectedVendedor !== 'todos') query = query.eq('id_usuario', selectedVendedor);
                }

                const { data: rawData, error } = await query;
                if (error) throw error;

                // Normaliza o campo status para bater com as constantes STATUS.*
                const todos = (rawData || []).map(o => ({
                    ...o,
                    status: o.status_orcamento ? o.status_orcamento.nome : STATUS.CONTATO_INICIAL
                }));

                const ordenarCronologicamente = (a, b) => {
                    if (a.data_contato !== b.data_contato) return a.data_contato.localeCompare(b.data_contato);
                    return (a.hora_contato || '').localeCompare(b.hora_contato || '');
                };

                agendados = todos.filter(o => {
                    if ([STATUS.PERDIDO, STATUS.DECLINADO].includes(o.status)) return false;
                    if (o.ligacao_confirmada) return false;
                    const dataContato = new Date(o.data_contato + 'T00:00:00');
                    const naSemana = dataContato >= inicio && dataContato <= fim;
                    const atrasado = dataContato < hoje;
                    return naSemana || atrasado;
                }).sort(ordenarCronologicamente);

                realizados = todos.filter(o => {
                    if ([STATUS.PERDIDO, STATUS.DECLINADO].includes(o.status)) return false;
                    if (!o.ligacao_confirmada) return false;
                    const dataContato = new Date(o.data_contato + 'T00:00:00');
                    const naSemana = dataContato >= inicio && dataContato <= fim;
                    const atrasado = dataContato < hoje;
                    return naSemana || atrasado;
                }).sort(ordenarCronologicamente);

            } catch (err) {
                showToast('Erro ao carregar a agenda: ' + err.message, 'error');
                hideLoader();
                return;
            }

            hideLoader();

            const isGerente = currentUser.perfil === 'Gerente' || currentUser.perfil === 'Administrador' || currentUser.perfil === 'Admin';
            const colspanCount = 5 + (isGerente ? 1 : 0);

            const buildToggle = () => `
                <div class="agenda-toggle" id="agendaToggle">
                    <button class="${window._agendaFiltro === 'pendentes' ? 'active' : ''}" onclick="setAgendaFiltro('pendentes')">
                        Pendentes <span class="toggle-count">${agendados.length}</span>
                    </button>
                    <button class="${window._agendaFiltro === 'realizados' ? 'active' : ''}" onclick="setAgendaFiltro('realizados')">
                        Realizados <span class="toggle-count">${realizados.length}</span>
                    </button>
                </div>`;

            let html = `<header class="dashboard-header"><h1>Agenda e Próximos Passos</h1><div class="header-controls">${isGerente ? `<div class="filter-wrapper"><span class="filter-icon"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></span><select class="vendedor-select" id="vendedorSelectAgenda" onchange="filtrarPorVendedor(this.value)">${buildVendedorOptions()}</select></div>` : ''}<div class="filter-wrapper"><span class="filter-icon"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/></svg></span><select class="month-select" onchange="changeMonth(this.value)">${buildMonthOptions()}</select></div><div class="filter-wrapper"><span class="filter-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg></span><select class="day-select" onchange="changeDay(this.value)">${buildDayOptions()}</select></div><div class="header-notification-area"><button class="btn-notification" id="btnNotification" onclick="event.stopPropagation(); toggleNotifications();" aria-label="Notificações"><svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg><span class="notification-badge" id="notificationBadgeCount"></span></button></div></div></header>`;

            html += buildToggle();

            const listaAtiva = window._agendaFiltro === 'realizados' ? realizados : agendados;
            const msgVazia = window._agendaFiltro === 'realizados'
                ? '📭 Nenhum contato realizado neste período.'
                : '✨ Nenhum contato pendente para esta semana.';

            if (listaAtiva.length === 0) {
                html += `<div class="chart-card" style="text-align:center; padding:48px; color:var(--text-muted);">${msgVazia}</div>`;
            } else {
                html += `<div class="table-card"><table id="agendaTable"><thead><tr>
                    <th style="min-width:120px;">Data / Hora</th>
                    <th>Cliente</th>
                    <th>WhatsApp</th>
                    <th>Motivo do Contato</th>
                    ${isGerente ? '<th>Vendedor</th>' : ''}
                    <th style="text-align:center;">Contato</th>
                </tr></thead><tbody>`;

                listaAtiva.forEach(o => {
                    const nome = escapeHtml(o.clientes?.nome_cliente || 'Cliente');
                    const agendRaw = o.observacao_agendamento || '';
                    const linhas = agendRaw.split('\n');
                    const tipo = escapeHtml(linhas[0] || '-');
                    const obsExtra = linhas.length > 1 ? `<div style="font-size:11px; color:var(--text-muted); margin-top:2px; font-weight:400;">${escapeHtml(linhas.slice(1).join(' '))}</div>` : '';
                    const dataObj = new Date(o.data_contato + 'T00:00:00');
                    const dataExibicao = dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                    const horaExibicao = o.hora_contato || '--:--';
                    const agendamentoCompleto = `${dataExibicao} às ${horaExibicao}`;
                    const isRealizado = window._agendaFiltro === 'realizados';

                    html += `<tr class="clickable-row" data-id="${o.id_orcamento}" ${isRealizado ? 'style="opacity:0.65;"' : ''}>
                        <td style="font-weight:500; white-space:nowrap; min-width:120px;">${agendamentoCompleto}</td>
                        <td><span class="client-name">${nome}</span></td>
                        <td>${escapeHtml(o.clientes?.whatsapp || '-')}</td>
                        <td style="font-size:var(--font-xs); color:var(--text-secondary); font-weight:600;">${tipo}${obsExtra}</td>
                        ${isGerente ? `<td>${escapeHtml(o.usuarios?.nome || '-')}</td>` : ''}
                        <td style="text-align:center; vertical-align:middle;">
                            ${isRealizado
                                ? `<span style="color:var(--brand-blue); font-size:18px;" title="Contato realizado">✓</span>`
                                : `<button class="btn-confirm-contact" data-id="${o.id_orcamento}" title="Confirmar contato realizado" onclick="event.stopPropagation()">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="20 6 9 17 4 12"/></svg>
                                   </button>`
                            }
                        </td>
                    </tr>`;
                });
                html += `</tbody></table></div>`;
            }

            document.getElementById('mainContent').innerHTML = html;

            document.querySelectorAll('.table-card tbody tr.clickable-row').forEach(row => {
                row.addEventListener('click', function() {
                    const id = this.getAttribute('data-id');
                    if (id) abrirDetalhesCliente(id);
                });
            });

            document.querySelectorAll('.btn-confirm-contact').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await confirmarContato(btn.getAttribute('data-id'), btn);
                });
            });

            renderNotificationBadge(buildNotifications().length);
        }

        async function setAgendaFiltro(valor) {
            window._agendaFiltro = valor;
            await renderAgendaDia();
        }

        async function confirmarContato(orcamentoId, btnElement) {
            if (btnElement.classList.contains('loading')) return;
            btnElement.classList.add('loading');
            try {
                const { error } = await db.from('orcamentos')
                    .update({ ligacao_confirmada: true })
                    .eq('id_orcamento', orcamentoId);
                if (error) throw error;

                // Atualiza estado local
                const idx = kpisMensais.findIndex(o => o.id_orcamento === orcamentoId);
                if (idx !== -1) kpisMensais[idx].ligacao_confirmada = true;

                // Histórico
                await db.from('comentarios').insert([{
                    id_orcamento: orcamentoId,
                    texto: '✅ Contato confirmado como realizado via agenda.',
                    tipo: 'Sistema',
                    autor: currentUser.nome
                }]);

                // Animação de saída e remoção da linha
                const row = btnElement.closest('tr');
                if (row) {
                    row.style.transition = 'opacity 0.2s ease, transform 0.15s ease';
                    row.style.opacity = '0';
                    row.style.transform = 'translateX(8px)';
                    setTimeout(() => {
                        const tbody = row.parentNode;
                        row.remove();
                        if (tbody && tbody.children.length === 0) {
                            const isGerente = currentUser.perfil === 'Gerente' || currentUser.perfil === 'Administrador' || currentUser.perfil === 'Admin';
                            const colspanCount = 5 + (isGerente ? 1 : 0);
                            const emptyRow = document.createElement('tr');
                            emptyRow.innerHTML = `<td colspan="${colspanCount}" style="text-align:center; padding:48px; color:var(--text-muted);">✨ Nenhum contato pendente para esta semana.</td>`;
                            tbody.appendChild(emptyRow);
                        }
                    }, 200);
                }

                showToast('Contato confirmado!', 'success');
            } catch (err) {
                showToast('Erro ao confirmar contato: ' + err.message, 'error');
                btnElement.classList.remove('loading');
            }
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

        // ── Estado da rolagem infinita de clientes ──────────────────
        const _clientes = {
            todos: [],        // lista completa após filtro
            cursor: 0,        // quantos já foram renderizados
            pageSize: 30,     // linhas por lote
            loading: false,
            observer: null,
            isGerente: false,
            isVendedor: false,
            pk: null
        };

        async function renderClientesLista() {
            const main = document.getElementById('mainContent');
            main.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">Carregando clientes...</div>';
            try {
                const pk = _clientes.pk || (await detectClientePK());
                _clientes.pk = pk;
                const isVendedor = currentUser.perfil === 'Vendedor' || (currentUser.perfil || '').toLowerCase() === 'terminal';
                const isGerente = currentUser.perfil === 'Gerente' || currentUser.perfil === 'Administrador' || currentUser.perfil === 'Admin';
                _clientes.isVendedor = isVendedor;
                _clientes.isGerente = isGerente;

                // Monta lista de IDs permitidos por perfil
                let query = db.from('clientes')
                    .select(`${pk}, nome_cliente, whatsapp, cpf, email, id_cliente_codigo, orcamentos(id_orcamento, data_criacao, id_usuario, usuarios(nome), status_orcamento(nome))`)
                    .order('nome_cliente');

                if (isVendedor) {
                    const { data: orcsV } = await db.from('orcamentos').select('id_cliente').eq('id_usuario', currentUser.id_usuario);
                    const ids = [...new Set((orcsV || []).map(o => o.id_cliente).filter(Boolean))];
                    query = query.in(pk, ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
                } else if (currentUser.perfil === 'Gerente') {
                    const { data: usrs } = await db.from('usuarios').select('id_usuario').eq('id_loja', currentUser.id_loja);
                    const idsU = (usrs || []).map(u => u.id_usuario);
                    const { data: orcsL } = idsU.length
                        ? await db.from('orcamentos').select('id_cliente').in('id_usuario', idsU)
                        : { data: [] };
                    const ids = [...new Set((orcsL || []).map(o => o.id_cliente).filter(Boolean))];
                    query = query.in(pk, ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
                }

                const { data: clientes, error } = await query;
                if (error) throw error;
                (clientes || []).forEach(c => { c._pk = c[pk]; });

                // Guarda lista completa e aplica filtro de busca
                window._clientesCache = clientes || [];
                _aplicarFiltroClientes();

                renderNotificationBadge && renderNotificationBadge(buildNotifications().length);
            } catch(e) {
                main.innerHTML = `<div style="padding:40px;text-align:center;color:#ef4444;">Erro ao carregar clientes: ${escapeHtml(e.message)}</div>`;
            }
        }

        function _aplicarFiltroClientes() {
            // Desconecta observer anterior
            if (_clientes.observer) { _clientes.observer.disconnect(); _clientes.observer = null; }

            const busca = (window._clienteBusca || '').toLowerCase().trim();
            const todos = window._clientesCache || [];
            _clientes.todos = busca ? todos.filter(c =>
                (c.nome_cliente || '').toLowerCase().includes(busca) ||
                (c.cpf || '').includes(busca) ||
                (c.email || '').toLowerCase().includes(busca) ||
                (c.whatsapp || '').includes(busca) ||
                (c.id_cliente_codigo || '').toLowerCase().includes(busca)
            ) : todos;
            _clientes.cursor = 0;

            const main = document.getElementById('mainContent');
            const { isGerente, isVendedor } = _clientes;
            const colspan = isGerente ? 7 : 6;

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
                            <input type="text" class="search-input" placeholder="Buscar por nome, CPF, e-mail..." id="inputBuscaClientes"
                                value="${escapeHtml(window._clienteBusca || '')}"
                                oninput="filtrarClientesLista(this.value)" style="width:260px;">
                        </div>
                        <span id="clientesCount" style="font-size:var(--font-xs);color:var(--text-muted);">
                            ${_clientes.todos.length} cliente${_clientes.todos.length !== 1 ? 's' : ''}
                        </span>
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
                            <tbody id="clientesTbody">
                                ${_clientes.todos.length === 0
                                    ? `<tr><td colspan="${colspan}" style="text-align:center;padding:32px;color:var(--text-muted);">Nenhum cliente encontrado.</td></tr>`
                                    : ''}
                            </tbody>
                        </table>
                        <div id="clientesSentinel" style="height:1px;"></div>
                    </div>
                </div>`;

            if (_clientes.todos.length > 0) {
                _renderLoteClientes(); // primeiro lote imediato
                _setupInfiniteScroll();
            }
        }

        function _rowCliente(c) {
            const { isGerente, isVendedor } = _clientes;
            const orcs = c.orcamentos || [];
            orcs.sort((a, b) => new Date(b.data_criacao) - new Date(a.data_criacao));
            const ultimoOrc = orcs[0];
            const ultimoContato = ultimoOrc ? new Date(ultimoOrc.data_criacao).toLocaleDateString('pt-BR') : '-';
            const vendedor = ultimoOrc?.usuarios?.nome || '-';
            const codigo = c.id_cliente_codigo || String(c._pk || '').slice(0, 8) || '-';

            const tr = document.createElement('tr');

            // td código
            const tdCod = document.createElement('td');
            const spanCod = document.createElement('span');
            spanCod.className = 'cliente-id-badge';
            spanCod.textContent = codigo;
            tdCod.appendChild(spanCod);

            // td nome
            const tdNome = document.createElement('td');
            const spanNome = document.createElement('span');
            spanNome.className = 'client-name';
            spanNome.style.cursor = 'pointer';
            spanNome.textContent = c.nome_cliente || '-';
            spanNome.addEventListener('click', () => abrirFichaCliente(c._pk));
            tdNome.appendChild(spanNome);

            // td email
            const tdEmail = document.createElement('td');
            tdEmail.style.color = 'var(--text-secondary)';
            tdEmail.textContent = c.email || '-';

            // td whatsapp
            const tdWpp = document.createElement('td');
            tdWpp.textContent = c.whatsapp || '-';

            // td vendedor (só gerente)
            const tdVend = document.createElement('td');
            if (isGerente) tdVend.textContent = vendedor;

            // td último contato
            const tdContato = document.createElement('td');
            tdContato.textContent = ultimoContato;

            // td ações
            const tdAcoes = document.createElement('td');
            const divAcoes = document.createElement('div');
            divAcoes.style.cssText = 'display:flex; gap:4px; align-items:center;';

            const btnVer = document.createElement('button');
            btnVer.className = 'btn-action-icon';
            btnVer.title = 'Ver ficha';
            btnVer.innerHTML = `<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
            btnVer.addEventListener('click', () => abrirFichaCliente(c._pk));

            const btnEditar = document.createElement('button');
            btnEditar.className = 'btn-action-icon';
            btnEditar.title = 'Editar';
            btnEditar.innerHTML = `<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
            btnEditar.addEventListener('click', () => abrirModalEditarCliente(c._pk));

            divAcoes.appendChild(btnVer);
            divAcoes.appendChild(btnEditar);

            if (!isVendedor) {
                const btnExcluir = document.createElement('button');
                btnExcluir.className = 'btn-action-icon danger';
                btnExcluir.title = 'Excluir';
                btnExcluir.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`;
                btnExcluir.addEventListener('click', () => abrirModalExcluirCliente(c._pk, c.nome_cliente || ''));
                divAcoes.appendChild(btnExcluir);
            }

            const btnNegocio = document.createElement('button');
            btnNegocio.className = 'btn-action-icon green';
            btnNegocio.title = 'Criar negócio';
            btnNegocio.innerHTML = `<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
            btnNegocio.addEventListener('click', () => abrirModalCriarNegocio(c._pk, c.nome_cliente || '', c.cpf || '', c.whatsapp || '', c.email || ''));
            divAcoes.appendChild(btnNegocio);

            tdAcoes.appendChild(divAcoes);

            tr.appendChild(tdCod);
            tr.appendChild(tdNome);
            tr.appendChild(tdEmail);
            tr.appendChild(tdWpp);
            if (isGerente) tr.appendChild(tdVend);
            tr.appendChild(tdContato);
            tr.appendChild(tdAcoes);

            return tr;
        }

        function _renderLoteClientes() {
            if (_clientes.loading) return;
            const tbody = document.getElementById('clientesTbody');
            if (!tbody) return;
            const { todos, cursor, pageSize } = _clientes;
            if (cursor >= todos.length) return;
            _clientes.loading = true;
            const lote = todos.slice(cursor, cursor + pageSize);
            const frag = document.createDocumentFragment();
            lote.forEach(c => frag.appendChild(_rowCliente(c)));
            tbody.appendChild(frag);
            _clientes.cursor += lote.length;
            _clientes.loading = false;
        }

        function _setupInfiniteScroll() {
            const sentinel = document.getElementById('clientesSentinel');
            if (!sentinel) return;
            _clientes.observer = new IntersectionObserver(entries => {
                if (entries[0].isIntersecting && _clientes.cursor < _clientes.todos.length) {
                    _renderLoteClientes();
                }
            }, { rootMargin: '200px' });
            _clientes.observer.observe(sentinel);
        }

        function filtrarClientesLista(val) {
            window._clienteBusca = val;
            // Se cache disponível, filtra localmente sem nova query
            if (window._clientesCache) {
                _aplicarFiltroClientes();
            } else {
                renderClientesLista();
            }
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
                                <div style="font-weight:600;font-size:var(--font-sm);margin-bottom:2px;line-height:1.6;">${formatarProdutos(o.modelo_colchao)}</div>
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

            const isVendedor = currentUser.perfil === 'Vendedor' || (currentUser.perfil || '').toLowerCase() === 'terminal';
            const isGerenteOuAdmin = currentUser.perfil === 'Gerente' || currentUser.perfil === 'Administrador' || currentUser.perfil === 'Admin';

            // Configura visibilidade do campo de transferência
            const campoTransferencia = document.getElementById('campoTransferenciaCarteira');
            const selectVendedor = document.getElementById('editClienteVendedor');
            if (isGerenteOuAdmin && campoTransferencia && selectVendedor) {
                // Popula o dropdown com os vendedores disponíveis
                let optsVendedor = '<option value="">— Manter vendedor atual —</option>';
                const listaFiltrada = currentUser.perfil === 'Gerente'
                    ? todosVendedores.filter(v => v.id_loja === currentUser.id_loja)
                    : todosVendedores;

                // Para Admin: agrupa por loja para facilitar identificação
                if (currentUser.perfil !== 'Gerente') {
                    const lojaMap = {};
                    listaLojas.forEach(l => { lojaMap[l.id_loja] = l.nome_loja; });
                    // Agrupa por loja
                    const porLoja = {};
                    listaFiltrada.forEach(v => {
                        const nomeLoja = lojaMap[v.id_loja] || 'Sem Loja';
                        if (!porLoja[nomeLoja]) porLoja[nomeLoja] = [];
                        porLoja[nomeLoja].push(v);
                    });
                    Object.keys(porLoja).sort().forEach(nomeLoja => {
                        optsVendedor += `<optgroup label="${escapeHtml(nomeLoja)}">`;
                        porLoja[nomeLoja].forEach(v => {
                            optsVendedor += `<option value="${v.id_usuario}">${escapeHtml(v.nome)}</option>`;
                        });
                        optsVendedor += '</optgroup>';
                    });
                } else {
                    listaFiltrada.forEach(v => {
                        optsVendedor += `<option value="${v.id_usuario}">${escapeHtml(v.nome)}</option>`;
                    });
                }

                selectVendedor.innerHTML = optsVendedor;
                campoTransferencia.style.display = 'block';
            } else if (campoTransferencia) {
                campoTransferencia.style.display = 'none';
            }

            // Load from DB
            detectClientePK().then(pk => db.from('clientes').select('*').eq(pk, idCliente).single()).then(({data, error}) => {
                if (error || !data) { showToast('Erro ao carregar cliente.','error'); return; }
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
            const isVendedor = currentUser.perfil === 'Vendedor' || (currentUser.perfil || '').toLowerCase() === 'terminal';
            const isGerenteOuAdmin = currentUser.perfil === 'Gerente' || currentUser.perfil === 'Administrador' || currentUser.perfil === 'Admin';
            const nome = document.getElementById('editClienteNome').value.trim();
            const cpfRaw = document.getElementById('editClienteCpf').value.replace(/\D/g,'');
            const tel = document.getElementById('editClienteTel').value.trim();
            const email = document.getElementById('editClienteEmail').value.trim();
            const novoVendedorId = isGerenteOuAdmin ? (document.getElementById('editClienteVendedor')?.value || '') : '';
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

                // Transferência de carteira (Gerente/Admin)
                if (isGerenteOuAdmin && novoVendedorId) {
                    const { error: errTransf } = await db.from('orcamentos')
                        .update({ id_usuario: novoVendedorId })
                        .eq('id_cliente', id);
                    if (errTransf) throw new Error('Dados salvos, mas erro na transferência: ' + errTransf.message);

                    const vendedor = todosVendedores.find(v => v.id_usuario === novoVendedorId);
                    showToast(`Cliente transferido para ${vendedor?.nome || 'novo vendedor'} com sucesso!`, 'success');
                } else {
                    showToast('Cliente atualizado com sucesso!', 'success');
                }

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
            if (currentUser.perfil === 'Vendedor' || (currentUser.perfil || '').toLowerCase() === 'terminal') {
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
            // Cruza vendedores com lojas via id_loja (FK correcta)
            const lojaMap = {};
            listaLojas.forEach(l => { lojaMap[l.id_loja] = l; });

            // Calcula realizado por vendedor a partir de kpisMensais
            const realizadoPorVendedor = {};
            kpisMensais.forEach(o => {
                if (o.status === STATUS.FECHADO || o.status === STATUS.VENDIDO) {
                    realizadoPorVendedor[o.id_usuario] = (realizadoPorVendedor[o.id_usuario] || 0) + parseFloat(o.valor_orcado || 0);
                }
            });

            // Agrupa vendedores por id_loja
            const porLoja = {};
            todosVendedores.forEach(v => {
                const idL = v.id_loja || '__sem_loja__';
                if (!porLoja[idL]) porLoja[idL] = [];
                porLoja[idL].push(v);
            });

            const fmt = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            const pct = (real, meta) => meta > 0 ? Math.min(Math.round((real / meta) * 100), 100) : 0;
            const barColor = (p) => p >= 100 ? '#10b981' : p >= 80 ? '#10b981' : p >= 50 ? '#f59e0b' : '#ef4444';

            function progressBar(real, meta) {
                const p = pct(real, meta);
                return `<div style="margin-top:6px;">
                    <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--text-muted); margin-bottom:3px;">
                        <span>Realizado: <strong style="color:var(--text-primary);">R$ ${fmt(real)}</strong></span>
                        <span style="font-weight:700; color:${barColor(p)}">${p}%</span>
                    </div>
                    <div style="background:var(--border-light); border-radius:99px; height:6px; overflow:hidden;">
                        <div style="width:${p}%; height:100%; background:${barColor(p)}; border-radius:99px; transition:width 0.4s ease;"></div>
                    </div>
                </div>`;
            }

            let sections = '';
            let lojaIds = Object.keys(porLoja).sort((a, b) => {
                const nA = lojaMap[a]?.nome_loja || 'Sem Loja';
                const nB = lojaMap[b]?.nome_loja || 'Sem Loja';
                return nA.localeCompare(nB);
            });

            if (currentUser.perfil === 'Gerente') {
                lojaIds = lojaIds.filter(idL => idL === currentUser.id_loja);
            }

            lojaIds.forEach(idL => {
                const vendedores = porLoja[idL];
                const loja = lojaMap[idL];
                const nomeLoja = loja?.nome_loja || 'Sem Loja';
                const metaLoja = parseFloat(loja?.meta_mensal || 0);
                const somaVendedores = vendedores.reduce((s, v) => s + getMetaVendedor(v.id_usuario), 0);
                const realizadoLoja = vendedores.reduce((s, v) => s + (realizadoPorVendedor[v.id_usuario] || 0), 0);
                const metaExibida = metaLoja > 0 ? metaLoja : somaVendedores;

                // Cabeçalho da loja
                sections += `
                <div style="margin-bottom:28px; border:1.5px solid var(--border-light); border-radius:var(--radius-md); overflow:hidden;">
                    <div style="background:var(--bg-body); padding:16px 20px; border-bottom:1.5px solid var(--border-light);">
                        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
                            <div style="display:flex; align-items:center; gap:10px;">
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--brand-blue-dark)" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                                <span style="font-weight:800; font-size:var(--font-md); color:var(--brand-blue-dark);">${escapeHtml(nomeLoja)}</span>
                            </div>
                            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                                <span style="font-size:var(--font-xs); color:var(--text-muted);">Meta da loja:</span>
                                <input type="text" id="metaLoja_${idL}" value="R$ ${fmt(metaExibida)}"
                                    onfocus="this.select()"
                                    oninput="this.value = formatCurrency(this.value)"
                                    style="width:160px; padding:6px 10px; border-radius:8px; border:1.5px solid var(--border-light); font-size:var(--font-sm); font-weight:700; text-align:right; background:var(--card-bg); color:var(--text-primary);">
                                <button onclick="salvarMetaLoja('${idL}')"
                                    style="padding:6px 14px; border-radius:8px; background:var(--brand-blue); color:#fff; border:none; cursor:pointer; font-size:var(--font-xs); font-weight:600;">
                                    Salvar
                                </button>
                                ${metaLoja === 0 ? `<span style="font-size:10px; color:var(--text-muted); font-style:italic;">(usando soma dos vendedores)</span>` : ''}
                            </div>
                        </div>
                        ${progressBar(realizadoLoja, metaExibida)}
                    </div>
                    <table style="width:100%; border-collapse:collapse;">
                        <thead>
                            <tr style="background:var(--bg-body); border-bottom:1px solid var(--border-light);">
                                <th style="padding:10px 20px 10px 36px; text-align:left; font-size:var(--font-xs); color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.05em;">Vendedor</th>
                                <th style="padding:10px 20px; text-align:left; font-size:var(--font-xs); color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.05em;">Meta Individual</th>
                                <th style="padding:10px 20px; text-align:left; font-size:var(--font-xs); color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.05em; min-width:200px;">Progresso</th>
                                <th style="padding:10px 20px; text-align:right; font-size:var(--font-xs); color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.05em;">Ação</th>
                            </tr>
                        </thead>
                        <tbody>`;

                vendedores.forEach((v, idx) => {
                    const meta = getMetaVendedor(v.id_usuario);
                    const real = realizadoPorVendedor[v.id_usuario] || 0;
                    const p = pct(real, meta);
                    const cor = barColor(p);
                    const bg = idx % 2 === 0 ? 'var(--card-bg)' : 'var(--bg-body)';
                    sections += `
                            <tr style="background:${bg}; border-bottom:1px solid var(--border-light);">
                                <td style="padding:14px 20px 14px 36px;">
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        <div style="width:28px; height:28px; border-radius:50%; background:var(--brand-blue); color:#fff; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center;">${escapeHtml(v.nome.charAt(0).toUpperCase())}</div>
                                        <strong style="font-size:var(--font-sm);">${escapeHtml(v.nome)}</strong>
                                    </div>
                                </td>
                                <td style="padding:14px 20px; font-weight:700; font-size:var(--font-sm);">R$ ${fmt(meta)}</td>
                                <td style="padding:14px 20px;">
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        <div style="flex:1; background:var(--border-light); border-radius:99px; height:8px; overflow:hidden; min-width:80px;">
                                            <div style="width:${p}%; height:100%; background:${cor}; border-radius:99px;"></div>
                                        </div>
                                        <span style="font-size:11px; font-weight:700; color:${cor}; min-width:36px;">${p}%</span>
                                        <span style="font-size:11px; color:var(--text-muted);">R$ ${fmt(real)}</span>
                                    </div>
                                </td>
                                <td style="padding:14px 20px; text-align:right;">
                                    <button class="btn-salvar-modal" style="padding:6px 14px; font-size:11px; background:var(--card-bg); border:1px solid var(--border-light); color:var(--text-primary); border-radius:8px;"
                                        onclick="abrirModalMeta('${v.id_usuario}', '${escapeHtml(v.nome)}', ${meta})">Editar Meta</button>
                                </td>
                            </tr>`;
                });

                sections += `</tbody></table></div>`;
            });
            
            const btnVoltarHtml = (currentUser.perfil === 'Administrador' || currentUser.perfil === 'Admin') 
                ? `<button class="btn-voltar" onclick="navigateTo('admin_inicio')">← Voltar</button>` 
                : '';

            document.getElementById('mainContent').innerHTML = `
                <header class="dashboard-header">
                    <div style="display:flex; align-items:center; gap:16px;">
                        ${btnVoltarHtml}
                        <h1>Gestão de Metas</h1>
                    </div>
                    <span style="font-size:var(--font-xs); color:var(--text-muted);">Mês atual · dados em tempo real</span>
                </header>
                <div style="padding:0 0 32px;">${sections || '<p style="color:var(--text-muted); padding:24px;">Nenhum vendedor cadastrado.</p>'}</div>`;
        }

        async function salvarMetaLoja(idLoja) {
            const input = document.getElementById(`metaLoja_${idLoja}`);
            if (!input) return;
            const valor = parseCurrency(input.value);
            if (valor < 0) { showToast('Valor inválido.', 'error'); return; }
            try {
                const { error } = await db.from('lojas').update({ meta_mensal: Math.round(valor) }).eq('id_loja', idLoja);
                if (error) throw error;
                const idx = listaLojas.findIndex(l => l.id_loja === idLoja);
                if (idx > -1) listaLojas[idx].meta_mensal = Math.round(valor);
                showToast('Meta da loja salva!', 'success');
                renderMetas();
            } catch (e) { showToast('Erro ao salvar meta da loja: ' + e.message, 'error'); }
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
        
        const { data: comentarios, error: erroComent } = await db.from('comentarios').select('*').eq('id_orcamento', id).order('data_criacao', { ascending: true });
        if (erroComent) throw erroComent;
        
        // Anexamos os comentários direto no objeto 'data'
        data.comentarios = comentarios || [];
        
        // Guardamos o pacote completo dentro do Cofre!
        setClienteAtual(data);
        
        previousView = currentView; currentView = 'detalhes_cliente'; setUltimaVisita(id); renderDetalhesClientePage();
    } catch (e) { 
        showToast('Erro ao carregar cliente.', 'error'); 
    } finally { 
        hideLoader(); 
    }
}
        function renderDetalhesClientePage() {
            if (!AppState.contextoVenda.clienteAtual) { navigateTo(previousView); return; }
            const orc = AppState.contextoVenda.clienteAtual; 
            const id = orc.id_orcamento;
            const isGerente = currentUser.perfil === 'Gerente' || currentUser.perfil === 'Administrador' || currentUser.perfil === 'Admin';
            const isTerminal = (currentUser.perfil || '').toLowerCase() === 'terminal';
            const main = document.getElementById('mainContent');
            const isOpenStatus = [STATUS.CONTATO_INICIAL, STATUS.NEGOCIACAO, STATUS.EM_FECHAMENTO].includes(orc.status);
            
            const comentarios = orc.comentarios || []; 
            const comentariosFrag = renderComentariosHtml(comentarios, id);
            const statusClass = classToFormatStatus(orc.status);
            const interesse = escapeHtml(orc.interesse || '-');
            const interesseColor = orc.interesse === 'Alta' ? '#10b981' : orc.interesse === 'Média' ? '#f59e0b' : orc.interesse === 'Baixa' ? '#ef4444' : '#94a3b8';
            const dataCriacao = orc.data_criacao ? new Date(orc.data_criacao).toLocaleDateString('pt-BR') : '-';
            const ultimoContato = comentarios.length > 0 ? new Date(comentarios[comentarios.length - 1].data_criacao).toLocaleDateString('pt-BR') : '-';
            const whats = (orc.clientes?.whatsapp || '').replace(/\D/g, '');
            const valorFormatado = 'R$ ' + parseFloat(orc.valor_orcado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

            main.innerHTML = `
                <header style="display:flex; align-items:center; gap:16px; margin-bottom:20px; flex-wrap:nowrap; overflow:hidden;">
                    <button class="btn-voltar" onclick="voltarDetalhes()" style="flex-shrink:0;">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> Voltar
                    </button>
                    <div style="flex:1; min-width:0; display:flex; align-items:center; gap:12px; overflow:hidden;">
                        <div style="font-size:1.25rem; font-weight:800; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0;">${escapeHtml(orc.clientes?.nome_cliente || 'Cliente')}</div>
                        ${orc.protocolo ? `<span style="font-family:'JetBrains Mono',monospace; font-size:11px; font-weight:700; color:var(--brand-blue-dark); background:#eff6ff; border:1px solid #bfdbfe; padding:2px 9px; border-radius:5px; white-space:nowrap; flex-shrink:0;">${escapeHtml(orc.protocolo)}</span>` : ''}
                    </div>
                </header>

                <div class="detalhes-page-wrapper">

                    <div class="det-col-wide">
                        <section class="det-section">
                            <div class="det-section-header">
                                <svg class="det-section-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                <h2 class="det-section-title">Dados do Cliente</h2>
                            </div>

                            
                            <div class="det-pill-row">
                                <div class="det-pill">
                                    <span class="det-pill-label">Status</span>
                                    <span class="det-pill-value"><span class="status-tag ${statusClass}" style="font-size:11px; padding:3px 10px;">${escapeHtml(orc.status)}</span></span>
                                </div>
                                <div class="det-pill">
                                    <span class="det-pill-label">Interesse</span>
                                    <span class="det-pill-value"><svg width="8" height="8" viewBox="0 0 10 10" style="flex-shrink:0;"><circle cx="5" cy="5" r="5" fill="${interesseColor}"/></svg>${interesse}</span>
                                </div>
                            </div>

                            
                            <div class="det-pill-row" style="grid-template-columns:1fr; margin-bottom:10px;">
                                <div class="det-pill">
                                    <span class="det-pill-label">WhatsApp</span>
                                    <div class="det-pill-row-action">
                                        <span class="det-pill-value mono">${escapeHtml(orc.clientes?.whatsapp || '-')}</span>
                                        ${whats ? `<a href="https://wa.me/55${whats}" target="_blank" class="btn-wa-inline" style="flex-shrink:0;">
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                            Chamar
                                        </a>` : ''}
                                    </div>
                                </div>
                            </div>

                            
                            <div class="det-pill-row">
                                <div class="det-pill">
                                    <span class="det-pill-label">CPF / CNPJ</span>
                                    <span class="det-pill-value mono">${escapeHtml(orc.clientes?.cpf || '-')}</span>
                                </div>
                                <div class="det-pill">
                                    <span class="det-pill-label">Origem</span>
                                    <span class="det-pill-value">${escapeHtml(orc.origem || '-')}</span>
                                </div>
                            </div>

                            
                            <div class="det-pill-row">
                                <div class="det-pill">
                                    <span class="det-pill-label">Criado em</span>
                                    <span class="det-pill-value">${dataCriacao}</span>
                                </div>
                                <div class="det-pill">
                                    <span class="det-pill-label">Último Contato</span>
                                    <span class="det-pill-value">${ultimoContato}</span>
                                </div>
                            </div>
                            ${(isGerente || (currentUser.perfil || '').toLowerCase() === 'terminal') && orc.usuarios?.nome ? `
                            <div class="det-pill-row" style="grid-template-columns:1fr;">
                                <div class="det-pill">
                                    <span class="det-pill-label">Vendedor Responsável</span>
                                    <span class="det-pill-value" style="font-weight:600;">${escapeHtml(orc.usuarios.nome)}</span>
                                </div>
                            </div>` : ''}

                            
                            <div class="det-pill-row" style="grid-template-columns:1fr;">
                                <div class="det-pill highlight">
                                    <span class="det-pill-label">Valor Orçado</span>
                                    <span class="det-pill-value">${valorFormatado}</span>
                                </div>
                            </div>

                            
                            ${orc.modelo_colchao ? (() => {
                                const prods = orc.modelo_colchao.split(',').map(p => p.trim()).filter(Boolean);
                                const primeiro = escapeHtml(prods[0] || '-');
                                const extra = prods.length - 1;
                                const accId = `acc-det-${orc.id_orcamento}`;
                                const listaHtml = prods.map(p => `<li><span style="color:var(--brand-blue);font-weight:bold;">•</span> ${escapeHtml(p)}</li>`).join('');
                                return `
                                <div class="det-pill-row" style="grid-template-columns:1fr;">
                                    <div class="det-pill">
                                        <span class="det-pill-label">Produto(s)</span>
                                        <div style="display:flex; flex-direction:column; gap:6px;">
                                            <span class="det-pill-value">${primeiro}</span>
                                            ${extra > 0 ? `
                                            <button class="btn-expand-produtos" onclick="
                                                const acc=document.getElementById('${accId}');
                                                const open=acc.style.display==='block';
                                                acc.style.display=open?'none':'block';
                                                this.classList.toggle('open',!open);
                                            ">+ ${extra} item${extra > 1 ? 'ns' : ''} <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="6 9 12 15 18 9"/></svg></button>
                                            <div id="${accId}" style="display:none; padding:10px 12px; background:var(--surface-2); border-left:3px solid var(--brand-blue); border-radius:0 var(--radius-sm) var(--radius-sm) 0; font-size:var(--font-xs); color:var(--text-secondary);">
                                                <strong style="display:block; margin-bottom:6px;">Todos os itens:</strong>
                                                <ul style="list-style:none; padding:0; display:flex; flex-direction:column; gap:5px;">${listaHtml}</ul>
                                            </div>` : ''}
                                        </div>
                                    </div>
                                </div>`;
                            })() : ''}

                            
                            ${orc.forma_pagamento || orc.data_entrega ? `
                            <div class="det-pill-row">
                                ${orc.forma_pagamento ? `<div class="det-pill"><span class="det-pill-label">Pagamento</span><span class="det-pill-value">${escapeHtml(orc.forma_pagamento)}</span></div>` : ''}
                                ${orc.data_entrega ? `<div class="det-pill"><span class="det-pill-label">Entrega</span><span class="det-pill-value blue">${new Date(orc.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}</span></div>` : ''}
                            </div>` : ''}

                            
                            ${isGerente ? `
                            <div class="det-pill-row" style="grid-template-columns:1fr;">
                                <div class="det-pill">
                                    <span class="det-pill-label">Vendedor</span>
                                    <span class="det-pill-value">${escapeHtml(orc.usuarios?.nome || '-')}</span>
                                </div>
                            </div>` : ''}

                            <div class="det-obs-area" style="margin-top:auto; padding-top:12px;">
                                <label class="det-obs-label">Observações <span id="obsSalvaLoader" class="auto-save-indicator">✓ Salvo</span></label>
                                <textarea id="obsFixaCliente" class="form-input" style="resize:none; min-height:72px; font-size:13px;" placeholder="Ex: Cliente prefere contato de manhã..." onblur="salvarObservacaoFixa('${orc.id_orcamento}')">${escapeHtml(orc.observacoes || '')}</textarea>
                            </div>

                            ${(() => {
                                const isVendedor = currentUser.perfil === 'Vendedor';
                                const podeAjustar = isGerente || !isVendedor || isOpenStatus;
                                const btnAjuste = podeAjustar ? `
                                <button class="btn-primary-action" style="width:100%;justify-content:center;margin-top:0;" onclick="abrirAjusteProposta()">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                    Ajustar Proposta
                                </button>` : '';
                                const btnsFechamento = (isOpenStatus && !isGerente) ? `
                                <div style="display:flex;gap:8px;margin-top:8px;">
                                    <button class="btn-fechar-hero" style="flex:1;justify-content:center;" onclick="abrirConfirmaFechamento('${orc.id_orcamento}')">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                                        Fechar Venda
                                    </button>
                                    <button class="btn-perder-hero" style="flex:1;justify-content:center;" onclick="abrirMotivoPerda('${orc.id_orcamento}')">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                                        Marcar Perdida
                                    </button>
                                </div>` : '';
                                if (!btnAjuste && !btnsFechamento) return '';
                                return `<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border-light);">${btnAjuste}${btnsFechamento}</div>`;
                            })()}
                        </section>
                    </div>

                    <div class="det-col-history">
                        <section class="det-section scrollable">
                            <div class="det-section-header">
                                <svg class="det-section-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                <h2 class="det-section-title">Histórico de Contatos</h2>
                            </div>

                            <div class="det-timeline-scroll" id="listaComentarios"></div>

                            <div class="det-comment-expand" id="btnExpandComment" onclick="expandirComentario()">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                Adicionar registro...
                            </div>
                            <div class="det-comment-form" id="formComentario">
                                <textarea id="novoComentario" rows="3" class="form-input" style="font-size:13px; background:var(--card-bg); resize:none;" placeholder="Registre observações, ligações ou anotações..." oninput="atualizarIndicadorDigitacao()"></textarea>
                                <div class="typing-indicator" id="typingIndicator">Mensagem sendo redigida...</div>
                                <div class="det-comment-actions">
                                    <div class="field-error" id="comentarioMsg"></div>
                                    <button class="btn-registrar-hist" id="btnSalvarTimeline" onclick="salvarComentario()">
                                        <span class="btn-spinner" style="display:none; width:14px; height:14px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:spin 1s linear infinite;"></span>
                                        <span class="btn-text" style="display:flex; align-items:center; gap:6px;">
                                            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                                            Registrar
                                        </span>
                                    </button>
                                </div>
                            </div>
                        </section>
                    </div>

                    <div class="det-col-wide">
                        <section class="det-section">
                            <div class="det-section-header">
                                <svg class="det-section-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                <h2 class="det-section-title">Agendar Próximo Contato</h2>
                            </div>

                            <div style="margin-bottom:16px;">
                                <div style="font-size:10px; font-weight:600; color:#94a3b8; text-transform:uppercase; letter-spacing:.05em; margin-bottom:8px;">Acesso rápido</div>
                                <div class="det-quick-dates">
                                    <button class="btn-quick-date" onclick="setQuickDate(1)">Amanhã</button>
                                    <button class="btn-quick-date" onclick="setQuickDate(3)">Em 3 dias</button>
                                    <button class="btn-quick-date" onclick="setQuickDate(7)">Semana que vem</button>
                                    <button class="btn-quick-date" onclick="setQuickDate(15)">Em 15 dias</button>
                                </div>
                            </div>

                            <div class="schedule-form-grid" style="margin-bottom:16px;">
                                <div class="form-group">
                                    <label>Data *</label>
                                    <input type="date" id="agendarData" value="${escapeHtml(orc.data_contato || '')}" class="form-input" style="height:40px; padding:0 12px; font-family:'JetBrains Mono',monospace; font-size:13px;">
                                </div>
                                <div class="form-group">
                                    <label>Horário</label>
                                    <input type="time" id="agendarHora" value="${escapeHtml(orc.hora_contato || '')}" class="form-input" style="height:40px; padding:0 12px; font-family:'JetBrains Mono',monospace; font-size:13px;">
                                </div>
                            </div>

                            <div class="form-group" style="margin-bottom:16px;">
                                <label>Tipo de Contato *</label>
                                <select id="agendarTipo" class="form-input" style="height:40px; padding:0 12px; font-size:13px;">
                                    <option value="">Selecionar...</option>
                                    <optgroup label="Vendas">
                                        <option value="Apresentação de Campanha/Promoção">Apresentação de Campanha/Promoção</option>
                                        <option value="Reativação de Contato Antigo">Reativação de Contato Antigo</option>
                                        <option value="Acompanhamento de Orçamento">Acompanhamento de Orçamento</option>
                                        <option value="Virada de Tabela">Virada de Tabela</option>
                                        <option value="Quebra de Objeção">Quebra de Objeção</option>
                                        <option value="Cross-sell (Venda Cruzada)">Cross-sell (Venda Cruzada)</option>
                                    </optgroup>
                                    <optgroup label="Pós-Venda">
                                        <option value="Alinhamento Logístico">Alinhamento Logístico</option>
                                        <option value="Acompanhamento de Adaptação (Pós-Entrega)">Acompanhamento de Adaptação (Pós-Entrega)</option>
                                        <option value="Assistência Técnica">Assistência Técnica</option>
                                    </optgroup>
                                </select>
                                <div class="field-error" id="agendarTipoErro"></div>
                            </div>

                            <div class="form-group" style="flex:1; display:flex; flex-direction:column; margin-bottom:16px;">
                                <label>Observações / Lembrete</label>
                                <textarea id="agendarObservacao" class="form-input" style="flex:1; resize:none; font-size:13px; min-height:120px;" placeholder="Detalhes contextuais para o próximo contato..."></textarea>
                            </div>

                            <button class="btn-agendar-full" id="btnConfirmarAgendamento" onclick="agendarContato()" style="margin-top:0;">
                                <span class="btn-spinner" style="display:none; width:16px; height:16px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:spin 1s linear infinite;"></span>
                                <span class="btn-text" style="display:flex; align-items:center; gap:6px;">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                    Confirmar Agendamento
                                </span>
                            </button>
                            <div class="field-error" id="agendarMsg" style="text-align:center; margin-top:8px;"></div>
                        </section>
                    </div>

                </div>
            `;
            // Injeta o fragment da timeline após o main.innerHTML ser construído
            const listaContainer = document.getElementById('listaComentarios');
            if (listaContainer) listaContainer.appendChild(comentariosFrag);
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

        function toggleSenhaAdmin() {
            const input = document.getElementById('adminModSenha');
            const icon = document.getElementById('eyeIconAdmin');
            const isHidden = input.type === 'password';
            input.type = isHidden ? 'text' : 'password';
            icon.innerHTML = isHidden
                ? '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
                : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
        }

        function formatCurrency(value) { let num = value.replace(/\D/g, ''); num = (parseInt(num) || 0).toString(); return 'R$ ' + parseInt(num.slice(0, -2) || '0').toLocaleString('pt-BR') + ',' + num.slice(-2).padStart(2, '0'); }
        function parseCurrency(value) { return parseFloat(value.replace(/[^\d,]/g, '').replace(',', '.')) || 0; }

        function toggleAccordion(event, idOrcamento) {
            event.stopPropagation();
            const accordionRow = document.getElementById(`acc-${idOrcamento}`);
            const btn = event.currentTarget;
            if (accordionRow.classList.contains('open')) {
                accordionRow.classList.remove('open');
                btn.classList.remove('open');
            } else {
                document.querySelectorAll('.accordion-row.open').forEach(r => r.classList.remove('open'));
                document.querySelectorAll('.btn-expand-produtos.open').forEach(b => b.classList.remove('open'));
                accordionRow.classList.add('open');
                btn.classList.add('open');
            }
        }

        function formatarProdutos(modelo_colchao) {
            if (!modelo_colchao) return '-';
            
            // Separa os produtos
            const produtos = modelo_colchao.split(',').map(p => p.trim()).filter(Boolean);
            if (produtos.length === 0) return '-';

            const primeiroProduto = escapeHtml(produtos[0]);
            
            // Se tem só 1 produto, mostra ele normalmente
            if (produtos.length === 1) {
                return primeiroProduto;
            } 
            
            // Se tem mais de 1, mostra o primeiro + a tag com a quantidade extra
            const qtdExtra = produtos.length - 1;
            const tagPlural = qtdExtra > 1 ? 'itens' : 'item';
            
            return `${primeiroProduto} <br><span style="display:inline-block; margin-top:4px; font-size:10px; font-weight:700; color:var(--brand-blue-dark); background:#eff6ff; border: 1px solid #bfdbfe; padding:2px 8px; border-radius:12px;">+ ${qtdExtra} ${tagPlural}</span>`;
        }


        function buildProdutoSelectOptions() {
            let opts = '<option value="">Selecione um produto</option>';
            if (todosProdutos.length === 0) return opts;
            todosProdutos.forEach(p => {
                const texto = p.codigo ? `${p.codigo} - ${p.nome}` : p.nome;
                opts += `<option value="${escapeHtml(texto)}">${escapeHtml(texto)}</option>`;
            });
            return opts;
        }

        function adicionarProdutoRow() {
            const container = document.getElementById('produtosContainer'); 
            const row = document.createElement('div'); 
            row.className = 'produto-row';
            row.innerHTML = `
                <div class="produto-row-top">
                    <select class="form-input prod-nome" required>
                        ${buildProdutoSelectOptions()}
                    </select>
                    <button type="button" class="btn-remove-item" onclick="removerProdutoRow(this)" title="Remover item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                </div>
                <div class="produto-row-bottom">
                    <div>
                        <div class="produto-row-label">De</div>
                        <input type="text" class="form-input input-de font-data" placeholder="R$ 0,00" inputmode="decimal" oninput="this.value = formatCurrency(this.value);">
                    </div>
                    <div>
                        <div class="produto-row-label">Por</div>
                        <input type="text" class="form-input input-por font-data" placeholder="R$ 0,00" inputmode="decimal" oninput="this.value = formatCurrency(this.value); calcTotalModal();">
                    </div>
                </div>
            `;
            container.appendChild(row); 
            atualizarBotoesLixeira();
        }

        function validarProdutoSelecionado(input) {
            const checkSpan = input.parentElement.querySelector('.prod-check');
            const produtoDigitado = input.value.trim().toLowerCase();
            
            const produtoExiste = todosProdutos.some(p => {
                const textoDisplay = p.codigo ? `${p.codigo} - ${p.nome}`.toLowerCase() : p.nome.toLowerCase();
                return textoDisplay === produtoDigitado || p.nome.toLowerCase() === produtoDigitado;
            });
        
            if (produtoExiste && produtoDigitado !== '') {
                checkSpan.style.display = 'inline';
                input.style.borderColor = '#10b981';
            } else {
                checkSpan.style.display = 'none';
                input.style.borderColor = 'var(--border-light)';
            }
        }

        function removerProdutoRow(btn) { btn.closest('.produto-row').remove(); calcTotalModal(); atualizarBotoesLixeira(); }
        function atualizarBotoesLixeira() { const btns = document.getElementById('produtosContainer').querySelectorAll('.btn-remove-item'); if (btns.length === 1) { btns[0].style.opacity = '0.3'; btns[0].style.pointerEvents = 'none'; } else { btns.forEach(b => { b.style.opacity = '1'; b.style.pointerEvents = 'auto'; }); } }
        function calcTotalModal() { 
    let total = 0; 
    const container = document.getElementById('produtosContainer');
    
    // Só faz a soma se estiver dentro da página de Novo Orçamento
    if (container) {
        container.querySelectorAll('.input-por').forEach(inp => { 
            total += parseCurrency(inp.value); 
        }); 
    }
    
    const display = document.getElementById('displayTotalModal');
    if (display) {
        display.textContent = 'R$ ' + total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }); 
    }
    
    return total; 
}
        function abrirNovoOrcamento() { const p = (currentUser?.perfil || '').toLowerCase(); if (p !== 'vendedor' && p !== 'terminal') return; navigateTo('novo_orcamento'); }

        // Protocolo gerado automaticamente pelo banco via nextval('protocolo_seq')

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
            
            // Se estiver vazio, passa direto (agora é opcional)
            if (cpf.length === 0) {
                errSpan.textContent = '';
                return true;
            }
            
            // Se preencheu, valida o tamanho (11 para CPF ou 14 para CNPJ)
            if (cpf.length !== 11 && cpf.length !== 14) { 
                errSpan.textContent = 'CPF/CNPJ inválido'; 
                return false; 
            }
            
            errSpan.textContent = '';
            const { data: existing } = await db.from('clientes')
                .select('*')
                .eq('cpf', cpf)
                .maybeSingle();
            if (existing) {
                errSpan.textContent = `⚠️ Documento já pertence a ${existing.nome_cliente}. O orçamento será vinculado a este cliente.`;
                return false;
            }
            return true;
        }

        async function renderNovoOrcamentoPage() {
            const main = document.getElementById('mainContent');
            if (todosProdutos.length === 0) await carregarProdutos();
            const hoje = new Date().toISOString().split('T')[0];
        
            main.innerHTML = `
                <header class="dashboard-header" style="display:flex; align-items:center; gap:16px; margin-bottom:24px;">
                    <button class="btn-voltar" onclick="navigateTo(previousView)" style="background:#fff; border:1px solid #e2e8f0; padding:8px 16px; border-radius:8px; cursor:pointer; font-weight:600; color:#475569; display:flex; align-items:center; gap:6px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> Voltar
                    </button>
                    <h1 style="font-size: 20px; font-weight: 800; color:#0f172a;">Novo Orçamento</h1>
                </header>

                <div class="novo-orcamento-wrapper">
                    <!-- COLUNA 1: CLIENTE -->
                    <section class="novo-orcamento-section">
                        <div class="section-header">
                            <svg class="section-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            <h2 class="section-title">Dados do Cliente</h2>
                        </div>
                        
                        <div class="form-group"><label for="modNome">Nome ou Razão Social *</label><input type="text" id="modNome" class="form-input" placeholder="Ex: João da Silva" onblur="validateField('modNome','errNome')"><div class="field-error" id="errNome" style="color:#ef4444; font-size:12px; margin-top:4px;"></div></div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                            <div class="form-group"><label for="modCpf">CPF / CNPJ</label><input type="text" id="modCpf" class="form-input font-data" placeholder="Opcional" onblur="validarCPF()"><div class="field-error" id="errCpf" style="color:#ef4444; font-size:12px; margin-top:4px;"></div></div>                            <div class="form-group"><label for="modWhats">WhatsApp *</label><input type="tel" id="modWhats" class="form-input font-data" placeholder="(00) 00000-0000" onblur="validateField('modWhats','errWhats')"><div class="field-error" id="errWhats" style="color:#ef4444; font-size:12px; margin-top:4px;"></div></div>
                        </div>

                        <div class="form-group"><label for="modEmail">E-mail</label><input type="email" id="modEmail" class="form-input" placeholder="cliente@email.com"></div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                            <div class="form-group"><label for="modOrigem">Canal de Origem</label><select id="modOrigem" class="form-input"><option value="">Selecionar...</option><option value="Instagram">Instagram / Redes Sociais</option><option value="WhatsApp">WhatsApp (Orgânico)</option><option value="Indicação">Indicação</option><option value="Passou na Loja">Passou na Loja Física</option><option value="Panfleto">Ação Externa</option><option value="Outros">Outros</option></select></div>
                            <div class="form-group"><label for="modInteresse">Interesse</label><select id="modInteresse" class="form-input"><option value="">Selecionar...</option><option value="Alto">Alto</option><option value="Médio">Médio</option><option value="Baixo">Baixo</option></select></div>
                        </div>

                        <div class="form-group" style="margin-bottom: 0; flex: 1;"><label for="modObservacoes">Contexto / Observações</label><textarea id="modObservacoes" class="form-input" placeholder="Necessidades específicas, histórico..."></textarea></div>
                    </section>

                    <!-- COLUNA 2: ITENS -->
                    <section class="novo-orcamento-section">
                        <div class="section-header">
                            <svg class="section-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                            <h2 class="section-title">Itens</h2>
                        </div>
                        
                        <div class="produtos-wrapper" id="produtosContainer"></div>
                        
                        <button type="button" class="btn-add-item-premium" onclick="adicionarProdutoRow()">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Adicionar linha de produto
                        </button>
                        <div class="field-error" id="errItens" style="text-align: center; color:#ef4444; font-size:12px; margin-top:8px;"></div>
                        
                        <div class="total-modal-box">
                            <span>Total</span>
                            <span class="valor-total" id="displayTotalModal">R$ 0,00</span>
                        </div>
                    </section>

                    <!-- COLUNA 3: DATAS E FOLLOW-UP -->
                    <section class="novo-orcamento-section">
                        <div class="section-header">
                            <svg class="section-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            <h2 class="section-title">Agendar Contato</h2>
                        </div>
                        
                        <div class="form-group"><label for="modDataOrcamento">Data do Orçamento</label><input type="date" id="modDataOrcamento" class="form-input font-data" value="${hoje}" onblur="validateField('modDataOrcamento','errDataOrc')"><div class="field-error" id="errDataOrc" style="color:#ef4444; font-size:12px; margin-top:4px;"></div></div>
                        
                        <div class="form-group"><label for="modMotivoContato">Tipo de Contato</label><select id="modMotivoContato" class="form-input"><option value="">Selecionar...</option><optgroup label="Vendas"><option value="Apresentação de Campanha/Promoção">Apresentação de Campanha/Promoção</option><option value="Reativação de Contato Antigo">Reativação de Contato Antigo</option><option value="Acompanhamento de Orçamento">Acompanhamento de Orçamento</option><option value="Virada de Tabela">Virada de Tabela</option><option value="Quebra de Objeção">Quebra de Objeção</option><option value="Cross-sell (Venda Cruzada)">Cross-sell (Venda Cruzada)</option></optgroup><optgroup label="Pós-Venda"><option value="Alinhamento Logístico">Alinhamento Logístico</option><option value="Acompanhamento de Adaptação (Pós-Entrega)">Acompanhamento de Adaptação (Pós-Entrega)</option><option value="Assistência Técnica">Assistência Técnica</option></optgroup></select></div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                            <div class="form-group"><label for="modDataContato">Data</label><input type="date" id="modDataContato" class="form-input font-data" onblur="validateField('modDataContato','errDataContato')"><div class="field-error" id="errDataContato" style="color:#ef4444; font-size:12px; margin-top:4px;"></div></div>
                            <div class="form-group"><label for="modHoraContato">Horário *</label><input type="time" id="modHoraContato" class="form-input font-data" onblur="validateField('modHoraContato','errHoraContato')"><div class="field-error" id="errHoraContato" style="color:#ef4444; font-size:12px; margin-top:4px;"></div></div>
                        </div>

                        <div class="footer-actions">
                            <button id="btnSalvarOrcamento" style="background:var(--brand-blue); color:#fff; border:none; padding:14px; border-radius:8px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; transition:0.2s;" onclick="salvarOrcamento()">
                                <span class="btn-spinner" style="display:none; width:16px; height:16px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:spin 1s linear infinite;"></span>
                                <span class="btn-text" style="display:flex; align-items:center; gap:8px;">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                                    Confirmar e Salvar
                                </span>
                            </button>
                            <button style="background:#fff; color:#475569; border:1px solid #e2e8f0; padding:14px; border-radius:8px; font-weight:600; cursor:pointer; transition:0.2s;" onclick="navigateTo(previousView)">Cancelar Alterações</button>
                            <p class="msg" id="modalMsg" style="text-align: center; font-size: 12px;"></p>
                        </div>
                    </section>
                </div>
            `;
            
            adicionarProdutoRow();
            calcTotalModal();
            setTimeout(() => { const modNome = document.getElementById('modNome'); if(modNome) modNome.focus(); }, 100);

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
                const motivoContato = document.getElementById('modMotivoContato') ? document.getElementById('modMotivoContato').value : '';
                
                let valid = true;
                if (!nome) { document.getElementById('errNome').textContent = 'Obrigatório'; valid = false; }
                
                // Valida apenas se o documento foi preenchido, mas não exige
                if (cpf && cpf.length !== 11 && cpf.length !== 14) { 
                    document.getElementById('errCpf').textContent = 'Documento inválido'; 
                    valid = false; 
                }
                
                if (!whats) { document.getElementById('errWhats').textContent = 'Obrigatório'; valid = false; }
                              
                const produtoRows = document.getElementById('produtosContainer').querySelectorAll('.produto-row');
                if (produtoRows.length === 0) {
                    document.getElementById('errItens').textContent = 'Adicione pelo menos um produto';
                    valid = false;
                } else {
                    let hasEmpty = false;
                    produtoRows.forEach(row => {
                        const nomeProd = row.querySelector('.prod-nome').value.trim();
                        const valorProd = parseCurrency(row.querySelector('.input-por').value);
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
                    .insert([{ nome_cliente: nome, whatsapp: whats, cpf: cpf || null, email: emailOrc || null, id_cliente_codigo: nextCodigo }])                        .select(pkIns)
                        .single();
                    if (errClient) throw new Error('Erro ao criar cliente: ' + errClient.message);
                    idCliente = newCliente[pkIns];
                }
                
                const produtosList = [];
                let valorTotal = 0;
                produtoRows.forEach(row => {
                    const nomeProd = row.querySelector('.prod-nome').value.trim();
                    const valorDe = parseCurrency(row.querySelector('.input-de').value);
                    const valorPor = parseCurrency(row.querySelector('.input-por').value);
                    produtosList.push({ nome: nomeProd, valorDe: valorDe, valorPor: valorPor });
                    valorTotal += valorPor;
                });
                
                const statusInicial = mapStatusUUID.find(s => s.nome === STATUS.CONTATO_INICIAL);
                const idStatus = statusInicial ? statusInicial.id_status : null;
                let idInteresse = null;
                if (interesse) {
                    const nivel = mapInteresseUUID.find(n => n.nome === interesse);
                    idInteresse = nivel ? nivel.id_interesse : null;
                }
                let dataCriacaoFinal = dataOrcamento;
                const hojeData = new Date().toISOString().split('T')[0];
                if (dataOrcamento === hojeData) {
                    dataCriacaoFinal = new Date().toISOString();
                } else {
                    dataCriacaoFinal = `${dataOrcamento}T12:00:00.000Z`;
                }
                // 1. Montamos o payload SEM o protocolo ainda
				const payload = {
				    id_cliente: idCliente, // <--- NÃO ESQUEÇA DESTA LINHA!
				    id_usuario: currentUser.id_usuario,
				    id_status: idStatus,
				    id_nivel_interesse: idInteresse,
				    valor_orcado: valorTotal,
				    modelo_colchao: produtosList.map(p => p.nome).join(', '),
				    data_criacao: dataCriacaoFinal,
				    data_contato: dataContato || null,
				    hora_contato: horaContato || null,
				    observacao_agendamento: motivoContato || null,
				    observacoes: observacoes,
				    origem: origem
				};
                // 2. INSERT simples — o banco gera o protocolo via nextval()
                const { data: newOrc, error: errOrc } = await db.from('orcamentos')
                    .insert(payload)
                    .select('id_orcamento, protocolo')
                    .single();
                if (errOrc) throw errOrc;
                
                await db.from('comentarios').insert([{
                    id_orcamento: newOrc.id_orcamento,
                    texto: `Orçamento criado via sistema. Produtos: ${produtosList.map(p => p.nome).join(', ')}. Valor total: R$ ${valorTotal.toFixed(2)}. Próximo contato agendado para ${dataContato} às ${horaContato}.`,
                    tipo: 'Sistema',
                    autor: currentUser.nome
                }]);
                
                showToast(`Orçamento ${newOrc.protocolo} salvo com sucesso!`, 'success');
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
                console.log("mapStatusUUID ao perder:", JSON.stringify(mapStatusUUID));
                if (!mapStatusUUID.length) {
                    const { data } = await db.from('status_orcamento').select('*');
                    mapStatusUUID = data || [];
                }
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

        let modoFechamentoSelecionado = null; // 'entrega' | 'retirada'

        function selecionarModoFechamento(modo) {
            modoFechamentoSelecionado = modo;
            const btnEntrega = document.getElementById('btnOpcaoEntrega');
            const btnRetirada = document.getElementById('btnOpcaoRetirada');
            const step2 = document.getElementById('fechamentoStep2');
            const errModo = document.getElementById('errModoFechamento');
            if (errModo) errModo.textContent = '';

            // Highlight selecionado
            btnEntrega.style.borderColor = modo === 'entrega' ? 'var(--brand-blue)' : 'var(--border-light)';
            btnEntrega.style.background = modo === 'entrega' ? '#eff6ff' : 'var(--card-bg)';
            btnEntrega.style.color = modo === 'entrega' ? 'var(--brand-blue-dark)' : 'var(--text-primary)';
            btnRetirada.style.borderColor = modo === 'retirada' ? 'var(--accent-green)' : 'var(--border-light)';
            btnRetirada.style.background = modo === 'retirada' ? '#f0fdf4' : 'var(--card-bg)';
            btnRetirada.style.color = modo === 'retirada' ? 'var(--accent-green-dark)' : 'var(--text-primary)';

            if (modo === 'entrega') {
                step2.style.display = 'block';
            } else {
                step2.style.display = 'none';
                const errData = document.getElementById('errDataEntrega');
                if (errData) errData.textContent = '';
            }
        }

        function abrirConfirmaFechamento(id) {
            idOrcamentoParaPerder = id;
            modoFechamentoSelecionado = null;

            // Reset visual
            const btnEntrega = document.getElementById('btnOpcaoEntrega');
            const btnRetirada = document.getElementById('btnOpcaoRetirada');
            if (btnEntrega) { btnEntrega.style.borderColor = 'var(--border-light)'; btnEntrega.style.background = 'var(--card-bg)'; btnEntrega.style.color = 'var(--text-primary)'; }
            if (btnRetirada) { btnRetirada.style.borderColor = 'var(--border-light)'; btnRetirada.style.background = 'var(--card-bg)'; btnRetirada.style.color = 'var(--text-primary)'; }

            const step2 = document.getElementById('fechamentoStep2');
            if (step2) step2.style.display = 'none';
            const dataEntrega = document.getElementById('fechamentoDataEntrega');
            if (dataEntrega) dataEntrega.value = '';
            const errData = document.getElementById('errDataEntrega');
            if (errData) errData.textContent = '';
            const errModo = document.getElementById('errModoFechamento');
            if (errModo) errModo.textContent = '';

            openModal('modalConfirmaFechamento');
            const btn = document.getElementById('btnConfirmaFechar');
            btn.querySelector('.btn-spinner').style.display = 'none';
            btn.querySelector('.btn-text').textContent = 'Confirmar Fechamento';
            btn.disabled = false;
            btn.onclick = async () => { await confirmarFechamento(id); };
        }

       async function confirmarFechamento(id) {
            const errModo = document.getElementById('errModoFechamento');
            errModo.textContent = '';

            if (!modoFechamentoSelecionado) {
                errModo.textContent = 'Selecione se o produto será entregue ou retirado na loja.';
                return;
            }

            let dataEntrega = null;
            if (modoFechamentoSelecionado === 'entrega') {
                dataEntrega = document.getElementById('fechamentoDataEntrega').value;
                const errData = document.getElementById('errDataEntrega');
                errData.textContent = '';
                if (!dataEntrega) { errData.textContent = 'Selecione a data de entrega.'; return; }
            }

            const btn = document.getElementById('btnConfirmaFechar');
            btn.querySelector('.btn-spinner').style.display = 'inline-block';
            btn.querySelector('.btn-text').textContent = 'Salvando...';
            btn.disabled = true;

            try {
                if (!mapStatusUUID.length) {
                    const { data } = await db.from('status_orcamento').select('*');
                    mapStatusUUID = data || [];
                }
                const statusFechado = mapStatusUUID.find(s => s.nome === STATUS.FECHADO);
                if (!statusFechado) throw new Error('Status "Fechado" não encontrado');

                const updatePayload = { id_status: statusFechado.id_status };
                if (dataEntrega) updatePayload.data_entrega = dataEntrega;

                const { error } = await db.from('orcamentos').update(updatePayload).eq('id_orcamento', id);
                if (error) throw error;

                if (modoFechamentoSelecionado === 'entrega') {
                    const dataEntregaObj = new Date(dataEntrega + 'T00:00:00');
                    const dataEntregaFormatada = dataEntregaObj.toLocaleDateString('pt-BR');
                    const valorFechadoFmt = parseFloat(AppState.contextoVenda.clienteAtual?.valor_orcado || 0)
                        .toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                    await db.from('comentarios').insert([{
                        id_orcamento: id,
                        texto: `🏆 Venda Fechada! (R$ ${valorFechadoFmt})\n📦 Modalidade: Entrega\n📅 Previsão de Entrega: ${dataEntregaFormatada}`,
                        tipo: 'Sistema',
                        autor: currentUser.nome
                    }]);

                    // Criar agendamento automático de confirmação de recebimento
                    await db.from('orcamentos').update({
                        data_contato: dataEntrega,
                        hora_contato: '09:00',
                        observacao_agendamento: `Confirmação de recebimento - Entrega prevista para ${dataEntregaFormatada}`
                    }).eq('id_orcamento', id);

                    await db.from('comentarios').insert([{
                        id_orcamento: id,
                        texto: `Agendamento automático criado: Confirmação de recebimento para ${dataEntregaFormatada} às 09:00.`,
                        tipo: 'Sistema',
                        autor: currentUser.nome
                    }]);

                    closeModal('modalConfirmaFechamento');
                    showToast('🎉 Venda fechada! Agendamento de confirmação criado automaticamente.', 'success');
                    navigateTo('inicio'); 

                } else {
                    // Retirada na loja
                    const valorFechadoFmt = parseFloat(AppState.contextoVenda.clienteAtual?.valor_orcado || 0)
                        .toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                    await db.from('comentarios').insert([{
                        id_orcamento: id,
                        texto: `🏆 Venda Fechada! (R$ ${valorFechadoFmt})\n📦 Modalidade: Retirada na Loja`,
                        tipo: 'Sistema',
                        autor: currentUser.nome
                    }]);

                    closeModal('modalConfirmaFechamento');

                    // Exibir parabéns antes de redirecionar
                    setTimeout(() => {
                        showToast('🏆 Parabéns! Venda concluída com sucesso!', 'success');
                    }, 100);
                    navigateTo('inicio'); 
                }
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
                const obsAgendamento = obs ? `${tipo}\n${obs}` : tipo;
                const { error: err1 } = await db.from('orcamentos').update({ data_contato: data, hora_contato: hora, observacao_agendamento: obsAgendamento }).eq('id_orcamento', AppState.contextoVenda.clienteAtual.id_orcamento);
                if (err1) throw new Error(err1.message);
                
                const dataFormatada = new Date(data + 'T00:00:00').toLocaleDateString('pt-BR');
                let texto = `Retorno agendado para ${dataFormatada}${hora ? ' às ' + hora : ''} • ${tipo}`;
                if (obs) texto += `\nLembrete: ${obs}`;
                
                const { error: err2 } = await db.from('comentarios').insert([{ id_orcamento: AppState.contextoVenda.clienteAtual.id_orcamento, texto: texto, tipo: 'Sistema', autor: currentUser.nome }]);
                if (err2) throw new Error(err2.message);
                
                showToast('Agendamento confirmado!', 'success'); await abrirDetalhesCliente(AppState.contextoVenda.clienteAtual.id_orcamento);
            } catch (e) { showToast('Erro ao agendar: ' + e.message, 'error'); } 
            finally { btn.querySelector('.btn-spinner').style.display = 'none'; btn.querySelector('.btn-text').textContent = 'Confirmar Agendamento'; btn.disabled = false; }
        }

        function voltarDetalhes() {
            const fab = document.getElementById('fabButton');
            if (fab && (currentUser?.perfil === 'Vendedor' || (currentUser.perfil || '').toLowerCase() === 'terminal')) fab.style.display = 'flex';
            currentView = previousView;
            navigateTo(currentView);
        }
        function setQuickDate(dias) {
            const d = new Date();
            d.setDate(d.getDate() + dias);
            const iso = d.toISOString().split('T')[0];
            const input = document.getElementById('agendarData');
            if (input) input.value = iso;
        }

        function expandirComentario() {
            const btn = document.getElementById('btnExpandComment');
            const form = document.getElementById('formComentario');
            if (btn) btn.style.display = 'none';
            if (form) { form.classList.add('open'); const ta = document.getElementById('novoComentario'); if (ta) ta.focus(); }
        }


        function changePage(page) { currentPage = page; atualizarTabelaPaginadaServer(); }

        /* ═══════════════════════════════════════════
           TOGGLE TABELA ↔ KANBAN
        ═══════════════════════════════════════════ */
        function switchCarteiraView(view) {
            kanbanAtivo = (view === 'kanban');

            const tabelaWrapper = document.getElementById('tabelaCarteiraWrapper');
            const kanbanBoard   = document.getElementById('kanbanBoard');
            const btnTabela     = document.getElementById('btnViewTabela');
            const btnKanban     = document.getElementById('btnViewKanban');

            if (!tabelaWrapper || !kanbanBoard) return;

            if (kanbanAtivo) {
                tabelaWrapper.classList.add('hidden');
                kanbanBoard.classList.add('active');
                btnTabela?.classList.remove('active');
                btnKanban?.classList.add('active');
                renderKanbanBoard();
            } else {
                kanbanBoard.classList.remove('active');
                tabelaWrapper.classList.remove('hidden');
                btnTabela?.classList.add('active');
                btnKanban?.classList.remove('active');
                atualizarTabelaPaginadaServer();
            }
        }

        // Estado do filtro de vendedor para Terminal
        window._terminalVendedorFiltro = window._terminalVendedorFiltro || 'todos';

        function terminalFiltrarVendedor(idVendedor) {
            window._terminalVendedorFiltro = idVendedor;
            renderKanbanBoard();
        }

        async function renderKanbanBoard() {
            const board = document.getElementById('kanbanBoard');
            if (!board) return;
            board.innerHTML = `<div class="kanban-loading"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" opacity=".3"/><path d="M21 12a9 9 0 01-9 9"/></svg> Carregando pipeline...</div>`;

            try {
                const isGerente = currentUser.perfil === 'Gerente' || currentUser.perfil === 'Administrador' || currentUser.perfil === 'Admin';

                // Busca TODOS os orçamentos em aberto (sem paginação — kanban precisa do total)
                let query = db.from('orcamentos')
                    .select('id_orcamento, protocolo, data_criacao, valor_orcado, modelo_colchao, data_contato, hora_contato, usuarios(nome, id_loja), clientes(nome_cliente), status_orcamento(nome)')
                    .not('id_status', 'is', null);

                if (currentUser.perfil === 'Gerente') {
                    query = query.eq('usuarios.id_loja', currentUser.id_loja);
                } else if (currentUser.perfil === 'Vendedor') {
                    query = query.eq('id_usuario', currentUser.id_usuario);
                } else if ((currentUser.perfil || '').toLowerCase() === 'terminal') {
                    query = query.eq('usuarios.id_loja', currentUser.id_loja);
                } else {
                    if (selectedVendedor !== 'todos') {
                        query = query.eq('id_usuario', selectedVendedor);
                    } else if (selectedLoja !== 'todas') {
                        const ids = todosVendedores.filter(v => v.id_loja === selectedLoja).map(v => v.id_usuario);
                        if (ids.length > 0) query = query.in('id_usuario', ids);
                    }
                }

                if (searchTerm) query = query.ilike('clientes.nome_cliente', `%${searchTerm}%`);

                // 1. APLICA O FILTRO DE STATUS DIRETO NO BANCO
                if (currentFilter !== 'todos') {
                    const uuidsPermitidos = mapStatusUUID
                        .filter(s => s.nome === currentFilter)
                        .map(s => s.id_status);
                    
                    if (uuidsPermitidos.length > 0) {
                        query = query.in('id_status', uuidsPermitidos);
                    }
                }

                query = query.order('data_criacao', { ascending: false }).limit(300);

                const { data, error } = await query;
                if (error) throw error;

                const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

                // Agrupa por coluna (funil completo: ativo + finalizados)
                const colunas = [
                    { key: 'ci',  label: 'Contato Inicial',  cls: 'kcol-ci',  statuses: [STATUS.CONTATO_INICIAL] },
                    { key: 'nv',  label: 'Negociação',       cls: 'kcol-nv',  statuses: [STATUS.NEGOCIACAO] },
                    { key: 'ad',  label: 'Em Fechamento',    cls: 'kcol-ad',  statuses: [STATUS.EM_FECHAMENTO] },
                    { key: 'fec', label: 'Fechado',          cls: 'kcol-fec', statuses: [STATUS.FECHADO, 'Vendido'], finalizado: true },
                    { key: 'per', label: 'Perdido',          cls: 'kcol-per', statuses: [STATUS.PERDIDO, STATUS.DECLINADO], finalizado: true }
                ];

                // Se filtro de status ativo, restringe colunas
                const filtroAtivo = currentFilter !== 'todos';

                const boardDiv = document.createElement('div');
                boardDiv.className = 'kanban-board';

                colunas.forEach(col => {
                    const items = (data || []).filter(o => {
                        const st = o.status_orcamento?.nome || STATUS.CONTATO_INICIAL;
                        return col.statuses.includes(st);
                    });

                    // Pula coluna se filtro ativo e não há itens
                    if (filtroAtivo && items.length === 0) return;

                    const total = items.reduce((s, o) => s + parseFloat(o.valor_orcado || 0), 0);
                    const statusDestino = col.statuses[0];

                    // Coluna
                    const colDiv = document.createElement('div');
                    colDiv.className = 'kanban-col';
                    colDiv.dataset.status = statusDestino;

                    // Header da coluna
                    const header = document.createElement('div');
                    header.className = `kanban-col-header ${col.cls}`;
                    const titleDiv = document.createElement('div');
                    titleDiv.className = 'kcol-title';
                    const dot = document.createElement('span');
                    dot.className = 'kcol-dot';
                    titleDiv.appendChild(dot);
                    titleDiv.appendChild(document.createTextNode(col.label));
                    const countSpan = document.createElement('span');
                    countSpan.className = 'kcol-count';
                    countSpan.id = `count-${statusDestino.replace(/\s+/g, '-')}`;
                    countSpan.textContent = items.length;
                    header.appendChild(titleDiv);
                    header.appendChild(countSpan);
                    colDiv.appendChild(header);

                    // Zona de drop (kanban-cards)
                    const cardsDiv = document.createElement('div');
                    cardsDiv.className = 'kanban-cards';
                    cardsDiv.style.cssText = 'flex:1; display:flex; flex-direction:column; gap:8px; padding-top:8px; min-width:0; overflow:hidden;';

                    if (!col.finalizado) {
                        cardsDiv.addEventListener('dragover', allowDrop);
                        cardsDiv.addEventListener('dragenter', dragEnter);
                        cardsDiv.addEventListener('dragleave', dragLeave);
                        cardsDiv.addEventListener('drop', e => dropCard(e, statusDestino));
                    } else if (col.key === 'per') {
                        cardsDiv.addEventListener('drop', dropCardPerdido);
                    } else {
                        cardsDiv.addEventListener('drop', dropCardFechado);
                    }

                    if (items.length === 0) {
                        const empty = document.createElement('div');
                        empty.className = 'kanban-empty';
                        empty.textContent = 'Nenhum orçamento';
                        cardsDiv.appendChild(empty);
                    } else {
                        items.forEach(o => {
                            const nome = o.clientes?.nome_cliente || 'Cliente';
                            const vendedor = o.usuarios?.nome || '';
                            const inicial = vendedor ? vendedor.charAt(0).toUpperCase() : '?';
                            const idNumerico = o.protocolo && o.protocolo.includes('-') ? o.protocolo.split('-')[1] : (o.protocolo || '—');
                            const produto = o.modelo_colchao ? o.modelo_colchao.split(',')[0].trim() : '—';
                            const valor = parseFloat(o.valor_orcado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

                            const dataCriacao = new Date(o.data_criacao);
                            const diasAtras = Math.floor((hoje - dataCriacao) / 86400000);
                            let borderClass = 'kcard-fresh';
                            let daysClass = 'ok-days';
                            let clockIconHtml = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
                            let alertChipData = null;

                            const isFechado = [STATUS.FECHADO, 'Vendido'].includes(o.status_orcamento?.nome);
                            const isPerdido = [STATUS.PERDIDO, STATUS.DECLINADO].includes(o.status_orcamento?.nome);

                            if (isFechado) {
                                borderClass = 'kcard-won';
                                clockIconHtml = `<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
                            } else if (isPerdido) {
                                borderClass = 'kcard-lost';
                            } else if (o.data_contato) {
                                // FOCO 1 e 2: A agenda do vendedor tem prioridade absoluta
                                const dc = new Date(o.data_contato + 'T00:00:00');
                                if (dc < hoje) {
                                    // Foco 1: Contato vencido — vendedor perdeu o prazo
                                    borderClass = 'kcard-urgent';
                                    daysClass = 'alert-days';
                                } else {
                                    // Foco 2: Contato agendado no futuro — negócio sob controle
                                    borderClass = 'kcard-fresh';
                                }
                            } else if (diasAtras >= 5) {
                                // FOCO 3: Sem nenhuma agenda e já faz muitos dias — abandono real
                                borderClass = 'kcard-urgent';
                                daysClass = 'alert-days';
                                alertChipData = `${diasAtras}d no funil`;
                            }

                            const diasLabel = isFechado ? `há ${diasAtras}d` : diasAtras === 0 ? 'Hoje' : diasAtras === 1 ? 'Ontem' : `há ${diasAtras}d`;

                            // Card
                            const card = document.createElement('div');
                            card.className = `kcard ${borderClass}`;
                            card.id = `card-${o.id_orcamento}`;
                            card.addEventListener('click', () => abrirDetalhesCliente(o.id_orcamento));

                            if (isFechado || isPerdido) {
                                card.draggable = false;
                            } else {
                                card.draggable = true;
                                card.addEventListener('dragstart', e => dragStart(e, o.id_orcamento));
                            }

                            // Alert chip (se houver)
                            if (alertChipData) {
                                const chip = document.createElement('div');
                                chip.className = 'kcard-alert-chip';
                                chip.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
                                chip.appendChild(document.createTextNode(alertChipData));
                                card.appendChild(chip);
                            }

                            // kcard-top
                            const top = document.createElement('div');
                            top.className = 'kcard-top';
                            const nameDiv = document.createElement('div');
                            nameDiv.className = 'kcard-name';
                            nameDiv.textContent = nome;
                            const protoSpan = document.createElement('span');
                            protoSpan.className = 'kcard-proto';
                            protoSpan.textContent = idNumerico;
                            top.appendChild(nameDiv);
                            top.appendChild(protoSpan);

                            // kcard-product
                            const prodDiv = document.createElement('div');
                            prodDiv.className = 'kcard-product';
                            prodDiv.textContent = produto;

                            // kcard-bottom
                            const bottom = document.createElement('div');
                            bottom.className = 'kcard-bottom';
                            const valueSpan = document.createElement('span');
                            valueSpan.className = 'kcard-value';
                            valueSpan.textContent = `R$ ${valor}`;
                            const metaDiv = document.createElement('div');
                            metaDiv.className = 'kcard-meta';
                            const daysDiv = document.createElement('div');
                            daysDiv.className = `kcard-days ${daysClass}`;
                            daysDiv.innerHTML = clockIconHtml;
                            daysDiv.appendChild(document.createTextNode(diasLabel));
                            metaDiv.appendChild(daysDiv);

                            if (isGerente || (currentUser.perfil || '').toLowerCase() === 'terminal') {
                                const avatarDiv = document.createElement('div');
                                avatarDiv.className = 'kcard-avatar';
                                avatarDiv.title = vendedor;
                                avatarDiv.textContent = inicial;
                                metaDiv.appendChild(avatarDiv);
                            }

                            bottom.appendChild(valueSpan);
                            bottom.appendChild(metaDiv);

                            card.appendChild(top);
                            card.appendChild(prodDiv);
                            card.appendChild(bottom);
                            cardsDiv.appendChild(card);
                        });
                    }

                    const totalFmt = total.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

                    // Rodapé da coluna
                    const footerDiv = document.createElement('div');
                    footerDiv.className = 'kcol-total';
                    const strong = document.createElement('strong');
                    strong.textContent = `R$ ${totalFmt}`;
                    footerDiv.appendChild(strong);
                    footerDiv.appendChild(document.createTextNode(` em ${items.length} orçamento${items.length !== 1 ? 's' : ''}`));

                    colDiv.appendChild(cardsDiv);
                    colDiv.appendChild(footerDiv);
                    boardDiv.appendChild(colDiv);
                });

                board.innerHTML = '';
                board.appendChild(boardDiv);

            } catch (e) {
                board.innerHTML = `<div style="padding:24px; text-align:center; color:#ef4444;">Erro ao carregar pipeline: ${e.message}</div>`;
            }
        }

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
                renderNotificationBadge(buildNotifications().length);
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
                const modais = ['modalMotivoPerda', 'modalConfirmaFechamento', 'modalEditarMeta', 'modalExcluirComentario', 'modalUsuarioAdmin', 'modalExcluirUsuarioAdmin', 'modalEditarCliente', 'modalExcluirCliente', 'modalCriarNegocio', 'modalAjusteProposta'];
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

	// ═══════════════════════════════════════════
// FUNÇÕES DE ARRASTAR E SOLTAR (DRAG & DROP)
// ═══════════════════════════════════════════

function dragStart(event, idOrcamento) {
    // Guarda o ID do card que está sendo arrastado
    event.dataTransfer.setData('text/plain', idOrcamento);
    event.dataTransfer.effectAllowed = 'move';
    
    // Deixa o card original levemente transparente enquanto você arrasta
    setTimeout(() => {
        event.target.style.opacity = '0.4';
    }, 0);
}

function allowDrop(event) {
    // Esse comando é OBRIGATÓRIO. Ele avisa o navegador que essa área aceita receber itens.
    event.preventDefault();
}

function dragEnter(event) {
    event.preventDefault();
    // Feedback visual: acende levemente o fundo da coluna quando o card passa por cima
    event.currentTarget.style.background = 'rgba(99,102,241,0.05)';
    event.currentTarget.style.borderRadius = '8px';
}

function dragLeave(event) {
    // Apaga o fundo da coluna se o card sair dela sem ser solto
    event.currentTarget.style.background = '';
}

async function dropCard(event, statusNomeDestino) {
    event.preventDefault();
    event.currentTarget.style.background = ''; // Limpa o fundo aceso
    
    // 1. Pega o ID do orçamento que guardamos no início do arraste
    const idOrcamento = event.dataTransfer.getData('text/plain');
    if (!idOrcamento) return;

    // 2. Acha a "Chave" (UUID) verdadeira desse status no Supabase
    const statusObj = mapStatusUUID.find(s => s.nome === statusNomeDestino);
    if (!statusObj) {
        showToast('Erro: Status destino não encontrado no banco de dados.', 'error');
        renderKanbanBoard(); 
        return;
    }

    showToast('Atualizando pipeline...', 'info');

    try {
        // 3. Salva a nova etapa direto no Supabase
        const { error } = await db.from('orcamentos')
            .update({ id_status: statusObj.id_status })
            .eq('id_orcamento', idOrcamento);

        if (error) throw error;

        // 4. Atualiza a memória local para não precisar baixar tudo do banco de novo
        const index = kpisMensais.findIndex(o => String(o.id_orcamento) === String(idOrcamento));
        if (index !== -1) {
            kpisMensais[index].status = statusObj.nome;
            if(kpisMensais[index].status_orcamento) {
                 kpisMensais[index].status_orcamento.nome = statusObj.nome;
            }
        }

        showToast('Orçamento movido com sucesso!', 'success');
        
        // 5. Recarrega o Kanban para os cards se organizarem nas colunas certas
        renderKanbanBoard();

    } catch (error) {
        showToast('Erro ao mover card: ' + error.message, 'error');
        renderKanbanBoard(); // Se der erro, redesenha a tela para o card voltar pro lugar original
    }
}

// Drop em coluna "Perdido" → abre modal de motivo de perda
function dropCardPerdido(event) {
    event.preventDefault();
    event.currentTarget.style.background = '';
    const idOrcamento = event.dataTransfer.getData('text/plain');
    if (!idOrcamento) return;
    // Reutiliza o fluxo existente de motivo de perda
    abrirMotivoPerda(idOrcamento);
}

// Drop em coluna "Fechado" → atualiza status direto (sem modal adicional)
async function dropCardFechado(event) {
    event.preventDefault();
    event.currentTarget.style.background = '';
    const idOrcamento = event.dataTransfer.getData('text/plain');
    if (!idOrcamento) return;

    const statusObj = mapStatusUUID.find(s => s.nome === STATUS.FECHADO);
    if (!statusObj) {
        showToast('Erro: status Fechado não encontrado.', 'error');
        return;
    }

    showToast('Fechando negócio...', 'info');
    try {
        const { error } = await db.from('orcamentos')
            .update({ id_status: statusObj.id_status })
            .eq('id_orcamento', idOrcamento);
        if (error) throw error;

        const index = kpisMensais.findIndex(o => String(o.id_orcamento) === String(idOrcamento));
        if (index !== -1) {
            kpisMensais[index].status = STATUS.FECHADO;
            if (kpisMensais[index].status_orcamento) kpisMensais[index].status_orcamento.nome = STATUS.FECHADO;
        }

        showToast('Negócio fechado com sucesso! 🎉', 'success');
        renderKanbanBoard();
    } catch (err) {
        showToast('Erro ao fechar negócio: ' + err.message, 'error');
        renderKanbanBoard();
    }
}


// =============================================================================
// MÓDULO DE CONTROLE DE ESTOQUE
// =============================================================================

let estoqueData = [];
let filtroEstoqueCategoria = 'todas';
let filtroEstoqueQualidade = 'todas';
let filtroEstoqueBusca = '';

async function renderEstoque() {
    const main = document.getElementById('mainContent');
    main.innerHTML = `
        <div class="page-header">
            <h1><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> Controle de Estoque</h1>
            <p class="page-subtitle">Consulte disponibilidade, reservas e estado dos produtos</p>
        </div>
        
        <div class="kpi-grid" style="margin-bottom: 24px;">
            <div class="kpi-card">
                <div class="kpi-label">Total de Produtos</div>
                <div class="kpi-value" id="estoqueKpiTotal">-</div>
                <div class="kpi-trend">produtos cadastrados</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Disponível</div>
                <div class="kpi-value" id="estoqueKpiDisponivel">-</div>
                <div class="kpi-trend" style="color: var(--accent-green);">prontos para venda</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Reservado</div>
                <div class="kpi-value" id="estoqueKpiReservado">-</div>
                <div class="kpi-trend" style="color: var(--warning-orange);">aguardando retirada</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Baixo Estoque</div>
                <div class="kpi-value" id="estoqueKpiBaixo">-</div>
                <div class="kpi-trend" style="color: var(--danger-text);">atenção necessária</div>
            </div>
        </div>
        
        <div class="table-controls">
            <div class="search-box">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="estoqueBuscaInput" placeholder="Buscar por nome ou código..." value="${filtroEstoqueBusca}" oninput="filtrarEstoque()">
            </div>
            <div class="filter-group">
                <select id="estoqueFiltroCategoria" class="form-input" onchange="filtrarEstoque()" style="min-width: 150px;">
                    <option value="todas">Todas Categorias</option>
                </select>
                <select id="estoqueFiltroQualidade" class="form-input" onchange="filtrarEstoque()" style="min-width: 140px;">
                    <option value="todas">Todas Qualidades</option>
                    <option value="novo">Novo</option>
                    <option value="mostruario">Mostruário</option>
                    <option value="avaria">Avaria</option>
                </select>
            </div>
        </div>
        
        <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Código</th>
                        <th>Produto</th>
                        <th>Categoria</th>
                        <th>Qualidade</th>
                        <th style="text-align: center;">Disponível</th>
                        <th style="text-align: center;">Reservado</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody id="estoqueTableBody">
                    <tr><td colspan="7" style="text-align: center; padding: 40px;">Carregando estoque...</td></tr>
                </tbody>
            </table>
        </div>
    `;
    
    await carregarEstoqueComProdutos();
}

async function carregarEstoqueComProdutos() {
    try {
        const { data, error } = await db
            .from('estoque')
            .select(`
                *,
                produtos (
                    nome_produto,
                    categoria
                )
            `);

        if (error) throw error;

        estoqueData = data || [];
        
        // Preencher dropdown de categorias
        const categorias = [...new Set(estoqueData.map(item => item.produtos?.categoria).filter(Boolean))];
        const selectCategoria = document.getElementById('estoqueFiltroCategoria');
        if (selectCategoria) {
            categorias.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat;
                option.textContent = cat;
                selectCategoria.appendChild(option);
            });
        }
        
        atualizarKpisEstoque();
        filtrarEstoque();
    } catch (e) {
        showToast('Erro ao carregar estoque: ' + e.message, 'error');
        document.getElementById('estoqueTableBody').innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--danger-text);">Erro ao carregar dados</td></tr>';
    }
}

function atualizarKpisEstoque() {
    const total = estoqueData.length;
    const disponivel = estoqueData.reduce((sum, item) => sum + (item.qtd_disponivel || 0), 0);
    const reservado = estoqueData.reduce((sum, item) => sum + (item.qtd_reservada || 0), 0);
    const baixo = estoqueData.filter(item => (item.qtd_disponivel || 0) > 0 && (item.qtd_disponivel || 0) <= 5).length;
    
    document.getElementById('estoqueKpiTotal').textContent = total;
    document.getElementById('estoqueKpiDisponivel').textContent = disponivel;
    document.getElementById('estoqueKpiReservado').textContent = reservado;
    document.getElementById('estoqueKpiBaixo').textContent = baixo;
}

function filtrarEstoque() {
    filtroEstoqueBusca = document.getElementById('estoqueBuscaInput')?.value.toLowerCase() || '';
    filtroEstoqueCategoria = document.getElementById('estoqueFiltroCategoria')?.value || 'todas';
    filtroEstoqueQualidade = document.getElementById('estoqueFiltroQualidade')?.value || 'todas';
    
    const filtrados = estoqueData.filter(item => {
        const nomeProduto = item.produtos?.nome_produto?.toLowerCase() || '';
        const codigo = item.codigo_produto?.toLowerCase() || '';
        const categoria = item.produtos?.categoria || '';
        const qualidade = item.qualidade?.toLowerCase() || '';
        
        const matchBusca = nomeProduto.includes(filtroEstoqueBusca) || codigo.includes(filtroEstoqueBusca);
        const matchCategoria = filtroEstoqueCategoria === 'todas' || categoria === filtroEstoqueCategoria;
        const matchQualidade = filtroEstoqueQualidade === 'todas' || qualidade === filtroEstoqueQualidade;
        
        return matchBusca && matchCategoria && matchQualidade;
    });
    
    renderizarTabelaEstoque(filtrados);
}

function renderizarTabelaEstoque(data) {
    const tbody = document.getElementById('estoqueTableBody');
    if (!tbody) return;
    
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">Nenhum produto encontrado</td></tr>';
        return;
    }
    
    tbody.innerHTML = data.map(item => {
        const disponivel = item.qtd_disponivel || 0;
        const reservado = item.qtd_reservada || 0;
        const qualidade = item.qualidade?.toLowerCase() || 'novo';
        
        // Pill de quantidade disponível
        let pillClass = 'pill-success';
        let pillText = 'OK';
        if (disponivel === 0) {
            pillClass = 'pill-danger';
            pillText = 'Zero';
        } else if (disponivel <= 5) {
            pillClass = 'pill-warning';
            pillText = 'Baixo';
        }
        
        // Tag de qualidade
        let qualidadeClass = 'tag-novo';
        let qualidadeLabel = 'Novo';
        if (qualidade === 'mostruario') {
            qualidadeClass = 'tag-mostruario';
            qualidadeLabel = 'Mostruário';
        } else if (qualidade === 'avaria') {
            qualidadeClass = 'tag-avaria';
            qualidadeLabel = 'Avaria';
        }
        
        return `
            <tr>
                <td style="font-family: 'JetBrains Mono', monospace; font-size: var(--font-xs);">${escapeHtml(item.codigo_produto || '-')}</td>
                <td><strong>${escapeHtml(item.produtos?.nome_produto || 'Produto não vinculado')}</strong></td>
                <td>${escapeHtml(item.produtos?.categoria || '-')}</td>
                <td><span class="quality-tag ${qualidadeClass}">${qualidadeLabel}</span></td>
                <td style="text-align: center;"><span class="pill ${pillClass}">${disponivel}</span></td>
                <td style="text-align: center; color: var(--text-muted);">${reservado}</td>
                <td><span class="status-pill ${pillClass}">${pillText}</span></td>
            </tr>
        `;
    }).join('');
}
