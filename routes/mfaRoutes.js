const mongoose = require('mongoose');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const Raven = require('raven');

const User = mongoose.model('investors');
const requireLogin = require('../middlewares/requireLogin');

const background = require('../services/background');

module.exports = app => {
	// Get QR code
	app.get('/mfa/setup', requireLogin, async (req, res) => {
		if (req.user.mfa.enrolled === true) {
			res.status(422).send({ error: 'User already enrolled into 2fa' });
		}
		const options = {
			issuer: 'TokenHub',
			name: `TokenHub (${req.user.email})`,
			length: 64
		};
		try {
			const { base32, otpauth_url } = await speakeasy.generateSecret(options);
			const mfa = {
				created: new Date(),
				enrolled: false,
				secret: base32,
				otp: otpauth_url
			};
			//console.log(mfa);
			req.user.mfa = mfa;
			try {
				const user = await req.user.save();
				QRCode.toDataURL(req.user.mfa.otp, (err, url) => {
					if (err) {
						Raven.captureException(err);
						res.status(422).send(err);
					}
					res.status(200).send({ qrCode: url });
				});
			} catch(err) {
				Raven.captureException(err);
			}
		} catch(err) {
			Raven.captureException(err);
		}
	});
	// Setup mfa on User collection
	app.post('/mfa/setup', requireLogin, async (req, res) => {
		const { token } = req.body;
		const mail = req.user.email;

		if (req.user.mfa.enrolled) {
			res.status(422).send({ error: 'User already enrolled into 2fa' });
			return;
		}
		try {
			const user = await User.findById(req.user._id).select('mfa');

			const success = speakeasy.totp.verify({
				secret: user.mfa.secret,
				encoding: `base32`,
				window: 1, // let user enter previous totp token because ux
				token
			});

			if (success) {
				user.mfa.enrolled = true;
				user.mfa.created = new Date();
				user.markModified(`mfa`);
				try {
					await user.save();
					const data = {
						email: mail,
						tp_name: '2fa activated',
						global_merge_vars: [],
						tags: ['2fa activated']
					};
					background.sendMail(data);
					res.status(200).send({ message: 'User successfuly enrolled into 2fa' });
				} catch (err) {
					Raven.captureException(err);
					res.status(422).send(err);
				}
			} else {
				res.status(422).send({ error: 'Invalid token' });
			}
		} catch(err) {
			Raven.captureException(err);
		}

	});
	// make mfa disable on User collection
	app.post('/mfa/disable', requireLogin, async (req, res) => {
		const { token } = req.body;
		const mail = req.user.email;

		if (!req.user.mfa.enrolled) {
			res.status(422).send({ error: 'User is not enrolled in 2fa' });
			return true;
		}
		try {
			const user = await User.findById(req.user._id).select('mfa');
			const success = speakeasy.totp.verify({
				secret: user.mfa.secret,
				encoding: `base32`,
				window: 1, // let user enter previous totp token because ux
				token
			});

			if (success) {
				user.mfa.enrolled = false;
				user.mfa.created = new Date();
				user.markModified(`mfa`);
				try {
					await user.save();

					const data = {
						email: mail,
						tp_name: '2fa deactivated',
						global_merge_vars: [],
						tags: ['2fa deactivated']
					};
					background.sendMail(data);

					res
						.status(200)
						.send({ message: 'User successfuly un-enrolled into 2fa' });
				} catch (err) {
					Raven.captureException(err);
					res.status(422).send(err);
				}
			} else {
				res.status(422).send({ error: 'Invalid token' });
			}
		} catch(err) {
			Raven.captureException(err);
		}

	});
	// verify mfa on User collection
	app.post('/mfa/verify', requireLogin, async (req, res) => {
		const { token } = req.body;
		if (!req.user.mfa.enrolled) {
			res.status(422).send({ error: 'User is not enrolled into 2fa' });
		}
		try {
			const user = await User.findById(req.user._id).select('mfa');

			const success = speakeasy.totp.verify({
				secret: user.mfa.secret,
				encoding: `base32`,
				window: 1, // let user enter previous totp token because ux
				token
			});
			if (success) {
				delete req.session.mfaLock;
				res.status(200).send({ message: 'Valid token. Lock removed' });
				return true;
			} else {
				res.status(422).send({ error: 'Invalid token' });
			}
		} catch(err) {
			Raven.captureException(err);
		}

	});
};
