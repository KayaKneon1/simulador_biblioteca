const express = require('express');
const methodOverride = require('method-override');
const path = require('path');

const logger = require('./Middlewares/logger');
const prisma = require('./lib/prisma');

const app = express();
const port = 5000;

// ===== Middlewares =====
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(logger);

// ===== EJS como engine para .html =====
app.engine('html', require('ejs').__express);
app.set('view engine', 'html');
app.set('views', path.join(__dirname, 'views', 'html'));

// ===== Arquivos estáticos (css e js) =====
app.use('/css', express.static(path.join(__dirname, 'views', 'css')));
app.use('/js',  express.static(path.join(__dirname, 'views', 'js')));

// ===== Helper: busca tudo do banco e renderiza =====
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

// ===== Rotas GET =====
app.get('/',            async (req, res) => renderizarIndex(res, 'livros'));
app.get('/livros',      async (req, res) => renderizarIndex(res, 'livros'));
app.get('/usuarios',    async (req, res) => renderizarIndex(res, 'usuarios'));
app.get('/emprestados', async (req, res) => renderizarIndex(res, 'emprestados'));
app.get('/cadastro',    async (req, res) => renderizarIndex(res, 'cadastro'));

// ===== Busca por título =====
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

// ===== Cadastrar usuário =====
app.post('/cadastrar-usuario', async (req, res) => {
  try {
    await prisma.usuario.create({
      data: {
        nome: req.body.nome,
        email: req.body.email
      }
    });
    res.redirect('/usuarios');
  } catch (erro) {
    console.error('Erro ao cadastrar usuário:', erro);
    res.status(500).send('Erro ao cadastrar usuário');
  }
});

// ===== Cadastrar livro =====
app.post('/cadastrar-livro', async (req, res) => {
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

// ===== Emprestar livro =====
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
      data: {
        livroId: livro.id,
        usuarioId: usuario.id
      }
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

// ===== Devolver livro =====
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

// ===== Editar livro (form) =====
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

// ===== Atualizar livro =====
app.put('/livros', async (req, res) => {
  try {
    const { id, titulo, autor, ano, categoria, imagemUrl, descricao } = req.body;

    await prisma.livro.update({
      where: { id: Number(id) },
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

// ===== Atualizar usuário =====
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

// ===== Excluir usuário =====
app.delete('/usuarios', async (req, res) => {
  try {
    await prisma.usuario.delete({ where: { id: Number(req.body.id) } });
    res.redirect('/usuarios');
  } catch (erro) {
    console.error('Erro ao excluir usuário:', erro);
    res.status(500).send('Erro ao excluir usuário');
  }
});

// ===== Excluir livro =====
app.delete('/livros', async (req, res) => {
  try {
    await prisma.livro.delete({ where: { id: Number(req.body.id) } });
    res.redirect('/livros');
  } catch (erro) {
    console.error('Erro ao excluir livro:', erro);
    res.status(500).send('Erro ao excluir livro');
  }
});

// ===== Tratamento global de erros =====
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).send('Erro interno do servidor');
});

app.listen(port, () => {
  console.log(`Servidor rodando: http://localhost:${port}`);
});