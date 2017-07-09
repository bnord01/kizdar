// Listen to `push` notification event. Define the text to be displayed
// and show the notification.
self.addEventListener('push', function(event) {
  var payload = event.data ? event.data.text() : 'Something something Kizomba!';

  event.waitUntil(self.registration.showNotification('Kizomba Alert!', {
    body: payload,
    icon: 'lovekiz.png'
  }));
});

// Listen to  `pushsubscriptionchange` event which is fired when
// subscription expires. Subscribe again and register the new subscription
// in the server by sending a POST request with endpoint. Real world
// application would probably use also user identification.
self.addEventListener('pushsubscriptionchange', function(event) {
  console.log('Subscription expired');
  event.waitUntil(
    self.registration.pushManager.subscribe({ userVisibleOnly: true })
    .then(function(subscription) {
      // Retrieve the user's public key.
      var rawKey = subscription.getKey ? subscription.getKey('p256dh') : '';
      var key = rawKey ?
          btoa(String.fromCharCode.apply(null, new Uint8Array(rawKey))) :
          '';
      var rawAuthSecret = subscription.getKey ? subscription.getKey('auth') : '';
      var authSecret = rawAuthSecret ?
                 btoa(String.fromCharCode.apply(null, new Uint8Array(rawAuthSecret))) :
                 '';
      console.log('Subscribed after expiration ', subscription.endpoint);
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
    })
  );
});
