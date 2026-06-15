let socket;
let codigoSalaAtual = '';
let quizAtual = null;
let perguntasAtuais = [];
let quizIdAtual = null;
let musicaAtiva = false;

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
                perguntasAtuais = data.perguntas || [];
                renderizarPerguntas();
                
                if (data.quiz.musica) {
                    document.getElementById('musicaUrl').value = data.quiz.musica;
                }
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
                <input type="file" class="upload-imagem" data-idx="${idx}" accept="image/*">
                <div class="preview-imagem" id="preview-${idx}">
                    ${p.imagem_base64 ? `<img src="${p.imagem_base64}" style="max-width: 100px;">` : ''}
                </div>
            </div>
            
            <input type="text" placeholder="Texto da pergunta" value="${escapeHtml(p.texto || '')}" class="pergunta-texto" data-idx="${idx}">
            
            <div class="opcao-item">
                <span class="opcao-simbolo resposta-a">★</span>
                <input type="text" placeholder="Resposta completa (ex: Brasília)" value="${escapeHtml(p.opcao_a_texto || '')}" class="resposta-texto" data-opcao="A" data-idx="${idx}">
                <input type="text" placeholder="Texto do botão (ex: BRA)" value="${escapeHtml(p.opcao_a_botao || '')}" class="botao-texto" data-opcao="A" data-idx="${idx}">
            </div>
            
            <div class="opcao-item">
                <span class="opcao-simbolo resposta-b">▲</span>
                <input type="text" placeholder="Resposta completa (ex: São Paulo)" value="${escapeHtml(p.opcao_b_texto || '')}" class="resposta-texto" data-opcao="B" data-idx="${idx}">
                <input type="text" placeholder="Texto do botão (ex: SP)" value="${escapeHtml(p.opcao_b_botao || '')}" class="botao-texto" data-opcao="B" data-idx="${idx}">
            </div>
            
            <div class="opcao-item">
                <span class="opcao-simbolo resposta-c">●</span>
                <input type="text" placeholder="Resposta completa (ex: Salvador)" value="${escapeHtml(p.opcao_c_texto || '')}" class="resposta-texto" data-opcao="C" data-idx="${idx}">
                <input type="text" placeholder="Texto do botão (ex: SA)" value="${escapeHtml(p.opcao_c_botao || '')}" class="botao-texto" data-opcao="C" data-idx="${idx}">
            </div>
            
            <div class="opcao-item">
                <span class="opcao-simbolo resposta-d">■</span>
                <input type="text" placeholder="Resposta completa (ex: Rio de Janeiro)" value="${escapeHtml(p.opcao_d_texto || '')}" class="resposta-texto" data-opcao="D" data-idx="${idx}">
                <input type="text" placeholder="Texto do botão (ex: RIO)" value="${escapeHtml(p.opcao_d_botao || '')}" class="botao-texto" data-opcao="D" data-idx="${idx}">
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
    
    // Adicionar event listeners para upload de imagens
    document.querySelectorAll('.upload-imagem').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.idx);
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(ev) {
                    perguntasAtuais[idx].imagem_base64 = ev.target.result;
                    perguntasAtuais[idx].imagem_tipo = file.type;
                    document.getElementById(`preview-${idx}`).innerHTML = 
                        `<img src="${ev.target.result}" style="max-width: 100px;">`;
                };
                reader.readAsDataURL(file);
            }
        });
    });
    
    // Adicionar event listeners para campos de texto
    document.querySelectorAll('.pergunta-texto').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.idx);
            perguntasAtuais[idx].texto = e.target.value;
        });
    });
    
    document.querySelectorAll('.resposta-texto').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.idx);
            const opcao = e.target.dataset.opcao;
            const campo = `opcao_${opcao.toLowerCase()}_texto`;
            perguntasAtuais[idx][campo] = e.target.value;
        });
    });
    
    document.querySelectorAll('.botao-texto').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.idx);
            const opcao = e.target.dataset.opcao;
            const campo = `opcao_${opcao.toLowerCase()}_botao`;
            perguntasAtuais[idx][campo] = e.target.value;
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
        imagem_base64: null,
        imagem_tipo: null,
        opcao_a_texto: '',
        opcao_a_botao: '',
        opcao_b_texto: '',
        opcao_b_botao: '',
        opcao_c_texto: '',
        opcao_c_botao: '',
        opcao_d_texto: '',
        opcao_d_botao: '',
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
    
    const formData = new FormData();
    formData.append('quiz_id', quizIdAtual);
    formData.append('nome', nome);
    formData.append('cor_fundo', document.getElementById('corFundo').value);
    formData.append('perguntas', JSON.stringify(perguntasAtuais));
    
    const logoFile = document.getElementById('uploadLogo').files[0];
    if (logoFile) {
        formData.append('logo', logoFile);
    }
    
    fetch('/api/quiz/salvar', {
        method: 'POST',
        body: formData
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
            document.getElementById('salaAtiva').style.display = 'block';
            document.getElementById('codigoSalaDisplay').innerHTML = `📱 CÓDIGO: ${codigoSalaAtual}`;
            conectarHost();
        } else {
            alert('Erro: ' + data.erro);
        }
    });
}

function conectarHost() {
    if (socket) socket.disconnect();
    
    socket = io();
    
    socket.on('atualizar-jogadores', (jogadores) => {
        const lista = document.getElementById('listaJogadoresHost');
        document.getElementById('totalJogadores').innerText = jogadores.length;
        lista.innerHTML = jogadores.map(j => `
            <div class="jogador-item-host">
                <span>${j.emoji} ${j.nome}</span>
                <span>${j.pontuacao} pts</span>
            </div>
        `).join('');
    });
    
    socket.on('nova-pergunta-host', (data) => {
        const espelho = document.getElementById('espelhoConteudo');
        espelho.innerHTML = `
            <div class="espelho-imagem">${data.pergunta.imagem_base64 ? `<img src="${data.pergunta.imagem_base64}">` : ''}</div>
            <div class="espelho-texto">${escapeHtml(data.pergunta.texto)}</div>
            <div class="espelho-opcoes">
                <div class="opcao completa-a">🔴 ★ ${escapeHtml(data.pergunta.opcoes.A)}</div>
                <div class="opcao completa-b">🟢 ▲ ${escapeHtml(data.pergunta.opcoes.B)}</div>
                <div class="opcao completa-c">🔵 ● ${escapeHtml(data.pergunta.opcoes.C)}</div>
                <div class="opcao completa-d">🟡 ■ ${escapeHtml(data.pergunta.opcoes.D)}</div>
            </div>
            <div class="espelho-tempo">⏱ Tempo: ${data.pergunta.tempo} segundos</div>
        `;
    });
    
    socket.on('atualizar-ranking', (ranking) => {
        const rankingDiv = document.getElementById('rankingHost');
        rankingDiv.innerHTML = ranking.slice(0, 10).map(r => `
            <div class="ranking-item">
                <span>${r.posicao}º ${r.emoji} ${escapeHtml(r.nome)}</span>
                <strong>${r.pontuacao} pts</strong>
            </div>
        `).join('');
    });
    
    socket.on('fim-jogo', (data) => {
        alert(`Jogo finalizado! Vencedor: ${data.ranking[0]?.nome}`);
    });
}

function iniciarJogo() {
    if (confirm('Iniciar o jogo agora?')) {
        socket.emit('iniciar-jogo', codigoSalaAtual);
    }
}

function proximaPergunta() {
    socket.emit('proxima-pergunta', codigoSalaAtual);
}

function encerrarJogo() {
    if (confirm('Encerrar o jogo?')) {
        location.reload();
    }
}

// ============ MÚSICA ============
function toggleMusica() {
    const audio = document.getElementById('musicaFundo');
    const btn = document.getElementById('btnMusica');
    
    if (musicaAtiva) {
        audio.pause();
        musicaAtiva = false;
        btn.innerHTML = '🎵 Tocar';
    } else {
        const url = document.getElementById('musicaUrl').value;
        if (url) {
            audio.src = url;
            audio.play().catch(e => console.log('Não foi possível tocar:', e));
            musicaAtiva = true;
            btn.innerHTML = '⏸️ Pausar';
        } else {
            alert('Configure uma URL de música primeiro!');
        }
    }
}

function testarMusica() {
    const url = document.getElementById('musicaUrl').value;
    if (url) {
        const audio = document.getElementById('musicaFundo');
        audio.src = url;
        audio.play().catch(e => alert('Não foi possível tocar. Verifique a URL.'));
    } else {
        alert('Digite uma URL de música MP3');
    }
}

// ============ UTILITÁRIOS ============
function mostrarTab(tab) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    const tabs = { quizzes: 0, editar: 1, jogar: 2, config: 3 };
    document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`).style.display = 'block';
    document.querySelectorAll('.tab-btn')[tabs[tab]].classList.add('active');
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