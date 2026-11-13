import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { initSchema, seed } from './db.js';
import { statusDoErro } from './http-erro.js';
import { usaAzure, ensureContainer } from './storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _routes;

export function createApp() {
  if (!_routes) throw new Error('createApp() deve ser chamado após start() carregar as rotas.');
  const { authRoutes, candidatoRoutes, rhRoutes, usuariosRoutes, conviteRoutes } = _routes;
  const app = express();
  fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(session({
    secret: process.env.SESSION_SECRET || 'onboardig-prototipo-dev',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 8 * 3600000,
      secure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
    },
  }));
  app.use('/api', authRoutes);
  app.use('/api', candidatoRoutes);
  app.use('/api', rhRoutes);
  app.use('/api', usuariosRoutes);
  app.use('/api', conviteRoutes);
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('/', (req, res) => {
    if (!req.session.user) return res.redirect('/login.html');
    res.redirect(req.session.user.papel === 'rh' ? '/rh-revisao.html' : '/candidato-aprovacao.html');
  });
  app.use((err, req, res, next) => {
    const mapeado = statusDoErro(err);
    if (!mapeado) return next();
    if (mapeado.status >= 500) console.error(err);
    res.status(mapeado.status).json({ erro: mapeado.erro });
  });
  return app;
}

export async function start() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error('Defina DATABASE_URL.');
    process.exit(1);
  }
  _routes = {
    authRoutes: (await import('./routes/auth.js')).default,
    candidatoRoutes: (await import('./routes/candidato.js')).default,
    rhRoutes: (await import('./routes/rh.js')).default,
    usuariosRoutes: (await import('./routes/usuarios.js')).default,
    conviteRoutes: (await import('./routes/convite.js')).default,
  };
  const app = createApp();
  await initSchema();
  await seed();
  if (usaAzure) {
    try {
      await ensureContainer();
      console.log('Container Azure pronto.');
    } catch (err) {
      console.error('Não foi possível criar/acessar o container Azure:', err.message);
    }
  }
  const port = process.env.PORT || 8765;
  app.listen(port, '0.0.0.0', () => console.log(`onboardig em http://0.0.0.0:${port}`));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start();
}
