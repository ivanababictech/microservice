const mongoose = require('mongoose');
const moment = require('moment');
const requestify = require('requestify');
const QRCode = require('qrcode');
const _ = require('lodash');
const async = require('async');
const bodyParser = require('body-parser');
const request = require('request');
const multer = require('multer');
const mime = require('mime');
// const gcs = require( 'multer-gcs' );
const gcs = require('@voxjar/multer-gcs');
const Ico = mongoose.model('icos');
const Investor = mongoose.model('investors');
const Wallets = mongoose.model('wallets');
const InvestorDocs = mongoose.model('investorDoc');
const Raven = require('raven');

const requireLogin = require('../middlewares/requireLogin');
const checkDocument = require('../middlewares/checkDocument');
const background = require('../services/background');
const fileUpload = require('../services/fileUpload');
const worker = require('../services/worker');
const keys = require('../config/keys');

const storage = gcs({
	filename: function(req, file, cb) {
		cb(null, Date.now() + '.' + mime.getExtension(file.mimetype));
	},
	bucket: keys.bucketName,
	projectId: keys.googleProjectID,
	keyFilename: './config/keyfile.json'
});

const upload = multer({ storage: storage });

module.exports = app => {
	app.post('/emailPaymentInfo', requireLogin, async (req, res) => {
		const { ico, currency, amount, address } = req.body;
		if (currency === 'BTC') {
			QRCode.toDataURL(`bitcoin:${address}?amount=${amount}`, (err, qrCode) => {
				const content = `<br>BTC Address: <b>${address}</b>`;

				sendEmailToUser(req.user.email, ico, currency, content, qrCode);
			});
		}

		if (currency === 'ETH') {
			QRCode.toDataURL(`ethereum:${address}?value=${amount}`, (err, qrCode) => {
				const content = `<br>ETH Address: <b>${address}</b>`;

				sendEmailToUser(req.user.email, ico, currency, content, qrCode);
			});
		}

		if (currency === 'USD') {
			const content = `<table class="table table_wire article">
								<colgroup>
									<col>
									<col>
								</colgroup>

								<tbody>
									<tr>
										<td><b>Institution</b></td>
										<td>TRISTATE CAPITAL BANK</td>
									</tr>
									<tr>
										<td><b>Address</b></td>
										<td>ONE OXFORD CENTRE, SUITE 2700 301 GRANT STREET PITTSBURGH, PA 15219</td>
									</tr>

									<tr>
										<td><b>SWIFT</b></td>
										<td>TRTTUS33</td>
									</tr>
									<tr>
										<td><b>Account Name</b></td>
										<td>North Capital Private Securities</td>
									</tr>
									<tr>
										<td><b>Address</b></td>
										<td>623 E Ft Union Blvd Suite 101</td>
									</tr>
									<tr>
										<td><b>Account Number</b></td>
										<td>0220003339</td>
									</tr>
									<tr>
										<td><b>FFC</b></td>
										<td>[INVESTOR NAME]; Investment in ${ico} Token Sale</td>
									</tr>

								</tbody>
							</table>
							<br><br>
							<div class="wire__title">
								Please send <span class="text-danger">${amount} USD</span> to the bank account
								above (bank wire transfers only) to complete this transaction.<br />
								We will update your <span class="text-danger">USD</span> invested balance automatically after we receive your payment.
								<br />Fractional Tokens will be rounded down.
							</div>`;

			sendEmailToUser(req.user.email, ico, currency, content, '');
		}

		res.status(200).send({ message: 'Email sent' });
	});

	function sendEmailToUser(email, ico, currency, content, qrCode) {
		const data = {
			email: email,
			tp_name: 'Deposit instructions',
			global_merge_vars: [
				{
					name: 'ico',
					content: ico
				},
				{
					name: 'currency',
					content: currency
				},
				{
					name: 'content',
					content: content
				},
				{
					name: 'qrCode',
					content: ''
				}
			],
			tags: ['deposit instructions']
		};
		background.sendMail(data);
	}

	app.post('/auth/profile', requireLogin, async (req, res) => {
		const {
			firstName,
			lastName,
			country,
			securityQuestions,
			defaultIco
		} = req.body;
		req.user.firstName = firstName;
		req.user.lastName = lastName;
		req.user.country = country;
		req.user.defaultIco = defaultIco;
		req.user.securityQuestions = securityQuestions;
		try {
			const user = await req.user.save();

			res.status(200).send(user);
		} catch (err) {
			Raven.captureException(err);
			res.status(422).send(err);
		}
	});

	app.post('/auth/full_profile', requireLogin, async (req, res) => {
		const {
			firstName,
			lastName,
			dob,
			phone,
			address1,
			address2,
			state,
			zip,
			taxId,
			city,
			investAs,
			companyName,
			entityType
		} = req.body;
		if (!firstName || !lastName || !dob || !phone || !address1 || !city) {
			res.status(400).send({
				error: 'Missing parameter'
			});
		} else {
			req.user.firstName = firstName;
			req.user.lastName = lastName;
			req.user.dob = dob;
			req.user.phone = phone;
			req.user.address1 = address1;
			req.user.address2 = address2;
			req.user.state = state;
			req.user.zip = zip;
			req.user.taxId = taxId;
			req.user.investAs = investAs;
			req.user.companyName = companyName;
			req.user.entityType = entityType;
			req.user.city = city;

			//req.user.verification.idmAml_status = 'Pending';
			//req.user.verification.idmKyc_status = 'Pending';

			//	If investAs is Entity, require companyName
			if (investAs === 'Entity') {
				if (companyName == null || companyName == '') {
					res.status(400).send({
						error: 'If investAs is Entity, require companyName'
					});
					return;
				}
			}

			try {
				/*if (
					(req.user.verification.idmKyc === true ||
						req.user.verification.kycOverride === true) &&
					!_.isNil(req.user.idmAccountId)
				) {
					req.user.verification.idmKyc = false;
					req.user.verification.KycOverride = false;
					req.user.verification.idmKyc_status = 'Pending';

					if (req.user.investAs === 'Entity') {
						// If investAs is Entity, Merchant application
						if (req.user.companyName == null || req.user.companyName == '') {
							return res.status(400).send({
								success: false,
								error: 'If investAs is Entity, require companyName'
							});
						}

						if (req.user.entityType == null || req.user.entityType == '') {
							return res.status(400).send({
								success: false,
								error: 'If investAs is Entity, require entityType'
							});
						}

						const data = {
							action: 'createIDMEntityWithoutDoc',
							investor: req.user
						};

						background.queueIDMPartyAndEntity(data);
					} else {
						const data = {
							action: 'createIDMPartyWithoutDoc',
							investor: req.user
						};

						background.queueIDMPartyAndEntity(data);
					}
				} */
				const user = await req.user.save();
				res.status(200).send(user);
			} catch (err) {
				Raven.captureException(err);
				res.status(422).send(err);
			}
		}
	});

	app.post(
		'/investor/documents',
		requireLogin,
		upload.single('file'),
		async (req, res) => {
			if (!req.file || !req.body.title || !req.body.country) {
				res.status(400).send({
					error: 'Missing parameter'
				});
				return;
			}

			fileUpload.moveFile(req, res, async function(fileUrl) {
				const investorDocs = new InvestorDocs();
				investorDocs._investor = req.user._id;
				investorDocs.title = req.body.title;
				investorDocs.country = req.body.country;
				investorDocs.file = fileUrl;
				investorDocs.save(async error => {
					if (error) {
						res.status(422).send(error);
					} else {
						// Adds data to the queue to be processed by the worker.
						if (req.user.investAs === 'Entity') {
							// If investAs is Entity, Merchant application
							if (req.user.companyName == null || req.user.companyName == '') {
								res.status(400).send({
									success: false,
									error: 'If investAs is Entity, require companyName'
								});
								return;
							}

							if (req.user.entityType == null || req.user.entityType == '') {
								res.status(400).send({
									success: false,
									error: 'If investAs is Entity, require entityType'
								});
								return;
							}
							req.user.verification.idmKyc_status = 'Pending';
							req.user.verification.idmAml_status = 'Pending';
							try {
								const user = await req.user.save();
								background.queueIDMCreateEntity(
									req.user,
									investorDocs,
									fileUrl,
									req.file.mimetype
								);
							} catch(err) {
								Raven.captureException(err)
							}

						} else {
							background.queueIDMCreateParty(
								req.user,
								investorDocs,
								fileUrl,
								req.file.mimetype
							);
						}

						const data = {
							email: req.user.email,
							tp_name: 'Verification submitted',
							global_merge_vars: [],
							tags: ['verification submitted']
						};
						background.sendMail(data);

						res.status(200).send(investorDocs);
					}
				});
			});
		}
	);

	app.post(
		'/investor/accreditationDocuments',
		requireLogin,
		upload.single('file'),
		async (req, res) => {
			if (!req.file || !req.body.title) {
				res.status(400).send({
					error: 'Missing parameter'
				});
				return;
			}

			fileUpload.moveFile(req, res, function(fileUrl) {
				const investorDocs = new InvestorDocs();
				investorDocs._investor = req.user._id;
				investorDocs.title = req.body.title;
				investorDocs.file = fileUrl;
				investorDocs.accreditation = true;
				investorDocs.save(error => {
					if (error) {
						res.status(422).send(error);
					} else {
						Ico.findById(req.body.ico_id, (err, ico) => {
							res.send({ investorDocs: investorDocs, icodocs: ico.documents });
						});
						//create ncAccount
						Investor.find({}, (err, investors) => {
							async.parallel(
								investors.map(investor => {
									return callback => {
										if (investor.country === 'US') {
											let data = { investor: investor };
											if (investor.investAs === 'Individual') {
												data.action = 'createNCParty';
											} else data.action = 'createNCEntity';

											background.queueNCPartyAndEntity(data);

											createNcAccount(
												investor,
												investorDocs,
												req.file.originalname,
												req.file.mimetype,
												callback
											);
										}
									};
								}),
								(err, results) => {
									if (err) {
										console.log(err);
									} else {
										console.log('success');
									}
								}
							);
						});
					}
				});
			});
		}
	);

	app.post('/investor/isVerified', requireLogin, async (req, res) => {
		const investor = req.user;
		const { ico } = req.body;
		try {
			const icoRules = await Ico.findById(ico).select('investorRules');
			try {
				const restricted_Countries = await Ico.findById(ico).select(
					'restrictedCountries'
				);
				var restricted = restricted_Countries.restrictedCountries;
				if (restricted.indexOf(investor.country) > -1) {
					res.send({ status: 'Restricted' });
					return;
				}
				try {
					const investorVerification = await Investor.findById(investor._id).select(
						'verification accreditation country'
					);
			
					const amlAge = moment().diff(
						moment(investorVerification.verification.Aml_date),
						'months',
						true
					);
					const kycAge = moment().diff(
						moment(investorVerification.verification.Kyc_date),
						'months',
						true
					);
			
					if (!icoRules) {
						res.status(404).send({
							error: 'Wrong ICO or no rules yet '
						});
						return;
					}
					if (icoRules.investorRules.aml) {
						if (
							(!investorVerification.verification.idmAml &&
								!investorVerification.verification.amlOverride) ||
							(amlAge > 12 || amlAge <= 0)
						) {
							res.status(200).send({
								status: investorVerification.verification.idmAml_status
							});
							return;
						}
					}
			
					if (icoRules.investorRules.kyc) {
						if (
							(!investorVerification.verification.idmKyc &&
								!investorVerification.verification.kycOverride) ||
							(kycAge > 12 || kycAge <= 0)
						) {
							res.status(200).send({
								status: investorVerification.verification.idmKyc_status
							});
							return;
						}
					}
			
					if (
						icoRules.investorRules.accreditation &&
						investorVerification.country === 'US'
					) {
						const accreditationObject = _.find(investorVerification.accreditation, {
							_ico: ico
						});
						if (accreditationObject) {
							const accreditationAge = moment().diff(
								moment(accreditationObject.accreditation_date),
								'months',
								true
							);
			
							if (
								(!accreditationObject.ncAccreditation &&
									!accreditationObject.accreditationOverride) ||
								(accreditationAge > 3 || accreditationAge <= 0)
							) {
								res.status(200).send({
									status: accreditationObject.ncAccreditation_status
								});
								return;
							}
						} else {
							res.status(200).send({
								status: 'Not Accredited'
							});
							return;
						}
					}
					res.status(200).send({
						status: 'Verified'
					});
				} catch(err) {
					Raven.captureException(err)
				}
				
			} catch(err) {
				Raven.captureException(err)
			}
			
		} catch(err) {
			Raven.captureException(err)
		}
		
	});

	app.get('/investor', async (req, res) => {
		try {
			const investor = await Investor.find().select({});
			res.send(investor);
		} catch(err) {
			Raven.captureException(err)
		}
		
	});

	function createNcAccount(
		investor,
		investorDoc,
		fileName,
		fileType,
		callback
	) {
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
			if (err) return callback(err);

			if (body != null && body.statusCode == 101) {
				const ncAccount = body.accountDetails[0].accountId;
				let accreditation = [];
				Ico.find({}, (err, icos) => {
					icos.map(ico => {
						if (ico.investorRules.accreditation) {
							accreditation.push({
								ncAccount: ncAccount,
								_ico: ico._id
							});
						}
					});
					investor.accreditation = accreditation;
					investor.save(error => {
						if (error) {
							callback(error);
						} else {
							if (investor.partyId)
								createNcLink(
									investor,
									ncAccount,
									investorDoc,
									fileName,
									fileType,
									callback
								);
							else callback(null);
						}
					});
				});
			} else {
				callback(body.statusDesc);
			}
		});
	}

	function createNcLink(
		investor,
		ncAccount,
		investorDoc,
		fileName,
		fileType,
		callback
	) {
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
				return callback(err);
			}

			if (body != null && body.statusCode == 101) {
				// Adds data to the queue to be processed by the worker.
				background.queueAccreditationDocuments(
					investor,
					investorDoc,
					fileName,
					fileType,
					ncAccount
				);
				callback(null, body.linkDetails);
			} else {
				callback(body.statusDesc);
			}
		});
	}

	// app.use(function(err, req, res, next) {
	// 	if (err.code === 'LIMIT_FILE_SIZE') {
	// 		res.send({
	// 			error: 'File size must be no more than 10MB'
	// 		});
	// 		return;
	// 	}
	// });
};
