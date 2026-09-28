# Aula: autenticação com Bcrypt e JWT

Este roteiro usa a aplicação Express + EJS + Prisma da pasta `biblioteca_project`. O objetivo é cadastrar usuários com senha hasheada, autenticar com JWT e exigir autenticação nas rotas da biblioteca.

> A aplicação atual ainda usa `express-session`, compara senhas em texto puro e não protege as rotas do acervo. Este roteiro substitui esse fluxo. As páginas `login.html` e `cadastro.html` já servem para a aula; o CRUD existente será usado como exemplo de rotas privadas.

## 1. Preparar o terminal e proteger os dados locais

Abra um terminal PowerShell na raiz do repositório:

```powershell
cd .\biblioteca_project
```

A aplicação já possui um banco `dev.db`. Para preservar os dados existentes e ter um banco descartável para a aula, adicione `*.db` ao `.gitignore` dentro de `biblioteca_project` e configure o ambiente para usar `aula.db`. O arquivo `.env` já é ignorado pelo Git.

Gere uma chave aleatória para o JWT:

```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Crie `biblioteca_project/.env` e coloque o valor gerado em `JWT_SECRET`:

```env
DATABASE_URL="file:./aula.db"
JWT_SECRET="COLE_AQUI_O_VALOR_GERADO"
```

Não use um segredo fixo no código nem publique o arquivo `.env`.

## 2. Instalar dependências

```powershell
npm install bcryptjs jsonwebtoken cookie-parser
```

- `bcryptjs` gera e compara hashes de senha.
- `jsonwebtoken` assina e valida tokens JWT.
- `cookie-parser` permite ler o cookie de autenticação enviado pelo navegador.

`dotenv` já está instalado no projeto. Depois que as referências a sessões forem removidas do código, remova também a dependência:

```powershell
npm uninstall express-session
```

## 3. Adicionar a senha ao modelo e migrar

Em `prisma/schema.prisma`, inclua `senha` no modelo `Usuario`:

```prisma
model Usuario {
  id          Int          @id @default(autoincrement())
  nome        String
  email       String       @unique
  senha       String
  emprestimos Emprestimo[]
}
```

Crie a migração e gere o Prisma Client:

```powershell
npx prisma migrate dev --name adicionar-senha-usuario
npx prisma generate
```

Como `DATABASE_URL` aponta para `aula.db`, as migrações criam um banco separado e deixam `dev.db` intacto. Confirme que `aula.db` não será incluído no Git.

## 4. Carregar o ambiente e configurar cookies

No topo de `app.js`, antes de importar `./lib/prisma`, carregue as variáveis de ambiente e valide a chave:

```js
require('dotenv').config();

if (!process.env.JWT_SECRET) {
  throw new Error('Defina JWT_SECRET no arquivo .env');
}
```

Importe as dependências:

```js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
```

Na lista de middlewares básicos, inclua:

```js
app.use(cookieParser());
```

Remova o `require('express-session')`, o bloco `app.use(session(...))` e o middleware global que usa `req.session.usuario`. O nome do usuário será disponibilizado às views pelo middleware JWT.

## 5. Hashear a senha no cadastro

Na rota pública `POST /cadastrar-usuario`, mantenha as validações de campos, confirmação de senha e e-mail duplicado. Antes de criar o usuário, gere o hash:

```js
const senhaHash = await bcrypt.hash(senha, 12);

await prisma.usuario.create({
  data: { nome, email, senha: senhaHash }
});
```

Use `senhaHash` no campo `senha`; nunca persista a senha recebida em texto puro.

## 6. Validar a senha e emitir o JWT no login

Na rota pública `POST /login`, substitua a comparação direta de strings por `bcrypt.compare`. Se usuário não existir ou a senha não corresponder, responda com a mesma mensagem para ambos os casos:

```js
const usuario = await prisma.usuario.findUnique({ where: { email } });

if (!usuario || !(await bcrypt.compare(senha, usuario.senha))) {
  return res.status(401).render('login.html', {
    erro: 'E-mail ou senha inválidos.',
    sucesso: null
  });
}

const token = jwt.sign(
  { sub: String(usuario.id) },
  process.env.JWT_SECRET,
  { expiresIn: '1h', algorithm: 'HS256' }
);

res.cookie('token', token, {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 1000
});

return res.redirect('/livros');
```

O JWT é assinado, não criptografado: seu payload pode ser lido. Guarde nele apenas identificadores e informações não sensíveis.

## 7. Criar o middleware de autenticação

Crie `Middlewares/auth.js`:

```js
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

function limparCookie(res) {
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  });
}

async function authMiddleware(req, res, next) {
  const token = req.cookies?.token;

  if (!token) return res.redirect('/login');

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256']
    });
  } catch {
    limparCookie(res);
    return res.redirect('/login');
  }

  const id = Number(payload.sub);
  if (!Number.isSafeInteger(id)) {
    limparCookie(res);
    return res.redirect('/login');
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id },
      select: { id: true, nome: true, email: true }
    });

    if (!usuario) {
      limparCookie(res);
      return res.redirect('/login');
    }

    req.usuario = usuario;
    res.locals.usuarioLogado = usuario;
    return next();
  } catch (erro) {
    return next(erro);
  }
}

module.exports = authMiddleware;
```

Além de validar assinatura e expiração, o middleware busca o usuário atual no banco. Assim, o template recebe `usuarioLogado.nome`, e um token de usuário removido não continua autorizando acesso.

## 8. Proteger todas as rotas privadas

A ordem das rotas Express importa. Deixe públicas e declare primeiro:

- `GET /login`
- `GET /cadastro`
- `POST /login`
- `POST /cadastrar-usuario`

Depois dessas rotas, registre o middleware:

```js
app.use(require('./Middlewares/auth'));
```

Mova para baixo dele todas as rotas da biblioteca. Neste projeto, isso inclui páginas de livros, usuários e empréstimos; busca; cadastro, edição e exclusão; emprestar e devolver. Se uma rota privada permanecer declarada antes do `app.use`, ela continuará acessível sem autenticação.

O `GET /logout` também pode ficar depois do middleware. Remova qualquer uso de `req.session` e limpe o cookie ao sair:

```js
app.get('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  });
  return res.redirect('/login');
});
```

As telas existentes já exibem o link de login/logout por meio de `usuarioLogado`; não é necessário mudar o HTML para esta implementação.

## 9. Testar o fluxo

Inicie a aplicação dentro de `biblioteca_project`:

```powershell
node app.js
```

No navegador, confira os casos:

1. Acesse `http://localhost:5000/livros` sem autenticação e confirme o redirecionamento para `/login`.
2. Crie uma conta e faça login. Confirme que a página protegida abre e mostra o nome do usuário.
3. Tente uma senha incorreta; a mensagem não deve revelar se o e-mail existe.
4. Faça logout e confirme que a rota privada volta a redirecionar.
5. Confira no banco que `Usuario.senha` contém um hash Bcrypt (normalmente começa com `$2a$` ou `$2b$`), nunca a senha original.

Valide também o schema e o estado das migrações:

```powershell
npx prisma validate
npx prisma migrate status
```

## Observações de segurança

- Em produção, use HTTPS para que o cookie com `secure: true` seja transmitido com segurança.
- JWT em cookie é enviado automaticamente pelo navegador. `SameSite=Lax` ajuda, mas aplicações reais devem avaliar proteção CSRF nas operações que alteram dados.
- O logout acima remove o cookie do navegador; como JWT é stateless, o token já copiado continua válido até expirar. Use expirações curtas ou uma estratégia de revogação se a aplicação precisar invalidá-lo imediatamente.
