const express = require('express');
const methodOverride = require('method-override');
const path = require('path');

require('dotenv').config();

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const { autenticarJWT, usuarioOpcional} = require('./Middlewares/auth');

const logger = require('./Middlewares/logger');
const prisma = require('./lib/prisma');

const app = express();
const port = 5000;

app.use(cookieParser());

// ===== Middlewares básicos =====
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(logger);

app.use(usuarioOpcional)

app.use((req, res, next) => {
  res.locals.usuarioLogado = req.user || null;
  next();
})

// ===== EJS como engine para .html =====
app.engine('html', require('ejs').__express);
app.set('view engine', 'html');
app.set('views', path.join(__dirname, 'views', 'html'));

// ===== Arquivos estáticos =====
app.use('/css', express.static(path.join(__dirname, 'views', 'css')));
app.use('/js',  express.static(path.join(__dirname, 'views', 'js')));

// ===== Disponibiliza usuário logado em todas as views =====
app.use((req, res, next) => {
  res.locals.usuarioLogado = req.user || null;
  next();
});

// ===== Helper: renderizarIndex =====
async function renderizarIndex(res, abaAtiva, dadosExtras = {}) {
  const livros = await prisma.livro.findMany({ orderBy: { id: 'asc' } });
  const usuarios = await prisma.usuario.findMany({ orderBy: { id: 'asc' } });

  const emprestimosBanco = await prisma.emprestimo.findMany({
    include: { livro: true, usuario: true }
  });

  const emprestimos = emprestimosBanco.map(e => ({
    id: e.id,
    livro: e.livro?.titulo ?? '(livro removido)',
    usuario: e.usuario?.nome ?? '(usuário removido)'
  }));

  res.render('index.html', {
    abaAtiva,
    livros,
    usuarios,
    emprestimos,
    ...dadosExtras
  });
}

// =========================================================
// ROTAS GET
// =========================================================

app.get('/',            async (req, res) => renderizarIndex(res, 'livros'));
app.get('/livros',      autenticarJWT, async (req, res) => renderizarIndex(res, 'livros'));
app.get('/usuarios',    autenticarJWT, async (req, res) => renderizarIndex(res, 'usuarios'));
app.get('/emprestados', autenticarJWT, async (req, res) => renderizarIndex(res, 'emprestados'));

// Aba interna do index: cadastro de livro
app.get('/cadastro-livro', async (req, res) => renderizarIndex(res, 'cadastro-livro'));

// Página separada de login
app.get('/login', (req, res) => {
  if (req.user) {
    return res.redirect('/livros')
  }

  const sucesso = req.query.cadastro === 'ok'
    ? 'Conta criada com sucesso! Faça login para continuar.'
    :null

  res.render('login.html', {
    erro: null,
    sucesso
  })
});

// Página separada de cadastro (link do /login)
app.get('/cadastro', (req, res) => {
  if (req.user) return res.redirect('/livros');
  res.render('cadastro.html', { erro: null, sucesso: null });
});

// =========================================================
// AUTENTICAÇÃO
// =========================================================

// Cadastrar usuário (vem apenas da página /cadastro)
app.post('/cadastrar-usuario', async (req, res) => {
  const { nome, email, senha, confirmarSenha } = req.body;

  try {
    if (!nome || !email || !senha || !confirmarSenha) {
      return res.render('cadastro.html', {
        erro: 'Preencha todos os campos.',
        sucesso: null
      });
    }
    if (senha !== confirmarSenha) {
      return res.render('cadastro.html', {
        erro: 'As senhas não coincidem.',
        sucesso: null
      });
    }
    if (senha.length < 6) {
      return res.render('cadastro.html', {
        erro: 'A senha deve ter no mínimo 6 caracteres.',
        sucesso: null
      });
    }

    const existente = await prisma.usuario.findUnique({ where: { email } });
    if (existente) {
      return res.render('cadastro.html', {
        erro: 'Este e-mail já está cadastrado.',
        sucesso: null
      });
    }

    const senhaHash = await bcrypt.hash(senha, 12)
    await prisma.usuario.create({
      data: { nome, email, senha: senhaHash }
    });

    return res.redirect('/login?cadastro=ok');
  } catch (erro) {
    console.error('Erro ao cadastrar usuário:', erro);

    return res.render('cadastro.html', {
      erro: 'Erro ao cadastrar usuário. Tente novamente.',
      sucesso: null
    });
  }
});

// Login
app.post('/login', async (req, res) => {
  const { email, senha } = req.body;

  try {
    const usuario = await prisma.usuario.findUnique({ where: { email } });

    // ⚠️ Sem hash: comparação direta de string
    if (!usuario || usuario.senha !== senha) {
      return res.render('login.html', {
        erro: 'E-mail ou senha inválidos.',
        sucesso: null
      });
    }

    if (!usuario || !(await bcrypt.compare(senha, usuario.senha))){

      const token = jwt.sign(
        {
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email
        },
        process.env.JWT_SECRET,
        {
          expiresIn: process.env.JWT_EXPIRES_IN || "1h"
        }
      )
    };

    res.cookie('token', token, {
      httpOnly: true,
      secure: false
    })

    res.redirect('/livros');
  } catch (erro) {
    console.error('Erro no login:', erro);
    res.render('login.html', { erro: 'Erro ao fazer login.', sucesso: null });
  }
});

// Logout
app.get('/logout', (req, res) => {
  res.redirect('/login');
});

// =========================================================
// LIVROS
// =========================================================

// Busca
app.post('/busca', async (req, res) => {
  try {
    const titulo = (req.body.nome || '').trim();

    const livros = await prisma.livro.findMany({
      where: { titulo: { contains: titulo } },
      orderBy: { id: 'asc' }
    });
    const usuarios = await prisma.usuario.findMany({ orderBy: { id: 'asc' } });
    const emprestimosBanco = await prisma.emprestimo.findMany({
      include: { livro: true, usuario: true }
    });
    const emprestimos = emprestimosBanco.map(e => ({
      id: e.id,
      livro: e.livro?.titulo ?? '(livro removido)',
      usuario: e.usuario?.nome ?? '(usuário removido)'
    }));

    res.render('index.html', {
      abaAtiva: 'livros',
      livros,
      usuarios,
      emprestimos
    });
  } catch (erro) {
    console.error('Erro na busca:', erro);
    res.status(500).send('Erro na busca');
  }
});

// Cadastrar livro
app.post('/cadastrar-livro', autenticarJWT, async (req, res) => {
  try {
    const { titulo, autor, ano, categoria, imagemUrl, descricao } = req.body;

    await prisma.livro.create({
      data: {
        titulo,
        autor,
        ano: Number(ano),
        categoria,
        imagemUrl: imagemUrl || '',
        descricao: descricao || '',
        status: 'disponivel'
      }
    });

    res.redirect('/livros');
  } catch (erro) {
    console.error('Erro ao cadastrar livro:', erro);
    res.status(500).send('Erro ao cadastrar livro');
  }
});

// Form de edição
app.get('/editar-livro', async (req, res) => {
  try {
    const livro = await prisma.livro.findUnique({
      where: { id: Number(req.query.id) }
    });
    if (!livro) return res.status(404).send('Livro não encontrado.');

    res.render('editar-livro.html', { livro });
  } catch (erro) {
    console.error('Erro ao buscar livro:', erro);
    res.status(500).send('Erro ao buscar livro');
  }
});

// Atualizar livro
app.put('/livros/:id', async (req, res) => {
  try {
    const { titulo, autor, ano, categoria, imagemUrl, descricao } = req.body;

    await prisma.livro.update({
      where: { id: Number(req.params.id) },
      data: {
        titulo,
        autor,
        ano: Number(ano),
        categoria,
        imagemUrl,
        descricao
      }
    });

    res.redirect('/livros');
  } catch (erro) {
    console.error('Erro ao atualizar livro:', erro);
    res.status(500).send('Erro ao atualizar livro');
  }
});

// Excluir livro
app.delete('/livros', async (req, res) => {
  try {
    const id = Number(req.body.id);

    const emprestimo = await prisma.emprestimo.findFirst({
      where: { livroId: id }
    });
    if (emprestimo) {
      await prisma.emprestimo.delete({ where: { id: emprestimo.id } });
    }

    await prisma.livro.delete({ where: { id } });
    res.redirect('/livros');
  } catch (erro) {
    console.error('Erro ao excluir livro:', erro);
    res.status(500).send('Erro ao excluir livro');
  }
});

// =========================================================
// USUÁRIOS
// =========================================================

// Atualizar usuário
app.put('/usuarios', async (req, res) => {
  try {
    const { id, nome, email } = req.body;

    await prisma.usuario.update({
      where: { id: Number(id) },
      data: { nome, email }
    });

    res.redirect('/usuarios');
  } catch (erro) {
    console.error('Erro ao atualizar usuário:', erro);
    res.status(500).send('Erro ao atualizar usuário');
  }
});

// Excluir usuário
app.delete('/usuarios', async (req, res) => {
  try {
    const id = Number(req.body.id);

    await prisma.emprestimo.deleteMany({ where: { usuarioId: id } });
    await prisma.usuario.delete({ where: { id } });

    res.redirect('/usuarios');
  } catch (erro) {
    console.error('Erro ao excluir usuário:', erro);
    res.status(500).send('Erro ao excluir usuário');
  }
});

// =========================================================
// EMPRÉSTIMOS
// =========================================================

// Emprestar
app.post('/emprestar', async (req, res) => {
  try {
    const { livroId, usuarioId } = req.body;

    const livro = await prisma.livro.findUnique({ where: { id: Number(livroId) } });
    const usuario = await prisma.usuario.findUnique({ where: { id: Number(usuarioId) } });

    if (!livro || !usuario) {
      return res.status(404).send('Livro ou usuário não encontrado.');
    }
    if (livro.status !== 'disponivel') {
      return res.status(400).send('Este livro já está emprestado.');
    }

    await prisma.emprestimo.create({
      data: { livroId: livro.id, usuarioId: usuario.id }
    });

    await prisma.livro.update({
      where: { id: livro.id },
      data: { status: 'emprestado' }
    });

    res.redirect('/emprestados');
  } catch (erro) {
    console.error('Erro ao emprestar:', erro);
    res.status(500).send('Erro ao emprestar livro');
  }
});

// Devolver
app.post('/devolver/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);

    const emprestimo = await prisma.emprestimo.findUnique({ where: { id } });
    if (!emprestimo) {
      return res.status(404).send('Empréstimo não encontrado.');
    }

    await prisma.livro.update({
      where: { id: emprestimo.livroId },
      data: { status: 'disponivel' }
    });

    await prisma.emprestimo.delete({ where: { id } });

    res.redirect('/emprestados');
  } catch (erro) {
    console.error('Erro ao devolver:', erro);
    res.status(500).send('Erro ao devolver livro');
  }
});

// =========================================================
// Tratamento global de erros
// =========================================================
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).send('Erro interno do servidor');
});

app.listen(port, () => {
  console.log(`Servidor rodando: http://localhost:${port}`);
});