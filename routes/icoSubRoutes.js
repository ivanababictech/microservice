const mongoose = require('mongoose');
const requestify = require('requestify');
const Raven = require('raven');

const IcoSub = mongoose.model('icoSub');
const Ico = mongoose.model('icos');
const requireLogin = require('../middlewares/requireLogin');
const keys = require('../config/keys');

module.exports = app => {
	//create a icoSub record on IcoSub collection.
	app.post('/icoSub', requireLogin, async (req, res) => {
		const { ico } = req.body;
		const investor = req.user;
		const investorIco = investor._id + ico;
		try {
			const icoLpr = await Ico.findById(ico)
			.select('lprId')
			.exec();

			IcoSub.find(function(req, icoSub) {
				let flag = true;
				if (icoSub.length > 0) {
					for (let i = 0; i < icoSub.length; i++) {
						if (investorIco == icoSub[i]._investor + icoSub[i]._ico) {
							flag = false;
							break;
						}
					}
				}

				if (flag) {
					let item = new IcoSub();
					item._investor = investor.id;
					item._ico = ico;

					item.save(err => {
						if (err) {
							res.status(422).send(err);
						} else {
							requestify
								.request(keys.serverUrl + '/lepricoin/createWallets', {
									method: 'POST',
									body: {
										ico: item._ico,
										user: investor,
										lprId: icoLpr.lprId
									},
									dataType: 'json'
								})
								.then(function(response) {
									//console.log('ok', response);
									res.status(200).send(item);
								})
								.catch(err => {
									//console.log('err', err);
									res.status(422).send(err.getBody());
								});
						}
					});
				} else {
					res.status(406).send({ error: 'This item is already exists' });
				}
			});
		} catch(err) {
			Raven.captureException(err);
		}
		
	});
	// get all records from IcoSub collection with login
	app.get('/icoSub', requireLogin, async (req, res) => {
		try {
			await IcoSub.find((err, icoSubs) => {
				if (icoSubs) {
					res.status(200).send(icoSubs);
				} else {
					Raven.captureException(err);
					res.status(404).send(err);
				}
			});
		} catch(err) {
			Raven.captureException(err);
		}
		
	});
	// filter a icoSub record from IcoSub collection by ico and investor
	app.get('/icoSub/:investor/:ico', requireLogin, async (req, res) => {
		IcoSub.find(
			{
				_ico: req.params.ico,
				_investor: req.params.investor
			},
			(err, icoSubs) => {
				if (icoSubs.length > 0) {
					res.status(200).send(icoSubs);
				} else {					
					res.status(404).send('Not Found');
				}
			}
		);
	});
};
