/*global self,chrome,fetch,btoa */
// WebDAV provider: one PUT/GET file on any WebDAV server (Nextcloud,
// ownCloud, Synology, Fastmail, generic). Basic auth with an app password.
// Host permissions exempt extension fetches from CORS, so servers without
// CORS headers work too.
(function () {
    'use strict';
    var NS = self.TabSetGoSync = self.TabSetGoSync || {};
    var FILE = 'tabsetgo-settings.json';

    function getConfig() {
        return chrome.storage.local.get(['webdavConfig']).then(function (items) {
            return items.webdavConfig || null;
        });
    }

    function authHeaders(cfg) {
        return { 'Authorization': 'Basic ' + btoa(cfg.username + ':' + cfg.appPassword) };
    }

    function fileUrl(cfg) {
        return cfg.baseUrl.replace(/\/+$/, '') + '/' + FILE;
    }

    NS.providers.register({
        'id': 'webdav',
        'label': 'WebDAV',

        'isAvailable': function () {
            return getConfig().then(function (cfg) {
                return cfg ? { 'ok': true } : { 'ok': false, 'reason': 'not configured' };
            });
        },

        'connect': function (opts) {
            if (!opts || !opts.baseUrl) {
                return Promise.reject(new Error('a WebDAV folder URL is required'));
            }
            var cfg = {
                'baseUrl': String(opts.baseUrl).replace(/\/+$/, ''),
                'username': opts.username || '',
                'appPassword': opts.appPassword || ''
            };
            // Probe: 404 is fine (no file yet); auth errors are not.
            return fetch(fileUrl(cfg), { 'method': 'GET', 'headers': authHeaders(cfg) })
                .then(function (res) {
                    if (res.status === 401 || res.status === 403) {
                        throw new Error('authentication failed (' + res.status + ')');
                    }
                    if (!res.ok && res.status !== 404) {
                        throw new Error('server responded ' + res.status);
                    }
                    return chrome.storage.local.set({ 'webdavConfig': cfg });
                });
        },

        'disconnect': function () {
            return chrome.storage.local.remove('webdavConfig');
        },

        'pull': function () {
            return getConfig().then(function (cfg) {
                if (!cfg) {
                    return null;
                }
                return fetch(fileUrl(cfg), { 'method': 'GET', 'headers': authHeaders(cfg) })
                    .then(function (res) {
                        if (res.status === 404) {
                            return null;
                        }
                        if (!res.ok) {
                            throw new Error('WebDAV GET failed: ' + res.status);
                        }
                        return res.json();
                    });
            });
        },

        'push': function (doc) {
            return getConfig().then(function (cfg) {
                if (!cfg) {
                    throw new Error('WebDAV is not configured');
                }
                return fetch(fileUrl(cfg), {
                    'method': 'PUT',
                    'headers': Object.assign({ 'Content-Type': 'application/json' }, authHeaders(cfg)),
                    'body': JSON.stringify(doc)
                }).then(function (res) {
                    if (!res.ok) {
                        throw new Error('WebDAV PUT failed: ' + res.status);
                    }
                });
            });
        },

        'status': function () {
            return getConfig().then(function (cfg) {
                return cfg
                    ? { 'connected': true, 'detail': 'Syncing to ' + fileUrl(cfg) }
                    : { 'connected': false, 'detail': 'Enter your server details below.' };
            });
        }
    });
})();
