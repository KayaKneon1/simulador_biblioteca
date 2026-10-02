require('dotenv').config()

const bcrypt = require('bcryptjs')
const prisma = require('../lib/prisma')

const rodar  = async () => {
    const usuarios = await prisma.usuario.findMany();

    for(const u of usuarios){
        if(!u.senha.startsWith('$2')){
            const hashed = await bcrypt.hash(u.senha, 12)
            await prisma.usuario.update({
                where: {id: u.id},
                data: {senha: hashed}
            });
            console.log(`Re-hashed user ${u.id}`);
        }
    }

    console.log(`Re-hashed completo.`)
    process.exit(0);
};

rodar()