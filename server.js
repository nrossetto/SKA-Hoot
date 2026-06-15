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

// Criar pasta de uploads se não existir
if (!fs.existsSync('public/uploads')) {
  fs.mkdirSync('public/uploads', { recursive: true });
}

// ============ CONEXÃO COM POSTGRESQL ============
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/skahoot',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Erro ao conectar ao PostgreSQL:', err.stack);
  } else {
    console.log('✅ Conectado ao PostgreSQL!');
    release();
  }
});

// ============ CRIAÇÃO DAS TABELAS COM MIGRAÇÕES ============
async function initDatabase() {
  const client = await pool.connect();
  try {
    // Tabela de quizzes
    await client.query(`
      CREATE TABLE IF NOT EXISTS quizzes (
        id SERIAL PRIMARY KEY,
        nome TEXT UNIQUE NOT NULL,
        data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Tabela de perguntas
    await client.query(`
      CREATE TABLE IF NOT EXISTS perguntas (
        id SERIAL PRIMARY KEY,
        quiz_id INTEGER REFERENCES quizzes(id) ON DELETE CASCADE,
        texto TEXT,
        opcao_a_texto TEXT,
        opcao_b_texto TEXT,
        opcao_c_texto TEXT,
        opcao_d_texto TEXT,
        correta CHAR(1),
        tempo INTEGER DEFAULT 15
      )
    `);
    
    // Tabela de partidas
    await client.query(`
      CREATE TABLE IF NOT EXISTS partidas (
        id SERIAL PRIMARY KEY,
        quiz_id INTEGER REFERENCES quizzes(id),
        codigo TEXT,
        data_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ranking TEXT
      )
    `);
    
    // MIGRAÇÕES: Adicionar todas as colunas que podem estar faltando
    console.log('🔄 Verificando migrações...');
    
    // Colunas da tabela quizzes
    const quizColumns = [
      'ADD COLUMN IF NOT EXISTS musica_url TEXT',
      'ADD COLUMN IF NOT EXISTS cor_fundo TEXT DEFAULT \'#667eea\'',
      'ADD COLUMN IF NOT EXISTS logo_base64 TEXT',
      'ADD COLUMN IF NOT EXISTS logo_tipo TEXT'
    ];
    
    for (const col of quizColumns) {
      try {
        await client.query(`ALTER TABLE quizzes ${col}`);
        console.log(`  ✅ quizzes: ${col}`);
      } catch (err) {
        console.log(`  ⚠️ quizzes: ${col} - ${err.message}`);
      }
    }
    
    // Colunas da tabela perguntas
    const perguntaColumns = [
      'ADD COLUMN IF NOT EXISTS imagem_url TEXT',
      'ADD COLUMN IF NOT EXISTS opcao_a_botao TEXT',
      'ADD COLUMN IF NOT EXISTS opcao_b_botao TEXT',
      'ADD COLUMN IF NOT EXISTS opcao_c_botao TEXT',
      'ADD COLUMN IF NOT EXISTS opcao_d_botao TEXT'
    ];
    
    for (const col of perguntaColumns) {
      try {
        await client.query(`ALTER TABLE perguntas ${col}`);
        console.log(`  ✅ perguntas: ${col}`);
      } catch (err) {
        console.log(`  ⚠️ perguntas: ${col} - ${err.message}`);
      }
    }
    
    console.log('✅ Migrações aplicadas com sucesso!');
  } catch (err) {
    console.error('❌ Erro ao criar tabelas:', err);
  } finally {
    client.release();
  }
}

initDatabase();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static('public/uploads'));

// Estado do jogo em memória
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
  if (!req.file) {
    return res.json({ sucesso: false, erro: 'Nenhum arquivo enviado' });
  }
  const url = `/uploads/${req.file.filename}`;
  res.json({ sucesso: true, url: url });
});

app.post('/api/upload/imagem', upload.single('imagem'), (req, res) => {
  if (!req.file) {
    return res.json({ sucesso: false, erro: 'Nenhum arquivo enviado' });
  }
  const url = `/uploads/${req.file.filename}`;
  res.json({ sucesso: true, url: url });
});

app.post('/api/quiz/criar', async (req, res) => {
  const { nome } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO quizzes (nome) VALUES ($1) RETURNING id',
      [nome]
    );
    res.json({ sucesso: true, id: result.rows[0].id });
  } catch (err) {
    res.json({ sucesso: false, erro: err.message });
  }
});

app.get('/api/quiz/listar', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nome, data_criacao, musica_url, cor_fundo FROM quizzes ORDER BY data_criacao DESC'
    );
    res.json({ sucesso: true, quizzes: result.rows });
  } catch (err) {
    res.json({ sucesso: false, erro: err.message });
  }
});

app.get('/api/quiz/carregar/:id', async (req, res) => {
  const quizId = req.params.id;
  try {
    const quizResult = await pool.query(
      'SELECT * FROM quizzes WHERE id = $1',
      [quizId]
    );
    
    if (quizResult.rows.length === 0) {
      return res.json({ sucesso: false, erro: 'Quiz não encontrado' });
    }
    
    const perguntasResult = await pool.query(
      'SELECT * FROM perguntas WHERE quiz_id = $1 ORDER BY id',
      [quizId]
    );
    
    const quiz = quizResult.rows[0];
    res.json({ 
      sucesso: true, 
      quiz: quiz,
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
    
    await client.query(
      'UPDATE quizzes SET nome = $1, cor_fundo = $2, musica_url = $3 WHERE id = $4',
      [nome, cor_fundo, musica_url || null, quiz_id]
    );
    
    await client.query('DELETE FROM perguntas WHERE quiz_id = $1', [quiz_id]);
    
    const perguntasData = JSON.parse(perguntas);
    
    for (const p of perguntasData) {
      await client.query(`
        INSERT INTO perguntas (
          quiz_id, texto, imagem_url,
          opcao_a_texto, opcao_a_botao,
          opcao_b_texto, opcao_b_botao,
          opcao_c_texto, opcao_c_botao,
          opcao_d_texto, opcao_d_botao,
          correta, tempo
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        quiz_id, p.texto, p.imagem_url || null,
        p.opcao_a_texto, p.opcao_a_botao,
        p.opcao_b_texto, p.opcao_b_botao,
        p.opcao_c_texto, p.opcao_c_botao,
        p.opcao_d_texto, p.opcao_d_botao,
        p.correta, p.tempo || 15
      ]);
    }
    
    await client.query('COMMIT');
    res.json({ sucesso: true });
  } catch (err) {
    await client.query('ROLLBACK');
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
    const result = await pool.query(
      'SELECT * FROM perguntas WHERE quiz_id = $1 ORDER BY id',
      [quiz_id]
    );
    
    if (result.rows.length === 0) {
      return res.json({ sucesso: false, erro: 'Quiz sem perguntas' });
    }
    
    const quizResult = await pool.query(
      'SELECT musica_url FROM quizzes WHERE id = $1',
      [quiz_id]
    );
    const musicaUrl = quizResult.rows[0]?.musica_url || null;
    
    salas[codigo] = {
      codigo: codigo,
      quiz_id: quiz_id,
      quizNome: quizNome,
      musica_url: musicaUrl,
      jogadores: {},
      perguntas: result.rows,
      perguntaAtual: -1,
      ativo: true,
      jogoAtivo: false,
      pausado: false,
      respostasPerguntaAtual: {}
    };
    
    res.json({ sucesso: true, codigo: codigo, musica_url: musicaUrl });
  } catch (err) {
    res.json({ sucesso: false, erro: err.message });
  }
});

app.get('/api/sala/config/:codigo', async (req, res) => {
  const sala = salas[req.params.codigo];
  if (sala) {
    try {
      const result = await pool.query(
        'SELECT cor_fundo, logo_base64 FROM quizzes WHERE id = $1',
        [sala.quiz_id]
      );
      const quiz = result.rows[0];
      res.json({ 
        sucesso: true, 
        cor_fundo: quiz?.cor_fundo || '#667eea',
        logo_base64: quiz?.logo_base64 || null
      });
    } catch (err) {
      res.json({ sucesso: false, erro: err.message });
    }
  } else {
    res.json({ sucesso: false });
  }
});

app.get('/api/sala/musica/:codigo', async (req, res) => {
  const sala = salas[req.params.codigo];
  if (sala && sala.musica_url) {
    res.json({ sucesso: true, musica_url: sala.musica_url });
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
      socket.emit('entrada-aceita', { 
        nome: nomeFinal, 
        emoji: emoji,
        quizNome: salas[codigo].quizNome
      });
      
      io.to(codigo).emit('atualizar-jogadores', Object.values(salas[codigo].jogadores));
    } else {
      socket.emit('erro', 'Código inválido ou sala inativa');
    }
  });

  socket.on('host-conectar', (codigo) => {
    if (salas[codigo]) {
      socket.join(`host_${codigo}`);
      socket.emit('host-entrada-aceita', { sucesso: true });
      socket.emit('atualizar-jogadores', Object.values(salas[codigo].jogadores));
      enviarRanking(codigo);
      
      if (salas[codigo].musica_url) {
        socket.emit('musica-url', salas[codigo].musica_url);
      }
    }
  });

  socket.on('pausar-jogo', (codigo) => {
    const sala = salas[codigo];
    if (sala && sala.jogoAtivo) {
      sala.pausado = true;
      io.to(codigo).emit('jogo-pausado');
      io.to(`host_${codigo}`).emit('jogo-pausado');
    }
  });

  socket.on('retomar-jogo', (codigo) => {
    const sala = salas[codigo];
    if (sala && sala.jogoAtivo) {
      sala.pausado = false;
      io.to(codigo).emit('jogo-retomado');
      io.to(`host_${codigo}`).emit('jogo-retomado');
    }
  });

  socket.on('iniciar-jogo', (codigo) => {
    if (salas[codigo] && salas[codigo].perguntas.length > 0) {
      salas[codigo].jogoAtivo = true;
      salas[codigo].pausado = false;
      salas[codigo].perguntaAtual = 0;
      io.to(codigo).emit('jogo-iniciado');
      enviarPergunta(codigo, 0);
    }
  });

  socket.on('responder', (data) => {
    const { codigo, resposta, tempoRestante } = data;
    const sala = salas[codigo];
    
    if (!sala || !sala.jogoAtivo || sala.pausado) return;
    
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
    
    sala.respostasPerguntaAtual[socket.id] = {
      resposta: resposta,
      correta: isCorreta,
      pontos: pontos
    };
    
    let respostaCompleta = '';
    if (pergunta.correta === 'A') respostaCompleta = pergunta.opcao_a_texto;
    else if (pergunta.correta === 'B') respostaCompleta = pergunta.opcao_b_texto;
    else if (pergunta.correta === 'C') respostaCompleta = pergunta.opcao_c_texto;
    else if (pergunta.correta === 'D') respostaCompleta = pergunta.opcao_d_texto;
    
    socket.emit('feedback', {
      correta: isCorreta,
      pontos: pontos,
      respostaCorreta: respostaCompleta
    });
    
    enviarRanking(codigo);
    
    const totalJogadores = Object.keys(sala.jogadores).length;
    const totalRespostas = Object.keys(sala.respostasPerguntaAtual).length;
    
    if (totalRespostas === totalJogadores) {
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
    
    const dadosJogador = {
      pergunta: {
        texto: pergunta.texto,
        imagem_url: pergunta.imagem_url,
        tempo: pergunta.tempo
      },
      botoes: {
        A: pergunta.opcao_a_botao || '★',
        B: pergunta.opcao_b_botao || '▲',
        C: pergunta.opcao_c_botao || '●',
        D: pergunta.opcao_d_botao || '■'
      }
    };
    
    const dadosHost = {
      pergunta: {
        texto: pergunta.texto,
        imagem_url: pergunta.imagem_url,
        tempo: pergunta.tempo,
        opcoes: {
          A: pergunta.opcao_a_texto,
          B: pergunta.opcao_b_texto,
          C: pergunta.opcao_c_texto,
          D: pergunta.opcao_d_texto
        }
      }
    };
    
    io.to(codigo).emit('nova-pergunta-jogador', dadosJogador);
    io.to(`host_${codigo}`).emit('nova-pergunta-host', dadosHost);
    
    let tempoRestante = pergunta.tempo;
    const timerInterval = setInterval(() => {
      if (!sala.jogoAtivo) {
        clearInterval(timerInterval);
        return;
      }
      
      if (sala.pausado) return;
      
      tempoRestante--;
      if (tempoRestante <= 0) {
        clearInterval(timerInterval);
        if (sala.perguntaAtual === indice && sala.jogoAtivo) {
          proximaPergunta(codigo);
        }
      }
    }, 1000);
    
    sala.timerInterval = timerInterval;
  }
  
  function enviarRanking(codigo) {
    const sala = salas[codigo];
    if (!sala) return;
    
    const ranking = Object.values(sala.jogadores)
      .sort((a, b) => b.pontuacao - a.pontuacao)
      .map((j, i) => ({ posicao: i + 1, nome: j.nome, pontuacao: j.pontuacao, emoji: j.emoji }));
    
    io.to(codigo).emit('atualizar-ranking', ranking);
    io.to(`host_${codigo}`).emit('atualizar-ranking', ranking);
  }
  
  function proximaPergunta(codigo) {
    const sala = salas[codigo];
    if (!sala || !sala.jogoAtivo) return;
    
    if (sala.timerInterval) clearInterval(sala.timerInterval);
    
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
    
    if (sala.timerInterval) clearInterval(sala.timerInterval);
    
    const ranking = Object.values(sala.jogadores)
      .sort((a, b) => b.pontuacao - a.pontuacao);
    
    try {
      await pool.query(
        'INSERT INTO partidas (quiz_id, codigo, ranking) VALUES ($1, $2, $3)',
        [sala.quiz_id, codigo, JSON.stringify(ranking)]
      );
    } catch (err) {
      console.error('Erro ao salvar partida:', err);
    }
    
    io.to(codigo).emit('fim-jogo', { ranking: ranking });
    io.to(`host_${codigo}`).emit('fim-jogo', { ranking: ranking });
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

// Servir arquivos
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
  ║     🎮 SKA-HOOT 2.0 FINAL! 🎮         ║
  ╠═══════════════════════════════════════╣
  ║  Acesse: http://localhost:${PORT}      ║
  ║  Tela do Host: http://localhost:${PORT}/host ║
  ║  Controle: http://localhost:${PORT}/game-control ║
  ║  Senha Mestra: ${SENHA_MESTRA}         ║
  ╚═══════════════════════════════════════╝
  `);
});
