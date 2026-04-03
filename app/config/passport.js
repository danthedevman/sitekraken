import pkg from 'passport-auth0';
import { ObjectId } from 'mongodb';
import { getCollections } from './db.js';

const { Strategy: Auth0Strategy } = pkg;

export default function configurePassport(passport) {
  passport.use(
    new Auth0Strategy(
      {
        domain: process.env.AUTH0_DOMAIN,
        clientID: process.env.AUTH0_CLIENT_ID,
        clientSecret: process.env.AUTH0_CLIENT_SECRET,
        callbackURL: process.env.AUTH0_CALLBACK_URL
      },
      async function (accessToken, refreshToken, extraParams, profile, done) {
        try {
          const { users } = getCollections();
          let user = await users.findOne({ auth0Id: profile.id });

          if (!user) {
            const doc = {
              auth0Id: profile.id,
              email: profile.emails?.[0]?.value || '',
              displayName: profile.displayName || profile.nickname || 'User',
              avatar: profile.picture || '',
              createdAt: new Date(),
              updatedAt: new Date()
            };

            const result = await users.insertOne(doc);
            user = { _id: result.insertedId, ...doc };
          }

          return done(null, { ...user, _id: user._id.toString() });
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, user._id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const { users } = getCollections();
      const user = await users.findOne({ _id: new ObjectId(id) });
      if (!user) return done(null, false);
      done(null, { ...user, _id: user._id.toString() });
    } catch (error) {
      done(error);
    }
  });
}
