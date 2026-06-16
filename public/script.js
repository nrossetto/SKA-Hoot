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
    
    // Textos curtos nos botões!
    document.getElementById('botaoA').innerHTML = botoes.A || 'A';
    document.getElementById('botaoB').innerHTML = botoes.B || 'B';
    document.getElementById('botaoC').innerHTML = botoes.C || 'C';
    document.getElementById('botaoD').innerHTML = botoes.D || 'D';
    
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
