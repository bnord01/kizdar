var express = require('express');
var bodyParser = require('body-parser');
var glob = require('glob');
var path = require('path');
var fs = require('fs');
var app = express();

app.use(bodyParser.json());

app.use(function setHomepageCanonical(req, res, next) {
  // Better for canonical URL, "index.html" is ugly
  if(req.url === '/index.html') {
    return res.redirect(301, '/');
  }
  return next();
});

app.use(function setServiceWorkerHeader(req, res, next) {
  // https://github.com/mozilla/serviceworker-cookbook/issues/201
  var file = req.url.split('/').pop();
  if (file === 'service-worker.js' || file === 'worker.js') {
    res.header('Cache-control', 'public, max-age=0');
  }
  next();
});

// `web-push` is a library which makes sending notifications a very
// simple process.
var webPush = require('web-push');
// Global array collecting all active endpoints. In real world
// application one would use a database here.
var subscriptions = [];

// Setting the Google Cloud Messaging API Key.
if (!process.env.GCM_API_KEY) {
  console.error('If you want Chrome to work, you need to set the ' +
                'GCM_API_KEY environment variable to your GCM API key.');
} else {
  webPush.setGCMAPIKey(process.env.GCM_API_KEY);
}

// Send notification to the push service. Remove the endpoint from the
// `subscriptions` array if the  push service responds with an error.
// Subscription has been cancelled or expired.
function sendNotification(endpoint) {
  webPush.sendNotification({
    endpoint: endpoint
  }).then(function() {
    console.log('Push Application Server - Notification sent to ' + endpoint);
  }).catch(function() {
    console.log('ERROR in sending Notification, endpoint removed ' + endpoint);
    subscriptions.splice(subscriptions.indexOf(endpoint), 1);
  });
}

function isSubscribed(endpoint) {
  return (subscriptions.indexOf(endpoint) >= 0);
}

// Register a subscription
app.post('/register', function(req, res) {
var endpoint = req.body.endpoint;
  if (!isSubscribed(endpoint)) {
    console.log('Subscription registered ' + endpoint);
    subscriptions.push(endpoint);
  }
  res.type('js').send('{"success":true}');
});

// Unregister a subscription by removing it from the `subscriptions` array
app.post('/unregister', function(req, res) {
  var endpoint = req.body.endpoint;
  if (isSubscribed(endpoint)) {
    console.log('Subscription unregistered ' + endpoint);
    subscriptions.splice(subscriptions.indexOf(endpoint), 1);
  }
  res.type('js').send('{"success":true}');
});

// Send an alert to all subscribers
app.post('/sendAlert', function(req, res) {
  var payload = req.body.payload; // TODO not used yet
  cnt = cnt + 1
  console.log("Sending notifications to " + subscriptions.length + " subscribers.")
  subscriptions.forEach(sendNotification);
  res.type('js').send('{"success":true}');
});

// Serve public content
app.use(express.static(__dirname + '/pub'));

// Serve bower components
app.use('/bower_components',  express.static(__dirname + '/bower_components'));

// Listen on the port given by heroku
var port = process.env.PORT || 3003;
var ready = new Promise(function willListen(resolve, reject) {
 app.listen(port, function didListen(err) {
  if (err) {
    reject(err);
    return;
  }
  console.log('app.listen on http://localhost:%d', port);
  resolve();
  });
});

exports.ready = ready;
exports.app = app;
