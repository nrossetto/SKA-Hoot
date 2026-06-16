let socket;
let codigoSalaAtual = '';
let quizAtual = null;
let perguntasAtuais = [];
let quizIdAtual = null;

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

function logout() { location.reload(); }

function carregarQuizzes() {
    fetch('/api/quiz/listar')
        .then(res => res.json())
        .then(data => {
            if (data.sucesso) {
                const grid = document.getElementById('quizzesGrid');
                if (data.quizzes.length === 0) {
                    grid.innerHTML = '<div class="empty-state">Nenhum quiz criado ainda.</div>';
                } else {
                    grid.innerHTML = data.quizzes.map(q => `
                        <div class="quiz-card">
                            <h3>${escapeHtml(q.nome)}</h3>
                            <p>Criado em: ${new Date(q.data_criacao).toLocaleDateString()}</p>
                            ${q.musica_url ? '<p>🎵 Com música</p>' : ''}
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
            alert('Quiz criado!');
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
    if (confirm('Deletar este quiz?')) {
        fetch(`/api/quiz/deletar/${id}`, { method: 'DELETE' })
            .then(() => { carregarQuizzes(); carregarSelectQuizzes(); });
    }
}

function uploadMusica() {
    const fileInput = document.getElementById('uploadMusica');
    const file = fileInput.files[0];
    if (!file) {
        alert('Selecione um arquivo MP3');
        return;
    }
    const formData = new FormData();
    formData.append('musica', file);
    fetch('/api/upload/musica', {
        method: 'POST',
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        if (data.sucesso) {
            document.getElementById('musicaUrl').value = data.url;
            document.getElementById('musicaPreview').innerHTML = `
                <audio controls style="width: 100%;">
                    <source src="${data.url}" type="audio/mpeg">
                </audio>
                <p>✅ Música carregada!</p>
            `;
        } else {
            alert('Erro: ' + data.erro);
        }
    });
}

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
                    document.getElementById('musicaPreview').innerHTML = `
                        <audio controls style="width: 100%;">
                            <source src="${data.quiz.musica_url}" type="audio/mpeg">
                        </audio>
                        <p>✅ Música configurada</p>
                    `;
                }
                perguntasAtuais = data.perguntas || [];
                renderizarPerguntas();
            }
        });
}

function renderizarPerguntas() {
    const container = document.getElementById('editorPerguntas');
    if (perguntasAtuais.length === 0) {
        container.innerHTML = '<div class="empty-state">Nenhuma pergunta.</div>';
        return;
    }
    
    container.innerHTML = perguntasAtuais.map((p, idx) => `
        <div class="pergunta-card" data-idx="${idx}">
            <div class="pergunta-header">
                <h4>Pergunta ${idx + 1}</h4>
                <button onclick="removerPergunta(${idx})" class="btn-remover">🗑️</button>
            </div>
            
            <div class="campo-imagem">
                <label>📸 Imagem:</label>
                <input type="file" class="upload-imagem-edit" data-idx="${idx}" accept="image/*">
                <div class="preview-imagem" id="preview-${idx}">
                    ${p.imagem_url ? `<img src="${p.imagem_url}" style="max-width: 100px;">` : ''}
                </div>
                <input type="hidden" class="imagem-url" data-idx="${idx}" value="${p.imagem_url || ''}">
            </div>
            
            <input type="text" placeholder="Texto da pergunta" value="${escapeHtml(p.texto || '')}" class="pergunta-texto" data-idx="${idx}">
            
            <div class="opcao-item">
                <span class="opcao-simbolo" style="color: #e74c3c;">★</span>
                <input type="text" placeholder="Texto completo (ex: Brasília)" value="${escapeHtml(p.opcao_a || '')}" class="resposta-texto" data-opcao="A" data-idx="${idx}">
                <input type="text" placeholder="Texto curto (ex: BRA)" value="${escapeHtml(p.opcao_a_botao || '')}" class="botao-texto" data-opcao="A" data-idx="${idx}">
            </div>
            
            <div class="opcao-item">
                <span class="opcao-simbolo" style="color: #2ecc71;">▲</span>
                <input type="text" placeholder="Texto completo (ex: São Paulo)" value="${escapeHtml(p.opcao_b || '')}" class="resposta-texto" data-opcao="B" data-idx="${idx}">
                <input type="text" placeholder="Texto curto (ex: SP)" value="${escapeHtml(p.opcao_b_botao || '')}" class="botao-texto" data-opcao="B" data-idx="${idx}">
            </div>
            
            <div class="opcao-item">
                <span class="opcao-simbolo" style="color: #3498db;">●</span>
                <input type="text" placeholder="Texto completo (ex: Rio de Janeiro)" value="${escapeHtml(p.opcao_c || '')}" class="resposta-texto" data-opcao="C" data-idx="${idx}">
                <input type="text" placeholder="Texto curto (ex: RIO)" value="${escapeHtml(p.opcao_c_botao || '')}" class="botao-texto" data-opcao="C" data-idx="${idx}">
            </div>
            
            <div class="opcao-item">
                <span class="opcao-simbolo" style="color: #f1c40f;">■</span>
                <input type="text" placeholder="Texto completo (ex: Salvador)" value="${escapeHtml(p.opcao_d || '')}" class="resposta-texto" data-opcao="D" data-idx="${idx}">
                <input type="text" placeholder="Texto curto (ex: SA)" value="${escapeHtml(p.opcao_d_botao || '')}" class="botao-texto" data-opcao="D" data-idx="${idx}">
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
                }
            }
        });
    });
    
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
    
    document.querySelectorAll('.botao-texto').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.idx);
            const opcao = e.target.dataset.opcao.toLowerCase();
            perguntasAtuais[idx][`opcao_${opcao}_botao`] = e.target.value;
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
        opcao_a_botao: '',
        opcao_b: '',
        opcao_b_botao: '',
        opcao_c: '',
        opcao_c_botao: '',
        opcao_d: '',
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
        body: JSON.stringify({ quiz_id: quizId, quizNome: quizNome })
    })
    .then(res => res.json())
    .then(data => {
        if (data.sucesso) {
            codigoSalaAtual = data.codigo;
            document.getElementById('salaInfo').style.display = 'block';
            document.getElementById('codigoSalaDisplay').innerHTML = `📱 CÓDIGO: ${codigoSalaAtual}`;
            document.getElementById('btnIniciarJogo').disabled = false;
            // Esconder controles avançados inicialmente
            document.getElementById('controlesAvancados').style.display = 'none';
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

function iniciarJogo() {
    if (!codigoSalaAtual) return;
    if (confirm('Iniciar o jogo agora?')) {
        socket.emit('iniciar-jogo', codigoSalaAtual);
        document.getElementById('btnIniciarJogo').disabled = true;
        document.getElementById('controlesAvancados').style.display = 'flex';
        document.getElementById('btnProximaPergunta').disabled = true;
        document.getElementById('btnAvancarRanking').disabled = true;
    }
}

function avancarRelatorio() {
    if (!codigoSalaAtual) return;
    socket.emit('avancar-relatorio', codigoSalaAtual);
    document.getElementById('btnAvancarRelatorio').disabled = true;
    document.getElementById('btnAvancarRanking').disabled = false;
}

function avancarRanking() {
    if (!codigoSalaAtual) return;
    socket.emit('avancar-ranking', codigoSalaAtual);
    document.getElementById('btnAvancarRanking').disabled = true;
    document.getElementById('btnProximaPergunta').disabled = false;
}

function proximaPergunta() {
    if (!codigoSalaAtual) return;
    socket.emit('avancar-proxima-pergunta', codigoSalaAtual);
    document.getElementById('btnProximaPergunta').disabled = true;
    document.getElementById('btnAvancarRelatorio').disabled = false;
}

function conectarHost() {
    if (socket) socket.disconnect();
    socket = io();
    
    socket.on('host-entrada-aceita', () => console.log('Conectado'));
    
    socket.on('nova-pergunta-host', (data) => {
        document.getElementById('btnAvancarRelatorio').disabled = false;
        document.getElementById('btnAvancarRanking').disabled = true;
        document.getElementById('btnProximaPergunta').disabled = true;
        
        const espelho = document.getElementById('espelhoPergunta');
        if (espelho) {
            const p = data.pergunta;
            espelho.innerHTML = `
                <h3>📢 Pergunta ${data.numero} de ${data.total}</h3>
                ${p.imagem_url ? `<img src="${p.imagem_url}" style="max-width: 200px;">` : ''}
                <p><strong>${p.texto}</strong></p>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:10px 0;">
                    <div style="background:#e74c3c; color:white; padding:10px; border-radius:8px;">🔴 A: ${p.opcoes.A}</div>
                    <div style="background:#2ecc71; color:white; padding:10px; border-radius:8px;">🟢 B: ${p.opcoes.B}</div>
                    <div style="background:#3498db; color:white; padding:10px; border-radius:8px;">🔵 C: ${p.opcoes.C}</div>
                    <div style="background:#f1c40f; color:#2c3e50; padding:10px; border-radius:8px;">🟡 D: ${p.opcoes.D}</div>
                </div>
                <p>⏱ Tempo: ${p.tempo}s</p>
                <p style="color:#7f8c8d; font-size:0.9em;">Botões: ${p.botoes.A} | ${p.botoes.B} | ${p.botoes.C} | ${p.botoes.D}</p>
            `;
        }
    });
    
    socket.on('mostrar-relatorio', (relatorio) => {
        const espelho = document.getElementById('espelhoPergunta');
        if (espelho) {
            espelho.innerHTML = `
                <h3>📊 RELATÓRIO DA PERGUNTA</h3>
                <p><strong>${relatorio.pergunta}</strong></p>
                <p>✅ Resposta correta: <strong>${relatorio.respostaCorreta}</strong></p>
                <hr>
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin:10px 0;">
                    <div style="background:#27ae60; color:white; padding:15px; border-radius:10px; text-align:center;">
                        <div style="font-size:2em;">✅</div>
                        <div>${relatorio.pctAcertos}%</div>
                        <div>Acertaram (${relatorio.acertos})</div>
                    </div>
                    <div style="background:#e74c3c; color:white; padding:15px; border-radius:10px; text-align:center;">
                        <div style="font-size:2em;">❌</div>
                        <div>${relatorio.pctErros}%</div>
                        <div>Erraram (${relatorio.erros})</div>
                    </div>
                    <div style="background:#95a5a6; color:white; padding:15px; border-radius:10px; text-align:center;">
                        <div style="font-size:2em;">⏭</div>
                        <div>${relatorio.pctNaoResponderam}%</div>
                        <div>Não responderam</div>
                    </div>
                </div>
                <div style="background:#ecf0f1; padding:10px; border-radius:8px; margin:10px 0;">
                    <h4>Distribuição das respostas:</h4>
                    <div>🔴 A: ${relatorio.distribuicao.A}</div>
                    <div>🟢 B: ${relatorio.distribuicao.B}</div>
                    <div>🔵 C: ${relatorio.distribuicao.C}</div>
                    <div>🟡 D: ${relatorio.distribuicao.D}</div>
                </div>
                <p style="color:#7f8c8d; font-size:0.9em;">${relatorio.totalResponderam} de ${relatorio.totalJogadores} responderam</p>
            `;
        }
        document.getElementById('btnAvancarRelatorio').disabled = true;
        document.getElementById('btnAvancarRanking').disabled = false;
    });
    
    socket.on('mostrar-ranking-parcial', () => {
        const espelho = document.getElementById('espelhoPergunta');
        if (espelho) {
            espelho.innerHTML += `
                <hr>
                <h4>🏆 RANKING PARCIAL</h4>
                <p>Veja o ranking ao lado!</p>
            `;
        }
        document.getElementById('btnAvancarRanking').disabled = true;
        document.getElementById('btnProximaPergunta').disabled = false;
    });
    
    socket.on('atualizar-jogadores', (jogadores) => {
        const lista = document.getElementById('listaJogadoresHost');
        document.getElementById('totalJogadores').innerText = jogadores.length;
        lista.innerHTML = jogadores.map(j => 
            `<div class="jogador-item-host">${j.emoji} ${j.nome} - ${j.pontuacao} pts</div>`
        ).join('');
    });
    
    socket.on('atualizar-ranking', (ranking) => {
        const rankingDiv = document.getElementById('rankingHost');
        rankingDiv.innerHTML = ranking.slice(0, 10).map(r => 
            `<div class="ranking-item">${r.posicao}º ${r.emoji} ${r.nome} - ${r.pontuacao} pts</div>`
        ).join('');
    });
    
    socket.on('fim-jogo', (data) => {
        alert(`🏆 JOGO FINALIZADO! Vencedor: ${data.ranking[0]?.nome}`);
        document.getElementById('btnIniciarJogo').disabled = false;
        document.getElementById('controlesAvancados').style.display = 'none';
        const espelho = document.getElementById('espelhoPergunta');
        if (espelho) {
            espelho.innerHTML = `
                <h2 style="color:#f1c40f;">🏆 FIM DE JOGO!</h2>
                <h3>Campeão: ${data.ranking[0]?.nome}</h3>
                <p>${data.ranking[0]?.pontuacao} pontos</p>
                <h4>Top 3:</h4>
                ${data.ranking.slice(0, 3).map((r, i) => `<p>${i+1}º ${r.emoji} ${r.nome} - ${r.pontuacao} pts</p>`).join('')}
            `;
        }
    });
}

function carregarHistorico() {
    fetch('/api/historico')
        .then(res => res.json())
        .then(data => {
            if (data.sucesso) {
                const lista = document.getElementById('listaHistorico');
                lista.innerHTML = data.historico.map(h => `
                    <div class="historico-card">
                        <strong>📅 ${new Date(h.data_hora).toLocaleString()}</strong><br>
                        🎯 Quiz ID: ${h.quiz_id}<br>
                        🔢 Código: ${h.codigo}
                    </div>
                `).join('');
            }
        });
}

function deletarHistorico() {
    if (confirm('Deletar todo o histórico?')) {
        fetch('/api/historico/deletar', { method: 'DELETE' })
            .then(() => carregarHistorico());
    }
}

function mostrarTab(tab) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const tabs = { quizzes: 0, editar: 1, jogar: 2, config: 3, historico: 4 };
    const tabName = tab.charAt(0).toUpperCase() + tab.slice(1);
    document.getElementById(`tab${tabName}`).style.display = 'block';
    document.querySelectorAll('.tab-btn')[tabs[tab]].classList.add('active');
    if (tab === 'historico') carregarHistorico();
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
