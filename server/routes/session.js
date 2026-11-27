// @ts-check

export default (app) => {
  app
    .get('/session/new', { name: 'newSession' }, (_req, reply) => {
      const signInForm = {};
      reply.render('session/new', { signInForm });
    })
    .post(
      '/session',
      { name: 'session' },
      app.fp.authenticate('form', async (req, reply, err, user) => {
        if (err) {
          return app.httpErrors.internalServerError(err);
        }
        if (!user) {
          // The assignment requires a friendly flash message on auth errors,
          // so the error is shown as a role="alert" banner, not a field error.
          req.flash('error', req.t('flash.session.create.error'));
          reply.render('session/new', { signInForm: req.body.data });
          return reply;
        }
        await req.logIn(user);
        req.flash('success', req.t('flash.session.create.success'));
        reply.redirect(app.reverse('root'));
        return reply;
      }),
    )
    .delete('/session', (req, reply) => {
      req.logOut();
      req.flash('info', req.t('flash.session.delete.success'));
      reply.redirect(app.reverse('root'));
    });
};
