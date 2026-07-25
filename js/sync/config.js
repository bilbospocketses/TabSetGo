/*global self */
// OAuth client IDs for the cloud providers. Empty string = provider reports
// "not configured" and stays disabled in the picker. Fill these from the
// console registrations described in docs/oauth-setup.md - they are public
// identifiers (PKCE public clients), not secrets.
(function () {
    'use strict';
    var NS = self.TabSetGoSync = self.TabSetGoSync || {};
    NS.config = {
        'dropboxClientId': '',
        'onedriveClientId': '',
        'gdriveClientId': ''
    };
})();
