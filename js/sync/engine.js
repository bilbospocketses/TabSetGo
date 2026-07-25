/*global self,chrome */
// Sync engine. Runs in the MV3 service worker. storage.local stays the
// source of truth; the active provider is an opt-in roaming backup. The new
// tab redirect path never touches this code.
(function () {
    'use strict';
    var NS = self.TabSetGoSync = self.TabSetGoSync || {};
    var KEYS = NS.doc.SETTINGS_KEYS;

    var applying = {};      // keys the engine itself is writing right now
    var pushTimer = null;

    // The legacy opt-in flag maps onto the browser provider; every other
    // provider (or none) keeps syncOptions false so the 4.0.x background
    // mirror and install-time restore stay strictly scoped to browser sync.
    // Always re-reads storage (no memo): storage can be cleared while the
    // worker is alive, and the check is one cheap read.
    function ensureMigrated() {
        return chrome.storage.local.get(['syncProvider', 'syncOptions']).then(function (items) {
            var updates = {};
            var enabled = items.syncOptions === true || items.syncOptions === 'true';
            if (typeof items.syncOptions === 'string') {
                // pre-storage-API versions persisted the flag as a string
                updates.syncOptions = enabled;
            }
            if (items.syncProvider === undefined) {
                updates.syncProvider = enabled ? 'browser' : 'off';
            }
            if (Object.keys(updates).length) {
                return chrome.storage.local.set(updates);
            }
        });
    }

    function activeProvider() {
        return ensureMigrated().then(function () {
            return chrome.storage.local.get(['syncProvider']);
        }).then(function (items) {
            var id = items.syncProvider;
            if (!id || id === 'off') {
                return null;
            }
            var provider = NS.providers.get(id);
            if (!provider) {
                return null;
            }
            return provider.isAvailable().then(function (avail) {
                return avail.ok ? provider : null;
            });
        });
    }

    function currentDoc() {
        return chrome.storage.local.get(KEYS.concat(['syncStamps'])).then(function (items) {
            var settings = {};
            KEYS.forEach(function (k) {
                if (items[k] !== undefined) {
                    settings[k] = items[k];
                }
            });
            return NS.doc.build(settings, items.syncStamps || {});
        });
    }

    function recordError(e) {
        return chrome.storage.local.set({
            'syncLastError': String((e && e.message) || e)
        });
    }

    function pushNow() {
        return activeProvider().then(function (provider) {
            if (!provider) {
                return;
            }
            return currentDoc().then(function (doc) {
                return provider.push(doc);
            }).then(function () {
                return chrome.storage.local.set({ 'syncLastPush': Date.now(), 'syncLastError': null });
            });
        }).catch(recordError);
    }

    function schedulePush() {
        if (pushTimer) {
            clearTimeout(pushTimer);
        }
        pushTimer = setTimeout(function () {
            pushTimer = null;
            pushNow();
        }, 2000);
    }

    function markApplying(keys) {
        keys.forEach(function (k) { applying[k] = true; });
        // onChanged dispatch races the flag cleanup; a grace window keeps the
        // engine's own writes from being stamped as user edits.
        setTimeout(function () {
            keys.forEach(function (k) { delete applying[k]; });
        }, 1000);
    }

    function pullNow() {
        return activeProvider().then(function (provider) {
            if (!provider) {
                return;
            }
            return provider.pull().then(function (remote) {
                var done = chrome.storage.local.set({ 'syncLastPull': Date.now(), 'syncLastError': null });
                if (!remote) {
                    // nothing remote yet: seed it with our state
                    return done.then(pushNow);
                }
                return done.then(currentDoc).then(function (local) {
                    var m = NS.doc.merge(local, remote);
                    var applyKeys = Object.keys(m.applyLocal);
                    var toSet = { 'syncStamps': m.stamps };
                    applyKeys.forEach(function (k) { toSet[k] = m.applyLocal[k]; });
                    if (applyKeys.length) {
                        markApplying(applyKeys);
                    }
                    return chrome.storage.local.set(toSet).then(function () {
                        if (m.pushNeeded) {
                            schedulePush();
                        }
                    });
                });
            });
        }).catch(recordError);
    }

    // Import deliberately wins everywhere: imported keys get stamp = now.
    function importDoc(doc) {
        if (!doc || doc.version !== 1 || !doc.settings) {
            return Promise.reject(new Error('not a TabSetGo settings file'));
        }
        return chrome.storage.local.get(['syncStamps']).then(function (items) {
            var stamps = items.syncStamps || {};
            var now = Date.now();
            var toSet = {};
            KEYS.forEach(function (k) {
                if (doc.settings[k] !== undefined) {
                    toSet[k] = doc.settings[k];
                    stamps[k] = now;
                }
            });
            toSet.syncStamps = stamps;
            markApplying(Object.keys(toSet));
            return chrome.storage.local.set(toSet).then(function () {
                schedulePush();
            });
        });
    }

    function setProvider(id) {
        var valid = id === 'off' || !!NS.providers.get(id);
        if (!valid) {
            return Promise.reject(new Error('unknown provider: ' + id));
        }
        return chrome.storage.local.set({
            'syncProvider': id,
            'syncOptions': id === 'browser'
        }).then(function () {
            if (id !== 'off') {
                return pullNow();
            }
        });
    }

    function status() {
        return ensureMigrated().then(function () {
            return chrome.storage.local.get(['syncProvider', 'syncLastPush', 'syncLastPull', 'syncLastError']);
        }).then(function (items) {
            var id = items.syncProvider || 'off';
            var provider = id === 'off' ? null : NS.providers.get(id);
            var base = {
                'provider': id,
                'lastPush': items.syncLastPush || null,
                'lastPull': items.syncLastPull || null,
                'lastError': items.syncLastError || null
            };
            if (!provider) {
                return base;
            }
            return provider.status().then(function (s) {
                base.detail = s.detail;
                base.connected = s.connected;
                return base;
            });
        });
    }

    chrome.storage.onChanged.addListener(function (changes, ns) {
        if (ns !== 'local') {
            return;
        }
        var touched = KEYS.filter(function (k) {
            return changes[k] && !applying[k];
        });
        if (!touched.length) {
            return;
        }
        chrome.storage.local.get(['syncStamps']).then(function (items) {
            var stamps = items.syncStamps || {};
            var now = Date.now();
            touched.forEach(function (k) { stamps[k] = now; });
            return chrome.storage.local.set({ 'syncStamps': stamps });
        }).then(schedulePush);
    });

    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
        if (!msg || typeof msg.type !== 'string') {
            return false;
        }
        if (msg.type === 'tabsetgo-sync-now') {
            pullNow().then(function () { sendResponse({ 'ok': true }); },
                function (e) { sendResponse({ 'ok': false, 'error': String(e) }); });
            return true;
        }
        if (msg.type === 'tabsetgo-sync-status') {
            status().then(sendResponse, function (e) { sendResponse({ 'error': String(e) }); });
            return true;
        }
        if (msg.type === 'tabsetgo-sync-set-provider') {
            setProvider(msg.id).then(function () { sendResponse({ 'ok': true }); },
                function (e) { sendResponse({ 'ok': false, 'error': String(e) }); });
            return true;
        }
        if (msg.type === 'tabsetgo-sync-import') {
            importDoc(msg.doc).then(function () { sendResponse({ 'ok': true }); },
                function (e) { sendResponse({ 'ok': false, 'error': String(e) }); });
            return true;
        }
        return false;
    });

    chrome.alarms.create('tabsetgo-sync', { 'periodInMinutes': 15 });
    chrome.alarms.onAlarm.addListener(function (alarm) {
        if (alarm.name === 'tabsetgo-sync') {
            pullNow();
        }
    });

    NS.engine = {
        'init': function () {
            return ensureMigrated().then(pullNow);
        },
        'pullNow': pullNow,
        'pushNow': pushNow,
        'importDoc': importDoc,
        'setProvider': setProvider,
        'status': status
    };
})();
