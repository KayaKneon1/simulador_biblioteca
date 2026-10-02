const jwt = require('jsonwebtoken');

function autenticarJWT(req, res, next) {
    const authHeader = req.headers.authorization;

    const tokenFromHeader =
        authHeader && authHeader.startsWith('Bearer')
            ? authHeader.split(' ')[1]
            :null

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
    }

    catch (err) {
        console.error('Token inválido:', err.message);

        return res.status(401).render('login.html', {
            erro: 'Sessão inválida. faça login novamente.',
            sucesso: null
        })
    }
}

function usuarioOpcional(req, res, next) {
    const token = req.cookies?.token;

    if (!token) {
        req.user = null
        return next();
    }

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        req.user = null
    }
    next()
}

module.exports = {
    autenticarJWT,
    usuarioOpcional
};