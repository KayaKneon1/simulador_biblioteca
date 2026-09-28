# README de alterações do projeto - autenticação segura

Este arquivo documenta, de forma explicativa e em passo a passo, as alterações aplicadas no projeto para responder ao tema: "Como proteger rotas privadas, hashear senhas com Bcrypt e gerar/validar tokens JWT".

Importante: este documento tem objetivo de explicar as mudanças implementadas no projeto. Ele não altera a estrutura original do código nem modifica o funcionamento já existente.

---

## 1) Objetivo das alterações

O projeto da biblioteca passou a ter uma camada de autenticação mais segura no backend. As principais mudanças foram:

- proteger rotas que exigem login;
- salvar senhas no banco em formato hash, e não em texto puro;
- validar a senha no login com `bcrypt.compare`;
- gerar um token JWT ao autenticar o usuário;
- validar o token em um middleware antes de permitir acesso às rotas privadas;
- manter o usuário logado em cookie para uso nas views do sistema.

---

## 2) Arquivos e partes do projeto que foram ajustados

As principais mudanças ficaram concentradas em:

- `biblioteca_project/app.js`
- `biblioteca_project/Middlewares/auth.js`
- `biblioteca_project/prisma/schema.prisma`
- `biblioteca_project/package.json`
- `biblioteca_project/scripts/rehash-senhas.js`

Esses arquivos foram os responsáveis por implementar a autenticação e a proteção das rotas.

---

## 3) Instalação das dependências necessárias

Para que o sistema pudesse hashear senhas e gerar/validar JWT, foram adicionadas dependências ao projeto.

No `package.json`, ficaram incluídas bibliotecas como:

- `npm install bcryptjs`: responsável por gerar o hash da senha e comparar em login;
- `npm install cookie-parser`: leitura de cookies para obter o token no servidor;
- `npm install bcrypt jsonwebtoken dotenv`: carregamento das variáveis de ambiente.

Com isso, o backend passou a ter suporte a autenticação segura usando hash de senha e JWT.

---

## 4) Configuração de variáveis de ambiente

Foi introduzida a leitura do arquivo `.env` no projeto, utilizando `dotenv`.

A ideia é manter segredos fora do código-fonte, evitando expor informações sensíveis no repositório. No projeto, a parte principal foi a leitura de duas variáveis:

- `JWT_SECRET`: chave secreta usada para assinar e validar os tokens;
- `JWT_EXPIRES_IN`: tempo de expiração do token (por exemplo, `1h`).

Essas variáveis são carregadas com:

```app.js
require('dotenv').config();
```

Isso permite que o sistema use a chave secreta para assinar os JWT sem deixar a senha secreta hardcoded no código.

---

## 5) Ajuste no Prisma: senha do usuário passou a ser persistida de forma segura

No modelo `Usuario` do Prisma, a senha foi tratada como campo obrigatório e passou a ser armazenada em formato hash.

Antes, o conceito de senha não era tratado com segurança. Depois da alteração, o modelo ficou estruturado em torno de:

```prisma
model Usuario {
  id          Int          @id @default(autoincrement())
  nome        String
  email       String       @unique
  senha       String

  emprestimos Emprestimo[]
}
```

Esse ajuste foi importante porque a senha precisa existir no banco, mas em formato hash, nunca como texto puro.

Além disso, o email continuou sendo único para evitar duplicidade de cadastro e conflitos de autenticação.

---

## 6) Cadastro de usuário: senha agora é hasheada com Bcrypt

Uma das mudanças centrais foi no fluxo de cadastro de usuário dentro do `app.js`.

Quando o usuário envia nome, email e senha, o projeto faz as seguintes validações:

- verifica se todos os campos foram preenchidos;
- verifica se as senhas coincidem;
- valida o tamanho mínimo da senha;
- verifica se o e-mail já existe;
- gera um hash com `bcrypt.hash(senha, 10)`;
- salva o hash no campo `senha` do banco.

A parte principal ficou assim:

```app.js
const hashed = await bcrypt.hash(senha, 10);

await prisma.usuario.create({
  data: {
    nome,
    email,
    senha: hashed
  }
});
```

Isso significa que, ao invés de salvar a senha original, o sistema armazena uma versão criptografada. Isso é fundamental para o padrão de segurança recomendado.

### Por que isso importa?

Se o banco for comprometido, o atacante não consegue ler diretamente as senhas dos usuários. Ele teria acesso apenas ao hash, que é muito mais difícil de reverter sem brute force ou ataques extremamente pesados.

---

## 7) Login: comparação da senha com Bcrypt e geração do JWT

No processo de autenticação, o projeto passou a validar a senha informada pelo usuário em relação ao hash salvo no banco.

O fluxo foi implementado assim:

1. Busca o usuário pelo e-mail;
2. Compara a senha digitada com o hash salvo usando `bcrypt.compare`;
3. Se a senha estiver correta, gera um token JWT;
4. Armazena o token em cookie para manter o usuário autenticado;
5. Redireciona para a área protegida do sistema.

A lógica principal ficou assim:

```js
const usuario = await prisma.usuario.findUnique({ where: { email } });
const match = await bcrypt.compare(senha, usuario.senha);

const token = jwt.sign(
  { id: usuario.id, nome: usuario.nome, email: usuario.email },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
);

res.cookie('token', token, { httpOnly: true, secure: false });
```

### O que o JWT contém

O payload do token inclui informações do usuário, como:

- `id`;
- `nome`;
- `email`.

Esses dados são usados durante a autenticação e para o sistema saber quem está acessando a rota.

### Por que usar JWT?

O JWT funciona como uma credencial digital assinada. Quando o usuário faz login, o servidor gera um token confiável e o cliente o envia posteriormente para provar que está autenticado.

---

## 8) Middleware de autenticação: proteção de rotas privadas

O projeto recebeu um middleware dedicado para validar o JWT antes de liberar acesso às rotas privadas.

O arquivo `biblioteca_project/Middlewares/auth.js` foi responsável por isso.

### Middleware principal: `autenticarJWT`

Esse middleware faz o seguinte:

1. tenta obter o token do cabeçalho `Authorization: Bearer ...`;
2. se não vier no header, tenta buscar o token no cookie `token`;
3. se não houver token, responde como não autenticado;
4. usa `jwt.verify(token, process.env.JWT_SECRET)` para validar a assinatura e a expiração;
5. se tudo estiver válido, coloca as informações do usuário em `req.user` e chama `next()`;
6. se o token for inválido, retorna erro de sessão inválida.

A estrutura principal ficou assim:

```js
function autenticarJWT(req, res, next) {
    const authHeader = req.headers.authorization;

    const tokenFromHeader =
        authHeader && authHeader.startsWith('Bearer ')
            ? authHeader.split(' ')[1]
            : null;

    const token = tokenFromHeader || req.cookies?.token;

    if (!token) {
        return res.status(401).render('login.html', {
            erro: 'Autentique-se para continuar.',
            sucesso: null
        });
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.user = payload;
        return next();
    } catch (err) {
        return res.status(401).render('login.html', {
            erro: 'Sessão inválida. Faça login novamente.',
            sucesso: null
        });
    }
}
```

Esse middleware foi então usado em rotas sensíveis, como:

- `/cadastrar-livro`
- `/emprestar`
- `/devolver`

Exemplo:

```app.js
app.post('/cadastrar-livro', autenticarJWT, async (req, res) => {
  // lógica de cadastro
});
```

Com isso, o sistema só permite que usuários autenticados realizem ações restritas.

---

## 9) Middleware opcional: carregar usuário logado nas páginas HTML

Além do middleware de autenticação obrigatória, foi adicionado um middleware opcional para identificar o usuário logado mesmo em páginas que não exigem autenticação.

Esse middleware ficou responsável por:

- verificar se existe um token em cookie;
- tentar validar esse token com `jwt.verify()`;
- preencher `req.user` com os dados do usuário quando o token for válido;
- em caso de token inválido ou ausente, deixar `req.user = null`.

A lógica foi a seguinte:

```auth.js
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
```

Isso foi importante porque as páginas HTML receberam uma integração com os dados do usuário logado por meio de `res.locals.usuarioLogado`, permitindo adaptar a interface conforme o estado da autenticação.

Exemplo usado no `app.js`:

```app.js
app.use((req, res, next) => {
    res.locals.usuarioLogado = req.user || null;
    next();
});
```

Com isso, o projeto passou a distinguir entre páginas públicas e rotas de login, bem como condicionais de visualização do conteúdo.

---

## 10) Logout: destruição da sessão do token

Foi implementado também o fluxo de logout.

Quando o usuário solicita sair do sistema, o backend limpa o cookie do token e redireciona para a tela de login:

```js
app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/login');
});
```

Isso assegura que o token não continue disponível no navegador e que a sessão seja encerrada corretamente.

---

## 11) Rehash de senhas antigas

Como o projeto pode ter usuários já cadastrados com senha em texto puro, foi criado um script de migração para transformar essas senhas em hash Bcrypt.

O arquivo `scripts/rehash-senhas.js` percorre todos os usuários e, caso a senha não comece com o padrão de hash do Bcrypt (`$2`), faz a conversão:

```js
if (!u.senha.startsWith('$2')) {
  const hashed = await bcrypt.hash(u.senha, 10);
  await prisma.usuario.update({
    where: { id: u.id },
    data: { senha: hashed }
  });
}
```

Isso foi uma etapa importante para compatibilidade do projeto antigo com o novo modelo de segurança.

### Objetivo do script

Permitirá que usuários antigos, que ainda tenham senhas em texto puro, sejam migrados para o novo padrão sem quebrar o login.

---

## 12) Proteção de rotas em conjunto com a renderização de páginas

O sistema também passou a usar uma lógica de autenticação para páginas de visualização, sem deixar de manter a compatibilidade com o fluxo web tradicional.

Exemplo:

- se o usuário já estiver autenticado, a rota `/login` redireciona para `/livros`;
- se o usuário não estiver autenticado, a página de login é renderizada;
- a autenticação de rotas privadas é validada por JWT.

Esse comportamento torna a experiência mais segura e fluida, evitando que usuários acessem áreas restritas sem autenticação.

---

## 13) Resumo da mudança de arquitetura de segurança

Em resumo, o projeto evoluiu de um sistema com autenticação básica para um modelo mais seguro baseado em três pilares:

1. Hash da senha com `bcrypt`;
2. Geração de token JWT para sessão do usuário;
3. Validação do token em middleware para proteger áreas privadas.

Esse conjunto faz com que o sistema:

- proteja rotas sensíveis;
- evite guardar senhas em texto puro;
- autentique usuários de forma segura;
- mantenha o uso de cookies e views compatível com o projeto web.

---

## 14) Conclusão

As alterações aplicadas no projeto responderam diretamente à exigência de segurança em autenticação web. O sistema passou a:

- hashear senhas com Bcrypt;
- comparar senhas em login de forma segura;
- gerar tokens JWT com chave secreta em ambiente;
- validar tokens em middleware;
- proteger rotas privadas;
- manter usuário logado através de cookie;
- preparar o projeto para compatibilidade com usuários antigos por meio do script de rehash.

Essa é a base essencial para um projeto web com autenticação segura e controle de acesso adequado.
