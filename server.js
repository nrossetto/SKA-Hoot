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
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const SENHA_MESTRA = process.env.SENHA_MESTRA || 'ska2026';

// Configurar armazenamento de arquivos
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

// ============ CONEXÃO COM POSTGRESQL ============
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

// ============ CRIAÇÃO DAS TABELAS SIMPLIFICADAS ============
async function initDatabase() {
  const client = await pool.connect();
  try {
    // Dropar tabelas existentes
    await client.query(`DROP TABLE IF EXISTS partidas`);
    await client.query(`DROP TABLE IF EXISTS perguntas`);
    await client.query(`DROP TABLE IF EXISTS quizzes`);
    
    // Tabela quizzes simplificada
    await client.query(`
      CREATE TABLE quizzes (
        id SERIAL PRIMARY KEY,
        nome TEXT UNIQUE NOT NULL,
        data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        musica_url TEXT,
        cor_fundo TEXT DEFAULT '#667eea'
      )
    `);
    
    // Tabela perguntas SIMPLIFICADA (sem campos de botão separados)
    await client.query(`
      CREATE TABLE perguntas (
        id SERIAL PRIMARY KEY,
        quiz_id INTEGER REFERENCES quizzes(id) ON DELETE CASCADE,
        texto TEXT,
        imagem_url TEXT,
        opcao_a TEXT,
        opcao_b TEXT,
        opcao_c TEXT,
        opcao_d TEXT,
        correta CHAR(1),
        tempo INTEGER DEFAULT 15
      )
    `);
    
    // Tabela partidas
    await client.query(`
      CREATE TABLE partidas (
        id SERIAL PRIMARY KEY,
        quiz_id INTEGER REFERENCES quizzes(id),
        codigo TEXT,
        data_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ranking TEXT
      )
    `);
    
    console.log('✅ Tabelas recriadas com sucesso!');
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
  const { senha } = req.body;
  res.json({ sucesso: senha === SENHA_MESTRA });
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
  const { nome } = req.body;
  try {
    const result = await pool.query('INSERT INTO quizzes (nome) VALUES ($1) RETURNING id', [nome]);
    res.json({ sucesso: true, id: result.rows[0].id });
  } catch (err) {
    res.json({ sucesso: false, erro: err.message });
  }
});

app.get('/api/quiz/listar', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, nome, data_criacao FROM quizzes ORDER BY data_criacao DESC');
    res.json({ sucesso: true, quizzes: result.rows });
  } catch (err) {
    res.json({ sucesso: false, erro: err.message });
  }
});

app.get('/api/quiz/carregar/:id', async (req, res) => {
  const quizId = req.params.id;
  try {
    const quizResult = await pool.query('SELECT * FROM quizzes WHERE id = $1', [quizId]);
    if (quizResult.rows.length === 0) {
      return res.json({ sucesso: false, erro: 'Quiz não encontrado' });
    }
    
    const perguntasResult = await pool.query('SELECT * FROM perguntas WHERE quiz_id = $1 ORDER BY id', [quizId]);
    
    res.json({ 
      sucesso: true, 
      quiz: quizResult.rows[0],
      perguntas: perguntasResult.rows 
    });
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
      // INSERT SIMPLIFICADO - 10 colunas apenas!
      await client.query(`
        INSERT INTO perguntas (
          quiz_id, texto, imagem_url,
          opcao_a, opcao_b, opcao_c, opcao_d,
          correta, tempo
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        quiz_id, 
        p.texto || '', 
        p.imagem_url || null,
        p.opcao_a_texto || '', 
        p.opcao_b_texto || '',
        p.opcao_c_texto || '', 
        p.opcao_d_texto || '',
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
    
    salas[codigo] = {
      codigo: codigo,
      quiz_id: quiz_id,
      quizNome: quizNome,
      jogadores: {},
      perguntas: result.rows,
      perguntaAtual: -1,
      ativo: true,
      jogoAtivo: false,
      pausado: false,
      respostasPerguntaAtual: {}
    };
    
    res.json({ sucesso: true, codigo: codigo });
  } catch (err) {
    res.json({ sucesso: false, erro: err.message });
  }
});

app.get('/api/sala/config/:codigo', async (req, res) => {
  const sala = salas[req.params.codigo];
  if (sala) {
    try {
      const result = await pool.query('SELECT cor_fundo FROM quizzes WHERE id = $1', [sala.quiz_id]);
      const quiz = result.rows[0];
      res.json({ sucesso: true, cor_fundo: quiz?.cor_fundo || '#667eea' });
    } catch (err) {
      res.json({ sucesso: false, erro: err.message });
    }
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

// ============ SOCKET.IO (SIMPLIFICADO) ============
io.on('connection', (socket) => {
  console.log('Novo jogador conectado:', socket.id);

  socket.on('entrar-sala', (data) => {
    const { codigo, nome } = data;
    
    if (salas[codigo] && salas[codigo].ativo) {
      let nomeFinal = nome || `Jogador${Object.keys(salas[codigo].jogadores).length + 1}`;
      let emoji = '🎮';
      const animais = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐸', '🐒', '🦉', '🐝'];
      emoji = animais[Math.floor(Math.random() * animais.length)];
      
      salas[codigo].jogadores[socket.id] = {
        id: socket.id,
        nome: nomeFinal,
        emoji: emoji,
        pontuacao: 0,
        respostas: []
      };
      
      socket.join(codigo);
      socket.emit('entrada-aceita', { nome: nomeFinal, emoji: emoji, quizNome: salas[codigo].quizNome });
      io.to(codigo).emit('atualizar-jogadores', Object.values(salas[codigo].jogadores));
    } else {
      socket.emit('erro', 'Código inválido');
    }
  });

  socket.on('host-conectar', (codigo) => {
    if (salas[codigo]) {
      socket.join(`host_${codigo}`);
      socket.emit('host-entrada-aceita', { sucesso: true });
      socket.emit('atualizar-jogadores', Object.values(salas[codigo].jogadores));
      enviarRanking(codigo);
    }
  });

  socket.on('iniciar-jogo', (codigo) => {
    if (salas[codigo] && salas[codigo].perguntas.length > 0) {
      salas[codigo].jogoAtivo = true;
      salas[codigo].perguntaAtual = 0;
      io.to(codigo).emit('jogo-iniciado');
      enviarPergunta(codigo, 0);
    }
  });

  socket.on('responder', (data) => {
    const { codigo, resposta, tempoRestante } = data;
    const sala = salas[codigo];
    if (!sala || !sala.jogoAtivo) return;
    
    const pergunta = sala.perguntas[sala.perguntaAtual];
    if (!pergunta) return;
    if (sala.respostasPerguntaAtual[socket.id]) return;
    
    const isCorreta = resposta === pergunta.correta;
    let pontos = 0;
    if (isCorreta && tempoRestante > 0) {
      pontos = Math.floor((tempoRestante / pergunta.tempo) * 1000);
    }
    if (isCorreta) {
      sala.jogadores[socket.id].pontuacao += pontos;
    }
    
    sala.respostasPerguntaAtual[socket.id] = { resposta, correta: isCorreta, pontos };
    
    let respostaCompleta = '';
    if (pergunta.correta === 'A') respostaCompleta = pergunta.opcao_a;
    else if (pergunta.correta === 'B') respostaCompleta = pergunta.opcao_b;
    else if (pergunta.correta === 'C') respostaCompleta = pergunta.opcao_c;
    else if (pergunta.correta === 'D') respostaCompleta = pergunta.opcao_d;
    
    socket.emit('feedback', { correta: isCorreta, pontos, respostaCorreta: respostaCompleta });
    enviarRanking(codigo);
    
    if (Object.keys(sala.respostasPerguntaAtual).length === Object.keys(sala.jogadores).length) {
      proximaPergunta(codigo);
    }
  });
  
  socket.on('proxima-pergunta', (codigo) => {
    proximaPergunta(codigo);
  });
  
  function enviarPergunta(codigo, indice) {
    const sala = salas[codigo];
    if (!sala || indice >= sala.perguntas.length) {
      finalizarJogo(codigo);
      return;
    }
    
    const pergunta = sala.perguntas[indice];
    sala.respostasPerguntaAtual = {};
    sala.perguntaAtual = indice;
    
    // Para o host: mostrar as 4 opções completas
    const dadosHost = {
      pergunta: {
        texto: pergunta.texto,
        imagem_url: pergunta.imagem_url,
        tempo: pergunta.tempo,
        opcoes: {
          A: pergunta.opcao_a,
          B: pergunta.opcao_b,
          C: pergunta.opcao_c,
          D: pergunta.opcao_d
        }
      }
    };
    
    // Para o jogador: mostrar apenas as opções simplificadas (A, B, C, D)
    const dadosJogador = {
      pergunta: {
        texto: pergunta.texto,
        imagem_url: pergunta.imagem_url,
        tempo: pergunta.tempo
      },
      botoes: {
        A: 'A',
        B: 'B', 
        C: 'C',
        D: 'D'
      }
    };
    
    io.to(codigo).emit('nova-pergunta-jogador', dadosJogador);
    io.to(`host_${codigo}`).emit('nova-pergunta-host', dadosHost);
    
    // Timer automático
    setTimeout(() => {
      if (sala.perguntaAtual === indice && sala.jogoAtivo) {
        proximaPergunta(codigo);
      }
    }, pergunta.tempo * 1000);
  }
  
  function enviarRanking(codigo) {
    const sala = salas[codigo];
    if (!sala) return;
    const ranking = Object.values(sala.jogadores).sort((a, b) => b.pontuacao - a.pontuacao)
      .map((j, i) => ({ posicao: i + 1, nome: j.nome, pontuacao: j.pontuacao, emoji: j.emoji }));
    io.to(codigo).emit('atualizar-ranking', ranking);
    io.to(`host_${codigo}`).emit('atualizar-ranking', ranking);
  }
  
  function proximaPergunta(codigo) {
    const sala = salas[codigo];
    if (!sala || !sala.jogoAtivo) return;
    const proximoIndice = sala.perguntaAtual + 1;
    if (proximoIndice < sala.perguntas.length) {
      enviarPergunta(codigo, proximoIndice);
    } else {
      finalizarJogo(codigo);
    }
    enviarRanking(codigo);
  }
  
  async function finalizarJogo(codigo) {
    const sala = salas[codigo];
    if (!sala) return;
    const ranking = Object.values(sala.jogadores).sort((a, b) => b.pontuacao - a.pontuacao);
    try {
      await pool.query('INSERT INTO partidas (quiz_id, codigo, ranking) VALUES ($1, $2, $3)',
        [sala.quiz_id, codigo, JSON.stringify(ranking)]);
    } catch (err) {
      console.error('Erro ao salvar partida:', err);
    }
    io.to(codigo).emit('fim-jogo', { ranking });
    io.to(`host_${codigo}`).emit('fim-jogo', { ranking });
    sala.jogoAtivo = false;
  }
  
  socket.on('disconnect', () => {
    for (let codigo in salas) {
      if (salas[codigo].jogadores[socket.id]) {
        delete salas[codigo].jogadores[socket.id];
        io.to(codigo).emit('atualizar-jogadores', Object.values(salas[codigo].jogadores));
        io.to(`host_${codigo}`).emit('atualizar-jogadores', Object.values(salas[codigo].jogadores));
        enviarRanking(codigo);
        break;
      }
    }
  });
});

app.get('/host', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

app.get('/game-control', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'game-control.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║     🎮 SKA-HOOT SIMPLIFICADO! 🎮      ║
  ╠═══════════════════════════════════════╣
  ║  Acesse: http://localhost:${PORT}      ║
  ║  Tela do Host: http://localhost:${PORT}/host ║
  ║  Senha Mestra: ${SENHA_MESTRA}         ║
  ╚═══════════════════════════════════════╝
  `);
});
