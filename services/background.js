'use strict';

const Pubsub = require('@google-cloud/pubsub');

const config = require('../config/keys');

//const ncAccountTopicName = 'New Topic for Nc Account';
const topicName = 'NewUsers';
const subscriptionName = 'shared-worker-subscription';

const pubsub = Pubsub({
	projectId: config.googleProjectID,
	keyFilename: './config/keyfile.json'
});

// This configuration will automatically create the topic if
// it doesn't yet exist. Usually, you'll want to make sure
// that a least one subscription exists on the topic before
// publishing anything to it as topics without subscribers
// will essentially drop any messages.
// [START topic]
function getTopic(cb) {
	pubsub.createTopic(topicName, (err, topic) => {
		// topic already exists.
		if (err && err.code === 6) {
			cb(null, pubsub.topic(topicName));
			return;
		}
		cb(err, topic);
	});
}
// [END topic]

// [START pubsub_list_topics]
function listAllTopics() {

	// Lists all topics in the current project
	return pubsub.getTopics().then(results => {
		const topics = results[0];

		console.log('Topics:');
		topics.forEach(topic => console.log(topic.name));

		return topics;
	});
}
// [END pubsub_list_topics]

// [START pubsub_delete_topic]
function deleteTopic(topicName) {

	// References an existing topic, e.g. "my-topic"
	const topic = pubsub.topic(topicName);

	// Deletes the topic
	return topic.delete().then(() => {
		console.log(`Topic ${topic.name} deleted.`);
	});
}
// [END pubsub_delete_topic]

// [START pubsub_list_subscriptions]
function listSubscriptions() {

	// Lists all subscriptions in the current project
	return pubsub.getSubscriptions().then(results => {
		const subscriptions = results[0];

		console.log('Subscriptions:');
		subscriptions.forEach(subscription => console.log(subscription.name));

		return subscriptions;
	});
}
// [END pubsub_list_subscriptions]

// [START pubsub_list_topic_subscriptions]
function listTopicSubscriptions(topicName) {

	// References an existing topic, e.g. "my-topic"
	const topic = pubsub.topic(topicName);

	// Lists all subscriptions for the topic
	return topic.getSubscriptions().then(results => {
		const subscriptions = results[0];

		console.log(`Subscriptions for ${topicName}:`);
		subscriptions.forEach(subscription => console.log(subscription.name));

		return subscriptions;
	});
}
// [END pubsub_list_topic_subscriptions]

// [START pubsub_delete_subscription]
function deleteSubscription(subscriptionName) {

	// References an existing subscription, e.g. "my-subscription"
	const subscription = pubsub.subscription(subscriptionName);

	// Deletes the subscription
	return subscription.delete()
		.then(() => {
			console.log(`Subscription ${subscription.name} deleted.`);
		});
}
// [END pubsub_delete_subscription]

// Used by the worker to listen to pubsub messages.
// When more than one worker is running they will all share the same
// subscription, which means that pub/sub will evenly distribute messages
// to each worker.
// [START subscribe]
function subscribe(cb) {
	let subscription;

	// Event handlers
	function handleMessage(message) {
		//const data = JSON.parse(message.data);
		cb(null, message);

		// "Ack" (acknowledge receipt of) the message
		//message.ack();
	}

	function handleError(err) {
		console.log('handleError:', err);
	}

	getTopic((err, topic) => {
		if (err) {
			cb(err);
			return;
		}

		topic.createSubscription(subscriptionName, (err, sub) => {
			if (err) {
				cb(err);
				return;
			}

			subscription = sub;

			// Listen to and handle message and error events
			subscription.on('message', handleMessage);
			subscription.on('error', handleError);

			//console.log('Listening to '+topicName+' with subscription '+subscriptionName);
		});
	});

	// Subscription cancellation function
	return () => {
		if (subscription) {
			// Remove event listeners
			subscription.removeListener('message', handleMessage);
			subscription.removeListener('error', handleError);
			subscription = undefined;
		}
	};
}
// [END subscribe]

// Adds data to the queue to be processed by the worker.
// [START queue]
function queueIDMCreateParty(investor, investorDocs, originalName, type) {
	getTopic((err, topic) => {
		if (err) {
			console.log('Error occurred while getting pubsub topic', err);
			return;
		}

		const data = {
			action: 'createIDMParty',
			investor: investor,
			investorDocs: investorDocs,
			originalName: originalName,
			type: type,
		};

		const publisher = topic.publisher();
		publisher.publish(Buffer.from(JSON.stringify(data)), (err) => {
			if (err) {
				console.log('Error occurred while queuing background task', err);
			} else {
				//console.log(`Investor ${investor.firstName} queued for background processing`);
			}
		});
	});
}

function queueIDMCreateEntity(investor, investorDocs, originalName, type) {
	getTopic((err, topic) => {
		if (err) {
			console.log('Error occurred while getting pubsub topic', err);
			return;
		}

		const data = {
			action: 'createIDMEntity',
			investor: investor,
			investorDocs: investorDocs,
			originalName: originalName,
			type: type,
		};

		const publisher = topic.publisher();
		publisher.publish(Buffer.from(JSON.stringify(data)), (err) => {
			if (err) {
				console.log('Error occurred while queuing background task', err);
			} else {
				//console.log(`Investor ${investor.firstName} queued for background processing`);
			}
		});
	});
}

function queuePartyDocument(investorDocs, originalName, type, partyId) {
	getTopic((err, topic) => {
		if (err) {
			console.log('Error occurred while getting pubsub topic', err);
			return;
		}

		const data = {
			action: 'uploadNCPartyDocument',
			investorDocs: investorDocs,
			originalName: originalName,
			type: type,
			partyId: partyId
		};

		const publisher = topic.publisher();
		publisher.publish(Buffer.from(JSON.stringify(data)), (err) => {
			if (err) {
				console.log('Error occurred while queuing background task', err);
			} else {
				//console.log(`InvestorDocs ${investorDocs.file} queued for background processing`);
			}
		});
	});
}

function queueAccreditationDocuments(investor, investorDocs, originalName, type, accountId) {
	getTopic((err, topic) => {
		if (err) {
			console.log('Error occurred while getting pubsub topic', err);
			return;
		}

		const data = {
			action: 'uploadNCVerificationDocument',
			investorDocs: investorDocs,
			investor: investor,
			originalName: originalName,
			type: type,
			accountId: accountId
		};

		const publisher = topic.publisher();
		publisher.publish(Buffer.from(JSON.stringify(data)), (err) => {
			if (err) {
				console.log('Error occurred while queuing background task', err);
			} else {
				//console.log(`Document ${investorDocs.file} queued for background processing`);
			}
		});
	});
}

function queueNCPartyAndEntity(data) {
	getTopic((err, topic) => {
		if (err) {
			console.log('Error occurred while getting pubsub topic', err);
			return;
		}

		const publisher = topic.publisher();
		publisher.publish(Buffer.from(JSON.stringify(data)), (err) => {
			if (err) {
				console.log('Error occurred while queuing background task', err);
			} else {
				console.log(`Investor ${data.investor.email} queued for background processing`);
			}
		});
	});
}

function queueIDMPartyAndEntity(data) {
	getTopic((err, topic) => {
		if (err) {
			console.log('Error occurred while getting pubsub topic', err);
			return;
		}

		const publisher = topic.publisher();
		publisher.publish(Buffer.from(JSON.stringify(data)), (err) => {
			if (err) {
				console.log('Error occurred while queuing background task', err);
			} else {
				console.log(`Investor ${data.investor.email} queued for background processing`);
			}
		});
	});
}

function sendMail(mailInfo) {
	getTopic((err, topic) => {
		if (err) {
			console.log('Error occurred while getting pubsub topic', err);
			return;
		}

		const data = {
			action: 'sendMailToUser',
			data: mailInfo
		};

		const publisher = topic.publisher();
		publisher.publish(Buffer.from(JSON.stringify(data)), (err) => {
			if (err) {
				console.log('Error send Mail processing task', err);
			} else {
				console.log('send Mail processing');
			}
		});
	});
}
// [END queue]

module.exports = {
	subscribe,
	queueIDMCreateParty,
	queueIDMCreateEntity,
	queueIDMPartyAndEntity,
	queuePartyDocument,
	queueAccreditationDocuments,
	queueNCPartyAndEntity,
	listAllTopics,
	deleteTopic,
	listSubscriptions,
	listTopicSubscriptions,
	deleteSubscription,
	sendMail
};