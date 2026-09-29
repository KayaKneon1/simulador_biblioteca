# Autenticação: proteger rotas, hashear senhas e usar JWT

@ Este README explica passo a passo como proteger rotas privadas, hashear senhas com Bcrypt e gerar/validar tokens JWT no projeto `biblioteca_project`. @

**Resumo das ações**
- Instalar dependências: `bcrypt` (ou `bcryptjs`), `jsonwebtoken`, `dotenv` (opcional: `cookie-parser`).
- Hashear senhas ao cadastrar.
- Comparar senhas ao logar e gerar um JWT.
- Criar middleware para validar JWT e proteger rotas privadas.

---

## 1) Instalar dependências

No diretório `biblioteca_project`, rode:

```bash
npm install bcrypt jsonwebtoken dotenv
# se for usar cookies opcionais para armazenar token:
npm install cookie-parser
```

Observação: no Windows, se houver problemas com `bcrypt` você pode usar `bcryptjs` (API compatível):
```bash
npm install bcryptjs
```

## 2) Variáveis de ambiente
Crie um arquivo `.env` (não versionar) com ao menos:

```
JWT_SECRET=uma_chave_muuito_secreta_aqui
JWT_EXPIRES_IN=1h
```

No topo de `app.js` carregue o dotenv e as libs:

```js
require('dotenv').config();
const bcrypt = require('bcrypt'); // ou require('bcryptjs')
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser'); // opcional

app.use(cookieParser()); // se usar cookies
```

## 3) Hashear senha ao cadastrar usuário
Substitua a parte que salva `senha` em texto puro por algo como:

```js
// dentro de /cadastrar-usuario
const hashed = await bcrypt.hash(senha, 10); // saltRounds = 10
await prisma.usuario.create({ data: { nome, email, senha: hashed } });
```

Explicação rápida: `bcrypt.hash` gera um hash seguro; salvar apenas o hash no banco.

## 4) Comparar senha e gerar JWT ao logar
No handler de `/login` faça:

```js
const usuario = await prisma.usuario.findUnique({ where: { email } });
if (!usuario) { /* erro */ }

const match = await bcrypt.compare(senha, usuario.senha);
if (!match) { /* erro: senha inválida */ }

// Gerar token
const token = jwt.sign({ id: usuario.id, nome: usuario.nome, email: usuario.email }, process.env.JWT_SECRET, {
  expiresIn: process.env.JWT_EXPIRES_IN || '1h'
});

// Opções de entrega do token:
// 1) Retornar JSON (API): res.json({ token })
// 2) Armazenar em cookie httpOnly e redirecionar (views):
res.cookie('token', token, { httpOnly: true, secure: false /* true em prod com HTTPS */ });
res.redirect('/livros');
```

Escolha a opção que se encaixa no seu fluxo: para APIs use `Authorization: Bearer <token>`, para app com views você pode usar cookie httpOnly.

## 5) Middleware para proteger rotas (validar JWT)
Exemplo de middleware que aceita header `Authorization: Bearer <token>` ou cookie `token`:

```js
function autenticarJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  const tokenFromHeader = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  const token = tokenFromHeader || req.cookies?.token;
  if (!token) {
    // se for rota de views, redirecione para login
    return res.status(401).render('login.html', { erro: 'Autentique-se para continuar.', sucesso: null });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // disponibiliza id, nome, email
    return next();
  } catch (err) {
    console.error('Token inválido:', err.message);
    return res.status(401).render('login.html', { erro: 'Sessão inválida. Faça login novamente.', sucesso: null });
  }
}

// Uso: app.get('/rota-privada', autenticarJWT, (req, res) => { ... });
```

Se você preferir manter a sessão (`req.session.usuario`), pode checar as duas formas no middleware:

```js
function authHybrid(req, res, next) {
  if (req.session?.usuario) return next();
  return autenticarJWT(req, res, next);
}
```

## 6) Re-hash de senhas existentes
Como o projeto atualmente salva senhas em texto puro, você deve re-hashar as senhas já salvas. Um script útil:

```js
// scripts/rehash-senhas.js
require('dotenv').config();
const bcrypt = require('bcrypt');
const prisma = require('../lib/prisma');

(async () => {
  const usuarios = await prisma.usuario.findMany();
  for (const u of usuarios) {
    // heurística simples: hashes Bcrypt começam com $2
    if (!u.senha.startsWith('$2')) {
      const hashed = await bcrypt.hash(u.senha, 10);
      await prisma.usuario.update({ where: { id: u.id }, data: { senha: hashed } });
      console.log(`Re-hashed user ${u.id}`);
    }
  }
  console.log('Re-hash completo.');
  process.exit(0);
})();
```

Rode com: `node scripts/rehash-senhas.js` (ajuste caminho se necessário).

## 7) Protegendo rotas existentes do projeto

- Para rotas que estão atualmente abertas (ex.: `/cadastrar-livro`, `/emprestar`, `/devolver`), adicione `autenticarJWT` ou `authHybrid` antes do handler.
- Exemplo:

```js
app.post('/cadastrar-livro', autenticarJWT, async (req, res) => { ... });
```

Se o site usa formulários e sessões, prefira `authHybrid` para compatibilidade imediata.

## 8) Boas práticas de segurança

- Guarde `JWT_SECRET` apenas em variáveis de ambiente e não no repositório.
- Use HTTPS em produção e `secure: true` para cookies.
- Defina `expiresIn` curto (1h) e implemente refresh tokens se precisar de sessões longas.
- Nunca exponha tokens em localStorage se o app for acessado por navegadores em domínios não confiáveis.

## 9) Testes rápidos

1. Instale dependências: `npm install`
2. Adicione `.env` com `JWT_SECRET`.
3. Re-hash (opcional): `node scripts/rehash-senhas.js`.
4. Inicie o servidor: `node app.js` ou `npm run dev` se houver script.
5. Teste login e verifique que o token é retornado ou cookie criado.

---

Se quiser, posso:
- Implementar os trechos no `app.js` para você (substituir cadastro/login existentes).
- Adicionar o script `scripts/rehash-senhas.js` no projeto.

Arquivo criado: `README.md`
