/*global self,chrome,crypto,fetch,btoa */
// Shared OAuth plumbing: PKCE, launchWebAuthFlow, and token storage.
// launchWebAuthFlow is the one identity API that works identically across
// Chromium variants (Chrome, Edge, Brave, Opera) - unlike getAuthToken,
// which is tied to Chrome's Google sign-in.
(function () {
    'use strict';
    var NS = self.TabSetGoSync = self.TabSetGoSync || {};

    function base64url(bytes) {
        var s = '';
        for (var i = 0; i < bytes.length; i++) {
            s += String.fromCharCode(bytes[i]);
        }
        return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function challengeFor(verifier) {
        var data = new TextEncoder().encode(verifier);
        return crypto.subtle.digest('SHA-256', data).then(function (hash) {
            return base64url(new Uint8Array(hash));
        });
    }

    function pkcePair() {
        var raw = new Uint8Array(32);
        crypto.getRandomValues(raw);
        var verifier = base64url(raw);
        return challengeFor(verifier).then(function (challenge) {
            return { 'verifier': verifier, 'challenge': challenge };
        });
    }

    function buildUrl(base, params) {
        var q = Object.keys(params).map(function (k) {
            return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
        }).join('&');
        return base + '?' + q;
    }

    // Runs the browser auth window and returns the raw redirect URL.
    function webAuthFlow(url, interactive) {
        return chrome.identity.launchWebAuthFlow({
            'url': url,
            'interactive': interactive !== false
        });
    }

    function paramsFrom(redirectUrl, fromFragment) {
        var u = new URL(redirectUrl);
        var raw = fromFragment ? u.hash.replace(/^#/, '') : u.search.replace(/^\?/, '');
        var out = {};
        raw.split('&').forEach(function (pair) {
            if (!pair) { return; }
            var kv = pair.split('=');
            out[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
        });
        return out;
    }

    function postForm(url, params) {
        var body = Object.keys(params).map(function (k) {
            return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
        }).join('&');
        return fetch(url, {
            'method': 'POST',
            'headers': { 'Content-Type': 'application/x-www-form-urlencoded' },
            'body': body
        }).then(function (res) {
            return res.json().then(function (json) {
                if (!res.ok) {
                    throw new Error(json.error_description || json.error || ('token endpoint said ' + res.status));
                }
                return json;
            });
        });
    }

    var TOKENS_KEY = 'oauthTokens';

    function getTokens(providerId) {
        return chrome.storage.local.get([TOKENS_KEY]).then(function (items) {
            return (items[TOKENS_KEY] || {})[providerId] || null;
        });
    }

    function setTokens(providerId, tokens) {
        return chrome.storage.local.get([TOKENS_KEY]).then(function (items) {
            var all = items[TOKENS_KEY] || {};
            if (tokens) {
                all[providerId] = tokens;
            } else {
                delete all[providerId];
            }
            var payload = {};
            payload[TOKENS_KEY] = all;
            return chrome.storage.local.set(payload);
        });
    }

    NS.oauth = {
        'base64url': base64url,
        'challengeFor': challengeFor,
        'pkcePair': pkcePair,
        'buildUrl': buildUrl,
        'webAuthFlow': webAuthFlow,
        'paramsFrom': paramsFrom,
        'postForm': postForm,
        'getTokens': getTokens,
        'setTokens': setTokens,
        'redirectUri': function (providerId) {
            return chrome.identity.getRedirectURL(providerId);
        }
    };
})();
