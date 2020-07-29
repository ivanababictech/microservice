const mongoose = require('mongoose');
const Raven = require('raven');

const xRates = mongoose.model('xRate');
const rateLog = mongoose.model('ratelogs');
const Transactions = mongoose.model('transactions');
const axios = require('axios');
const moment = require('moment');
const _ = require('lodash');

module.exports = app => {
	//    get method to create xrate on xRate collection.

	app.get('/xRate/create', async (req, res) => {
		// don't allow duplicate xRate data create!
		let btcArray = [];
		let ethArray = [];
		const now = new Date();
		const start = new Date();
		start.setHours(0, 0, 0, 0);

		const end = new Date();
		end.setHours(23, 59, 59, 999);
		//btc coinmarket
		try {
			const coinmarketBtc = await axios(
				'https://api.coinmarketcap.com/v1/ticker/bitcoin/'
			);
			if (coinmarketBtc.data) {
				await rateLog.create({
					source: 'coinmarket',
					currency: 'BTC',
					raw: coinmarketBtc.data[0],
					date: new Date(now.getTime() + now.getTimezoneOffset() * 60000)
				});
				btcArray.push(Number(coinmarketBtc.data[0].price_usd));
			}

			//btc coinbase
			try {
				const coinbaseBtc = await axios(
					'https://api.coinbase.com/v2/prices/BTC-USD/buy'
				);
				if (coinbaseBtc.data) {
					await rateLog.create({
						source: 'coinbase',
						currency: 'BTC',
						raw: coinbaseBtc.data.data,
						date: new Date(now.getTime() + now.getTimezoneOffset() * 60000)
					});
					btcArray.push(Number(coinbaseBtc.data.data.amount));
				}
			} catch (err) {
				Raven.captureException(err);
			}
			try {
				//btc kraken
				const krakenBtc = await axios(
					'https://api.kraken.com/0/public/Ticker?pair=XXBTZUSD'
				);
				if (krakenBtc.data) {
					await rateLog.create({
						source: 'kraken',
						currency: 'BTC',
						raw: krakenBtc.data.result.XXBTZUSD,
						date: new Date(now.getTime() + now.getTimezoneOffset() * 60000)
					});
					btcArray.push(Number(krakenBtc.data.result.XXBTZUSD.c[0]));
				}
			} catch (err) {
				Raven.captureException(err);
			}

			try {
				const xrateBtc = new xRates({
					currency: 'BTC',
					rate: _.meanBy(btcArray),
					date: new Date(now.getTime() + now.getTimezoneOffset() * 60000)
				});
				await xrateBtc.save();
			} catch (err) {
				Raven.captureException(err);
			}
			//eth coinmarket
			try {
				const coinmarketEth = await axios(
					'https://api.coinmarketcap.com/v1/ticker/ethereum/'
				);

				if (coinmarketEth.data) {
					await rateLog.create({
						source: 'coinmarket',
						currency: 'ETH',
						raw: coinmarketEth.data[0],
						date: new Date(now.getTime() + now.getTimezoneOffset() * 60000)
					});
					ethArray.push(Number(coinmarketEth.data[0].price_usd));
				}
			} catch (err) {
				Raven.captureException(err);
			}
			//eth conibase
			try {
				const coinbaseEth = await axios(
					'https://api.coinbase.com/v2/prices/ETH-USD/buy'
				);
				if (coinbaseEth.data) {
					await rateLog.create({
						source: 'coinbase',
						currency: 'ETH',
						raw: coinbaseEth.data.data,
						date: new Date(now.getTime() + now.getTimezoneOffset() * 60000)
					});
					ethArray.push(Number(coinbaseEth.data.data.amount));
				}
			} catch (err) {
				Raven.captureException(err);
			}
			try {
				const krakenEth = await axios(
					'https://api.kraken.com/0/public/Ticker?pair=XETHZUSD'
				);
				if (krakenEth.data) {
					await rateLog.create({
						source: 'kraken',
						currency: 'ETH',
						raw: krakenEth.data.result.XETHZUSD,
						date: new Date(now.getTime() + now.getTimezoneOffset() * 60000)
					});
					ethArray.push(Number(krakenEth.data.result.XETHZUSD.c[0]));
				}
			} catch (err) {
				Raven.captureException(err);
			}

			//eth kraken

			const xrateEth = new xRates({
				currency: 'ETH',
				rate: _.meanBy(ethArray),
				date: new Date(now.getTime() + now.getTimezoneOffset() * 60000)
			});
			try {
				await xrateEth.save();
				res.status(200).send({ message: 'Created' });
			} catch (err) {
				Raven.captureException(err);
			}
		} catch (err) {
			Raven.captureException(err);
		}
	});

	//     get method  /xrate to get all records
	app.get('/xRate', async (req, res) => {
		try {
			const xrates = await xRates.find().select({});
			res.send(xrates);
		} catch (err) {
			Raven.captureException(err);
		}
	});

	//  post method /xRate/custom      filter xRate from all records.
	app.post('/xRate/custom', async (req, res) => {
		try {
			const xrates = await xRate.find({ rate: req.params.rate }).select({});
			res.send(xrates);
		} catch (err) {
			Raven.captureException(err);
		}
	});

	//  get method where can pass date and currency, return rate
	// ex:  /xRate/getRate?date=2017-12-29&currency=BTC
	app.get('/xRate/getRate/:currency/:date', async (req, res) => {
		const pass_date = req.params.date;
		const pass_currency = req.params.currency;
		try {
			const xrates = await xRates
				.findOne({ currency: pass_currency })
				.sort({ date: -1 })
				.exec();

			res.send({ rate: xrates.rate });
			return;
		} catch (err) {
			Raven.captureException(err);
		}
	});

	//create method where I can send date, rate and currency and you will update rate for that date and currency
	//ex: /xRate/updateRate?date=2017-12-29&currency=BTC&rate=14499
	// app.get('/xRate/updateRate', async (req, res) => {
	// 	var pass_date = req.query.date;
	// 	var pass_currency = req.query.currency;
	// 	var pass_rate = parseInt(req.query.rate);

	// 	var ID;
	// 	const xrates = await xRate.find({ currency: pass_currency }).select({});
	// 	for (var i = 0, len = xrates.length; i < len; i++) {
	// 		if (pass_date == xrates[i].date.toISOString().slice(0, 10)) {
	// 			ID = xrates[i]._id;
	// 			break;
	// 		}
	// 	}
	// 	var Now_Date = new Date();
	// 	xRate.findById(ID, (err, xrate) => {
	// 		xrate.rate = pass_rate;
	// 		xrate.date = Now_Date;
	// 		xrate.save();
	// 		res.send(xrate);
	// 	});
	// });
	/////////////////////////////////////////////////////////////////////////////////

	//  Update all records from transactions collections where _ico === req.body.ico, date === req.body.date and currency === req.body.currency
	//  set transaction.xRate === req.body.xRate
	//  ex: /xRate/update?ico=&date=2017-12-29&currency=ETH&xRate=720
	app.put('/xRate/update', async (req, res) => {
		const pass_ico = req.body.ico;
		const pass_date = req.body.date;
		const pass_currency = req.body.currency;
		const pass_xRate = req.body.xRate;
		let ID;
		try {
			const xtransaction = await Transactions.find().select({});

			for (let i = 0, len = xtransaction.length; i < len; i++) {
				if (
					pass_date == xtransaction[i].updated_at.toISOString().slice(0, 10) &&
					pass_currency == xtransaction[i].currency &&
					pass_ico == xtransaction[i]._ico
				) {
					ID = xtransaction[i]._id;
					Transactions.findById(ID, (err, utransaction) => {
						utransaction.xRate = pass_xRate;
						utransaction.save();
					});
				}
			}
			const updated_transaction = {
				_ico: pass_ico,
				date: pass_date,
				currency: pass_currency,
				xRate: pass_rate
			};
			res.send(updated_transaction);
		} catch (err) {
			Raven.captureException(err);
		}
	});
};
