const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Pool } = require('pg');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;
const SENHA_MESTRA = process.env.SENHA_MESTRA || 'ska2026';

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

if (!fs.existsSync('public/uploads')) {
  fs.mkdirSync('public/uploads', { recursive: true });
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Erro ao conectar ao PostgreSQL:', err.stack);
  } else {
    console.log('✅ Conectado ao PostgreSQL!');
    release();
  }
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`DROP TABLE IF EXISTS partidas`);
    await client.query(`DROP TABLE IF EXISTS perguntas`);
    await client.query(`DROP TABLE IF EXISTS quizzes`);
    
    await client.query(`
      CREATE TABLE quizzes (
        id SERIAL PRIMARY KEY,
        nome TEXT UNIQUE NOT NULL,
        data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        musica_url TEXT,
        cor_fundo TEXT DEFAULT '#667eea'
      )
    `);
    
    await client.query(`
      CREATE TABLE perguntas (
        id SERIAL PRIMARY KEY,
        quiz_id INTEGER REFERENCES quizzes(id) ON DELETE CASCADE,
        texto TEXT,
        imagem_url TEXT,
        opcao_a TEXT,
        opcao_a_botao TEXT,
        opcao_b TEXT,
        opcao_b_botao TEXT,
        opcao_c TEXT,
        opcao_c_botao TEXT,
        opcao_d TEXT,
        opcao_d_botao TEXT,
        correta CHAR(1),
        tempo INTEGER DEFAULT 15
      )
    `);
    
    await client.query(`
      CREATE TABLE partidas (
        id SERIAL PRIMARY KEY,
        quiz_id INTEGER REFERENCES quizzes(id),
        codigo TEXT,
        data_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ranking TEXT
      )
    `);
    
    console.log('✅ Tabelas criadas com sucesso!');
  } catch (err) {
    console.error('❌ Erro ao criar tabelas:', err);
  } finally {
    client.release();
  }
}

initDatabase();

app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static('public/uploads'));

let salas = {};

function gerarCodigo() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// ============ API ROTAS ============

app.post('/api/verificar-senha', (req, res) => {
  res.json({ sucesso: req.body.senha === SENHA_MESTRA });
});

app.post('/api/upload/musica', upload.single('musica'), (req, res) => {
  if (!req.file) return res.json({ sucesso: false, erro: 'Nenhum arquivo' });
  res.json({ sucesso: true, url: `/uploads/${req.file.filename}` });
});

app.post('/api/upload/imagem', upload.single('imagem'), (req, res) => {
  if (!req.file) return res.json({ sucesso: false, erro: 'Nenhum arquivo' });
  res.json({ sucesso: true, url: `/uploads/${req.file.filename}` });
});

app.post('/api/quiz/criar', async (req, res) => {
  try {
    const result = await pool.query('INSERT INTO quizzes (nome) VALUES ($1) RETURNING id', [req.body.nome]);
    res.json({ sucesso: true, id: result.rows[0].id });
  } catch (err) {
    res.json({ sucesso: false, erro: err.message });
  }
});

app.get('/api/quiz/listar', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, nome, data_criacao, musica_url, cor_fundo FROM quizzes ORDER BY data_criacao DESC');
    res.json({ sucesso: true, quizzes: result.rows });
  } catch (err) {
    res.json({ sucesso: false, erro: err.message });
  }
});

app.get('/api/quiz/carregar/:id', async (req, res) => {
  try {
    const quizResult = await pool.query('SELECT * FROM quizzes WHERE id = $1', [req.params.id]);
    if (quizResult.rows.length === 0) {
      return res.json({ sucesso: false, erro: 'Quiz não encontrado' });
    }
    const perguntasResult = await pool.query('SELECT * FROM perguntas WHERE quiz_id = $1 ORDER BY id', [req.params.id]);
    res.json({ sucesso: true, quiz: quizResult.rows[0], perguntas: perguntasResult.rows });
  } catch (err) {
    res.json({ sucesso: false, erro: err.message });
  }
});

app.post('/api/quiz/salvar', async (req, res) => {
  const { quiz_id, nome, cor_fundo, musica_url, perguntas } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE quizzes SET nome = $1, cor_fundo = $2, musica_url = $3 WHERE id = $4',
      [nome, cor_fundo || '#667eea', musica_url || null, quiz_id]);
    await client.query('DELETE FROM perguntas WHERE quiz_id = $1', [quiz_id]);
    
    const perguntasData = JSON.parse(perguntas);
    for (const p of perguntasData) {
      await client.query(`
        INSERT INTO perguntas (
          quiz_id, texto, imagem_url,
          opcao_a, opcao_a_botao,
          opcao_b, opcao_b_botao,
          opcao_c, opcao_c_botao,
          opcao_d, opcao_d_botao,
          correta, tempo
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        quiz_id, 
        p.texto || '', 
        p.imagem_url || null,
        p.opcao_a || '', 
        p.opcao_a_botao || '',
        p.opcao_b || '', 
        p.opcao_b_botao || '',
        p.opcao_c || '', 
        p.opcao_c_botao || '',
        p.opcao_d || '', 
        p.opcao_d_botao || '',
        p.correta || 'A', 
        p.tempo || 15
      ]);
    }
    
    await client.query('COMMIT');
    res.json({ sucesso: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao salvar:', err);
    res.json({ sucesso: false, erro: err.message });
  } finally {
    client.release();
  }
});

app.delete('/api/quiz/deletar/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM quizzes WHERE id = $1', [req.params.id]);
    res.json({ sucesso: true });
  } catch (err) {
    res.json({ sucesso: false, erro: err.message });
  }
});

app.post('/api/sala/criar', async (req, res) => {
  const { quiz_id, quizNome } = req.body;
  const codigo = gerarCodigo();
  try {
    const result = await pool.query('SELECT * FROM perguntas WHERE quiz_id = $1 ORDER BY id', [quiz_id]);
    if (result.rows.length === 0) {
      return res.json({ sucesso: false, erro: 'Quiz sem perguntas' });
    }
    
    // Buscar configurações visuais do quiz
    const quizResult = await pool.query('SELECT cor_fundo, musica_url FROM quizzes WHERE id = $1', [quiz_id]);
    
    salas[codigo] = {
      codigo: codigo,
      quiz_id: quiz_id,
      quizNome: quizNome,
      jogadores: {},
      perguntas: result.rows,
      perguntaAtual: -1,
      ativo: true,
      jogoAtivo: false,
      respostasPerguntaAtual: {},
      etapa: 'aguardando', // aguardando | pergunta | resultado | ranking | podio
      tempoRestante: 0,
      timerInterval: null,
      cor_fundo: quizResult.rows[0]?.cor_fundo || '#667eea',
      musica_url: quizResult.rows[0]?.musica_url || null
    };
    res.json({ sucesso: true, codigo: codigo });
  } catch (err) {
    res.json({ sucesso: false, erro: err.message });
  }
});

app.get('/api/sala/config/:codigo', async (req, res) => {
  const sala = salas[req.params.codigo];
  if (sala) {
    res.json({ sucesso: true, cor_fundo: sala.cor_fundo || '#667eea' });
  } else {
    res.json({ sucesso: false });
  }
});

app.delete('/api/historico/deletar', async (req, res) => {
  try {
    await pool.query('DELETE FROM partidas');
    res.json({ sucesso: true });
  } catch (err) {
    res.json({ sucesso: false, erro: err.message });
  }
});

app.get('/api/historico', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM partidas ORDER BY data_hora DESC LIMIT 50');
    res.json({ sucesso: true, historico: result.rows });
  } catch (err) {
    res.json({ sucesso: false, erro: err.message });
  }
});

// ============ SOCKET.IO ============
io.on('connection', (socket) => {
  console.log('Novo jogador:', socket.id);

  socket.on('entrar-sala', (data) => {
    const sala = salas[data.codigo];
    if (sala && sala.ativo) {
      const animais = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐸', '🐒', '🦉', '🐝'];
      const emoji = animais[Math.floor(Math.random() * animais.length)];
      const nomeFinal = data.nome || `Jogador${Object.keys(sala.jogadores).length + 1}`;
      sala.jogadores[socket.id] = {
        id: socket.id,
        nome: nomeFinal,
        emoji: emoji,
        pontuacao: 0,
        respostas: []
      };
      socket.join(data.codigo);
      socket.emit('entrada-aceita', {
        nome: nomeFinal,
        emoji: emoji,
        quizNome: sala.quizNome
      });
      io.to(data.codigo).emit('atualizar-jogadores', Object.values(sala.jogadores));
      
      // Se o apresentador já estiver conectado, enviar atualização
      io.to(`apresentador_${data.codigo}`).emit('atualizar-jogadores', Object.values(sala.jogadores));
    } else {
      socket.emit('erro', 'Código inválido ou sala inativa');
    }
  });

  // Apresentador conecta
  socket.on('apresentador-conectar', (codigo) => {
    if (salas[codigo]) {
      socket.join(`apresentador_${codigo}`);
      socket.emit('apresentador-conectado', { 
        sucesso: true, 
        jogadores: Object.values(salas[codigo].jogadores),
        cor_fundo: salas[codigo].cor_fundo,
        musica_url: salas[codigo].musica_url
      });
      console.log('🎤 Apresentador conectado à sala:', codigo);
    } else {
      socket.emit('erro', 'Sala não encontrada');
    }
  });

  // Apresentador inicia o jogo
  socket.on('apresentador-iniciar', (codigo) => {
    const sala = salas[codigo];
    if (sala && sala.perguntas.length > 0 && !sala.jogoAtivo) {
      sala.jogoAtivo = true;
      sala.perguntaAtual = 0;
      sala.etapa = 'pergunta';
      
      // Notificar todos que o jogo começou
      io.to(codigo).emit('jogo-iniciado');
      io.to(`apresentador_${codigo}`).emit('jogo-iniciado');
      
      // Enviar a primeira pergunta
      enviarPergunta(codigo, 0);
    }
  });

  // Apresentador avança (Resultado → Ranking → Próxima Pergunta)
  socket.on('apresentador-avancar', (codigo) => {
    const sala = salas[codigo];
    if (!sala || !sala.jogoAtivo) return;

    if (sala.etapa === 'resultado') {
      // Avança para o ranking
      sala.etapa = 'ranking';
      enviarRanking(codigo);
      io.to(codigo).emit('mostrar-ranking');
      io.to(`apresentador_${codigo}`).emit('mostrar-ranking');
    } else if (sala.etapa === 'ranking') {
      // Avança para a próxima pergunta
      const proximoIndice = sala.perguntaAtual + 1;
      if (proximoIndice < sala.perguntas.length) {
        sala.etapa = 'pergunta';
        enviarPergunta(codigo, proximoIndice);
      } else {
        // Fim do jogo
        finalizarJogo(codigo);
      }
    }
  });

  // Jogador responde
  socket.on('responder', (data) => {
    const sala = salas[data.codigo];
    if (!sala || !sala.jogoAtivo) return;
    if (sala.etapa !== 'pergunta') return;
    
    const pergunta = sala.perguntas[sala.perguntaAtual];
    if (!pergunta) return;
    if (sala.respostasPerguntaAtual[socket.id]) return;
    
    const isCorreta = data.resposta === pergunta.correta;
    let pontos = 0;
    if (isCorreta && data.tempoRestante > 0) {
      pontos = Math.floor((data.tempoRestante / pergunta.tempo) * 1000);
    }
    if (isCorreta) {
      sala.jogadores[socket.id].pontuacao += pontos;
    }
    
    sala.respostasPerguntaAtual[socket.id] = {
      resposta: data.resposta,
      correta: isCorreta,
      pontos: pontos
    };
    
    let respostaCompleta = '';
    if (pergunta.correta === 'A') respostaCompleta = pergunta.opcao_a;
    else if (pergunta.correta === 'B') respostaCompleta = pergunta.opcao_b;
    else if (pergunta.correta === 'C') respostaCompleta = pergunta.opcao_c;
    else if (pergunta.correta === 'D') respostaCompleta = pergunta.opcao_d;
    
    socket.emit('feedback', {
      correta: isCorreta,
      pontos: pontos,
      respostaCorreta: respostaCompleta
    });
    
    // Verificar se todos já responderam
    const totalJogadores = Object.keys(sala.jogadores).length;
    const totalRespostas = Object.keys(sala.respostasPerguntaAtual).length;
    if (totalRespostas === totalJogadores && sala.jogoAtivo && sala.etapa === 'pergunta') {
      // Todos responderam, vamos para o resultado
      if (sala.timerInterval) clearInterval(sala.timerInterval);
      setTimeout(() => {
        if (sala.jogoAtivo && sala.etapa === 'pergunta') {
          sala.etapa = 'resultado';
          const relatorio = gerarRelatorio(codigo);
          io.to(codigo).emit('mostrar-relatorio', relatorio);
          io.to(`apresentador_${codigo}`).emit('mostrar-relatorio', relatorio);
        }
      }, 1500);
    }
  });

  // Função para gerar relatório
  function gerarRelatorio(codigo) {
    const sala = salas[codigo];
    if (!sala) return null;
    
    const pergunta = sala.perguntas[sala.perguntaAtual];
    const respostas = sala.respostasPerguntaAtual;
    const total = Object.keys(respostas).length;
    const totalJogadores = Object.keys(sala.jogadores).length;
    
    let acertos = 0;
    let erros = 0;
    const distribuicao = { A: 0, B: 0, C: 0, D: 0 };
    
    for (const id in respostas) {
      const r = respostas[id];
      if (r.correta) {
        acertos++;
      } else {
        erros++;
      }
      distribuicao[r.resposta] = (distribuicao[r.resposta] || 0) + 1;
    }
    
    const pctAcertos = total > 0 ? Math.round((acertos / total) * 100) : 0;
    const pctErros = total > 0 ? Math.round((erros / total) * 100) : 0;
    const pctNaoResponderam = totalJogadores > 0 ? Math.round(((totalJogadores - total) / totalJogadores) * 100) : 0;
    
    let respostaCorreta = '';
    if (pergunta.correta === 'A') respostaCorreta = pergunta.opcao_a;
    else if (pergunta.correta === 'B') respostaCorreta = pergunta.opcao_b;
    else if (pergunta.correta === 'C') respostaCorreta = pergunta.opcao_c;
    else if (pergunta.correta === 'D') respostaCorreta = pergunta.opcao_d;
    
    return {
      pergunta: pergunta.texto,
      respostaCorreta: respostaCorreta,
      opcaoCorreta: pergunta.correta,
      totalResponderam: total,
      totalJogadores: totalJogadores,
      acertos: acertos,
      erros: erros,
      pctAcertos: pctAcertos,
      pctErros: pctErros,
      pctNaoResponderam: pctNaoResponderam,
      distribuicao: distribuicao,
      numero: sala.perguntaAtual + 1,
      total: sala.perguntas.length
    };
  }

  // Função para enviar pergunta
  function enviarPergunta(codigo, indice) {
    const sala = salas[codigo];
    if (!sala || indice >= sala.perguntas.length) {
      finalizarJogo(codigo);
      return;
    }
    
    const pergunta = sala.perguntas[indice];
    sala.respostasPerguntaAtual = {};
    sala.perguntaAtual = indice;
    sala.etapa = 'pergunta';
    sala.tempoRestante = pergunta.tempo;
    
    const dadosApresentador = {
      pergunta: {
        texto: pergunta.texto,
        imagem_url: pergunta.imagem_url,
        tempo: pergunta.tempo,
        opcoes: {
          A: pergunta.opcao_a,
          B: pergunta.opcao_b,
          C: pergunta.opcao_c,
          D: pergunta.opcao_d
        },
        botoes: {
          A: pergunta.opcao_a_botao || 'A',
          B: pergunta.opcao_b_botao || 'B',
          C: pergunta.opcao_c_botao || 'C',
          D: pergunta.opcao_d_botao || 'D'
        }
      },
      numero: indice + 1,
      total: sala.perguntas.length
    };
    
    const dadosJogador = {
      pergunta: {
        texto: pergunta.texto,
        imagem_url: pergunta.imagem_url,
        tempo: pergunta.tempo
      },
      botoes: {
        A: pergunta.opcao_a_botao || 'A',
        B: pergunta.opcao_b_botao || 'B',
        C: pergunta.opcao_c_botao || 'C',
        D: pergunta.opcao_d_botao || 'D'
      },
      numero: indice + 1,
      total: sala.perguntas.length
    };
    
    io.to(codigo).emit('nova-pergunta-jogador', dadosJogador);
    io.to(`apresentador_${codigo}`).emit('nova-pergunta-apresentador', dadosApresentador);
    
    // Timer automático
    if (sala.timerInterval) clearInterval(sala.timerInterval);
    sala.timerInterval = setInterval(() => {
      if (!sala.jogoAtivo || sala.etapa !== 'pergunta') {
        clearInterval(sala.timerInterval);
        return;
      }
      
      sala.tempoRestante--;
      
      // Enviar atualização do timer para apresentador e jogadores
      io.to(codigo).emit('atualizar-timer', sala.tempoRestante);
      io.to(`apresentador_${codigo}`).emit('atualizar-timer', sala.tempoRestante);
      
      if (sala.tempoRestante <= 0) {
        clearInterval(sala.timerInterval);
        if (sala.jogoAtivo && sala.etapa === 'pergunta') {
          // Tempo acabou, vai para o resultado
          sala.etapa = 'resultado';
          const relatorio = gerarRelatorio(codigo);
          io.to(codigo).emit('mostrar-relatorio', relatorio);
          io.to(`apresentador_${codigo}`).emit('mostrar-relatorio', relatorio);
        }
      }
    }, 1000);
  }

  // Função para enviar ranking
  function enviarRanking(codigo) {
    const sala = salas[codigo];
    if (!sala) return;
    const ranking = Object.values(sala.jogadores)
      .sort((a, b) => b.pontuacao - a.pontuacao)
      .map((j, i) => ({ posicao: i + 1, nome: j.nome, pontuacao: j.pontuacao, emoji: j.emoji }));
    io.to(codigo).emit('atualizar-ranking', ranking);
    io.to(`apresentador_${codigo}`).emit('atualizar-ranking', ranking);
  }

  // Função para finalizar jogo
  async function finalizarJogo(codigo) {
    const sala = salas[codigo];
    if (!sala) return;
    
    if (sala.timerInterval) clearInterval(sala.timerInterval);
    
    const ranking = Object.values(sala.jogadores).sort((a, b) => b.pontuacao - a.pontuacao);
    try {
      await pool.query('INSERT INTO partidas (quiz_id, codigo, ranking) VALUES ($1, $2, $3)',
        [sala.quiz_id, codigo, JSON.stringify(ranking)]);
    } catch (err) {
      console.error('Erro ao salvar partida:', err);
    }
    
    sala.jogoAtivo = false;
    sala.etapa = 'podio';
    
    io.to(codigo).emit('fim-jogo', { ranking: ranking });
    io.to(`apresentador_${codigo}`).emit('fim-jogo', { ranking: ranking });
  }

  socket.on('disconnect', () => {
    for (let codigo in salas) {
      if (salas[codigo].jogadores[socket.id]) {
        delete salas[codigo].jogadores[socket.id];
        io.to(codigo).emit('atualizar-jogadores', Object.values(salas[codigo].jogadores));
        io.to(`apresentador_${codigo}`).emit('atualizar-jogadores', Object.values(salas[codigo].jogadores));
        break;
      }
    }
  });
});

// ============ ROTAS DE ARQUIVOS ============
app.get('/host', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

app.get('/apresentador', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'apresentador.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║     🎮 SKA-HOOT FINAL! 🎮             ║
  ╠═══════════════════════════════════════╣
  ║  Acesse: http://localhost:${PORT}      ║
  ║  Host: http://localhost:${PORT}/host   ║
  ║  Apresentador: http://localhost:${PORT}/apresentador ║
  ║  Senha: ${SENHA_MESTRA}                ║
  ╚═══════════════════════════════════════╝
  `);
});
