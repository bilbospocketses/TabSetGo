/*global self,chrome */
// Test-only provider backed by storage.local.__fakeRemote. Hidden unless the
// e2e suite sets storage.local.__testFakeProvider. Lets the engine's merge,
// migration, and push paths run end-to-end without any real backend.
(function () {
    'use strict';
    var NS = self.TabSetGoSync = self.TabSetGoSync || {};

    NS.providers.register({
        'id': 'fake',
        'label': 'Test provider',

        'isAvailable': function () {
            return chrome.storage.local.get(['__testFakeProvider']).then(function (items) {
                return items.__testFakeProvider
                    ? { 'ok': true }
                    : { 'ok': false, 'reason': 'test only' };
            });
        },

        'connect': function () { return Promise.resolve(); },
        'disconnect': function () { return Promise.resolve(); },

        'pull': function () {
            return chrome.storage.local.get(['__fakeRemote']).then(function (items) {
                return items.__fakeRemote || null;
            });
        },

        'push': function (doc) {
            return chrome.storage.local.set({ '__fakeRemote': doc });
        },

        'status': function () {
            return Promise.resolve({ 'connected': true, 'detail': 'In-memory test backend.' });
        }
    });
})();
