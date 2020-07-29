const mongoose = require('mongoose');
const requestIp = require('request-ip');

const UserLog = mongoose.model('userLog');

module.exports = res => {
	const userLog = new UserLog();
	userLog.response = res.statusCode;
	userLog.path = res.req.url;

	if (res.req.user && res.req.user._id) {
		userLog._investor = res.req.user._id;
	}
	let ipAddress;
	const forwardedIpsStr = res.req.header('x-forwarded-for');
	if (forwardedIpsStr) {
		var forwardedIps = forwardedIpsStr.split(',');
		ipAddress = forwardedIps[0];
	}
	if (!ipAddress) {
		ipAddress = res.req.connection.remoteAddress;
	}
	if (!ipAddress) {
		ipAddress = requestIp.getClientIp(res.req);
	}
	userLog.ip = ipAddress;
	userLog.save();
};
