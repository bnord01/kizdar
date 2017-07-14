'use strict';

var express = require('express');
var bodyParser = require('body-parser');
var app = express();
app.use(bodyParser.json());

//moment with timezone support
var moment = require('moment-timezone');
moment.locale('de');

// redis
var redis = require('redis');
var Promise = require('bluebird');
Promise.promisifyAll(redis.RedisClient.prototype);
Promise.promisifyAll(redis.Multi.prototype);
var client = redis.createClient(process.env.REDIS_URL || "redis://redis:6379");

// Web push library
var webPush = require('web-push');
// Setting the Google Cloud Messaging API Key.
if (!process.env.GCM_API_KEY) {
    console.error('ERROR no GCM_API_KEY environment variable set');
} else {
    webPush.setGCMAPIKey(process.env.GCM_API_KEY);
}

// Functionality

// promise of subscriptions of the form {endpoint,key,authSecret}
var subscriptions = client.smembersAsync('subscriptions').then(epts => {
    var promises = []
    var subs = []
    for (let endpoint of epts) {
        promises.push(client.multi()
            .get('key-' + endpoint)
            .get('authSecret-' + endpoint)
            .execAsync().then(kas => {
                var sub = {
                    endpoint: endpoint,
                    key: kas[0],
                    authSecret: kas[1]
                }
                subs.push(sub);
                console.log('Loaded subscription from redis: ' + sub.endpoint)
            }))
    }
    return Promise.all(promises).then(() => subs)
});

function unregister(endpoint) {
    return subscriptions.then(subs => {
        var idx = subs.findIndex(s => s.endpoint == endpoint)
        if (idx >= 0) {
            console.log('Subscription unregistered: ' + endpoint);
            subs.splice(idx, 1)
            return client.multi()
                .srem('subscriptions', endpoint)
                .del('key-' + endpoint)
                .del('authSecret-' + endpoint)
                .execAsync()
        }
    })
}

function register(endpoint, key, authSecret) {
    return subscriptions.then(subs => {
        var sub = subs.find(s => s.endpoint == endpoint)
        if (sub) {
            console.log('Subscription updated: ' + endpoint);
            sub.authSecret = authSecret
            sub.key = key
        } else {
            console.log('Subscription registered: ' + endpoint);
            subs.push({
                endpoint: endpoint,
                key: key,
                authSecret: authSecret
            })
        }
        return client.multi()
            .sadd('subscriptions', endpoint)
            .set('key-' + endpoint, key)
            .set('authSecret-' + endpoint, authSecret)
            .execAsync()
    })
}

function sendNotification(subscription, msg) {
    webPush.sendNotification({
        endpoint: subscription.endpoint,
        keys: {
            p256dh: subscription.key,
            auth: subscription.authSecret
        }
    }, msg).then(function() {
        console.log('Notification sent to ' + subscription.endpoint);
    }).catch(function() {
        console.log('ERROR in sending Notification, removing endpoint ' + subscription.endpoint);
        unregister(subscription.endpoint)
    });
}

function timestamp() {
    return moment().tz('Europe/Berlin').format('LTS')
}


// Setting up express

app.use(function setHomepageCanonical(req, res, next) {
    // Better for canonical URL, "index.html" is ugly
    if (req.url === '/index.html') {
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

// Register a subscription
app.post('/register', function(req, res) {
    var endpoint = req.body.endpoint;
    var key = req.body.key;
    var authSecret = req.body.authSecret;
    register(endpoint, key, authSecret).then(() => res.type('js').send('{"success":true}'))
});

// Unregister a subscription by removing it from the `subscriptions` array
app.post('/unregister', function(req, res) {
    var endpoint = req.body.endpoint;
    unregister(endpoint)
    res.type('js').send('{"success":true}');
});

// Send an alert to all subscribers
app.post('/sendAlert', function(req, res) {
    var payload = req.body.payload ? req.body.payload : 'Generic Kizomba Alert!'
    payload = `[${timestamp()}] ${payload}`
    subscriptions.then(subs => {
        console.log(`Sending notifications to ${subs.length} subscribers.`)
        console.log(`Message: ${payload}`)
        subs.forEach(sub => sendNotification(sub, payload))
    });
    res.type('js').send('{"success":true}');
});

// Serve public content
app.use(express.static(__dirname + '/pub'));

// Serve bower components
app.use('/bower_components', express.static(__dirname + '/bower_components'));

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
