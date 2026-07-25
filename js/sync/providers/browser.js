/*global self,chrome */
// "Browser sync" provider: the pre-4.1 chrome.storage.sync mechanism behind
// the provider interface. Roams in Chrome only (Edge/Brave/Opera implement
// the API but do not roam extension data). Stays wire-compatible with 4.0.x
// peers: raw keys are still written alongside the doc, and syncOptions=true
// keeps their background mirror + install-time restore working.
(function () {
    'use strict';
    var NS = self.TabSetGoSync = self.TabSetGoSync || {};

    NS.providers.register({
        'id': 'browser',
        'label': 'Browser sync (Chrome only)',

        'isAvailable': function () {
            return Promise.resolve({ 'ok': true });
        },

        'connect': function () { return Promise.resolve(); },
        'disconnect': function () { return Promise.resolve(); },

        'pull': function () {
            return chrome.storage.sync.get(null).then(function (items) {
                if (items.syncDoc && items.syncDoc.version === 1) {
                    return items.syncDoc;
                }
                var settings = {};
                var any = false;
                NS.doc.SETTINGS_KEYS.forEach(function (k) {
                    if (items[k] !== undefined) {
                        settings[k] = items[k];
                        any = true;
                    }
                });
                return any ? NS.doc.build(settings, {}) : null;
            });
        },

        'push': function (doc) {
            var payload = { 'syncDoc': doc, 'syncOptions': true };
            NS.doc.SETTINGS_KEYS.forEach(function (k) {
                if (doc.settings[k] !== undefined) {
                    payload[k] = doc.settings[k];
                }
            });
            return chrome.storage.sync.set(payload);
        },

        'status': function () {
            return Promise.resolve({
                'connected': true,
                'detail': 'Roams with your browser account in Chrome only.'
            });
        }
    });
})();
