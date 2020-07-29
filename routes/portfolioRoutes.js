const mongoose = require('mongoose');
const async = require('async');
const Raven = require('raven');

const requireLogin = require('../middlewares/requireLogin');

const User = mongoose.model('investors');
const Captables = mongoose.model('captable');
const Icos = mongoose.model('icos');
const Transactions = mongoose.model('transactions');
const ObjectId = mongoose.Types.ObjectId;

module.exports = app => {
	app.get('/getPortfolio', requireLogin, async (req, res) => {
		try {
			const captable = await Transactions.aggregate([
				{
					$match: {
						_investor: new ObjectId(req.user._id)
					}
				},
				{
					$lookup: {
						from: 'icos',
						localField: '_ico',
						foreignField: '_id',
						as: 'ico'
					}
				},
				{
					$unwind: '$ico'
				},
				{
					$group: {
						_id: '$ico',
						tokensBuy: {
							$sum: {
								$cond: [
									{
										$and: [
											{ $eq: ['$type', 'buy'] },
											{ $eq: ['$status', 'confirmed'] }
										]
									},
									{
										$divide: [
											{ $multiply: ['$amount', '$xRate'] },
											{ $arrayElemAt: ['$ico.periods.tokenPrice', -1] }
										]
									},
									0
								]
							}
						},
						tokensRefund: {
							$sum: {
								$cond: [
									{
										$and: [
											{ $eq: ['$type', 'refund'] },
											{ $eq: ['$status', 'confirmed'] }
										]
									},
									{
										$divide: [
											{ $multiply: ['$amount', '$xRate'] },
											{ $arrayElemAt: ['$ico.periods.tokenPrice', -1] }
										]
									},
									0
								]
							}
						},
						withdraw: {
							$sum: {
								$cond: [
									{
										$and: [
											{ $eq: ['$type', 'withdraw'] },
											{
												$or: [
													{ $eq: ['$status', 'confirmed'] },
													{ $eq: ['$status', 'pending'] }
												]
											}
										]
									},
									'$amount',
									0
								]
							}
						},
						distribution: {
							$sum: {
								$cond: [
									{
										$and: [
											{ $eq: ['$type', 'distribution'] },
											{
												$or: [
													{ $eq: ['$status', 'confirmed'] },
													{ $eq: ['$status', 'pending'] }
												]
											}
										]
									},
									'$amount',
									0
								]
							}
						},
						pendingtransactions: {
							$sum: {
								$cond: [
									{
										$and: [
											{ $eq: ['$type', 'withdraw'] },
											{
												$or: [
													{ $eq: ['$status', 'unconfirmed'] },
													{ $eq: ['$status', 'pending'] }
												]
											}
										]
									},
									1,
									0
								]
							}
						}
					}
				}
			]);
			let finalResult = [];
			captable.map(transaction => {
				let temp = {};
				//console.log(transaction._id);
				if (transaction._id.status === 'closed') {
					temp._ico = {
						name: transaction._id.name,
						symbol: transaction._id.symbol,
						logo: transaction._id.logo,
						status: transaction._id.status,
						id: transaction._id._id
					};
					temp.price =
						transaction._id.periods[
							transaction._id.periods.length - 1
						].tokenPrice;
					temp.amount = transaction.distribution - transaction.withdraw;
					temp.pendingTransactions = {
						number: transaction.pendingtransactions,
						currency: transaction._id.symbol
					};
				} else if (transaction._id.status === 'active') {
					temp._ico = {
						name: transaction._id.name,
						symbol: transaction._id.symbol,
						logo: transaction._id.logo,
						status: transaction._id.status,
						id: transaction._id._id
					};
					temp.price =
						transaction._id.periods[
							transaction._id.periods.length - 1
						].tokenPrice;
					temp.amount =
						transaction.tokensRefund === 0
							? transaction.tokensBuy
							: transaction.tokensBuy - transaction.tokensRefund;
				}
	
				finalResult.push(temp);
			});
	
			Promise.all(finalResult).then(results => {
				res.status(200).send(results);
			});
		} catch(err) {
			Raven.captureException(err);
		}		
	});
};
