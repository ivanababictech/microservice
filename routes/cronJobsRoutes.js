const mongoose = require('mongoose');
const request = require('request');
const _ = require('lodash');
const async = require('async');
const moment = require('moment');
const Raven = require('raven');

const Admin = mongoose.model('adminuser');

module.exports = app => {
	// get method  '/Admin/createToken'
	// save 64 long hex string to token on adminuser collection
	app.get('/worker/createAdminToken', async (req, res) => {
		try {
			const admins = await Admin.find().select({});
			for (var i = 0, len = admins.length; i < len; i++) {
				Admin.findById(admins[i]._id, (err, admin_user) => {
					var crypto = require('crypto');
					var encryptionKey = crypto.randomBytes(64);
					var encryption = encryptionKey.toString('hex');
					admin_user.token = encryption;
					admin_user.save();
				});
			}
			try {
				const admins_aftertoken = await Admin.find().select({});
				res.send(admins_aftertoken);
			} catch(e) {	
				Raven.captureException(e);
				res.send(e);
			}
		} catch(err) {
			Raven.captureException(err);
			res.send(err);
		}
	});
};
