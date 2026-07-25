/*global self,chrome */
// Dropbox provider: app-folder access type (the app sees only its own
// folder), authorization-code PKCE with refresh tokens.
(function () {
    'use strict';
    var NS = self.TabSetGoSync = self.TabSetGoSync || {};
    var ID = 'dropbox';
    var FILE = '/settings.json';

    function clientId() {
        return NS.config.dropboxClientId || '';
    }

    function accessToken() {
        return NS.oauth.getTokens(ID).then(function (tokens) {
            if (!tokens) {
                throw new Error('not connected');
            }
            if (tokens.expiresAt && Date.now() < tokens.expiresAt - 60000) {
                return tokens.accessToken;
            }
            if (!tokens.refreshToken) {
                throw new Error('session expired; reconnect Dropbox');
            }
            return NS.oauth.postForm('https://api.dropboxapi.com/oauth2/token', {
                'grant_type': 'refresh_token',
                'refresh_token': tokens.refreshToken,
                'client_id': clientId()
            }).then(function (json) {
                var next = {
                    'accessToken': json.access_token,
                    'refreshToken': tokens.refreshToken,
                    'expiresAt': Date.now() + (json.expires_in || 14400) * 1000
                };
                return NS.oauth.setTokens(ID, next).then(function () {
                    return next.accessToken;
                });
            });
        });
    }

    NS.providers.register({
        'id': ID,
        'label': 'Dropbox',

        'isAvailable': function () {
            return Promise.resolve(clientId()
                ? { 'ok': true }
                : { 'ok': false, 'reason': 'not configured' });
        },

        'connect': function () {
            if (!clientId()) {
                return Promise.reject(new Error('Dropbox app not configured'));
            }
            var redirectUri = NS.oauth.redirectUri(ID);
            return NS.oauth.pkcePair().then(function (pkce) {
                var url = NS.oauth.buildUrl('https://www.dropbox.com/oauth2/authorize', {
                    'client_id': clientId(),
                    'response_type': 'code',
                    'redirect_uri': redirectUri,
                    'code_challenge': pkce.challenge,
                    'code_challenge_method': 'S256',
                    'token_access_type': 'offline'
                });
                return NS.oauth.webAuthFlow(url).then(function (redirect) {
                    var params = NS.oauth.paramsFrom(redirect, false);
                    if (!params.code) {
                        throw new Error(params.error_description || params.error || 'authorization was cancelled');
                    }
                    return NS.oauth.postForm('https://api.dropboxapi.com/oauth2/token', {
                        'grant_type': 'authorization_code',
                        'code': params.code,
                        'client_id': clientId(),
                        'redirect_uri': redirectUri,
                        'code_verifier': pkce.verifier
                    });
                });
            }).then(function (json) {
                return NS.oauth.setTokens(ID, {
                    'accessToken': json.access_token,
                    'refreshToken': json.refresh_token || null,
                    'expiresAt': Date.now() + (json.expires_in || 14400) * 1000
                });
            });
        },

        'disconnect': function () {
            return NS.oauth.setTokens(ID, null);
        },

        'pull': function () {
            return accessToken().then(function (token) {
                return fetch('https://content.dropboxapi.com/2/files/download', {
                    'method': 'POST',
                    'headers': {
                        'Authorization': 'Bearer ' + token,
                        'Dropbox-API-Arg': JSON.stringify({ 'path': FILE })
                    }
                }).then(function (res) {
                    if (res.status === 409) {
                        return null;        // path not found: nothing synced yet
                    }
                    if (!res.ok) {
                        throw new Error('Dropbox download failed: ' + res.status);
                    }
                    return res.json();
                });
            });
        },

        'push': function (doc) {
            return accessToken().then(function (token) {
                return fetch('https://content.dropboxapi.com/2/files/upload', {
                    'method': 'POST',
                    'headers': {
                        'Authorization': 'Bearer ' + token,
                        'Dropbox-API-Arg': JSON.stringify({ 'path': FILE, 'mode': 'overwrite', 'mute': true }),
                        'Content-Type': 'application/octet-stream'
                    },
                    'body': JSON.stringify(doc)
                }).then(function (res) {
                    if (!res.ok) {
                        throw new Error('Dropbox upload failed: ' + res.status);
                    }
                });
            });
        },

        'status': function () {
            if (!clientId()) {
                return Promise.resolve({ 'connected': false, 'detail': 'Needs a one-time app registration (docs/oauth-setup.md).' });
            }
            return NS.oauth.getTokens(ID).then(function (tokens) {
                return tokens
                    ? { 'connected': true, 'detail': 'Connected to your Dropbox app folder.' }
                    : { 'connected': false, 'detail': 'Not connected yet.' };
            });
        }
    });
})();
