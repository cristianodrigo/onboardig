import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import './db.js';
import { usaAzure, ensureContainer } from './storage.js';
import authRoutes from './routes/auth.js';
import candidatoRoutes from './routes/candidato.js';
import rhRoutes from './routes/rh.js';
import usuariosRoutes from './routes/usuarios.js';
import conviteRoutes from './routes/convite.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8765;

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
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ erro: 'Arquivo maior que 10 MB.' });
  }
  if (err) return res.status(400).json({ erro: err.message || 'Requisição inválida.' });
  next();
});

(async () => {
  if (usaAzure) {
    try {
      await ensureContainer();
      console.log('Container Azure pronto.');
    } catch (err) {
      console.error('Não foi possível criar/acessar o container Azure:', err.message);
    }
  }
  app.listen(PORT, '0.0.0.0', () => console.log(`onboardig em http://0.0.0.0:${PORT}`));
})();
