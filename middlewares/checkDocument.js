const sizeOf = require('image-size');
const request = require('request');
const fs = require('fs');
const { URL } = require('url');
const keys = require('../config/keys');
const Storage = require('@google-cloud/storage');
const storage = new Storage({
	projectId: keys.googleProjectID,
	keyFilename: './config/keyfile.json'
});

module.exports = (req, res, next) => {
	let size = 0,
		fileInfo;
	if(!req.file) {
		next();
		return false;
	}
	const { url, filename, mimetype } = req.file;
	const parsedUrl = new URL(url);
	const docPath = parsedUrl.pathname.replace(`/${keys.bucketName}/`, '');
	const expiresTime = new Date();
	expiresTime.setMinutes(expiresTime.getMinutes() + 5);
	const docFile = storage.bucket(keys.bucketName).file(docPath);
	const config = {
		action: 'read',
		expires: expiresTime
	};
	docFile.getSignedUrl(config).then(pres => {
		request
			.get(pres[0])
			.on('data', function(chunk) {
				try {
					if (!fileInfo) {
						fileInfo = chunk;
					}
					size += chunk.length;
				} catch(e) {
					console.log(e)
				}
			})
			.on('end', function() {
				const filePath = filename;
				fs.unlink(filePath, function(error) {
					if (error) {
						throw error;
					}
				});
				//console.log(size)
				if (size > 4 * 1024 * 1024) {
					return res.status(400).send({
						success: false,
						error: 'File size must be no more than 4MB'
					});
				}

				if (
					mimetype != 'image/png' &&
					mimetype &&
					'image/jpg' &&
					mimetype != 'image/jpeg'
				) {
					return res.status(400).send({
						success: false,
						error: 'File type must be png, jpg or jpeg'
					});
				}

				const dimensions = sizeOf(fileInfo);
				if (dimensions.width <= dimensions.height) {
					if (dimensions.width < 450 || dimensions.height < 600) {
						return res.status(400).send({
							success: false,
							error: 'Minimum image size is 600x450px or 450x600px'
						});
					}
				}

				if (dimensions.width > dimensions.height) {
					if (dimensions.width < 600 || dimensions.height < 450) {
						return res.status(400).send({
							success: false,
							error: 'Minimum image size is 600x450px or 450x600px'
						});
					}
				}

				next();
			})
			.pipe(fs.createWriteStream(filename));
	});
};
