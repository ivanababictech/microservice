'use strict';

const fs = require('fs');
const mongoose = require('mongoose');
const cookieSession = require('cookie-session');
const bodyParser = require('body-parser');
const axios = require('axios');
const request = require('request');
const Storage = require('@google-cloud/storage');
const moment = require('moment');
const { URL } = require('url');
const base64Img = require('base64-img');
const _ = require('lodash');
const Raven = require('raven');

const keys = require('../config/keys');
const background = require('./background');
const sendMail = require('./sendMail');

require('../models/Investor');

mongoose.Promise = global.Promise;
mongoose.connect(keys.mongoURI, {
	useMongoClient: true
});

const storage = new Storage({
	projectId: keys.googleProjectID,
	keyFilename: './config/keyfile.json'
});
const docsBucket = storage.bucket(keys.bucketName);

const Investor = mongoose.model('investors');

function subscribe() {
	//background.deleteSubscription('shared-worker-subscription')
	// Subscribe to Cloud Pub/Sub and receive messages to process users.
	// The subscription will continue to listen for messages until the process
	// is killed.
	// [START subscribe]
	const unsubscribeFn = background.subscribe((err, message) => {
		// Any errors received are considered fatal.
		if (err) {
			console.log('subscribe error:', err);
			throw err;
		}

		const data = JSON.parse(message.data);
		console.log(`Received request:${data.action}`);
		if (data.action === 'createIDMParty') {
			// message.ack();
			createIDMParty(data, (err, result) => {
				if (result) {
					console.log('createIDMParty success');
					message.ack(); // Remove message from queue after it is processed successfully
				}
			});
		} else if (data.action === 'createIDMEntity') {
			createIDMEntity(data, (err, result) => {
				if (result) {
					console.log('createIDMEntity success');
					message.ack();
				}
			});
		} else if (data.action == 'uploadNCPartyDocument') {
			uploadNCPartyDocument(data, (err, result) => {
				if (result) {
					message.ack();
				}
			});
		} else if (data.action == 'uploadNCVerificationDocument') {
			uploadNCVerificationDocument(data, (err, result) => {
				if (result) {
					message.ack();
				}
			});
		} else if (data.action == 'createNCParty') {
			createNCParty(data, (err, result) => {
				if (result) {
					console.log('createNCParty success');
					message.ack();
				}
			});
		} else if (data.action == 'updateNCParty') {
			// message.ack();
			updateNCParty(data, (err, result) => {
				if (result) {
					console.log('updateNCParty success');
					message.ack();
				}
			});
		} else if (data.action == 'createNCEntity') {
			createNCEntity(data, (err, result) => {
				if (result) {
					console.log('createNCEntity success');
					message.ack();
				}
			});
		} else if (data.action == 'updateNCEntity') {
			updateNCEntity(data, (err, result) => {
				if (result) {
					console.log('updateNCEntity success');
					message.ack();
				}
			});
		} else if (data.action == 'createIDMEntityWithoutDoc') {
			createIDMEntityWithoutDoc(data, (err, result) => {
				if (result) {
					console.log('createIDMEntityWithoutDoc success');
					message.ack();
				}
			});
		} else if (data.action == 'createIDMPartyWithoutDoc') {
			createIDMPartyWithoutDoc(data, (err, result) => {
				if (result) {
					console.log('createIDMPartyWithoutDoc success');
					message.ack();
				}
			});
		} else if (data.action == 'sendMailToUser') {
			sendMailToUser(data, (err, result) => {
				if (result) {
					console.log('sendMail success');
					message.ack();
				}
			});
		} else {
			console.log('Unknown request');
		}
	});
	// [END subscribe]
	return unsubscribeFn;
}

/*
IDM call to get transaction ID
*/
async function createIDMParty(data, callback) {
	let docName = 'DL';
	switch (data.investorDocs.title) {
		case 'Passport':
			docName = 'PP';
			break;
		case 'ID card':
			docName = 'ID';
			break;
		case 'Driver license':
			docName = 'DL';
			break;
		case 'RP':
			docName = 'Residence permit';
			break;
		case 'Utility bill':
			docName = 'UB';
			break;
	}

	const parsedUrl = new URL(data.investorDocs.file);
	const docPath = parsedUrl.pathname.replace(`/${keys.bucketName}/`, '');
	let expiresTime = new Date();
	expiresTime.setMinutes(expiresTime.getMinutes() + 5);
	const docFile = docsBucket.file(docPath);
	var config = {
		action: 'read',
		expires: expiresTime
	};
	try {
		const publicUrl = await docFile.getSignedUrl(config);
		const response = await axios(publicUrl[0], {
			responseType: 'arraybuffer'
		});
		let scanData = new Buffer(response.data, 'binary').toString('base64');
		scanData = `data:${response.headers[
			'content-type'
		].toLowerCase()};base64,${scanData}`;
	
		let options = {
			url: keys.idmApiBaseUrl + 'consumer',
			method: 'POST',
			auth: {
				username: keys.idmUsername,
				password: keys.idmPassword
			},
			body: {
				dob: moment(data.investor.dob).format('YYYY-MM-DD'),
	
				man: data.investor.email,
				tea: data.investor.email,
				bfn: data.investor.firstName,
				bln: data.investor.lastName,
				profile: 'KYCAML',
				bsn: data.investor.address1,
				bco: data.investor.country,
				bz: data.investor.zip,
				bc: data.investor.city,
				bs: data.investor.state,
				phn: data.investor.phone,
				docCountry: data.investorDocs.country,
				docType: docName,
				scanData: scanData
			},
			json: true
		};
		if (data.investor.idmAccountId) {
			options.body.tid = data.investor.idmAccountId;
		}
		if (data.investor.country === 'US') {
			options.body.assn = data.investor.taxId;
		}
	
		request(options, (err, resp, body) => {
			if (err && resp.statusCode !== 200) {
				console.log('Error:', err);
				return;
			}
	
			if (body != null && resp.statusCode === 200) {
				Investor.find(
					{
						_id: data.investor._id
					},
					function(err, investor) {
						if (err) {
							throw err;
						} else {
							investor[0].idmAccountId = body.mtid;
							investor[0].verification.idmAml_status = 'Pending';
							investor[0].verification.idmKyc_status = 'Pending';
							investor[0].save(err => {
								if (err) console.log('Error:', err);
								else {
									callback(null, true); // To separate idm and nc call
									if (data.investor.investAs === 'Individual') {
										if (!data.investor.partyId || data.investor.partyId === '') {
											// To separate idm and nc call
											data.action = 'createNCParty';
											background.queueNCPartyAndEntity(data);
										} else {
											data.action = 'updateNCParty';
											background.queueNCPartyAndEntity(data);
										}
									}
								}
							});
						}
					}
				);
			} else console.log('Error:', body);
		});
	} catch(err) {
		Raven.captureException(err);
	}
	
}

async function createIDMPartyWithoutDoc(data, callback) {
	let options = {
		url: keys.idmApiBaseUrl + 'consumer',
		method: 'POST',
		auth: {
			username: keys.idmUsername,
			password: keys.idmPassword
		},
		body: {
			dob: moment(data.investor.dob).format('YYYY-MM-DD'),
			man: data.investor.email,
			tea: data.investor.email,
			bfn: data.investor.firstName,
			bln: data.investor.lastName,
			profile: 'KYCAML',
			bsn: data.investor.address1,
			bco: data.investor.country,
			bz: data.investor.zip,
			bc: data.investor.city,
			bs: data.investor.state,
			phn: data.investor.phone
		},
		json: true
	};
	if (data.investor.idmAccountId) {
		options.body.tid = data.investor.idmAccountId;
	}
	if (data.investor.country === 'US') {
		options.body.assn = data.investor.taxId;
	}

	request(options, (err, resp, body) => {
		if (err) {
			console.log('Error:', err);
			return;
		}

		if (body != null && resp.statusCode === 200) {
			Investor.find({ _id: data.investor._id }, (err, investor) => {
				if (err) {
					throw err;
				} else {
					investor[0].idmAccountId = body.mtid;
					investor[0].verification.idmAml_status = 'Pending';
					investor[0].verification.idmKyc_status = 'Pending';
					investor[0].save(err => {
						if (err) console.log('Error:', err);
						else {
							callback(null, true); // To separate idm and nc call
							if (data.investor.investAs === 'Individual') {
								if (!data.investor.partyId || data.investor.partyId === '') {
									// To separate idm and nc call
									data.action = 'createNCParty';
									background.queueNCPartyAndEntity(data);
								} else {
									data.action = 'updateNCParty';
									background.queueNCPartyAndEntity(data);
								}
							}
						}
					});
				}
			});
		} else console.log('Error:', body);
	});
}

/*
IDM call to Evaluate a merchant application
*/
async function createIDMEntity(data, callback) {
	let docName = 'DL';
	switch (data.investorDocs.title) {
		case 'Passport':
			docName = 'PP';
			break;
		case 'ID card':
			docName = 'ID';
			break;
		case 'Driver license':
			docName = 'DL';
			break;
		case 'RP':
			docName = 'Residence permit';
			break;
		case 'Utility bill':
			docName = 'UB';
			break;
	}

	const parsedUrl = new URL(data.investorDocs.file);
	const docPath = parsedUrl.pathname.replace(`/${keys.bucketName}/`, '');
	let expiresTime = new Date();
	expiresTime.setMinutes(expiresTime.getMinutes() + 5);
	const docFile = docsBucket.file(docPath);
	var config = {
		action: 'read',
		expires: expiresTime
	};
	try {
		const publicUrl = await docFile.getSignedUrl(config);
		try {
			const response = await axios(publicUrl[0], {
				responseType: 'arraybuffer'
			});
			let scanData = new Buffer(response.data, 'binary').toString('base64');
			scanData = `data:${response.headers[
				'content-type'
			].toLowerCase()};base64,${scanData}`;
		
			let options = {
				url: keys.idmApiBaseUrl + 'merchant',
				method: 'POST',
				auth: {
					username: keys.idmUsername,
					password: keys.idmPassword
				},
				body: {
					ataxid: data.investor.taxId,
					amn: data.investor.companyName,
					man: data.investor.email,
					tea: data.investor.email,
					afn: data.investor.firstName,
					aln: data.investor.lastName,
					profile: 'KYCEntity',
					asn: data.investor.address1 + ' ' + data.investor.address2,
					aco: data.investor.country,
					az: data.investor.zip,
					ac: data.investor.city,
					as: data.investor.state,
					aph: data.investor.phone,
					businesstype: data.investor.entityType,
					docCountry: data.investorDocs.country,
					docType: docName,
					scanData: scanData
				},
				json: true
			};
			if (data.investor.idmAccountId) {
				options.body.tid = data.investor.idmAccountId;
			}
		
			request(options, (err, resp, body) => {
				if (err && resp.statusCode !== 200) {
					console.log('Error:', err);
					return;
				}
		
				if (body != null && resp.statusCode === 200) {
					Investor.find(
						{
							_id: data.investor._id
						},
						function(err, investor) {
							if (err) {
								throw err;
							} else {
								investor[0].idmAccountId = body.mtid;
								investor[0].save(err => {
									if (err) console.log('Error:', err);
									else {
										callback(null, true);
										if (!data.investor.partyId || data.investor.partyId === '') {
											data.action = 'createNCEntity';
											background.queueNCPartyAndEntity(data);
											//createNCEntity(data, callback);
										} else {
											data.action = 'updateNCEntity';
											background.queueNCPartyAndEntity(data);
											//updateNCEntity(data, callback);
										}
									}
								});
							}
						}
					);
				} else console.log('Error:', body);
			});
		} catch(err) {
			Raven.captureException(err);
		}
		
	} catch(err) {
		Raven.captureException(err);
	}

}

async function createIDMEntityWithoutDoc(data, callback) {
	let options = {
		url: keys.idmApiBaseUrl + 'merchant',
		method: 'POST',
		auth: {
			username: keys.idmUsername,
			password: keys.idmPassword
		},
		body: {
			ataxid: data.investor.taxId,
			amn: data.investor.companyName,
			man: data.investor.email,
			tea: data.investor.email,
			afn: data.investor.firstName,
			aln: data.investor.lastName,
			profile: 'KYCEntity',
			asn: data.investor.address1 + ' ' + data.investor.address2,
			aco: data.investor.country,
			az: data.investor.zip,
			ac: data.investor.city,
			as: data.investor.state,
			aph: data.investor.phone,
			businesstype: data.investor.entityType
		},
		json: true
	};
	if (data.investor.idmAccountId) {
		options.body.tid = data.investor.idmAccountId;
	}

	request(options, (err, resp, body) => {
		if (err && resp.statusCode !== 200) {
			console.log('Error:', err);
			return;
		}

		if (body != null && resp.statusCode === 200) {
			Investor.find(
				{
					_id: data.investor._id
				},
				function(err, investor) {
					if (err) {
						throw err;
					} else {
						investor[0].idmAccountId = body.mtid;
						investor[0].save(err => {
							if (err) console.log('Error:', err);
							else {
								callback(null, true);
								if (!data.investor.partyId || data.investor.partyId === '') {
									data.action = 'createNCEntity';
									background.queueNCPartyAndEntity(data);
								} else {
									data.action = 'updateNCEntity';
									background.queueNCPartyAndEntity(data);
								}
							}
						});
					}
				}
			);
		} else console.log('Error:', body);
	});
}

async function getBase64Data(investorDocs, callback) {
	const parsedUrl = new URL(investorDocs.file);
	const docPath = parsedUrl.pathname.replace(`/${keys.bucketName}/`, '');
	const docFile = docsBucket.file(docPath);
	let expiresTime = new Date();
	expiresTime.setMinutes(expiresTime.getMinutes() + 5);
	var config = {
		action: 'read',
		expires: expiresTime
	};
	try {
		const publicUrl = await docFile.getSignedUrl(config);

		base64Img.requestBase64(publicUrl[0], function(err, res, body) {
			callback(body);
		});
	} catch(err) {
		Raven.captureException(err);
	}
	
}

/*
IDM call to upload document
*/
async function idmUploadDocument(
	investorDocs,
	originalName,
	type,
	mtid,
	callback
) {
	const parsedUrl = new URL(investorDocs.file);
	const docPath = parsedUrl.pathname.replace(`/${keys.bucketName}/`, '');
	const docFile = docsBucket.file(docPath);
	let expiresTime = new Date();
	expiresTime.setMinutes(expiresTime.getMinutes() + 5);
	var config = {
		action: 'read',
		expires: expiresTime
	};
	try {
		const publicUrl = await docFile.getSignedUrl(config);

		var formData = {
			appId: mtid,
			file: {
				value: request(publicUrl[0]),
				options: {
					filename: originalName,
					contentType: type
				}
			}
		};
	
		var options = {
			method: 'POST',
			url: keys.idmApiBaseUrl + '/' + mtid + '/files',
			auth: {
				username: keys.idmUsername,
				password: keys.idmPassword
			},
			formData: formData
		};
	
		request(options, (err, resp, body) => {
			if (err && resp.statusCode !== 200) {
				console.log('Error:', err);
			}
	
			if (body != null && resp.statusCode == 200) {
				callback(null, true);
				//console.log(body);
			} else {
				console.log('Error::', body);
			}
		});
	} catch(err) {
		Raven.captureException(err);
	}	
}

/*
NC API: Create party
*/
function createNCParty(data, callback) {
	if(!_.isNil(data.investor.city) && !_.isNil(data.investor.country)
		&& !_.isNil(data.investor.firstName) &&!_.isNil(data.investor.lastName)
		&& !_.isNil(data.investor.address1) && !_.isNil(data.investor.address2)
		&& !_.isNil(data.investor.state) && !_.isNil(data.investor.zip)
		&& !_.isNil(data.investor.email) && !_.isNil(data.investor.taxId)
	) {
		const domicile = data.investor.country == 'US' ? true : false;
		const options = {
			url: keys.ncApiBaseUrl + 'createParty',
			method: 'PUT',
			body: {
				developerAPIKey: keys.ncDeveloperKey,
				clientID: keys.ncClientID,
				domicile: domicile,
				primCity: data.investor.city,
				firstName: data.investor.firstName,
				lastName: data.investor.lastName,
				primCountry: data.investor.country,
				primAddress1: data.investor.address1,
				primAddress2: data.investor.address2,
				primState: data.investor.state,
				primZip: data.investor.zip,
				emailAddress: data.investor.email,
				socialSecurityNumber: data.investor.taxId,
				dob: moment(data.investor.dob).format('MM-DD-YYYY')
			},
			json: true
		};
		request(options, (err, resp, body) => {
			if (err) {
				console.log('Error:', err);
			}
	
			if (body != null && body.statusCode == 101) {
				Investor.findOneAndUpdate(
					{
						_id: data.investor._id
					},
					{
						$set: {
							partyId: body.partyDetails[1][0].partyId
						}
					},
					function(err, doc) {
						if (err) {
							throw err;
						} else {
							callback(null, true);
						}
					}
				);
			} else console.log(`createNCParty Error: ${data.investor.email}`, body);
		});
	} else {
		callback(null, false)
	}
	
}

/*
NC API: Create Entity
*/
function createNCEntity(data, callback) {
	if(!_.isNil(data.investor.city) && !_.isNil(data.investor.country)
		&& !_.isNil(data.investor.firstName) &&!_.isNil(data.investor.lastName)
		&& !_.isNil(data.investor.address1) && !_.isNil(data.investor.address2)
		&& !_.isNil(data.investor.state) && !_.isNil(data.investor.zip)
		&& !_.isNil(data.investor.email) && !_.isNil(data.investor.partyId)
	) {
		const domicile = data.investor.country == 'US' ? true : false;
		const options = {
			url: keys.ncApiBaseUrl + 'createEntity',
			method: 'PUT',
			body: {
				developerAPIKey: keys.ncDeveloperKey,
				clientID: keys.ncClientID,
				domicile: domicile,
				entityName: data.investor.companyName,
				entityType: data.investor.entityType,
				primCity: data.investor.city,
				primCountry: data.investor.country,
				primAddress1: data.investor.address1,
				primAddress2: data.investor.address2,
				primState: data.investor.state,
				primZip: data.investor.zip,
				emailAddress: data.investor.email,
				EIN: data.investor.taxId,
				phone: data.investor.phone
			},
			json: true
		};
	
		request(options, (err, resp, body) => {
			if (err && resp.statusCode !== 200) {
				console.log('Error:', err);
			}
	
			if (body != null && body.statusCode == 101) {
				Investor.findOneAndUpdate(
					{
						_id: data.investor._id
					},
					{
						$set: {
							partyId: body.entityDetails[1][0].partyId
						}
					},
					function(err, doc) {
						if (err) {
							throw err;
						} else {
							callback(null, true);
						}
					}
				);
			} else console.log(`createNCEntity Error: ${data.investor.email}`, body);
		});
	} else {
		callback(null, false)
	}

}

/*
NC API: Update party
*/
function updateNCParty(data, callback) {
	if(!_.isNil(data.investor.city) && !_.isNil(data.investor.country)
		&& !_.isNil(data.investor.firstName) &&!_.isNil(data.investor.lastName)
		&& !_.isNil(data.investor.address1) && !_.isNil(data.investor.address2)
		&& !_.isNil(data.investor.state) && !_.isNil(data.investor.zip)
		&& !_.isNil(data.investor.email) && !_.isNil(data.investor.partyId)
	) {
		const body = {
			developerAPIKey: keys.ncDeveloperKey,
			clientID: keys.ncClientID,
			partyId: data.investor.partyId,
			primCity: data.investor.city,
			firstName: data.investor.firstName,
			lastName: data.investor.lastName,
			primCountry: data.investor.country,
			primAddress1: data.investor.address1,
			primAddress2: data.investor.address2,
			primState: data.investor.state,
			primZip: data.investor.zip,
			emailAddress: data.investor.email
		};
	
		const options = {
			url: keys.ncApiBaseUrl + 'updateParty',
			method: 'POST',
			body: body,
			json: true
		};
		request(options, (err, resp, body) => {
			if (err && resp.statusCode !== 200) {
				console.log('Error:', err);
			}
	
			if (body != null && body.statusCode == 101) {
				callback(null, true);
			} else {
				console.log('updateNCParty Error:', body);
				callback(body, false);
			}
		});
	} else {
		callback(null, false)
	}
}

/*
NC API: Update Entity
*/
function updateNCEntity(data, callback) {
	if(!_.isNil(data.investor.city) && !_.isNil(data.investor.country)
		&& !_.isNil(data.investor.firstName) &&!_.isNil(data.investor.lastName)
		&& !_.isNil(data.investor.address1) && !_.isNil(data.investor.address2)
		&& !_.isNil(data.investor.state) && !_.isNil(data.investor.zip)
		&& !_.isNil(data.investor.email) && !_.isNil(data.investor.taxId)
		&& !_.isNil(data.investor.partyId) && !_.isNil(data.investor.phone)
	) {
		const body = {
			developerAPIKey: keys.ncDeveloperKey,
			clientID: keys.ncClientID,
			partyId: data.investor.partyId,
			entityName: data.investor.companyName,
			entityType: data.investor.entityType,
			primCity: data.investor.city,
			primCountry: data.investor.country,
			primAddress1: data.investor.address1,
			primAddress2: data.investor.address2,
			primState: data.investor.state,
			primZip: data.investor.zip,
			emailAddress: data.investor.email,
			EIN: data.investor.taxId,
			phone: data.investor.phone
		};
	
		const options = {
			url: keys.ncApiBaseUrl + 'updateEntity',
			method: 'POST',
			body: body,
			json: true
		};
	
		request(options, (err, resp, body) => {
			if (err && resp.statusCode !== 200) {
				console.log('Error:', err);
			}
	
			if (body != null && body.statusCode == 101) {
				callback(null, true);
			} else {
				console.log('updateNCEntity Error:', body);
				callback(body, false);
			}
		});
	} else {
		console.log("data is not enough")
		callback(null, false)
	}
}

/*
NC API: Perform KYC and AML
*/
function performKys(partyId, callback) {
	const options = {
		url: keys.ncApiBaseUrl + 'performKycAml',
		method: 'POST',
		body: {
			developerAPIKey: keys.ncDeveloperKey,
			clientID: keys.ncClientID,
			partyId: partyId
		},
		json: true
	};
	request(options, (err, resp, body) => {
		if (err || resp.statusCode !== 200) {
			console.log('Error:', err);
		}

		if (body != null && body.statusCode == 101) {
			callback(null, true);
			console.log('performKycAml Success');
		} else console.log('Error:', body.statusDesc);
	});
}

/*
NC API: Upload party document
*/
async function uploadNCPartyDocument(data, callback) {
	const parsedUrl = new URL(data.investorDocs.file);
	const docPath = parsedUrl.pathname.replace(`/${keys.bucketName}/`, '');
	let expiresTime = new Date();
	expiresTime.setMinutes(expiresTime.getMinutes() + 5);
	const docFile = docsBucket.file(docPath);
	var config = {
		action: 'read',
		expires: expiresTime
	};
	try {
		const publicUrl = await docFile.getSignedUrl(config);

		var formData = {
			clientID: keys.ncClientID,
			developerAPIKey: keys.ncDeveloperKey,
			partyId: data.partyId,
			documentTitle: `documentTitle0=${data.investorDocs.title}`,
			file_name: `filename0=${data.originalName}`,
			createdIpAddress: '1.1.1.1',
			userfile0: {
				value: request(publicUrl[0]),
				options: {
					filename: data.originalName,
					contentType: data.type
				}
			}
		};
	
		//console.log(formData);
		var options = {
			method: 'POST',
			url: keys.ncApiBaseUrl + 'uploadPartyDocument',
			formData: formData
		};
	
		request(options, (err, resp, body) => {
			if (err || resp.statusCode !== 200) {
				console.log('Error:', err);
			}
	
			var result = JSON.parse(body);
			if (result != null && result.statusCode == '101') {
				//performKys(data.partyId, callback);
			} else {
				console.log('Error:', result.statusDesc);
			}
		});
	} catch(err) {
		Raven.captureException(err)
	}	
}

/*
NC API: Upload verification document
*/
async function uploadNCVerificationDocument(data, callback) {
	const parsedUrl = new URL(data.investorDocs.file);
	const docPath = parsedUrl.pathname.replace(`/${keys.bucketName}/`, '');
	let expiresTime = new Date();
	expiresTime.setMinutes(expiresTime.getMinutes() + 5);
	const docFile = docsBucket.file(docPath);
	var config = {
		action: 'read',
		expires: expiresTime
	};
	try {
		const publicUrl = await docFile.getSignedUrl(config);
		var formData = {
			clientID: keys.ncClientID,
			developerAPIKey: keys.ncDeveloperKey,
			accountId: data.accountId,
			documentTitle: `documentTitle0=${data.investorDocs.title}`,
			userfile: {
				value: request(publicUrl[0]),
				options: {
					filename: data.originalName,
					contentType: data.type
				}
			}
		};
	
		var options = {
			method: 'POST',
			url: keys.ncApiBaseUrl + 'uploadVerificationDocument',
			formData: formData,
			json: true
		};
	
		request(options, (err, resp, body) => {
			if (err || resp.statusCode !== 200) {
				console.log('Error:', err);
			}
			if (body != null && body.statusCode == '101') {
				requestAiVerification(data.accountId, data.investor, callback);
			} else {
				console.log('UploadVerificationDocument Error:', body);
			}
		});
	} catch(err) {
		Raven.captureException(err)
	}
	
}

/*
NC API: Request AiVerification
*/
function requestAiVerification(accountId, investor, callback) {
	const options = {
		url: keys.ncApiBaseUrl + 'requestAiVerification',
		method: 'POST',
		body: {
			developerAPIKey: keys.ncDeveloperKey,
			clientID: keys.ncClientID,
			accountId: accountId,
			aiMethod: 'Upload'
		},
		json: true
	};
	request(options, (err, resp, body) => {
		if (err || resp.statusCode !== 200) {
			console.log('RequestAiVerification Error:', err);
		}

		if (body != null && body.statusCode == '101') {
			Investor.findById(investor._id, (err, result) => {
				result.accreditation.map(item => {
					item.ncAccreditation_status = body.accreditedDetails.accreditedStatus;
				});
				result.save(error => {
					if (error) console.log('investor nc accreditation Error:', error);
					else {
						callback(null, true);
						console.log('AiVerification Success');
					}
				});
			});
		} else {
			console.log('AiVerification Error:', body.statusDesc);
		}
	});
}

async function sendMailToUser(data, callback) {
	sendMail(data.data, (err, results) => {
		if(results) {
			callback(null, true);
		}
	})	
}

mongoose.disconnect();

module.exports = {
	subscribe,
	uploadNCPartyDocument,
	uploadNCVerificationDocument,
	createIDMParty,
	updateNCParty,
	updateNCEntity
};
