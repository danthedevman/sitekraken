export function profile(req, res) {
  res.render('auth/profile');
}

export function logout(req, res, next) {
  req.logout(function (err) {
    if (err) return next(err);
    req.session.destroy(() => {
      res.redirect('/');
    });
  });
}
