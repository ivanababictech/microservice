const mongoose = require('mongoose');
const speakeasy = require('speakeasy');
const token = require('crypto-token');
const Raven = require('raven');

const requireLogin = require('../middlewares/requireLogin');
const check2faLock = require('../middlewares/check2faLock');
const background = require('../services/background');
const keys = require('../config/keys');

const Transactions = mongoose.model('transactions');
const User = mongoose.model('investors');
const Ico = mongoose.model('icos');
const ObjectId = mongoose.Types.ObjectId;

module.exports = app => {
	//withdrawal verification check
	app.post('/confirmWithdrawal', async (req, res) => {
		const { token } = req.body;
		try {
			const withdrawal = await Transactions.findOne({
				txId: token,
				status: 'unconfirmed'
			});
			if (withdrawal) {
				withdrawal.status = 'pending';
				try {
					await withdrawal.save();
					res.send({ message: 'Confirmed!' });
					return;
				} catch(err) {
					Raven.captureException(err);
				}

			} else {
				res.status(404).send({
					success: false,
					error: 'Verification token is not valid'
				});
				return;
			}
		} catch(err) {
			Raven.captureException(err);
		}
	});

	// create a withdrawals record on Withdrawals collection
	app.post('/withdrawals', requireLogin, async (req, res) => {
		const { _ico, amount, mfaToken, currency, address } = req.body;
		const _investor = req.user._id;
		//amount = parseInt(amount.replace(',', ''));
		try {
			const user = await User.findById(_investor).select('mfa');

			const success = speakeasy.totp.verify({
				secret: user.mfa.secret,
				encoding: 'base32',
				window: 2, // let user enter previous totp token because ux
				token: mfaToken
			});

			if (success) {
				const ico = await Ico.findById(_ico)
					.select('periods symbol')
					.exec();
				const currentPeriod = ico.periods[ico.periods.length - 1];

				const captable = await Transactions.aggregate([
					{
						$match: {
							_ico: new ObjectId(_ico),
							_investor: new ObjectId(_investor)
						}
					},
					{
						$group: {
							_id: '$_investor',
							tokensDistribution: {
								$sum: {
									$cond: [
										{ $eq: ['$type', 'distribution'] },
										{ $multiply: ['$amount', '$xRate'] },
										0
									]
								}
							},
							tokensWithdraw: {
								$sum: {
									$cond: [
										{
											$and: [
												{ $eq: ['$type', 'withdraw'] },
												{ $eq: ['$status', 'confirmed'] }
											]
										},
										{
											$divide: [{ $multiply: ['$amount', '$xRate'] }, 1]
										},
										0
									]
								}
							}
						}
					}
				]);
				const substract =
					captable[0].tokensDistribution - captable[0].tokensWithdraw;
				if (substract >= amount) {
					const withdrawal = new Transactions({
						_investor,
						_ico,
						xRate: 1,
						type: 'withdraw',
						amount,
						currency,
						address,
						status: 'unconfirmed',
						txId: token(32)
					});
					try {
						await withdrawal.save();
						try {
							const ico = await Ico.findById(_ico).select('name');

							const data = {
								email: req.user.email,
								tp_name: 'Withdrawal request',
								global_merge_vars: [
									{
										name: 'iconame',
										content: ico.name
									},
									{
										name: 'confirmationurl',
										content:
											keys.redirectDomain + '/confirmWithdrawal/' + withdrawal.txId
									}
								],
								tags: ['Withdrawal request']
							};
							background.sendMail(data);
							res.status(200).send(withdrawal._id);
						} catch(err) {
							Raven.captureException(err);
						}
					} catch (err) {
						Raven.captureException(err);
						res.status(422).send({
							success: false,
							error: err
						});
					}
				} else {
					res.status(422).send({
						success: false,
						error: 'Not enough remaining tokens to proceed'
					});
				}
			} else {
				res.status(422).send({
					success: false,
					error: 'Invalid token'
				});
			}
		} catch(err) {
			Raven.captureException(err);
		}

	});
};
