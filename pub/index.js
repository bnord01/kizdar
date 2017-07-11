var subscriptionButton = document.getElementById('subscriptionButton');
var customMsgInput = document.getElementById('customMsgInput');

// Register service worker and check the initial subscription state.
// Set the UI (button) according to the status.
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
        .then(function() {
            console.log('service worker registered');
            subscriptionButton.removeAttribute('disabled');
        });
    getSubscription()
        .then(function(subscription) {
            if (subscription) {
                console.log('Already subscribed', subscription.endpoint);
                setUnsubscribeButton();
                // Update subscription with the server just in case
                sendRegistration(subscription)
            } else {
                setSubscribeButton();
            }
        });
}

// Get the `registration` from service worker and create a new
// subscription using `registration.pushManager.subscribe`. Then
// register received new subscription by sending a POST request with its
// endpoint to the server.
function subscribe() {
    navigator.serviceWorker.ready.then(function(registration) {
        return registration.pushManager.subscribe({
            userVisibleOnly: true
        });
    }).then(sendRegistration).then(setUnsubscribeButton);
}

// Method to obtain the subscription object
function getSubscription() {
    return navigator.serviceWorker.ready
        .then(function(registration) {
            return registration.pushManager.getSubscription();
        });
}

// unsubscribe the service-worker and deregister the endpoint from the server
function unsubscribe() {
    getSubscription().then(function(subscription) {
        return subscription.unsubscribe()
            .then(function() {
                console.log('Unsubscribed', subscription.endpoint);
                return fetch('unregister', {
                    method: 'post',
                    headers: {
                        'Content-type': 'application/json'
                    },
                    body: JSON.stringify({
                        endpoint: subscription.endpoint
                    })
                });
            });
    }).then(setSubscribeButton);
}

function sendRegistration(subscription) {
    // Retrieve the user's public key.
    var rawKey = subscription.getKey ? subscription.getKey('p256dh') : '';
    var key = rawKey ? btoa(String.fromCharCode.apply(null, new Uint8Array(rawKey))) : '';
    var rawAuthSecret = subscription.getKey ? subscription.getKey('auth') : '';
    var authSecret = rawAuthSecret ? btoa(String.fromCharCode.apply(null, new Uint8Array(rawAuthSecret))) : '';
    return fetch('register', {
        method: 'post',
        headers: {
            'Content-type': 'application/json'
        },
        body: JSON.stringify({
            endpoint: subscription.endpoint,
            key: key,
            authSecret: authSecret
        })
    });
}

function sendAlert(payload) {
    fetch('sendAlert', {
        method: 'post',
        headers: {
            'Content-type': 'application/json'
        },
        body: JSON.stringify({
            payload: payload
        }),
    });
}

function customAlert() {
    sendAlert(customMsgInput.value)
}

// Change the subscription button's text and action.
function setSubscribeButton() {
    subscriptionButton.onclick = subscribe;
    subscriptionButton.textContent = 'Subscribe!';
}

function setUnsubscribeButton() {
    subscriptionButton.onclick = unsubscribe;
    subscriptionButton.textContent = 'Unsubscribe!';
}
