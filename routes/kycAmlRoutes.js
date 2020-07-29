const mongoose = require('mongoose');
const request = require('request');
const _ = require('lodash');
const async = require('async');
const moment = require('moment');

const keys = require('../config/keys');
const Investor = mongoose.model('investors');
const Ico = mongoose.model('icos');
const worker = require('../services/worker');

module.exports = app => {
	// update worker data on Investor collection
	app.get('/worker/updateAmlKyc', async (req, res) => {
		Investor.find(
			{
				idmAccountId: { $ne: '' },
				'verification.idmKyc': false,
				migrationId: null
			},
			(err, investors) => {
				if (err) {
					res.status(422).send(err);
					return;
				}

				if (investors.length > 0) {
					async.parallel(
						investors.map(investor => {
							return callback => {
								getPartyInfo(investor, (err, result) => {
									//const result = 'Success';
									if (!_.isNil(investor.idmAccountId)) {
										updateInvestorVerification(investor, callback);
									} else {
										callback(err, result);
									}
								});
							};
						}),
						(err, results) => {
							if (err) {
								res.status(422).send({ success: false, error: err });
							} else {
								res.status(200).send({ success: true, result: 'Success' });
							}
						}
					);
				} else {
					res.status(404).send({ success: false, error: 'Not Found' });
				}
			}
		);
	});

	function getPartyInfo(investor, callback) {
		if (!_.isNil(investor.partyId)) {
			const options = {
				url: keys.ncApiUrl,
				method: 'POST',
				body: {
					developerAPIKey: keys.ncDeveloperKey,
					clientID: keys.ncClientID,
					partyId: investor.partyId
				},
				json: true
			};

			request(options, (err, resp, body) => {
				if (err) {
					return callback(err);
				}

				if (body != null && body.statusCode == 101) {
					const { kycStatus, amlStatus, amlDate } = body.partyDetails[0];
					if (kycStatus == 'Auto Approved') {
						investor.verification.ncKyc_status = 'Verified';
						investor.verification.ncKyc = true;
					} else if (kycStatus == 'Disapproved') {
						investor.verification.ncKyc_status = 'Not Verified';
						investor.verification.ncKyc = false;
					} else if (kycStatus == 'Pending') {
						investor.verification.ncKyc_status = 'Pending';
						investor.verification.ncKyc = false;
					}

					if (
						amlStatus == 'Auto Approved' ||
						amlStatus == 'Manually Approved'
					) {
						investor.verification.ncAml_status = 'Verified';
						investor.verification.ncAml = true;
					} else if (amlStatus == 'Disapproved') {
						investor.verification.ncAml_status = 'Not Verified';
						investor.verification.ncAml = false;
					} else if (amlStatus == 'Pending') {
						investor.verification.ncAml_status = 'Pending';
						investor.verification.ncAml = false;
					}

					if (
						_.isNil(investor.verification.Kyc_date) ||
						(!_.isNil(amlDate) && investor.verification.Kyc_date != amlDate)
					) {
						investor.verification.Kyc_date = amlDate;
					}

					if (
						_.isNil(investor.verification.Aml_date) ||
						investor.verification.Aml_date != amlDate
					) {
						investor.verification.Aml_date = amlDate;
					}

					investor.save(err => {
						if (err) {
							callback(err);
						} else {
							callback(null, 'update success');
						}
					});
				} else {
					callback(null, body.statusDesc);
				}
			});
		} else {
			callback(null);
		}
	}

	function updateInvestorVerification(investor, callback) {
		let targetPath = 'consumer';
		investor.investAs === 'Entity'
			? (targetPath = 'merchant')
			: (targetPath = 'consumer');

		const options = {
			url: `${keys.idmApiBaseUrl}${targetPath}/${investor.idmAccountId}`,
			method: 'GET',
			auth: {
				user: keys.consumerUser,
				password: keys.consumerPassword
			},
			json: true
		};

		request(options, (err, resp, body) => {
			if (err) {
				return callback(err);
			} else {
				//console.log(body);
				if (body) {
					if (body.ednaScoreCard) {
						const etrs = body.ednaScoreCard.etr;
						etrs.map(etr => {
							if (etr.test == 'ss:1') {
								if (etr.details == 'false') {
									investor.verification.idmAml = true;
									investor.verification.idmAml_status = 'Verified';
									investor.verification.Aml_date = moment(etr.ts).format(
										'MM DD YYYY h:mm A'
									);
								} else if (etr.details == 'true') {
									investor.verification.idmAml = false;
									investor.verification.idmAml_status = 'Rejected';
									investor.verification.Aml_date = moment(etr.ts).format(
										'MM DD YYYY h:mm A'
									);
								}
							}
						});
					}

					if (body.error_message) {
						return callback(body.error_message);
					}

					if (body.state == 'A') {
						investor.verification.idmKyc = true;
						investor.verification.idmKyc_status = 'Verified';
					} else if (body.state == 'R') {
						investor.verification.idmKyc = false;
						investor.verification.idmKyc_status = 'Pending';
					} else if (body.state == 'D') {
						investor.verification.idmKyc = false;
						investor.verification.idmKyc_status = 'Rejected';
					}

					investor.save(err => {
						if (err) {
							callback(err);
						} else {
							callback(null, 'update success');
						}
					});
				}
			}
		});
	}
	// create NcAccount on Investor collection
	app.get('/worker/createNcAccount', async (req, res) => {
		Investor.find(
			{
				$and: [
					{ $and: [{ partyId: { $ne: null } }, { partyId: { $ne: '' } }] },
					{ country: 'US' },
					{
						$or: [
							{ 'accreditation[0].ncAccount': { $eq: null } },
							{ 'accreditation[0].ncAccount': { $eq: '' } },
							{ accreditation: { $eq: null } },
							{ accreditation: { $eq: [] } }
						]
					}
				]
			},
			(err, investors) => {
				if (err) {
					res.status(422).send(err);
					return;
				}

				if (investors.length > 0) {
					async.parallel(
						investors.map(investor => {
							return callback => {
								createNcAccount(investor, callback);
							};
						}),
						(err, results) => {
							if (err) {
								res.status(422).send({ success: false, error: err });
							} else {
								res.status(200).send({ success: true, message: 'Success' });
							}
						}
					);
				} else {
					res.status(404).send({ error: 'Not Found' });
				}
			}
		);
	});

	function createNcAccount(investor, callback) {
		const options = {
			url: keys.ncCreateAcountApiUrl,
			method: 'PUT',
			body: {
				developerAPIKey: keys.ncDeveloperKey,
				clientID: keys.ncClientID,
				type: 'Individual',
				domesticYN: 'domestic account',
				streetAddress1: investor.address1,
				streetAddress2: investor.address2,
				city: investor.city,
				state: investor.state,
				zip: investor.zip,
				country: investor.country,
				KYCstatus: investor.verification.ncKyc_status,
				AMLstatus: investor.verification.ncAml_status,
				AccreditedStatus: 'Pending',
				approvalStatus: 'Pending'
			},
			json: true
		};

		request(options, (err, resp, body) => {
			if (err) {
				callback(err);
				return;
			}

			if (body != null && body.statusCode == 101) {
				var ncAccreditation = false;
				var ncAccreditation_status = 'accredited';
				var accreditationOverride = false;
				var accreditation_date = new Date();
				var ncAccount = body.accountDetails[0].accountId;

				//------------ accreditation codes for each ICO
				//investor.accreditation.ncAccount = body.accountDetails[0].accountId;
				var Accreditation = [];
				Ico.find({}, function(err, icos) {
					for (var i = 0, len = icos.length; i < len; i++) {
						if (icos[i].investorRules.accreditation) {
							Accreditation.push({
								ncAccreditation: ncAccreditation,
								ncAccreditation_status: ncAccreditation_status,
								accreditationOverride: accreditationOverride,
								accreditation_date: accreditation_date,
								ncAccount: ncAccount,
								_ico: icos[i]._id
							});
						}
					}
					investor.accreditation = Accreditation;
					//----------------------------------------------------------
					investor.save(error => {
						if (error) {
							callback(error);
						} else {
							createNcLink(investor, callback);
						}
					});
				});
			} else {
				callback(body.statusDesc);
			}
		});
	}

	function createNcLink(investor, callback) {
		const options = {
			url: keys.ncLinkApiUrl,
			method: 'PUT',
			body: {
				developerAPIKey: keys.ncDeveloperKey,
				clientID: keys.ncClientID,
				firstEntryType: 'Account',
				relatedEntryType: 'IndivACParty',
				linkType: 'owner',
				primary_value: 1,
				firstEntry: investor.accreditation.ncAccount,
				relatedEntry: investor.partyId
			},
			json: true
		};

		request(options, (err, resp, body) => {
			if (err) {
				callback(err);
				return;
			}

			if (body != null && body.statusCode == 101) {
				callback(null, body.linkDetails);
			} else {
				callback(body.statusDesc);
			}
		});
	}
	// Update Nc account of accreditation on Investor collection
	app.get('/worker/updateAccreditation', async (req, res) => {
		Investor.find(
			{
				$and: [
					{ 'accreditation.ncAccount': { $ne: null } },
					{ 'accreditation.ncAccount': { $ne: '' } }
				]
			},
			(err, investors) => {
				if (err) {
					res.status(422).send(err);
					return;
				}

				if (investors.length > 0) {
					async.parallel(
						investors.map(investor => {
							return callback => {
								getNcAccount(investor, callback);
							};
						}),
						(err, results) => {
							if (err) {
								res.status(422).send({ success: false, error: err });
							} else {
								res.status(200).send({ success: true, message: 'Success' });
							}
						}
					);
				} else {
					res.status(404).send({ success: false, error: 'Not Found' });
				}
			}
		);
	});

	function getNcAccount(investor, callback) {
		const options = {
			url: keys.ncGetAcountApiUrl,
			method: 'POST',
			body: {
				developerAPIKey: keys.ncDeveloperKey,
				clientID: keys.ncClientID,
				accountId: investor.accreditation.ncAccount
			},
			json: true
		};

		request(options, (err, resp, body) => {
			if (err) {
				callback(err);
				return;
			}

			if (body != null && body.statusCode == 101) {
				var ncAccreditation = false;
				var ncAccreditation_status = 'accredited';
				var accreditationOverride = false;
				var accreditation_date = new Date();
				if (
					body.accountDetails.accreditedStatus == 'Self Accredited' ||
					body.accountDetails.accreditedStatus == 'Verified Accredited'
				) {
					// investor.accreditation.ncAccreditation = true;
					// investor.accreditation.ncAccreditation_status = 'Verified';
					// investor.accreditation.accreditation_date =
					// 	body.accountDetails.accreditedInvestorDate;
					ncAccreditation = true;
					ncAccreditation_status = 'Verified';
					accreditation_date = body.accountDetails.accreditedInvestorDate;
				}

				if (body.accountDetails.accreditedStatus == 'Pending') {
					// investor.accreditation.ncAccreditation = false;
					// investor.accreditation.ncAccreditation_status = 'Accreditation';
					ncAccreditation = false;
					ncAccreditation_status = 'Accreditation';
				}

				if (body.accountDetails.accreditedStatus == 'Not Accredited') {
					// investor.accreditation.ncAccreditation = false;
					// investor.accreditation.ncAccreditation_status = 'Accreditation';
					ncAccreditation = false;
					ncAccreditation_status = 'Accreditation';
				}
				//------------ accreditation.ncAccount_ICO codes for ICO
				var ncAccount = body.accountDetails[0].accountId;
				var Accreditation = [];
				Ico.find({}, function(err, icos) {
					for (var i = 0, len = icos.length; i < len; i++) {
						if (icos[i].investorRules.accreditation) {
							Accreditation.push({
								ncAccreditation: ncAccreditation,
								ncAccreditation_status: ncAccreditation_status,
								accreditationOverride: accreditationOverride,
								accreditation_date: accreditation_date,
								ncAccount: ncAccount,
								_ico: icos[i]._id
							});
						}
					}
					investor.accreditation = Accreditation;
					//----------------------------------------------------
					investor.save(error => {
						if (error) {
							callback(error);
						} else {
							callback(null, 'update success');
						}
					});
				});
			} else {
				callback(body.statusDesc);
			}
		});
	}

	app.post('/kycAml/idmCallbackIndividual', async (req, res) => {
		//console.log(req.body);
		const data = req.body;

		//console.log(data.token);
		updateVerificationInvestor(data, (err, investor) => {
			if (err) {
				res.status(422).send({ success: false, error: err });
			} else {
				res.status(200).send({ success: true, result: 'Success' });
			}
		});
	});

	app.post('/kycAml/idmCallbackEntity', async (req, res) => {
		const data = JSON.parse(req.body);
		//console.log(data);
		updateVerificationInvestor(data, (err, investor) => {
			if (err) {
				res.status(422).send({ success: false, error: err });
			} else {
				res.status(200).send({ success: true, result: 'Success' });
			}
		});
	});

	function updateVerificationInvestor(data, callback) {
		//console.log(data);
		const { ednaScoreCard, tid, state } = data;
		if (!ednaScoreCard || !tid || !state) {
			callback('Missing parameter');
			return;
		}

		Investor.find(
			{
				idmAccountId: tid
			},
			(err, investor) => {
				if (err) {
					callback(err);
					return;
				}

				if (investor.length == 0) {
					callback('Investor not found');
					return;
				}

				if (ednaScoreCard) {
					const etrs = ednaScoreCard.etr;
					etrs.map(etr => {
						if (etr.test == 'ss:1') {
							if (etr.details == 'false') {
								investor[0].verification.idmAml = true;
								investor[0].verification.idmAml_status = 'Verified';
								investor[0].verification.Aml_date = moment(etr.ts).format(
									'MM DD YYYY h:mm A'
								);
							} else if (etr.details == 'true') {
								investor[0].verification.idmAml = false;
								investor[0].verification.idmAml_status = 'Rejected';
								investor[0].verification.Aml_date = moment(etr.ts).format(
									'MM DD YYYY h:mm A'
								);
							}
						}
					});
				}

				if (state == 'A') {
					investor[0].verification.idmKyc = true;
					investor[0].verification.idmKyc_status = 'Verified';
					investor[0].verification.Kyc_date = moment.utc(Date.now());
				} else if (state == 'R') {
					investor[0].verification.idmKyc = false;
					investor[0].verification.idmKyc_status = 'Pending';
					investor[0].verification.Kyc_date = moment.utc(Date.now());
				} else if (state == 'D') {
					investor[0].verification.idmKyc = false;
					investor[0].verification.idmKyc_status = 'Rejected';
					investor[0].verification.Kyc_date = moment.utc(Date.now());
				}
				//console.log('updated investor:', investor);
				investor[0].save(err => {
					if (err) {
						callback(err);
					} else callback(null, investor[0]);
				});
			}
		);
	}
};
