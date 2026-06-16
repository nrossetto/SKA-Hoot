let socket;
let codigoSala;
let jogadorNome = '';
let aguardandoResposta = false;
let tempoAtual = 0;
let timerInterval;
let pontuacaoTotal = 0;

document.getElementById('btnEntrar').onclick = () => {
    codigoSala = document.getElementById('codigoSala').value;
    jogadorNome = document.getElementById('nomeJogador').value.trim();
    
    if (codigoSala.length !== 4 || !/^\d+$/.test(codigoSala)) {
        alert('Digite um código numérico de 4 dígitos');
        return;
    }
    if (!jogadorNome) {
        alert('Digite seu nome');
        return;
    }
    
    conectarServidor();
};

async function carregarConfigVisual(codigo) {
    try {
        const response = await fetch(`/api/sala/config/${codigo}`);
        const data = await response.json();
        if (data.sucesso) {
            document.getElementById('playerBody').style.backgroundColor = data.cor_fundo;
        }
    } catch(e) {}
}

function conectarServidor() {
    carregarConfigVisual(codigoSala);
    
    socket = io();
    
    socket.on('connect', () => {
        socket.emit('entrar-sala', { codigo: codigoSala, nome: jogadorNome });
    });
    
    socket.on('entrada-aceita', (data) => {
        document.getElementById('telaEntrada').style.display = 'none';
        document.getElementById('telaAguardando').style.display = 'block';
        document.getElementById('seuNome').innerHTML = `${data.emoji} ${data.nome}`;
        document.getElementById('quizNome').innerHTML = data.quizNome || 'SKA-HOOT';
    });
    
    socket.on('atualizar-jogadores', (jogadores) => {
        const lista = document.getElementById('listaJogadores');
        lista.innerHTML = jogadores.map(j => `
            <div class="jogador-item">
                <span class="jogador-emoji">${j.emoji}</span>
                <span class="jogador-nome">${j.nome}</span>
            </div>
        `).join('');
    });
    
    socket.on('jogo-iniciado', () => {
        document.getElementById('telaAguardando').style.display = 'none';
        document.getElementById('telaJogo').style.display = 'block';
        document.getElementById('codigoSalaMini').innerHTML = `📱 ${codigoSala}`;
    });
    
    socket.on('nova-pergunta-jogador', (data) => {
        mostrarPergunta(data.pergunta, data.botoes);
    });
    
    socket.on('atualizar-timer', (tempo) => {
        const barra = document.getElementById('tempoBar');
        if (barra) {
            const total = 15; // Valor padrão, pode ser melhorado
            const pct = (tempo / total) * 100;
            barra.style.width = `${pct}%`;
            if (pct < 30) barra.style.backgroundColor = '#e74c3c';
            else if (pct < 60) barra.style.backgroundColor = '#f39c12';
            else barra.style.backgroundColor = '#f1c40f';
        }
    });
    
    socket.on('mostrar-relatorio', (relatorio) => {
        const container = document.getElementById('perguntaContainer');
        if (container) {
            container.innerHTML = `
                <div style="background: white; border-radius: 15px; padding: 20px; text-align: center; color: #2c3e50;">
                    <h3>📊 Resultado da Pergunta</h3>
                    <p style="margin: 10px 0;">Resposta correta: <strong>${relatorio.respostaCorreta}</strong></p>
                    <div style="display: flex; gap: 20px; justify-content: center; margin: 15px 0;">
                        <div style="background: #27ae60; color: white; padding: 15px; border-radius: 10px; min-width: 80px;">
                            <div style="font-size: 2em;">✅</div>
                            <div>${relatorio.pctAcertos}%</div>
                        </div>
                        <div style="background: #e74c3c; color: white; padding: 15px; border-radius: 10px; min-width: 80px;">
                            <div style="font-size: 2em;">❌</div>
                            <div>${relatorio.pctErros}%</div>
                        </div>
                    </div>
                    <p style="color: #7f8c8d; font-size: 0.9em;">Aguardando próximo passo...</p>
                </div>
            `;
        }
        document.querySelector('.respostas-grid').style.display = 'none';
    });
    
    socket.on('mostrar-ranking', () => {
        // Restaurar interface para próxima pergunta
        document.querySelector('.respostas-grid').style.display = 'grid';
        document.getElementById('perguntaContainer').innerHTML = `
            <div class="tempo-restante">
                <div class="tempo-bar" id="tempoBar"></div>
            </div>
            <div id="imagemPergunta" class="imagem-pergunta"></div>
            <h2 id="textoPergunta" class="texto-pergunta"></h2>
        `;
    });
    
    socket.on('feedback', (data) => {
        mostrarFeedback(data);
        if (data.correta) {
            pontuacaoTotal += data.pontos;
            document.getElementById('pontuacaoAtual').innerHTML = pontuacaoTotal;
        }
    });
    
    socket.on('atualizar-ranking', (ranking) => {
        localStorage.setItem('rankingAtual', JSON.stringify(ranking));
    });
    
    socket.on('fim-jogo', (data) => {
        document.getElementById('telaJogo').style.display = 'none';
        mostrarPodio(data.ranking);
    });
    
    socket.on('erro', (msg) => {
        alert(msg);
        location.reload();
    });
}

function mostrarPergunta(pergunta, botoes) {
    aguardandoResposta = true;
    tempoAtual = pergunta.tempo;
    
    document.getElementById('textoPergunta').innerHTML = pergunta.texto;
    
    const imgDiv = document.getElementById('imagemPergunta');
    if (pergunta.imagem_url) {
        imgDiv.innerHTML = `<img src="${pergunta.imagem_url}">`;
    } else {
        imgDiv.innerHTML = '';
    }
    
    document.getElementById('botaoA').innerHTML = botoes.A || 'A';
    document.getElementById('botaoB').innerHTML = botoes.B || 'B';
    document.getElementById('botaoC').innerHTML = botoes.C || 'C';
    document.getElementById('botaoD').innerHTML = botoes.D || 'D';
    
    document.querySelector('.respostas-grid').style.display = 'grid';
    
    if (timerInterval) clearInterval(timerInterval);
    const barra = document.getElementById('tempoBar');
    barra.style.width = '100%';
    barra.style.backgroundColor = '#f1c40f';
    
    timerInterval = setInterval(() => {
        if (tempoAtual > 0 && aguardandoResposta) {
            tempoAtual--;
            const percentual = (tempoAtual / pergunta.tempo) * 100;
            barra.style.width = `${percentual}%`;
            if (percentual < 30) barra.style.backgroundColor = '#e74c3c';
            else if (percentual < 60) barra.style.backgroundColor = '#f39c12';
        } else if (tempoAtual <= 0) {
            clearInterval(timerInterval);
            aguardandoResposta = false;
            desabilitarBotoes();
        }
    }, 1000);
    
    document.querySelectorAll('.resposta-btn').forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.onclick = () => responderPergunta(btn.dataset.resposta);
    });
}

function desabilitarBotoes() {
    document.querySelectorAll('.resposta-btn').forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.5';
    });
}

function responderPergunta(resposta) {
    if (!aguardandoResposta) return;
    aguardandoResposta = false;
    clearInterval(timerInterval);
    desabilitarBotoes();
    
    socket.emit('responder', {
        codigo: codigoSala,
        resposta: resposta,
        tempoRestante: tempoAtual
    });
}

function mostrarFeedback(data) {
    const telaFeedback = document.getElementById('telaFeedback');
    const icon = document.getElementById('feedbackIcon');
    const msg = document.getElementById('feedbackMsg');
    const pontos = document.getElementById('feedbackPontos');
    
    if (data.correta) {
        icon.innerHTML = '✅';
        msg.innerHTML = 'CORRETO!';
        msg.style.color = '#2ecc71';
        pontos.innerHTML = `+${data.pontos} pontos!`;
    } else {
        icon.innerHTML = '❌';
        msg.innerHTML = `ERRADO!<br><small>Resposta: ${data.respostaCorreta}</small>`;
        msg.style.color = '#e74c3c';
        pontos.innerHTML = '0 pontos';
    }
    
    telaFeedback.style.display = 'flex';
    setTimeout(() => { telaFeedback.style.display = 'none'; }, 1500);
}

function mostrarPodio(ranking) {
    const podioDiv = document.getElementById('podioContent');
    const top3 = ranking.slice(0, 3);
    const top10 = ranking.slice(3, 13);
    
    let html = `
        <div class="fim-jogo-titulo">🎉 FIM DE JOGO! 🎉</div>
        <div class="campeao-destaque">
            <div class="trofeu-grande">🏆</div>
            <div class="campeao-nome">${top3[0]?.nome || '-'}</div>
            <div class="campeao-pontos">${top3[0]?.pontuacao || 0} pontos</div>
        </div>
        <div class="podio-positions">
            <div class="podio-item segundo">
                <div class="medalha">🥈</div>
                <div class="nome">${top3[1]?.nome || '-'}</div>
                <div class="pontos">${top3[1]?.pontuacao || 0} pts</div>
            </div>
            <div class="podio-item terceiro">
                <div class="medalha">🥉</div>
                <div class="nome">${top3[2]?.nome || '-'}</div>
                <div class="pontos">${top3[2]?.pontuacao || 0} pts</div>
            </div>
        </div>
    `;
    
    if (top10.length > 0) {
        html += `<div class="top10-lista"><h3>📋 TOP 10</h3>`;
        top10.forEach((j, i) => {
            html += `<div class="top10-item">${i+4}. ${j.emoji} ${j.nome} - ${j.pontuacao} pts</div>`;
        });
        html += `</div>`;
    }
    
    podioDiv.innerHTML = html;
    document.getElementById('telaPodio').style.display = 'flex';
}

function mostrarRanking() {
    const ranking = JSON.parse(localStorage.getItem('rankingAtual') || '[]');
    const modal = document.getElementById('telaRanking');
    const lista = document.getElementById('listaRanking');
    lista.innerHTML = ranking.map(r => `
        <li><span>${r.posicao}º ${r.emoji} ${r.nome}</span><strong>${r.pontuacao} pts</strong></li>
    `).join('');
    modal.style.display = 'flex';
}

function fecharRanking() {
    document.getElementById('telaRanking').style.display = 'none';
}

document.getElementById('codigoSala').addEventListener('input', function(e) {
    this.value = this.value.replace(/\D/g, '').slice(0, 4);
});
