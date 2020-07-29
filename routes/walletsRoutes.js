const mongoose = require('mongoose');
const Raven = require('raven');

const requireLogin = require('../middlewares/requireLogin');
const check2faLock = require('../middlewares/check2faLock');

const Wallets = mongoose.model('wallets');

module.exports = app => {
	// get a wallets record where _investor=req.user._id and _ico=req.params.ico from Wallets collection
	app.get('/wallets/:ico', requireLogin, async (req, res) => {
		try {
			const wallets = await Wallets.find({
				_investor: req.user._id,
				_ico: req.params.ico
			});
	
			res.status(200).send(wallets);
		} catch(err) {
			Raven.captureException(err);
		}
		
	});
	// create a walletes record on Wallets collection
	app.post('/wallets', requireLogin, check2faLock, async (req, res) => {
		const { _ico, btcAddress, ethAddress } = req.body;
		const _investor = req.user._id;
		const wallets = new Wallets({
			_investor,
			_ico,
			btcAddress,
			ethAddress
		});
		try {
			await wallets.save();

			res.status(200).send(wallets);
		} catch (err) {
			Raven.captureException(err);
			res.status(422).send(err);
		}
	});
};
