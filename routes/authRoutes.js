const mongoose = require('mongoose');
const passport = require('passport');
const bcrypt = require('bcrypt');
const async = require('async');
const crypto = require('crypto');
const Raven = require('raven');

const keys = require('../config/keys');
const requireLogin = require('../middlewares/requireLogin');
const require2fa = require('../middlewares/require2fa');
const background = require('../services/background');
const saltRounds = 11;

const User = mongoose.model('investors');

module.exports = app => {
	// google login
	app.get(
		'/auth/google',
		passport.authenticate('google', {
			scope: ['profile', 'email']
		})
	);
	// if google authenticated then redirect /icos else redirect /set-password
	app.get(
		'/auth/google/callback',
		passport.authenticate('google'),
		(req, res) => {
			if (req.authInfo === true) {
				res.redirect(keys.redirectDomain + '/icos');
			} else {
				res.redirect(keys.redirectDomain + '/icos');
			}
		}
	);
	// login github
	app.get(
		'/auth/github',
		passport.authenticate('github', { scope: ['user:email'] })
	);
	// if git authenticated then redirect /icos else redirect /set-password
	app.get(
		'/auth/github/callback',
		passport.authenticate('github', { failureRedirect: keys.redirectDomain }),
		(req, res) => {
			if (req.authInfo === true) {
				res.redirect(keys.redirectDomain + '/icos');
			} else {
				res.redirect(keys.redirectDomain + '/icos');
			}
		}
	);
	// facebook login
	app.get(
		'/auth/facebook',
		passport.authenticate('facebook', {
			authType: 'rerequest',
			scope: ['email']
		})
	);
	// if facebook authenticated then redirect /icos else redirect /set-password
	app.get(
		'/auth/facebook/callback',
		passport.authenticate('facebook', { failureRedirect: keys.redirectDomain }),
		function (req, res) {
			if (req.authInfo === true) {
				res.redirect(keys.redirectDomain + '/icos');
			} else {
				res.redirect(keys.redirectDomain + '/icos');
			}
		}
	);
	// signin
	app.post(
		'/auth/signin',
		passport.authenticate('local', {
			failureFlash: 'Invalid username or password.'
		}),
		require2fa,
		function (req, res) {
			res.status(200).send({ message: 'SignIn success' });
		}
	);
	//sign up
	app.post('/auth/signup', function (req, res) {
		if (!req.body.username || !req.body.password) {
			res.status(400).send({ error: 'Bad email or password' });
			return;
		}
		User.findOne({
			email: req.body.username
		})
			.then(async user => {
				if (user) {
					res.status(406).send({ error: 'User already exists' });
				} else {
					try {
						const buf = crypto.randomBytes(20);
						const investor = await new User({
							email: req.body.username,
							password: req.body.password,
							verifyToken: buf.toString('hex')
						}).save();

						passport.authenticate('local')(req, res, function () {
							const data = {
								email: req.user.email,
								tp_name: 'Welcome to TokenHub',
								global_merge_vars: [
									{
										name: 'token',
										content: `${keys.redirectDomain}/confirm_emal/${
											investor.verifyToken
											}`
									}
								],
								tags: ['signup']
							};
							background.sendMail(data);

							res.status(200).send({ message: 'SignUp success' });
						});
					} catch (err) {
						Raven.captureException(err);
						res.status(422).send(err);
					}
				}
			})
			.catch(res.negotiate);
	});
	//logout
	app.get('/api/logout', (req, res) => {
		req.logout();
		res.status(200).send({ message: 'Log out success' });
	});
	// return current user
	app.get('/api/current_user', (req, res) => {
		if (req.user) {
			res.send(req.user);
			return;
		}
		res.status(403).send({ error: 'User is not authorized' });
	});
	// return sequrity questions
	app.post('/auth/get_questions', async (req, res) => {
		const email = req.body.email;
		if (!email) {
			res.status(400).send({ error: 'Bad email' });
			return;
		}
		try {
			const user = await User.findOne({ email }).exec();

			if (!user) {
				res.status(406).send({ error: 'User Not Found' });
				return;
			}
			if (user.securityQuestions.length > 0) {
				res.status(200).send({ questions: user.securityQuestions });
				return;
			} else {
				try {
					const buf = await crypto.randomBytes(20);
					const token = buf.toString('hex');
					user.resetPasswordToken = token;
					user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
					const reuser = await user.save();
					const data = {
						email: email,
						tp_name: 'password reset',
						global_merge_vars: [
							{
								name: 'resetUrl',
								content: `${keys.redirectDomain}/change-password/${
									reuser.resetPasswordToken
									}`
							}
						],
						tags: ['password reset']
					};
					background.sendMail(data);
					res
						.status(200)
						.send({ message: 'Password recovery instructions have been sent' });
					return;
				} catch(err) {
					Raven.captureException(err)
				}
			}
		} catch(err) {
			Raven.captureException(err)
		}
		
	});
	// sequrity qestions reset
	app.post('/auth/reset', (req, res) => {
		const answers = req.body.answers;
		if (!req.body.username || !answers) {
			res.status(400).send({ error: 'Bad email or answers' });
			return;
		}

		if (answers.length < 2) {
			res.status(400).send({ error: 'Bad answers' });
		} else {
			const email = req.body.username;
			User.findOne({ email: req.body.username })
				.select('securityQuestions resetPasswordToken resetPasswordExpires')
				.exec(function (err, user) {
					if (!user) {
						res.status(406).send({ error: 'User Not Found' });
					} else {
						if (
							user.securityQuestions.length > 0 &&
							answers[0].answer === user.securityQuestions[0].answer &&
							answers[1].answer === user.securityQuestions[1].answer
						) {
							crypto.randomBytes(20, async function (err, buf) {
								const token = buf.toString('hex');
								user.resetPasswordToken = token;
								user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

								try {
									const reuser = await user.save();
									const data = {
										email: email,
										tp_name: 'password reset',
										global_merge_vars: [
											{
												name: 'resetUrl',
												content: `${keys.redirectDomain}/change-password/${
													reuser.resetPasswordToken
													}`
											}
										],
										tags: ['password reset']
									};
									background.sendMail(data);

									res.status(200).send(reuser);
								} catch (err) {
									Raven.captureException(err);
									res.status(422).send(err);
								}
							});
						} else {
							res.status(422).send({ error: 'Bad Answers' });
						}
					}
				});
		}
	});
	// change password by token
	app.post('/auth/change-password/:token', (req, res) => {
		User.findOne({
			resetPasswordToken: req.params.token,
			resetPasswordExpires: { $gt: Date.now() }
		})
			.select('password')
			.exec(async function (err, user) {
				if (!user) {
					res
						.status(406)
						.send({ error: 'Password reset token is invalid or has expired.' });
					return;
				}

				user.password = req.body.password;
				user.resetPasswordToken = undefined;
				user.resetPasswordExpires = undefined;

				try {
					const reuser = await user.save();
					res.status(200).send(reuser);
				} catch (err) {
					Raven.captureException(err);
					res.status(422).send(err);
				}
			});
	});
	// set password
	app.post('/auth/set-password', requireLogin, async (req, res) => {
		const { password } = req.body;
		if (!password) {
			res.status(400).send({ error: 'Missing Password' });
		} else {
			req.user.password = password;

			try {
				const user = await req.user.save();
				res.status(200).send(user);
			} catch (err) {
				Raven.captureException(err);
				res.status(422).send(err);
			}
		}
	});
	//email verify by token
	app.get('/auth/email_verify/:token', async (req, res) => {
		User.findOne({ verifyToken: req.params.token }, (err, user) => {
			if (user) {
				user.verifyToken = null;
				user.emailVerified = true;
				user.save(err => {
					if (err) {
						res.status(422).send(err);
					} else {
						res.status(200).send({ message: 'Email verified' });
					}
				});
			} else {
				res.status(404).send({ message: 'Wrong token' });
			}
		});
	});
	// resend email verification
	app.post('/auth/resend_email_verificatoin', async (req, res) => {
		try {
			const user = await User.findOne({ email: req.body.email }).select(
				'email verifyToken'
			);
			if (user) {
				const data = {
					email: user.email,
					tp_name: 'email verification',
					global_merge_vars: [
						{
							name: 'token',
							content: `${keys.redirectDomain}/confirm_emal/${user.verifyToken}`
						}
					],
					tags: ['email verfification']
				};
				background.sendMail(data);
				res.status(200).send({ message: 'Sent message' });
			} else {
				res.status(404).send({ message: 'Not found' });
			}
		} catch(err) {
			Raven.captureException(err);
		}
		
	});
};
