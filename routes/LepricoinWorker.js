const mongoose = require('mongoose');
const requestify = require('requestify');
const _ = require('lodash');
const moment = require('moment');
const Raven = require('raven');

const Ico = mongoose.model('icos');
const Investor = mongoose.model('investors');
const Wallets = mongoose.model('wallets');
const Transactions = mongoose.model('transactions');
const xRate = mongoose.model('xRate');

const requireLogin = require('../middlewares/requireLogin');
const background = require('../services/background');
const keys = require('../config/keys');

module.exports = app => {
	// create a wallet record by lepricoin
	app.post('/lepricoin/createWallets', (req, res) => {
		const ico = req.body.ico;
		const icoLprId = req.body.lprId;
		const user = req.body.user;
		//console.log(user);
		if (!ico) {
			res.status(400).send({ error: 'Missing parameter' });
		} else {
			const url = keys.lepricoin_api_url + 'accounts';
			requestify
				.request(url, {
					method: 'POST',
					body: {
						email: user.email,
						extra: user._id,
						ico: icoLprId
					},
					auth: {
						username: keys.lepricoin_api_username,
						password: keys.lepricoin_api_password
					},
					dataType: 'json'
				})
				.then(async function(response) {
					const responseData = response.getBody();
					//console.log(responseData);
					const _ico = ico;
					const btcAddress = responseData.addresses.filter(item => {
						return item.currency === 'btc';
					})[0].address;
					const ethAddress = responseData.addresses.filter(item => {
						return item.currency === 'eth';
					})[0].address;
					const _investor = user._id;
					const lprId = responseData.uuid;

					const wallets = new Wallets({
						_investor,
						_ico,
						btcAddress,
						ethAddress,
						lprId
					});

					try {
						await wallets.save();
						res.status(200).send(wallets);
					} catch (err) {
						Raven.captureException(err);
						res.status(422).send(err);
					}
				})
				.catch(err => {
					res.status(404).send(err.getBody());
				});
		}
	});

	app.post('/lepricoin/transactionCallback', async (req, res) => {
		const {
			address,
			currency,
			amount,
			confirmations,
			txid,
			txtype,
			status,
			created_at,
			ico,
			account
		} = req.body;

		const url =
			keys.lepricoin_api_url +
			'crypto/transactions?address__account=' +
			account +
			'&txid=' +
			txid;
		requestify
			.request(url, {
				method: 'GET',
				auth: {
					username: keys.lepricoin_api_username,
					password: keys.lepricoin_api_password
				},
				dataType: 'json'
			})
			.then(async response => {
				const resVal = response.getBody();
				if (resVal.length > 0) {
					if (resVal[0].account === account && resVal[0].txid === txid) {
						try {
							const investorIco = await Wallets.findOne({
								lprId: account
							})
								.populate('_ico', 'name')
								.populate('_investor', 'email')
								.exec();
							Transactions.findOne({
								txId: txid,
								_ico: investorIco._ico._id,
								_investor: investorIco._investor._id
							}).then(async item => {
								// console.log('item:', item);
								if (item) {
									if (status === 'done') {
										item.status = 'confirmed';
									} else if (status === 'pending') {
										item.status = 'pending';
									}

									item.save(err => {
										if (err) {
											res.status(422).send(err);
										} else res.status(200).send(item);
									});
								} else {
									let new_item = new Transactions();
									new_item._investor = investorIco._investor._id;
									new_item._ico = investorIco._ico._id;
									new_item.amount = amount;
									new_item.txId = txid;
									new_item.type = 'buy';
									new_item.currency = currency.toUpperCase();

									if (status === 'done') {
										new_item.status = 'confirmed';
									} else if (status === 'pending') {
										new_item.status = 'pending';
									}
									// new_item.created_at = created_at;
									new_item.created_at = (new Date(resVal[0].txtime)).toUTCString();

									const xrate = await xRate
										.findOne({
											currency: currency.toUpperCase()
										})
										.sort({
											date: -1
										})
										.exec();
									// console.log('xrate', xrate);
									if (xrate) {
										new_item.xRate = xrate.rate;
									}

									new_item.save(err => {
										if (err) {
											res.status(422).send(err);
										} else {
											res.status(200).send(new_item);
											const data = {
												email: investorIco._investor.email,
												tp_name: 'Investment received',
												global_merge_vars: [
													{
														name: 'iconame',
														content: investorIco._ico.name
													}
												],
												tags: ['investment received']
											};
											background.sendMail(data);
										}
									});
								}
							});
						} catch (err) {
							Raven.captureException(err);
							res.status(422).send(err);
						}
					} else {
						res.status(422).send('There is no request data');
					}
				} else {
					res.status(422).send('There is no request data');
				}
			})
			.catch(err => {
				Raven.captureException(err);
				res.status(422).send(err);
			});
	});

	// get Lepricoin transation of worker from Transacrion collection
	app.get('/worker/getLepricoinTransactions', (req, res) => {
		const url = keys.lepricoin_api_url + 'crypto/transactions';
		requestify
			.request(url, {
				method: 'GET',
				auth: {
					username: keys.lepricoin_api_username,
					password: keys.lepricoin_api_password
				},
				dataType: 'json'
			})
			.then(async response => {
				await _.map(response.getBody(), async transaction => {
					try {
						const investorIco = await Wallets.findOne({
							lprId: transaction.account
						})
							.populate('_ico', 'name')
							.populate('_investor', 'email')
							.exec();
						if(investorIco) {
							try {
								const existingTransaction = await Transactions.findOne({
									txId: transaction.txid,
									_ico: investorIco._ico._id,
									_investor: investorIco._investor._id
								});
								if (existingTransaction) {
									if (transaction.status === 'done') {
										existingTransaction.status = 'confirmed';
									} else if (transaction.status === 'pending') {
										existingTransaction.status = 'pending';
									}
			
									existingTransaction.updated_at = new Date();
									try {
										await existingTransaction.save();
									} catch(err) {
										Raven.captureException(err);
									}

								} else {
									let new_item = new Transactions();
									new_item._investor = investorIco._investor._id;
									new_item._ico = investorIco._ico._id;
									new_item.amount = transaction.amount;
									new_item.txId = transaction.txid;
									new_item.type = 'buy';
									new_item.currency = transaction.currency.toUpperCase();
									if (transaction.status === 'done') {
										new_item.status = 'confirmed';
									} else if (transaction.status === 'pending') {
										new_item.status = 'pending';
									}
									new_item.created_at = (new Date(transaction.txtime)).toUTCString();
									new_item.updated_at = new Date(moment.utc());
									try {
										const xrate = await xRate
										.findOne({
											currency: transaction.currency.toUpperCase()
										})
										.sort({ date: -1 })
										.exec();
										new_item.xRate = xrate.rate;
										await new_item.save();
										const data = {
											email: investorIco._investor.email,
											tp_name: 'Investment received',
											global_merge_vars: [
												{
													name: 'iconame',
													content: investorIco._ico.name
												}
											],
											tags: ['investment received']
										};
										background.sendMail(data);
									} catch(err) {
										Raven.captureException(err);
									}
								}
							} catch(err) {
								Raven.captureException(err)
							}
						}
					} catch(err) {
						Raven.captureException(err);
					}
				});
				res.status(200).send({ message: 'Transactions updated' });
			})
			.catch(err => {
				Raven.captureException(err);
				res.status(422).send(err);
			});
	});
};
