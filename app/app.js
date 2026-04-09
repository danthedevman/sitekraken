import 'dotenv/config';
import path from 'path';
import express from 'express';
import session from 'express-session';
import flash from 'connect-flash';
import passport from 'passport';
import expressLayouts from 'express-ejs-layouts';
import methodOverride from 'method-override';
import { fileURLToPath } from 'url';
import MongoStore from 'connect-mongo';

import { connectDB } from './config/db.js';
import configurePassport from './config/passport.js';
import addLocals from './middleware/locals.js';

import indexRoutes from './routes/index.js';
import authRoutes from './routes/auth.js';
import workspaceRoutes from './routes/workspaces.js';
import chatbotRoutes from './routes/chatbot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
let server;

async function startServer() {
  await connectDB();
  configurePassport(passport);

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.use(expressLayouts);
  app.set('layout', 'layout');

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(methodOverride('_method'));
  app.use('/public', express.static(path.join(__dirname, 'public')));
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

  app.use(
    session({
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        dbName: process.env.MONGODB_DB,
        collectionName: 'sessions'
      }),
      cookie: {
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7
      }
    })
  );

  app.use(flash());
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(addLocals);

  app.use('/auth', authRoutes);
  app.use('/', indexRoutes);
  app.use('/workspaces', workspaceRoutes);
  app.use('/workspaces/:workspaceId/chatbot', chatbotRoutes);

  app.use((req, res) => {
    res.status(301).redirect('/workspaces');
  });

  app.use((err, req, res, next) => {
    console.error(err);
    req.flash('error', err.message || 'Something went wrong');
    const backUrl = req.get('Referrer') || '/';
    res.status(500).redirect(backUrl);
  });

  const PORT = process.env.PORT || 4000;

  server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

process.on('SIGINT', () => {
  if (server) {
    server.close(() => {
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

process.on('SIGTERM', () => {
  if (server) {
    server.close(() => {
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});
