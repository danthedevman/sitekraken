export default function addLocals(req, res, next) {
  res.locals.currentUser = req.user || null;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');//
  next();
}
