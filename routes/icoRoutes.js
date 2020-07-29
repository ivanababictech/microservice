const mongoose = require('mongoose');
const requestify = require('requestify');
const async = require('async');
const Raven = require('raven');

const require2fa = require('../middlewares/require2fa');
const check2faLock = require('../middlewares/check2faLock');

const Ico = mongoose.model('icos');
const Transactions = mongoose.model('transactions');
const Captable = mongoose.model('captable');
const keys = require('../config/keys');
const ObjectId = mongoose.Types.ObjectId;

module.exports = app => {
	// get /ico --- get all records from Ico collection
	app.get('/ico', async (req, res) => {
		try {
			const icos = await Ico.find().select({
				created_at: false,
				updated_at: false
			});

			res.send(icos);
		} catch(err) {
			Raven.captureException(err);
		}

	});
	// get /ico/:icoId (ex: 5a39f3f96b650a1b0603891f)--- get a record where _id=icoID from Ico collection
	app.get('/ico/:icoId', async (req, res) => {
		try {
			const ico = await Ico.findById(req.params.icoId).select({
				created_at: false,
				updated_at: false
			});
			const icoResult = Object.assign({}, ico._doc);
			let data = [];
			try {
				data = await ico.periods.map(async period => {
					let temp = {};
					const transaction = await Transactions.aggregate([
						{
							$match: {
								_ico: new ObjectId(req.params.icoId),
								status: 'confirmed'
							}
						},
						{
							$group: {
								_id: '$_ico',
								tokensBuy: {
									$sum: {
										$cond: [
											{
												$and: [
													{ $eq: ['$type', 'buy'] },
													{
														$and: [
															{ $gte: ['$created_at', period.dateStart] },
															{ $lte: ['$created_at', period.dateEnd] }
														]
													}
												]
											},
											'$amount',
											0
										]
									}
								},
								tokensRefund: {
									$sum: {
										$cond: [
											{
												$and: [
													{ $eq: ['$type', 'refund'] },
													{
														$and: [
															{ $gte: ['$created_at', period.dateStart] },
															{ $lte: ['$created_at', period.dateEnd] }
														]
													}
												]
											},
											'$amount',
											0
										]
									}
								}
							}
						}
					]);
					temp._id = period._id;
					temp.name = period.name;
					temp.tokenPrice = period.tokenPrice;
					temp.minTokens = period.minTokens;
					temp.dateEnd = period.dateEnd;
					temp.dateStart = period.dateStart;
					temp.remainingTokens = Math.round(
						transaction[0].tokensBuy - transaction[0].tokensRefund
					);
					return temp;
				});
				Promise.all(data).then(results => {
					icoResult.periods = results;
					res.status(200).send(icoResult);
				});
			} catch(err) {
				Raven.captureException(err);
			}
		} catch(err) {
			Raven.captureException(err);
		}
	});
	// get method /ico/:icoId/close  get data from Transactions collection where icoID=Transaction._ico and Transaction.status='confirmed'
	app.get('/ico/:icoId/close', async (req, res) => {
		Transactions.find({
			$and: [{ _ico: req.params.icoId }, { status: 'confirmed' }]
		})
			.select('_investor _ico amount type')
			.exec((err, transactions) => {
				if (err) res.status(422).send(err);
				else {
					let data = [];
					transactions.map(transaction => {
						let temp = {};
						temp.investor = transaction._investor;
						temp.ico = transaction._ico;
						temp.amount = transaction.amount;
						//temp.type = transaction.type;
						temp.type = 'distribution';
						data.push(temp);
					});
					res.status(200).send(data);
				}
			});
	});

	// post method /ico/:icoId/close/confirm
	// update a record where _id=IcoID by Ico.status='closed'
	app.post('/ico/:icoId/close/confirm', async (req, res) => {
		const confirmData = req.body;
		async.parallel(
			confirmData.map(item => {
				return callback => {
					createCaptable(item, callback);
				};
			}),
			(err, results) => {
				if (err) {
					res.status(422).send({ success: false, error: err });
				} else {
					Ico.findById(req.params.icoId, (error, ico) => {
						if (error) {
							res.status(422).send({ success: false, error: error });
						} else {
							ico.status = 'closed';
							ico.save(ierr => {
								if (ierr)
									res.status(422).send({ success: false, error: error });
								else
									res.status(200).send({ success: true, message: 'Success' });
							});
						}
					});
				}
			}
		);
	});

	function createCaptable(item, callback) {
		const captable = new Captable();
		captable._investor = item.investor;
		captable._ico = item.ico;
		captable.amount = item.amount;
		captable.type = 'distribution';
		captable.save(err => {
			if (err) {
				Raven.captureException(err);
				return callback(err);
			} else {
				callback(null, 'create success');
			}
		});
	}
	
};
