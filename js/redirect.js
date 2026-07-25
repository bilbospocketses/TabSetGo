/*global chrome,document,window */
(function init(angular) {
    "use strict";

    function redirect(url, items) {
        url = (0 !== url.indexOf("about:") && 0 !== url.indexOf("data:") && -1 === url.indexOf("://")) ? ("http://" + url) : url;
        if (/^http[s]?:/i.test(url) && items["always-tab-update"] !== true) {
            document.location.href = url;
        } else {
            chrome.tabs.getCurrent(function (tab) {
                // a keen user may open the extension's background page and set:
                // chrome.storage.local.set({'tab.selected': false});
                var selected = items["tab.selected"] === undefined ? true : (items["tab.selected"] == "true");
                chrome.tabs.update(tab.id, {
                    "url": url,
                    "highlighted": selected
                });
            });
        }
    }

    try {
        chrome.storage.local.get(["url", "tab.selected", "always-tab-update"], function (items) {
            if (items.url) {
                return redirect(items.url, items);
            }

            // The local copy of the url can be lost (interrupted writes, missed
            // service worker events, reinstalls) while the synced copy survives.
            // Chrome doesn't fire onChanged for same-value writes, so the
            // background mirror can never repair this state on its own. Fall
            // back to sync and heal local so the next tab takes the fast path. (#235)
            chrome.storage.sync.get(["url", "always-tab-update"], function (synced) {
                if (chrome.runtime.lastError || !synced || !synced.url) {
                    return angular.resumeBootstrap();
                }
                var repaired = { "url": synced.url };
                if (synced["always-tab-update"] !== undefined) {
                    repaired["always-tab-update"] = synced["always-tab-update"];
                }
                chrome.storage.local.set(repaired);
                redirect(synced.url, angular.extend({}, items, repaired));
            });
        });
    } catch(e){
        // If anything goes wrong with the redirection logic, fail to custom apps page.
        console.error(e);
        angular.resumeBootstrap();
    }
})(angular);
