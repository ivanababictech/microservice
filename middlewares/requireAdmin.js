const mongoose = require('mongoose');
const AdminUsers = mongoose.model('adminuser');

module.exports = (req, res, next) => {
	const token = req.params.token;
	AdminUsers.findOne({ token }, (err, admin_user) => {
		if (!admin_user) {
			return res.status(401).send({ error: 'Wrong token!' });
		} else {
			next();
		}
	});
};
