module.exports = (req, res, next) => {
	if (req.session.mfaLock) {
		res.status(401).send({ error: 'You must complete 2fa challenge' });
	}

	next();
	//res.status(401).send({ error: 'You must complete 2fa challenge' });
};
