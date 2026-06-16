let socket;
let codigoSalaAtual = '';
let quizAtual = null;
let perguntasAtuais = [];
let quizIdAtual = null;

// ============ LOGIN ============
function verificarSenha() {
    const senha = document.getElementById('senha').value;
    
    fetch('/api/verificar-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha: senha })
    })
    .then(res => res.json())
    .then(data => {
        if (data.sucesso) {
            document.getElementById('telaLogin').style.display = 'none';
            document.getElementById('telaDashboard').style.display = 'block';
            carregarQuizzes();
            carregarSelectQuizzes();
            carregarHistorico();
        } else {
            alert('Senha incorreta!');
        }
    });
}

function logout() {
    location.reload();
}

// ============ QUIZZES ============
function carregarQuizzes() {
    fetch('/api/quiz/listar')
        .then(res => res.json())
        .then(data => {
            if (data.sucesso) {
                const grid = document.getElementById('quizzesGrid');
                if (data.quizzes.length === 0) {
                    grid.innerHTML = '<div class="empty-state">Nenhum quiz criado ainda. Clique em "Criar Novo Quiz"</div>';
                } else {
                    grid.innerHTML = data.quizzes.map(q => `
                        <div class="quiz-card">
                            <h3>${escapeHtml(q.nome)}</h3>
                            <p>Criado em: ${new Date(q.data_criacao).toLocaleDateString()}</p>
                            <div class="quiz-card-buttons">
                                <button onclick="editarQuiz(${q.id})" class="btn-pequeno">✏️ Editar</button>
                                <button onclick="deletarQuiz(${q.id})" class="btn-pequeno-danger">🗑️ Deletar</button>
                            </div>
                        </div>
                    `).join('');
                }
            }
        });
}

function carregarSelectQuizzes() {
    fetch('/api/quiz/listar')
        .then(res => res.json())
        .then(data => {
            if (data.sucesso) {
                const select = document.getElementById('quizSelecionado');
                const selectJogar = document.getElementById('quizJogar');
                const options = '<option value="">-- Selecione um quiz --</option>' + 
                    data.quizzes.map(q => `<option value="${q.id}">${escapeHtml(q.nome)}</option>`).join('');
                select.innerHTML = options;
                selectJogar.innerHTML = options;
            }
        });
}

function criarNovoQuiz() {
    const nome = prompt('Digite o nome do novo quiz:');
    if (!nome) return;
    
    fetch('/api/quiz/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nome })
    })
    .then(res => res.json())
    .then(data => {
        if (data.sucesso) {
            alert('Quiz criado com sucesso!');
            carregarQuizzes();
            carregarSelectQuizzes();
            document.getElementById('quizSelecionado').value = data.id;
            carregarQuiz(data.id);
            mostrarTab('editar');
        } else {
            alert('Erro: ' + data.erro);
        }
    });
}

function editarQuiz(id) {
    document.getElementById('quizSelecionado').value = id;
    carregarQuiz(id);
    mostrarTab('editar');
}

function deletarQuiz(id) {
    if (confirm('Tem certeza que deseja deletar este quiz? Todas as perguntas serão perdidas!')) {
        fetch(`/api/quiz/deletar/${id}`, { method: 'DELETE' })
            .then(res => res.json())
            .then(data => {
                if (data.sucesso) {
                    alert('Quiz deletado!');
                    carregarQuizzes();
                    carregarSelectQuizzes();
                } else {
                    alert('Erro ao deletar');
                }
            });
    }
}

// ============ EDITOR DE PERGUNTAS ============
function carregarQuiz(id) {
    if (!id) return;
    quizIdAtual = id;
    
    fetch(`/api/quiz/carregar/${id}`)
        .then(res => res.json())
        .then(data => {
            if (data.sucesso) {
                document.getElementById('quizNome').value = data.quiz.nome;
                document.getElementById('corFundo').value = data.quiz.cor_fundo || '#667eea';
                if (data.quiz.musica_url) {
                    document.getElementById('musicaUrl').value = data.quiz.musica_url;
                }
                perguntasAtuais = data.perguntas || [];
                renderizarPerguntas();
            }
        });
}

function renderizarPerguntas() {
    const container = document.getElementById('editorPerguntas');
    if (perguntasAtuais.length === 0) {
        container.innerHTML = '<div class="empty-state">Nenhuma pergunta. Clique em "Adicionar Pergunta"</div>';
        return;
    }
    
    container.innerHTML = perguntasAtuais.map((p, idx) => `
        <div class="pergunta-card" data-idx="${idx}">
            <div class="pergunta-header">
                <h4>Pergunta ${idx + 1}</h4>
                <button onclick="removerPergunta(${idx})" class="btn-remover">🗑️</button>
            </div>
            
            <div class="campo-imagem">
                <label>📸 Imagem da pergunta:</label>
                <input type="file" class="upload-imagem-edit" data-idx="${idx}" accept="image/*">
                <div class="preview-imagem" id="preview-${idx}">
                    ${p.imagem_url ? `<img src="${p.imagem_url}" style="max-width: 100px;">` : ''}
                </div>
                <input type="hidden" class="imagem-url" data-idx="${idx}" value="${p.imagem_url || ''}">
            </div>
            
            <input type="text" placeholder="Texto da pergunta" value="${escapeHtml(p.texto || '')}" class="pergunta-texto" data-idx="${idx}">
            
            <div class="opcao-item">
                <span class="opcao-simbolo" style="color: #e74c3c;">★</span>
                <input type="text" placeholder="Opção A (ex: Brasília)" value="${escapeHtml(p.opcao_a || '')}" class="resposta-texto" data-opcao="A" data-idx="${idx}">
            </div>
            
            <div class="opcao-item">
                <span class="opcao-simbolo" style="color: #2ecc71;">▲</span>
                <input type="text" placeholder="Opção B (ex: São Paulo)" value="${escapeHtml(p.opcao_b || '')}" class="resposta-texto" data-opcao="B" data-idx="${idx}">
            </div>
            
            <div class="opcao-item">
                <span class="opcao-simbolo" style="color: #3498db;">●</span>
                <input type="text" placeholder="Opção C (ex: Rio de Janeiro)" value="${escapeHtml(p.opcao_c || '')}" class="resposta-texto" data-opcao="C" data-idx="${idx}">
            </div>
            
            <div class="opcao-item">
                <span class="opcao-simbolo" style="color: #f1c40f;">■</span>
                <input type="text" placeholder="Opção D (ex: Salvador)" value="${escapeHtml(p.opcao_d || '')}" class="resposta-texto" data-opcao="D" data-idx="${idx}">
            </div>
            
            <div class="pergunta-footer">
                <label>✅ Correta: 
                    <select class="correta-select" data-idx="${idx}">
                        <option value="A" ${p.correta === 'A' ? 'selected' : ''}>★ A</option>
                        <option value="B" ${p.correta === 'B' ? 'selected' : ''}>▲ B</option>
                        <option value="C" ${p.correta === 'C' ? 'selected' : ''}>● C</option>
                        <option value="D" ${p.correta === 'D' ? 'selected' : ''}>■ D</option>
                    </select>
                </label>
                <label>⏱ Tempo: 
                    <input type="number" class="tempo-input" data-idx="${idx}" value="${p.tempo || 15}" min="5" max="60" style="width: 60px;">
                </label>
            </div>
        </div>
    `).join('');
    
    // Upload de imagens no editor
    document.querySelectorAll('.upload-imagem-edit').forEach(input => {
        input.addEventListener('change', async (e) => {
            const idx = parseInt(e.target.dataset.idx);
            const file = e.target.files[0];
            if (file) {
                const formData = new FormData();
                formData.append('imagem', file);
                
                const response = await fetch('/api/upload/imagem', {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();
                if (data.sucesso) {
                    perguntasAtuais[idx].imagem_url = data.url;
                    document.getElementById(`preview-${idx}`).innerHTML = 
                        `<img src="${data.url}" style="max-width: 100px;">`;
                    document.querySelector(`.imagem-url[data-idx="${idx}"]`).value = data.url;
                }
            }
        });
    });
    
    // Event listeners para campos de texto
    document.querySelectorAll('.pergunta-texto').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.idx);
            perguntasAtuais[idx].texto = e.target.value;
        });
    });
    
    document.querySelectorAll('.resposta-texto').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.idx);
            const opcao = e.target.dataset.opcao.toLowerCase();
            perguntasAtuais[idx][`opcao_${opcao}`] = e.target.value;
        });
    });
    
    document.querySelectorAll('.correta-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.idx);
            perguntasAtuais[idx].correta = e.target.value;
        });
    });
    
    document.querySelectorAll('.tempo-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.idx);
            perguntasAtuais[idx].tempo = parseInt(e.target.value);
        });
    });
}

function adicionarPergunta() {
    perguntasAtuais.push({
        texto: '',
        imagem_url: null,
        opcao_a: '',
        opcao_b: '',
        opcao_c: '',
        opcao_d: '',
        correta: 'A',
        tempo: 15
    });
    renderizarPerguntas();
}

function removerPergunta(idx) {
    perguntasAtuais.splice(idx, 1);
    renderizarPerguntas();
}

function salvarQuiz() {
    const nome = document.getElementById('quizNome').value;
    if (!nome) {
        alert('Digite um nome para o quiz');
        return;
    }
    
    const data = {
        quiz_id: quizIdAtual,
        nome: nome,
        cor_fundo: document.getElementById('corFundo').value,
        musica_url: document.getElementById('musicaUrl').value,
        perguntas: JSON.stringify(perguntasAtuais)
    };
    
    fetch('/api/quiz/salvar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(data => {
        if (data.sucesso) {
            alert('Quiz salvo com sucesso!');
            carregarQuizzes();
        } else {
            alert('Erro: ' + data.erro);
        }
    });
}

function salvarConfigQuiz() {
    salvarQuiz();
}

// ============ JOGO ============
function selecionarQuizJogar(id) {
    if (id) {
        fetch(`/api/quiz/carregar/${id}`)
            .then(res => res.json())
            .then(data => {
                if (data.sucesso && data.perguntas.length > 0) {
                    quizAtual = data;
                } else {
                    alert('Este quiz não tem perguntas!');
                    document.getElementById('quizJogar').value = '';
                }
            });
    }
}

function criarSala() {
    const quizId = document.getElementById('quizJogar').value;
    if (!quizId) {
        alert('Selecione um quiz');
        return;
    }
    
    const quizNome = document.getElementById('quizJogar').options[document.getElementById('quizJogar').selectedIndex]?.text;
    
    fetch('/api/sala/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            quiz_id: quizId, 
            quizNome: quizNome
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.sucesso) {
            codigoSalaAtual = data.codigo;
            
            document.getElementById('salaInfo').style.display = 'block';
            document.getElementById('codigoSalaDisplay').innerHTML = `📱 CÓDIGO: ${codigoSalaAtual}`;
            
            // Conectar socket para receber atualizações
            conectarHost();
        } else {
            alert('Erro: ' + data.erro);
        }
    });
}

function abrirApresentador() {
    if (!codigoSalaAtual) {
        alert('Crie uma sala primeiro!');
        return;
    }
    
    window.open(`/apresentador?codigo=${codigoSalaAtual}`, '_blank');
}

function conectarHost() {
    if (socket) socket.disconnect();
    
    socket = io();
    
    socket.on('host-entrada-aceita', () => {
        console.log('✅ Conectado como host');
    });
    
    socket.on('atualizar-jogadores', (jogadores) => {
        const lista = document.getElementById('listaJogadoresHost');
        if (lista) {
            lista.innerHTML = jogadores.map(j => `
                <div class="jogador-item-host">${j.emoji} ${j.nome} - ${j.pontuacao} pts</div>
            `).join('');
        }
    });
    
    socket.on('atualizar-ranking', (ranking) => {
        const rankingDiv = document.getElementById('rankingHost');
        if (rankingDiv) {
            rankingDiv.innerHTML = ranking.slice(0, 10).map(r => `
                <div class="ranking-item">${r.posicao}º ${r.emoji} ${r.nome} - ${r.pontuacao} pts</div>
            `).join('');
        }
    });
    
    socket.on('fim-jogo', (data) => {
        alert(`🏆 Jogo finalizado! Vencedor: ${data.ranking[0]?.nome}`);
    });
}

// ============ HISTÓRICO ============
function carregarHistorico() {
    fetch('/api/historico')
        .then(res => res.json())
        .then(data => {
            if (data.sucesso) {
                const lista = document.getElementById('listaHistorico');
                if (data.historico.length === 0) {
                    lista.innerHTML = '<div class="empty-state">Nenhum histórico encontrado</div>';
                } else {
                    lista.innerHTML = data.historico.map(h => `
                        <div class="historico-card">
                            <strong>📅 ${new Date(h.data_hora).toLocaleString()}</strong><br>
                            🎯 Quiz ID: ${h.quiz_id}<br>
                            🔢 Código da sala: ${h.codigo}
                        </div>
                    `).join('');
                }
            }
        });
}

function deletarHistorico() {
    if (confirm('⚠️ Deletar todo o histórico? Essa ação não pode ser desfeita!')) {
        fetch('/api/historico/deletar', { method: 'DELETE' })
            .then(() => {
                alert('Histórico deletado!');
                carregarHistorico();
            });
    }
}

// ============ MÚSICA ============
function testarMusica() {
    const url = document.getElementById('musicaUrl').value;
    if (url) {
        const audio = new Audio(url);
        audio.play().catch(e => alert('Não foi possível tocar. Verifique a URL.'));
    } else {
        alert('Digite uma URL de música MP3');
    }
}

// ============ UTILITÁRIOS ============
function mostrarTab(tab) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    const tabs = { quizzes: 0, editar: 1, jogar: 2, config: 3, historico: 4 };
    const tabName = tab.charAt(0).toUpperCase() + tab.slice(1);
    document.getElementById(`tab${tabName}`).style.display = 'block';
    document.querySelectorAll('.tab-btn')[tabs[tab]].classList.add('active');
    
    if (tab === 'historico') {
        carregarHistorico();
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}
