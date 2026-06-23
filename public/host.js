let socket;
let codigoSalaAtual = '';
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
            carregarHistoricoArquivos();
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
                    grid.innerHTML = '<div class="empty-state">Nenhum quiz criado.</div>';
                } else {
                    grid.innerHTML = data.quizzes.map(q => `
                        <div class="quiz-card">
                            <h3>${escapeHtml(q.nome)}</h3>
                            <p>Criado em: ${new Date(q.data_criacao).toLocaleDateString()}</p>
                            ${q.musica_url ? '<p>🎵 Com música</p>' : ''}
                            <div class="quiz-card-buttons">
                                <button onclick="editarQuiz(${q.id})" class="btn-pequeno">✏️ Editar</button>
                                <button onclick="deletarQuiz(${q.id})" class="btn-pequeno-danger">🗑️ Deletar</button>
                                <button onclick="exportarQuiz(${q.id})" class="btn-export">📥 Exportar</button>
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

function selecionarQuizJogar(id) {
    if (id) {
        fetch(`/api/quiz/carregar/${id}`)
            .then(res => res.json())
            .then(data => {
                if (!data.sucesso || data.perguntas.length === 0) {
                    alert('Este quiz não tem perguntas!');
                    document.getElementById('quizJogar').value = '';
                }
            });
    }
}

// ============ EXPORT ============
function exportarQuiz(id) {
    fetch(`/api/quiz/export/${id}`)
        .then(response => {
            if (!response.ok) {
                return response.json().then(data => { 
                    throw new Error(data.erro || 'Erro ao exportar'); 
                });
            }
            return response.blob();
        })
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'quiz_exportado.json';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            alert('✅ Quiz exportado com sucesso!');
        })
        .catch(err => {
            alert('❌ Erro ao exportar: ' + err.message);
        });
}

// ============ IMPORT ============
function importarQuiz() {
    const fileInput = document.getElementById('fileImport');
    const file = fileInput.files[0];
    if (!file) {
        alert('Selecione um arquivo .json para importar');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            if (!data.nome || !data.perguntas || !Array.isArray(data.perguntas) || data.perguntas.length === 0) {
                alert('Arquivo inválido: faltando "nome" ou "perguntas"');
                return;
            }
            
            for (const p of data.perguntas) {
                if (!p.texto) {
                    alert('Uma pergunta está sem texto!');
                    return;
                }
            }
            
            fetch('/api/quiz/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            })
            .then(res => res.json())
            .then(result => {
                if (result.sucesso) {
                    alert(result.mensagem || 'Quiz importado com sucesso!');
                    fileInput.value = '';
                    carregarQuizzes();
                    carregarSelectQuizzes();
                } else {
                    alert('Erro ao importar: ' + result.erro);
                }
            })
            .catch(err => {
                alert('Erro ao enviar arquivo: ' + err.message);
            });
        } catch (err) {
            alert('Erro ao ler arquivo: ' + err.message + '\nCertifique-se de que é um JSON válido.');
        }
    };
    reader.readAsText(file);
}

// ============ UPLOAD DE MÚSICA ============
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

// ============ EDITOR ============
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
            
            <!-- TEXTAREA COM 4 LINHAS -->
            <textarea class="pergunta-texto-area" rows="4" placeholder="Texto da pergunta" data-idx="${idx}">${escapeHtml(p.texto || '')}</textarea>
            
            <div class="opcao-item">
                <span class="opcao-simbolo" style="color: #e74c3c;">★</span>
                <input type="text" placeholder="Texto completo (ex: Brasília)" value="${escapeHtml(p.opcao_a || '')}" class="resposta-texto" data-opcao="A" data-idx="${idx}">
                <input type="text" placeholder="Texto curto (ex: BRA)" value="${escapeHtml(p.opcao_a_botao || '')}" class="botao-texto" data-opcao="A" data-idx="${idx}">
                <div class="opcao-remover">
                    <input type="checkbox" id="removerA_${idx}" data-opcao="A" data-idx="${idx}" ${p.opcao_a_remover ? 'checked' : ''}>
                    <label for="removerA_${idx}">❌ Remover</label>
                </div>
            </div>
            
            <div class="opcao-item">
                <span class="opcao-simbolo" style="color: #2ecc71;">▲</span>
                <input type="text" placeholder="Texto completo (ex: São Paulo)" value="${escapeHtml(p.opcao_b || '')}" class="resposta-texto" data-opcao="B" data-idx="${idx}">
                <input type="text" placeholder="Texto curto (ex: SP)" value="${escapeHtml(p.opcao_b_botao || '')}" class="botao-texto" data-opcao="B" data-idx="${idx}">
                <div class="opcao-remover">
                    <input type="checkbox" id="removerB_${idx}" data-opcao="B" data-idx="${idx}" ${p.opcao_b_remover ? 'checked' : ''}>
                    <label for="removerB_${idx}">❌ Remover</label>
                </div>
            </div>
            
            <div class="opcao-item">
                <span class="opcao-simbolo" style="color: #3498db;">●</span>
                <input type="text" placeholder="Texto completo (ex: Rio de Janeiro)" value="${escapeHtml(p.opcao_c || '')}" class="resposta-texto" data-opcao="C" data-idx="${idx}">
                <input type="text" placeholder="Texto curto (ex: RIO)" value="${escapeHtml(p.opcao_c_botao || '')}" class="botao-texto" data-opcao="C" data-idx="${idx}">
                <div class="opcao-remover">
                    <input type="checkbox" id="removerC_${idx}" data-opcao="C" data-idx="${idx}" ${p.opcao_c_remover ? 'checked' : ''}>
                    <label for="removerC_${idx}">❌ Remover</label>
                </div>
            </div>
            
            <div class="opcao-item">
                <span class="opcao-simbolo" style="color: #f1c40f;">■</span>
                <input type="text" placeholder="Texto completo (ex: Salvador)" value="${escapeHtml(p.opcao_d || '')}" class="resposta-texto" data-opcao="D" data-idx="${idx}">
                <input type="text" placeholder="Texto curto (ex: SA)" value="${escapeHtml(p.opcao_d_botao || '')}" class="botao-texto" data-opcao="D" data-idx="${idx}">
                <div class="opcao-remover">
                    <input type="checkbox" id="removerD_${idx}" data-opcao="D" data-idx="${idx}" ${p.opcao_d_remover ? 'checked' : ''}>
                    <label for="removerD_${idx}">❌ Remover</label>
                </div>
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
    
    // Event listeners para upload de imagens
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
    
    // Event listeners para textarea
    document.querySelectorAll('.pergunta-texto-area').forEach(textarea => {
        textarea.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.idx);
            perguntasAtuais[idx].texto = e.target.value;
        });
    });
    
    // Event listeners para campos de texto
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
    
    // Event listeners para checkboxes de remover
    document.querySelectorAll('.opcao-remover input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.idx);
            const opcao = e.target.dataset.opcao.toLowerCase();
            perguntasAtuais[idx][`opcao_${opcao}_remover`] = e.target.checked;
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
        opcao_a_remover: false,
        opcao_b: '',
        opcao_b_botao: '',
        opcao_b_remover: false,
        opcao_c: '',
        opcao_c_botao: '',
        opcao_c_remover: false,
        opcao_d: '',
        opcao_d_botao: '',
        opcao_d_remover: false,
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

// ============ SALA ============
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
            document.getElementById('codigoDisplay').innerHTML = codigoSalaAtual;
        } else {
            alert('Erro: ' + data.erro);
        }
    });
}

function copiarCodigo() {
    navigator.clipboard.writeText(codigoSalaAtual).then(() => {
        alert('✅ Código copiado!');
    }).catch(() => {
        const input = document.createElement('input');
        input.value = codigoSalaAtual;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        alert('✅ Código copiado!');
    });
}

function abrirApresentador() {
    if (!codigoSalaAtual) {
        alert('Crie uma sala primeiro!');
        return;
    }
    window.open(`/apresentador?codigo=${codigoSalaAtual}`, '_blank');
}

// ============ HISTÓRICO EM ARQUIVO ============
function carregarHistoricoArquivos() {
    fetch('/api/historico/listar')
        .then(res => res.json())
        .then(data => {
            if (data.sucesso) {
                const lista = document.getElementById('listaHistoricoArquivos');
                if (data.arquivos.length === 0) {
                    lista.innerHTML = '<div class="empty-state">Nenhum histórico encontrado.</div>';
                } else {
                    lista.innerHTML = data.arquivos.map(a => `
                        <div class="historico-item">
                            <span>
                                📄 ${a.nome}
                                <span style="color: #7f8c8d; font-size: 0.8em; margin-left: 10px;">
                                    ${new Date(a.data).toLocaleString()}
                                </span>
                            </span>
                            <div>
                                <button onclick="baixarHistorico('${a.nome}')" class="btn-pequeno">📥 Baixar</button>
                                <button onclick="deletarHistorico('${a.nome}')" class="btn-pequeno-danger">🗑️</button>
                            </div>
                        </div>
                    `).join('');
                }
            }
        });
}

function baixarHistorico(nome) {
    window.open(`/api/historico/baixar/${encodeURIComponent(nome)}`, '_blank');
}

function deletarHistorico(nome) {
    if (confirm(`Deletar o arquivo "${nome}"?`)) {
        fetch(`/api/historico/deletar/${encodeURIComponent(nome)}`, { method: 'DELETE' })
            .then(() => carregarHistoricoArquivos());
    }
}

function deletarTodosHistoricos() {
    if (confirm('Deletar todos os arquivos de histórico?')) {
        fetch('/api/historico/deletar-todos', { method: 'DELETE' })
            .then(() => carregarHistoricoArquivos());
    }
}

function mostrarTab(tab) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const tabs = { quizzes: 0, editar: 1, sala: 2, config: 3, historico: 4 };
    const tabName = tab.charAt(0).toUpperCase() + tab.slice(1);
    document.getElementById(`tab${tabName}`).style.display = 'block';
    document.querySelectorAll('.tab-btn')[tabs[tab]].classList.add('active');
    if (tab === 'historico') carregarHistoricoArquivos();
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
