/*global self */
// Sync provider registry. Providers self-register on load.
(function () {
    'use strict';
    var NS = self.TabSetGoSync = self.TabSetGoSync || {};
    var byId = {};
    var order = [];

    NS.providers = {
        'register': function (provider) {
            if (!byId[provider.id]) {
                order.push(provider.id);
            }
            byId[provider.id] = provider;
        },
        'get': function (id) {
            return byId[id] || null;
        },
        'list': function () {
            return order.map(function (id) { return byId[id]; });
        }
    };
})();
