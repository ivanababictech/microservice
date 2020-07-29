const mongoose = require('mongoose');
const moment = require('moment');
const Raven = require('raven');

const requireLogin = require('../middlewares/requireLogin');
const check2faLock = require('../middlewares/check2faLock');

const Transactions = mongoose.model('transactions');
const xRate = mongoose.model('xRate');
const Ico = mongoose.model('icos');
const ObjectId = mongoose.Types.ObjectId;

module.exports = app => {
	// get method /transactions with login
	// return all records from Transactions where _investor=req.user._id with login
	app.get('/transactions', requireLogin, async (req, res) => {
		try {
			const transactions = await Transactions.find({
				_investor: req.user._id
			})
				.populate('_ico', 'name periods')
				.exec(function(error, transactions) {
					if (error) {
						Raven.captureException(err);
						res.status(422).send(error);
					}
					else res.status(200).send(transactions);
				});
		} catch(err) {
			Raven.captureException(err)
		}
		
	});

	// post method /transactions with login
	// create a transaction record on Transactions collection
};
