import { Router } from 'express';
import passport from 'passport';
import { ensureAuth } from '../middleware/auth.js';
import { profile, logout } from '../controllers/authController.js';

const router = Router();

router.get(
  '/login',
  passport.authenticate('auth0', {
    scope: 'openid email profile'
  })
);

router.get(
  '/callback',
  passport.authenticate('auth0', { failureRedirect: '/' }),
  (req, res) => res.redirect('/workspaces')
);

router.get('/profile', ensureAuth, profile);
router.post('/logout', ensureAuth, logout);

export default router;
