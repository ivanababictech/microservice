'use strict';

const Storage = require('@google-cloud/storage');
const config = require('../config/keys');

const storage = new Storage({
	projectId: config.googleProjectID,
	keyFilename: './config/keyfile.json'
});
const bucketName = config.bucketName;
const bucket = storage.bucket(bucketName);

/*
Create new bucket
*/
function createBucket(req, res, callback) {
	// Creates a new bucket
	storage
		.createBucket(bucketName)
		.then(() => {
			console.log(`Bucket ${bucketName} created.`);
			moveFile(req, res, callback);
		})
		.catch(err => {});
}

/*
Check if bucket was already created
*/
function checkBuckets(req, res, callback) {
	// Lists all buckets in the current project
	storage
		.getBuckets()
		.then(results => {
			const buckets = results[0];
			var found = false;

			buckets.forEach(bucket => {
				if (bucket.name == bucketName) {
					found = true;
				}
			});

			if (!found) {
				createBucket(req, res, callback);
			} else {
				moveFile(req, res, callback);
			}
		})
		.catch(err => {
			console.error('ERROR:', err);
		});
}

function getPublicUrl(filename) {
	return `https://storage.googleapis.com/${bucketName}/${filename}`;
}

/*
Upload file to google storage bucket
*/
function moveFile(req, res, callback) {

	const userId = req.user._id.toString();
	const fileType = req.file.originalname.slice(
		((req.file.originalname.lastIndexOf('.') - 1) >>> 0) + 2
	);
	const gcsname = req.file.filename;
	const destFilename = userId + '/' + Date.now() + '.' + fileType;

	bucket
		.file(gcsname)
		.copy(bucket.file(destFilename))
		.then(() => {
			deleteFile(gcsname, destFilename, callback);
		})
		.catch(err => {
			console.error('copy error:', err);
		});
}

function deleteFile(filename, destFilename, callback) {
	bucket
		.file(filename)
		.delete()
		.then(() => {
			callback(getPublicUrl(destFilename));
		})
		.catch(err => {
			console.error('delete error:', err);
		});
}
module.exports = {
	createBucket,
	checkBuckets,
	moveFile
};
