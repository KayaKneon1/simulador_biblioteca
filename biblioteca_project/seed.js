require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const livros = await prisma.livro.findMany();
  const usuarios = await prisma.usuario.findMany();

  console.log('Quantidade de livros:', livros.length);
  console.log('Quantidade de usuários:', usuarios.length);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });