/*global self,chrome */
// Google Drive provider: appDataFolder (an app-private sandbox the user
// never sees among their files). Uses the implicit grant via
// launchWebAuthFlow - the standard extension pattern for Google, since web
// clients get no refresh token without a secret. Access tokens (~1h) renew
// silently with prompt=none while the Google session lives; when that fails
// the status asks for a reconnect.
(function () {
    'use strict';
    var NS = self.TabSetGoSync = self.TabSetGoSync || {};
    var ID = 'gdrive';
    var AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
    var SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
    var API = 'https://www.googleapis.com/drive/v3';
    var UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

    function clientId() {
        return NS.config.gdriveClientId || '';
    }

    function authorize(interactive) {
        var url = NS.oauth.buildUrl(AUTH, {
            'client_id': clientId(),
            'response_type': 'token',
            'redirect_uri': NS.oauth.redirectUri(ID),
            'scope': SCOPE,
            'prompt': interactive ? 'consent' : 'none'
        });
        return NS.oauth.webAuthFlow(url, interactive).then(function (redirect) {
            var params = NS.oauth.paramsFrom(redirect, true);
            if (!params.access_token) {
                throw new Error(params.error || 'authorization was cancelled');
            }
            var tokens = {
                'accessToken': params.access_token,
                'expiresAt': Date.now() + (parseInt(params.expires_in, 10) || 3600) * 1000
            };
            return NS.oauth.setTokens(ID, tokens).then(function () {
                return tokens.accessToken;
            });
        });
    }

    function accessToken() {
        return NS.oauth.getTokens(ID).then(function (tokens) {
            if (tokens && tokens.expiresAt && Date.now() < tokens.expiresAt - 60000) {
                return tokens.accessToken;
            }
            if (!tokens) {
                throw new Error('not connected');
            }
            // silent renewal; surfaces as a reconnect request if it fails
            return authorize(false).catch(function () {
                throw new Error('session expired; reconnect Google Drive');
            });
        });
    }

    function findFileId(token) {
        var url = API + '/files?spaces=appDataFolder&q=' +
            encodeURIComponent("name='settings.json'") + '&fields=' +
            encodeURIComponent('files(id)');
        return fetch(url, { 'headers': { 'Authorization': 'Bearer ' + token } })
            .then(function (res) {
                if (!res.ok) {
                    throw new Error('Drive list failed: ' + res.status);
                }
                return res.json();
            }).then(function (json) {
                return (json.files && json.files[0] && json.files[0].id) || null;
            });
    }

    NS.providers.register({
        'id': ID,
        'label': 'Google Drive',

        'isAvailable': function () {
            return Promise.resolve(clientId()
                ? { 'ok': true }
                : { 'ok': false, 'reason': 'not configured' });
        },

        'connect': function () {
            if (!clientId()) {
                return Promise.reject(new Error('Google Drive app not configured'));
            }
            return authorize(true).then(function () { return undefined; });
        },

        'disconnect': function () {
            return NS.oauth.setTokens(ID, null);
        },

        'pull': function () {
            return accessToken().then(function (token) {
                return findFileId(token).then(function (id) {
                    if (!id) {
                        return null;
                    }
                    return fetch(API + '/files/' + id + '?alt=media', {
                        'headers': { 'Authorization': 'Bearer ' + token }
                    }).then(function (res) {
                        if (!res.ok) {
                            throw new Error('Drive download failed: ' + res.status);
                        }
                        return res.json();
                    });
                });
            });
        },

        'push': function (doc) {
            return accessToken().then(function (token) {
                return findFileId(token).then(function (id) {
                    if (id) {
                        return fetch(UPLOAD + '/files/' + id + '?uploadType=media', {
                            'method': 'PATCH',
                            'headers': {
                                'Authorization': 'Bearer ' + token,
                                'Content-Type': 'application/json'
                            },
                            'body': JSON.stringify(doc)
                        });
                    }
                    var boundary = 'tabsetgo' + Date.now();
                    var body =
                        '--' + boundary + '\r\n' +
                        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
                        JSON.stringify({ 'name': 'settings.json', 'parents': ['appDataFolder'] }) + '\r\n' +
                        '--' + boundary + '\r\n' +
                        'Content-Type: application/json\r\n\r\n' +
                        JSON.stringify(doc) + '\r\n' +
                        '--' + boundary + '--';
                    return fetch(UPLOAD + '/files?uploadType=multipart', {
                        'method': 'POST',
                        'headers': {
                            'Authorization': 'Bearer ' + token,
                            'Content-Type': 'multipart/related; boundary=' + boundary
                        },
                        'body': body
                    });
                }).then(function (res) {
                    if (res && !res.ok) {
                        throw new Error('Drive upload failed: ' + res.status);
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
                    ? { 'connected': true, 'detail': 'Connected to your Drive app data.' }
                    : { 'connected': false, 'detail': 'Not connected yet.' };
            });
        }
    });
})();
