module.exports = (req, res, next) => {
	if (!req.user.mfa || !req.user.mfa.enrolled) {
		next();
		return;
	}
	req.session.mfaLock = true;
	next();
	//res.status(401).send({ error: 'You must complete 2fa challenge' });
};
