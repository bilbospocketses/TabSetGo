/*global chrome,document,window,localStorage */
(function () {
    'use strict';

    function apply(theme) {
        if (theme === 'light' || theme === 'dark') {
            document.documentElement.setAttribute('data-theme', theme);
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
    }

    // localStorage mirror lets the correct theme paint on the first frame;
    // chrome.storage.local (async) stays the source of truth.
    var cached = null;
    try { cached = localStorage.getItem('theme'); } catch (e) {}
    apply(cached);

    if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get({ 'theme': 'system' }, function (items) {
            var t = items.theme || 'system';
            try { localStorage.setItem('theme', t); } catch (e) {}
            apply(t);
        });

        chrome.storage.onChanged.addListener(function (changes, ns) {
            if (ns === 'local' && changes.theme) {
                var t = changes.theme.newValue || 'system';
                try { localStorage.setItem('theme', t); } catch (e) {}
                apply(t);
            }
        });
    }
})();
