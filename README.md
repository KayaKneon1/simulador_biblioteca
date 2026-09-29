# 1° PASSO DA AULA, PEDIR PARA INSTALAR

- `npm install express`: *CASO NÃO TENHAM O NODE_MODULES*;
- `npm install bcryptjs`: responsável por gerar o hash da senha e comparar em login;
- `npm install method-override`: si houver algum erro nos metodos override;
- `npm install cookie-parser`: leitura de cookies para obter o token no servidor;
- `npm install bcrypt jsonwebtoken dotenv`: carregamento das variáveis de ambiente.

# 2° PASSO:

- Criar um arquivo na *PASTA RAIZ* um *.env*

    ESCREVAM ESSE CÓDIGO:

    - DATABASE_URL='file:./dev.db' 
    - JWT_SECRET=uma_chave_muuito_secreta_aqui
    - JWT_EXPIRES_IN=1h

    @ `DATABASE_URL` : localizar o banco de dados;
    @ `JWT_SECRET`: chave secreta usada para assinar e validar os tokens; 
    @ `JWT_EXPIRES_IN`: tempo de expiração do token (por exemplo, `1h`).  

# 3° PASSO:

- ALTERE A TABELA USUÁRIOS DO PRISMA ACRESCENTANDO UM:

```prisma
model Usuario {
    [...]
  senha       String

  emprestimos Emprestimo[]
}
```
- APÓS ISSO:

- `npm install @prisma/client` *REINSTALAR O PRISMA CLIENT*;
- `npm install @prisma/adapter-better-sqlite3 better-sqlite3` *SI O BETTER-SQLITE DER ERRO POR CONTA DA INPORTAÇÃO*;
- `npx prisma generate` *GERAR PRISMA*;
- `npm install ejs` *INSTALAÇÃO DO EJS*;

# 4° PASSO:

'''NO APP.JS'''
- await prisma.usuario.create({data: {nome, email, senha: hashed}}) //ACIMA DAS ROTAS

//NO TRY DO /LOGIN

```app.js
  try {
    const usuario = await prisma.usuario.findUnique({ where: { email } });

    if (!usuario || usuario.senha !== senha) {
      return res.render('login.html', {
        erro: 'E-mail ou senha inválidos.',
        sucesso: null
      });
    }
  }
```

# 5° PASSO

- CRIAR UM MIDDLEWARE *auth.js* e acrescentar os comandos dentro:
```auth.js
const jwt = require('jsonwebtoken');

function autenticarJWT(req, res, next) {
    const authHeader = req.headers.authorization;

    const tokenFromHeader =
        authHeader && authHeader.startsWith('Bearer ')
            ? authHeader.split(' ')[1]
            : null;

    const token = tokenFromHeader || req.cookies?.token;

    if (!token) {
        return res.status(401).render('login.html', {
            erro: 'Autentique-se para continuar.', sucesso: null
        });
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.user = payload;
        return next();

    } catch (err) {
        console.error('Token inválido:', err.message);

        return res.status(401).render('login.html', {
            erro: 'Sessão inválida. Faça login novamente.',
            sucesso: null
        });
    }
}

function usuarioOpcional(req, res, next) {
    const token = req.cookies?.token;

    if (!token) {
        req.user = null;
        return next();
    }

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        req.user = null;
    }
    next();
}

module.exports = {
    autenticarJWT,
    usuarioOpcional
};
```

# 6° PASSO

NO *app.js* devemos retirar os seguintes códigos:

```app.js
const session = require('express-session');
```

Junto com isso:

```app.js
app.use(session({
  secret: 'lyclari-biblioteca-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 4 } // 4h
}));
```

AINDA NO *app.js* Adicionamos 



```app.js
require('dotenv').config();

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser')

const { autenticarJWT, usuarioOpcional } = require('./Middlewares/auth');
```

Depois do `const port = 5000;` adicione esse trecho do codigo:

```app.js
app.use(cookieParser());
```

Com tudo, vamos atualizar o acesso dos middlewares do *app.js*, esse trecho do código que seria alterado:


```app.js
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(logger);

app.use(usuarioOpcional);

app.use((req, res, next) => {
    res.locals.usuarioLogado = req.user || null;
    next();
});
```

# 7º Passo

A seguinte vai ser alteração do meio do código, a primeira alterção vai ser no `app.user`

```app.js
app.use((req, res, next) => {
  res.locals.usuarioLogado = req.session.usuario || null;
  next();
});
```

Retirando o `req.session.usuario` trocando para `req.user`, ficando assim:

```app.js
app.use((req, res, next) => {
  res.locals.usuarioLogado = req.user || null;
  next();
});
```

# 8º Passo

- *ACRESCENTAR autenticarJWT:*
    - /cadastrar-livro
    - /emprestar
    - /devolver/:id

Como seria a alteração:
```app.js
app.post('/emprestar',      autenticarJWT, async (req, res) => { /* ... */ });
app.post('/cadastrar-livro',    autenticarJWT, async (req, res) => { /* ... */ });
app.post('/devolver/:id',   autenticarJWT, async (req, res) => { /* ... */ });
```


- ALTERAR O */login* PARA: 

```app.js
app.get('/login', (req, res) => {

  if (req.user) {
    return res.redirect('/livros');
  }

  const sucesso = req.query.cadastro === 'ok'
    ? 'Conta criada com sucesso! Faça login para continuar.'
    : null;

  res.render('login.html', {
    erro: null,
    sucesso
  });
});
```

- ALTERAR O */cadastro* PARA:

```app.js
app.get('/cadastro', (req, res) => {
  if (req.user) {
    return res.redirect('/livros');
  }

  res.render('cadastro.html', {
    erro: null,
    sucesso: null
  });
});
```

- NO */login* REMOVER O SEGUINTE CÓDIGO:

```app.js
    req.session.usuario = {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email
    };
```

- APÓS A RETIRADA NO SEU LUGAR ADICIONE NA PARTE DE */login*:

```app.js
if (!usuario || !(await bcrypt.compare(senha, usuario.senha))) { [...] }

const token = jwt.sign(
  {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email
  },
  process.env.JWT_SECRET,
  {
    expiresIn: process.env.JWT_EXPIRES_IN || '1h'
  }
);

res.cookie('token', token, {
  httpOnly: true,
  secure: false
});

res.redirect('/livros');
```

- SUBSTITUA O */logout* POR:

```app.js
app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/login');
});
```

- NO */cadastrar-usuario* MUDE O:

```app.js
    // Cria o hash da senha antes de salvar no banco
    const senhaHash = await bcrypt.hash(senha, 12);

    await prisma.usuario.create({
      data: {
        nome,
        email,
        senha: senhaHash
      }
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
```

# 9º Passo

Si ja houver algo no banco de dados e quer criptografar os dados, crie `scripts/rehash-senhas.js`:

```rehash-senhas.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');

(async () => {
  const usuarios = await prisma.usuario.findMany();

  for (const u of usuarios) {
    if (!u.senha.startsWith('$2')) {
      const hashed = await bcrypt.hash(u.senha, 12);
      await prisma.usuario.update({
        where: { id: u.id },
        data: { senha: hashed }
      });
      console.log(`Re-hashed user ${u.id}`);
    }
  }

  console.log('Re-hash completo.');
  process.exit(0);
})();
```

