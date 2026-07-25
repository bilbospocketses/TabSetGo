/*global self */
// Sync document helpers. Loaded via importScripts into the service worker.
(function () {
    'use strict';
    var NS = self.TabSetGoSync = self.TabSetGoSync || {};

    var SETTINGS_KEYS = ['url', 'always-tab-update', 'theme'];

    function build(settings, stamps) {
        var doc = { 'version': 1, 'updatedAt': 0, 'settings': {}, 'stamps': {} };
        SETTINGS_KEYS.forEach(function (k) {
            if (settings[k] !== undefined) {
                doc.settings[k] = settings[k];
            }
            doc.stamps[k] = stamps[k] || 0;
            if (doc.stamps[k] > doc.updatedAt) {
                doc.updatedAt = doc.stamps[k];
            }
        });
        return doc;
    }

    // Per-key last-writer-wins. Ties keep local. A remote value always fills a
    // key that local doesn't have at all (same self-heal intent as the new tab
    // page's read-time sync fallback).
    function merge(local, remote) {
        var applyLocal = {};
        var stamps = {};
        var pushNeeded = false;

        SETTINGS_KEYS.forEach(function (k) {
            var ls = (local.stamps && local.stamps[k]) || 0;
            var rs = (remote.stamps && remote.stamps[k]) || 0;
            var lv = local.settings ? local.settings[k] : undefined;
            var rv = remote.settings ? remote.settings[k] : undefined;

            var takeRemote =
                (rv !== undefined && rs > ls) ||
                (rv !== undefined && lv === undefined);

            if (takeRemote) {
                stamps[k] = rs > ls ? rs : ls;
                if (rv !== lv) {
                    applyLocal[k] = rv;
                }
            } else {
                stamps[k] = ls;
                if (lv !== undefined && (rs < ls || rv !== lv)) {
                    pushNeeded = true;
                }
            }
        });

        return { 'applyLocal': applyLocal, 'stamps': stamps, 'pushNeeded': pushNeeded };
    }

    NS.doc = {
        'SETTINGS_KEYS': SETTINGS_KEYS,
        'build': build,
        'merge': merge
    };
})();
