export function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  req.flash('error', 'Please sign in first');
  res.redirect('/auth/login');
}
