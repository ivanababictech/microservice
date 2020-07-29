const mongoose = require('mongoose');
const passport = require('passport');
const Storage = require('@google-cloud/storage');
const zip = require('express-zip');
const async = require('async');
const fs = require('fs');
const Multer = require('multer');
const moment = require('moment');
const Raven = require('raven');
const upload = Multer({
	storage: Multer.MemoryStorage,
	limits: {
		fileSize: 5 * 1024 * 1024 // no larger than 5mb
	}
});
const keys = require('../config/keys');
const InvestorDoc = mongoose.model('investorDoc');
const Icos = mongoose.model('icos');
const Transactions = mongoose.model('transactions');
const Investors = mongoose.model('investors');

const storage = new Storage({
	projectId: keys.googleProjectID,
	keyFilename: './config/keyfile.json'
});
const zipBucket = require('zip-bucket')(storage);
const docsBucket = storage.bucket(keys.bucketName);

const requireAdmin = require('../middlewares/requireAdmin');

module.exports = app => {
	// if investorId is admin then redirect /icos
	app.get(
		'/admin/api/loginUnder/:investorId/:token',
		requireAdmin,
		(req, res) => {
			var token = req.params.token;
			//console.log(requireAdmin(token));
			const investorId = req.params.investorId;
			req.body.username = investorId;
			req.body.password = 'fake';
			passport.authenticate('admin')(req, res, function(err) {
				if (!err) res.redirect(keys.redirectDomain + '/icos');
			});
		}
	);
	app.get('/liveness_check', (req, res) => {
		res.send('OK');
	});

	app.get('/readiness_check', (req, res) => {
		res.send('OK');
	});
	// get investors-docs by investorID
	app.get(
		'/admin/api/getDocuments/:investorId/:token',
		requireAdmin,
		(req, res) => {
			const investorId = req.params.investorId;
			const files = [];
			const zipFilename = investorId + '.zip';
			let expiresTime = new Date();
			expiresTime.setMinutes(expiresTime.getMinutes() + 5);
			InvestorDoc.find({ _investor: investorId }, function(err, investorDocs) {
				const fromBucket = keys.bucketName;
				const toBucket = keys.bucketName;
				const fromPath = investorId;
				// const toPath = 'tmp/' + investorId + '/' + zipFilename;
				const toPath = zipFilename;
				// const keep = '/tmp/' + zipFilename;
				zipBucket({
					fromBucket,
					fromPath,
					toBucket,
					toPath
				}).then(result => {
					if (result) {
						const bucket = storage.bucket(keys.bucketName);
						const bucketFile = bucket.file(result.toPath);
						bucketFile
							.getSignedUrl({
								action: 'read',
								expires: expiresTime
							})
							.then(signedUrls => {
								// signedUrls[0] contains the file's public URL
								// res.status(200).send(signedUrls[0]);
								res.redirect(signedUrls[0]);
							});
					}
				});
				/*async.each(investorDocs, function (investorDoc, callback) {
				const filepath = investorDoc.file.split('/');
				const bucketName = filepath[3];
				const bucket = storage.bucket(bucketName);
				const srcFilename = filepath[4] + '/' + filepath[5];
				const destFilename = 'tmp/' + filepath[5];

				// const bucketFile = bucket.file(srcFilename);
				// bucketFile.getSignedUrl({
				// 	action: 'read',
				// 	expires: '03-09-2491'
				// }).then(signedUrls => {
				// 	// signedUrls[0] contains the file's public URL
				// 	console.log(signedUrls[0]);
				// 	files.push({ path: signedUrls[0], name: filepath[5] });
				// 	callback();
				// });


				// const options = {
				// 	// The path to which the file should be downloaded, e.g. "./file.txt"
				// 	destination: destFilename,
				// };
				// Downloads the file
				// storage
				// 	.bucket(bucketName)
				// 	.file(srcFilename)
				// 	.download(options)
				// 	.then(() => {
				// 		files.push({ path: 'tmp/' + filepath[5], name: filepath[5] });
				// 		callback();
				// 	})
				// 	.catch(err => {
				// 		callback();
				// 	});

			}, function (err) {
				res.zip(files, zipFilename, function (err, val) {
					// files.map(file => {
					// 	fs.unlink(file.path, function (err) {

					// 	});
					// })

				});
			})*/
			});
		}
	);
	// transactions upload

	app.get(
		'/admin/api/getAccreditationDocuments/:investorId/:token',
		requireAdmin,
		(req, res) => {
			const investorId = req.params.investorId;
			const files = [];
			const zipFilename = investorId + '.zip';
			let expiresTime = new Date();
			expiresTime.setMinutes(expiresTime.getMinutes() + 5);
			InvestorDoc.find({ _investor: investorId, accreditation: true }, function(
				err,
				investorDocs
			) {
				if (err) {
					res.status(422).send(err);
					return;
				}
				if (investorDocs.length == 0) {
					res.status(422).send({ err: 'No investor Docs' });
					return;
				}
				const fromBucket = keys.bucketName;
				const toBucket = keys.bucketName;
				const fromPath = investorId;
				// const toPath = 'tmp/' + investorId + '/' + zipFilename;
				const toPath = zipFilename;
				// const keep = '/tmp/' + zipFilename;
				zipBucket({
					fromBucket,
					fromPath,
					toBucket,
					toPath
				}).then(result => {
					if (result) {
						const bucket = storage.bucket(keys.bucketName);
						const bucketFile = bucket.file(result.toPath);
						bucketFile
							.getSignedUrl({
								action: 'read',
								expires: expiresTime
							})
							.then(signedUrls => {
								res.redirect(signedUrls[0]);
							});
					}
				});
			});
		}
	);
};
