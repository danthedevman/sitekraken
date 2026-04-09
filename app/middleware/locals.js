export default function addLocals(req, res, next) {
  res.locals.appUrl = String(process.env.APP_URL || '').replace(/\/+$/, '');
  res.locals.currentUser = req.user || null;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');//
  next();
}
