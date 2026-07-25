/*global self,chrome,indexedDB */
// Synced-folder provider: reads/writes tabsetgo-settings.json in a folder the
// user picked (typically inside OneDrive / Google Drive for Desktop /
// Dropbox / Syncthing - their desktop client does the roaming). The picker
// itself is a window-only API, so connect() happens in the options page,
// which stores the directory handle in IndexedDB; this module (service
// worker) uses the stored handle. Chromium may downgrade the permission to
// "prompt" after restarts - the options page surfaces a re-authorize nudge.
(function () {
    'use strict';
    var NS = self.TabSetGoSync = self.TabSetGoSync || {};
    var FILE = 'tabsetgo-settings.json';

    function openDb() {
        return new Promise(function (resolve, reject) {
            var req = indexedDB.open('tabsetgo-sync', 1);
            req.onupgradeneeded = function () {
                req.result.createObjectStore('handles');
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
    }

    function getHandle() {
        return openDb().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction('handles', 'readonly');
                var rq = tx.objectStore('handles').get('folder');
                rq.onsuccess = function () { resolve(rq.result || null); };
                rq.onerror = function () { reject(rq.error); };
            });
        });
    }

    function removeHandle() {
        return openDb().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction('handles', 'readwrite');
                tx.objectStore('handles').delete('folder');
                tx.oncomplete = resolve;
                tx.onerror = function () { reject(tx.error); };
            });
        });
    }

    function grantedHandle() {
        return getHandle().then(function (handle) {
            if (!handle) {
                return null;
            }
            if (typeof handle.queryPermission !== 'function') {
                throw new Error('folder access is unavailable in this context');
            }
            return handle.queryPermission({ 'mode': 'readwrite' }).then(function (p) {
                if (p !== 'granted') {
                    throw new Error('folder needs re-authorization from the options page');
                }
                return handle;
            });
        });
    }

    NS.providers.register({
        'id': 'folder',
        'label': 'Synced folder',

        'isAvailable': function () {
            return getHandle().then(function (handle) {
                if (!handle) {
                    return { 'ok': false, 'reason': 'not configured' };
                }
                if (typeof handle.queryPermission !== 'function') {
                    return { 'ok': false, 'reason': 'unavailable in this context' };
                }
                return handle.queryPermission({ 'mode': 'readwrite' }).then(function (p) {
                    return p === 'granted'
                        ? { 'ok': true }
                        : { 'ok': false, 'reason': 'needs re-authorization' };
                });
            }).catch(function () {
                return { 'ok': false, 'reason': 'folder unavailable' };
            });
        },

        // The picker requires a user gesture in a window; the options page
        // performs it and stores the handle, then selects this provider.
        'connect': function () {
            return Promise.reject(new Error('choose the folder from the options page'));
        },

        'disconnect': function () {
            return removeHandle();
        },

        'pull': function () {
            return grantedHandle().then(function (handle) {
                if (!handle) {
                    return null;
                }
                return handle.getFileHandle(FILE).then(function (fh) {
                    return fh.getFile();
                }).then(function (file) {
                    return file.text();
                }).then(function (text) {
                    return JSON.parse(text);
                }).catch(function (e) {
                    if (e && e.name === 'NotFoundError') {
                        return null;
                    }
                    throw e;
                });
            });
        },

        'push': function (doc) {
            return grantedHandle().then(function (handle) {
                if (!handle) {
                    throw new Error('no folder chosen');
                }
                return handle.getFileHandle(FILE, { 'create': true }).then(function (fh) {
                    return fh.createWritable();
                }).then(function (writable) {
                    return writable.write(JSON.stringify(doc)).then(function () {
                        return writable.close();
                    });
                });
            });
        },

        'status': function () {
            return getHandle().then(function (handle) {
                if (!handle) {
                    return { 'connected': false, 'detail': 'Choose a synced folder below.' };
                }
                return NS.providers.get('folder').isAvailable().then(function (avail) {
                    return avail.ok
                        ? { 'connected': true, 'detail': 'Syncing to "' + handle.name + '" (' + FILE + ')' }
                        : { 'connected': false, 'detail': 'Folder "' + handle.name + '": ' + avail.reason };
                });
            });
        }
    });
})();
