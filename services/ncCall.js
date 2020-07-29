'use strict';

const request = require('request');

const keys = require('../config/keys');

/*
NC API: Update party
*/
function updateParty(data, target, value) {
	var body = {
		developerAPIKey: keys.ncDeveloperKey,
		clientID: keys.ncClientID,
		partyId: data.partyId,
		primCity: data.city,
		firstName: data.firstName,
		lastName: data.lastName,
		primCountry: data.country,
		primAddress1: data.address1,
		primAddress2: data.address2,
		primState: data.state,
		primZip: data.zip,
		emailAddress: data.email
	};

	if (target == 'AMLstatus') {
		body.AMLstatus = value;
	} else if (target == 'KYCstatus') {
		body.KYCstatus = value;
	}

	const options = {
		url: keys.ncApiBaseUrl + 'updateParty',
		method: 'POST',
		body: body,
		json: true
	};

	request(options, (err, resp, body) => {
		if (err && resp.statusCode !== 200) {
			//console.log('Error:', err);
		}

		if (body != null && body.statusCode == 101) {
			console.log('Success update party');
		} else console.log('Error:', body.statusDesc);
	});
}

/*
NC API: Update entity
*/
function updateEntity(data, target, value) {
	var body = {
		developerAPIKey: keys.ncDeveloperKey,
		clientID: keys.ncClientID,
		partyId: data.partyId,
		entityName: data.companyName,
		entityType: data.entityType,
		primCity: data.city,
		primCountry: data.country,
		primAddress1: data.address1,
		primAddress2: data.address2,
		primState: data.state,
		primZip: data.zip,
		emailAddress: data.email,
		EIN: data.taxId,
		phone: data.phone
	};

	if (target == 'AMLstatus') {
		body.AMLstatus = value;
	} else if (target == 'KYCstatus') {
		body.KYCstatus = value;
	}

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
			console.log('Success update entity');
		} else console.log('Error:', body.statusDesc);
	});
}

module.exports = {
	updateParty,
	updateEntity
};
