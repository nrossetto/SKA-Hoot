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
        document.getElementById('telaAguardando').style.display
