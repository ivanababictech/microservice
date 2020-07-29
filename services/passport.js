const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LocalStrategy = require('passport-local').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const GitHubStrategy = require('passport-github').Strategy;
const mongoose = require('mongoose');
const keys = require('../config/keys');

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const saltRounds = 11;

const User = mongoose.model('investors');

passport.serializeUser((user, done) => {
	done(null, user.id);
});

passport.deserializeUser((id, done) => {
	User.findById(id).then(user => {
		done(null, user);
	});
});

passport.use(
	new GoogleStrategy(
		{
			clientID: keys.googleClientID,
			clientSecret: keys.googleClientSecret,
			callbackURL: '/auth/google/callback',
			proxy: true
		},
		async (accessToken, refreshToken, profile, done) => {
			//console.log(profile.emails[0].value);
			const existingUser = await User.findOne({
				email: profile.emails[0].value
			});
			if (existingUser) {
				//we have record with this profile ID
				return done(null, existingUser, true);
			}
			// we dont have user with this profile ID
			const user = new User();
			user.email = profile.emails[0].value;

			if (
				isAllLetter(profile.name.givenName) &&
				isAllLetter(profile.name.familyName)
			) {
				user.firstName = profile.name.givenName;
				user.lastName = profile.name.familyName;
			}
			user.emailVerified = true;
			await user.save();
			done(null, user, false);
		}
	)
);

passport.use(
	new LocalStrategy(function(username, password, done) {
		User.findOne({ email: username }, function(err, user) {
			//let passwordValidation = false;
			if (err) {
				return done(err);
			}
			if (!user) {
				//console.log('wrong user');
				return done(null, false);
			}
			bcrypt.compare(password, user.password, function(err, res) {
				//passwordValidation = res;
				//console.log(passwordValidation);
				if (!res) {
					//console.log('wrong password');
					return done(null, false);
					//passwordValidation = false
				} else {
					return done(null, user);
				}
			});
			//console.log(passwordValidation);
			//if (!passwordValidation) {
			//return done(null, false);
			//}
		}).select('+password');
	})
);

passport.use(
	'admin',
	new LocalStrategy(function(username, password, done) {
		User.findById(username, function(err, user) {
			if (err) {
				return done(err);
			}
			if (!user) {
				return done(null, false);
			}
			done(null, user);
		});
	})
);

passport.use(
	new GitHubStrategy(
		{
			clientID: keys.githubClientID,
			clientSecret: keys.githubClientSecret,
			callbackURL: '/auth/github/callback',
			proxy: true
		},
		async (accessToken, refreshToken, profile, done) => {
			console.log(profile);
			const existingUser = await User.findOne({
				email: profile.emails[0].value
			});
			if (existingUser) {
				//we have record with this profile ID
				return done(null, existingUser, true);
			}
			// we dont have user with this profile ID
			const user = await new User({ email: profile.emails[0].value }).save();
			done(null, user, false);
		}
	)
);

passport.use(
	new FacebookStrategy(
		{
			clientID: keys.facebookClientID,
			clientSecret: keys.facebookClientSecret,
			callbackURL: '/auth/facebook/callback',
			profileFields: ['id', 'name', 'displayName', 'photos', 'email'],
			proxy: true
		},
		async (accessToken, refreshToken, profile, done) => {
			//console.log(profile);
			const existingUser = await User.findOne({
				email: profile.emails[0].value
			});
			if (existingUser) {
				//we have record with this profile ID
				return done(null, existingUser, true);
			}
			// we dont have user with this profile ID
			const user = new User();
			user.email = profile.emails[0].value;

			if (
				isAllLetter(profile.name.givenName) &&
				isAllLetter(profile.name.familyName)
			) {
				user.firstName = profile.name.givenName;
				user.lastName = profile.name.familyName;
			}
			user.emailVerified = true;
			// const buf = crypto.randomBytes(20);
			// user.verifyToken = buf.toString('hex');
			await user.save();
			done(null, user, false);
		}
	)
);

function isAllLetter(inputtxt) {
	var letters = /^[A-Za-z]+$/;
	if (inputtxt.match(letters)) {
		return true;
	} else {
		return false;
	}
}
