/*global self,chrome */
// OneDrive provider: Microsoft Graph App Folder (special/approot), PKCE with
// refresh tokens. Works for personal Microsoft accounts and OneDrive for
// Business (tenant consent permitting).
(function () {
    'use strict';
    var NS = self.TabSetGoSync = self.TabSetGoSync || {};
    var ID = 'onedrive';
    var FILE_URL = 'https://graph.microsoft.com/v1.0/me/drive/special/approot:/settings.json:/content';
    var AUTH = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
    var TOKEN = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
    var SCOPES = 'Files.ReadWrite.AppFolder offline_access';

    function clientId() {
        return NS.config.onedriveClientId || '';
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
                throw new Error('session expired; reconnect OneDrive');
            }
            return NS.oauth.postForm(TOKEN, {
                'grant_type': 'refresh_token',
                'refresh_token': tokens.refreshToken,
                'client_id': clientId(),
                'scope': SCOPES
            }).then(function (json) {
                var next = {
                    'accessToken': json.access_token,
                    'refreshToken': json.refresh_token || tokens.refreshToken,
                    'expiresAt': Date.now() + (json.expires_in || 3600) * 1000
                };
                return NS.oauth.setTokens(ID, next).then(function () {
                    return next.accessToken;
                });
            });
        });
    }

    NS.providers.register({
        'id': ID,
        'label': 'OneDrive',

        'isAvailable': function () {
            return Promise.resolve(clientId()
                ? { 'ok': true }
                : { 'ok': false, 'reason': 'not configured' });
        },

        'connect': function () {
            if (!clientId()) {
                return Promise.reject(new Error('OneDrive app not configured'));
            }
            var redirectUri = NS.oauth.redirectUri(ID);
            return NS.oauth.pkcePair().then(function (pkce) {
                var url = NS.oauth.buildUrl(AUTH, {
                    'client_id': clientId(),
                    'response_type': 'code',
                    'redirect_uri': redirectUri,
                    'scope': SCOPES,
                    'code_challenge': pkce.challenge,
                    'code_challenge_method': 'S256'
                });
                return NS.oauth.webAuthFlow(url).then(function (redirect) {
                    var params = NS.oauth.paramsFrom(redirect, false);
                    if (!params.code) {
                        throw new Error(params.error_description || params.error || 'authorization was cancelled');
                    }
                    return NS.oauth.postForm(TOKEN, {
                        'grant_type': 'authorization_code',
                        'code': params.code,
                        'client_id': clientId(),
                        'redirect_uri': redirectUri,
                        'code_verifier': pkce.verifier,
                        'scope': SCOPES
                    });
                });
            }).then(function (json) {
                return NS.oauth.setTokens(ID, {
                    'accessToken': json.access_token,
                    'refreshToken': json.refresh_token || null,
                    'expiresAt': Date.now() + (json.expires_in || 3600) * 1000
                });
            });
        },

        'disconnect': function () {
            return NS.oauth.setTokens(ID, null);
        },

        'pull': function () {
            return accessToken().then(function (token) {
                return fetch(FILE_URL, {
                    'headers': { 'Authorization': 'Bearer ' + token }
                }).then(function (res) {
                    if (res.status === 404) {
                        return null;
                    }
                    if (!res.ok) {
                        throw new Error('OneDrive download failed: ' + res.status);
                    }
                    return res.json();
                });
            });
        },

        'push': function (doc) {
            return accessToken().then(function (token) {
                return fetch(FILE_URL, {
                    'method': 'PUT',
                    'headers': {
                        'Authorization': 'Bearer ' + token,
                        'Content-Type': 'application/json'
                    },
                    'body': JSON.stringify(doc)
                }).then(function (res) {
                    if (!res.ok) {
                        throw new Error('OneDrive upload failed: ' + res.status);
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
                    ? { 'connected': true, 'detail': 'Connected to your OneDrive app folder.' }
                    : { 'connected': false, 'detail': 'Not connected yet.' };
            });
        }
    });
})();
