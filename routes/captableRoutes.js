const mongoose = require('mongoose');
const Raven = require('raven');
const requireLogin = require('../middlewares/requireLogin');
const check2faLock = require('../middlewares/check2faLock');

const Captable = mongoose.model('captable');

module.exports = app => {
	// get all records from Captable collection by logged in user id.
	app.get('/captable', requireLogin, check2faLock, async (req, res) => {
		try {
			const captable = await Captable.find({ _investor: req.user._id });
			res.status(200).send(captable);
		} catch (err) {
			Raven.captureException(err);
			res.status(422).send(err);
		}
	});
	// create a captable record on Captable collection by logged in user id.
	app.post('/captable', requireLogin, check2faLock, async (req, res) => {
		const { _ico, type, amount } = req.body;
		const _investor = req.user._id;
		const captable = new Captable({
			_investor,
			_ico,
			type,
			amount,
		});
		try {
			await captable.save();

			res.status(200).send(captable);
		} catch (err) {
			Raven.captureException(err);
			res.status(422).send(err);
		}
	});
};
