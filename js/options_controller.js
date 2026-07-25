(function(angular) {
    'use strict';

    var controllers = angular.module('newTab.controllers');

    controllers.controller('OptionsController', ['$scope', 'Storage', 'Permissions', '$log', 'popularPages', 'internalPages', '$timeout', '$q',
        function ($scope, Storage, Permissions, $log, popularPages, internalPages, $timeout, $q) {
            $scope.selected = 'url';
            $scope.popular = popularPages;
            $scope.internal = internalPages;
            $scope.optional_permissions = Permissions.OPTIONAL;
            $scope.required_permissions = Permissions.REQUIRED;

            // The sync engine (service worker) owns propagation; the options
            // page always reads and writes storage.local and just asks the
            // engine to pull before displaying.
            $scope.syncProviders = [
                { id: 'off', label: 'Off', note: 'Settings stay on this machine.', available: true },
                { id: 'browser', label: 'Browser sync', note: 'Roams with your browser account in Chrome only.', available: true },
                { id: 'folder', label: 'Synced folder', note: 'Coming soon: a folder inside OneDrive, Google Drive, Dropbox, or anything that syncs a folder.', available: false },
                { id: 'webdav', label: 'WebDAV', note: 'Coming soon: Nextcloud, ownCloud, Synology, or any WebDAV server.', available: false },
                { id: 'dropbox', label: 'Dropbox', note: 'Coming soon.', available: false },
                { id: 'onedrive', label: 'OneDrive', note: 'Coming soon.', available: false },
                { id: 'gdrive', label: 'Google Drive', note: 'Coming soon.', available: false }
            ];

            function sendSync(message) {
                return $q.when(chrome.runtime.sendMessage(message).catch(function () { return null; }));
            }

            function refreshSyncStatus() {
                return sendSync({ 'type': 'tabsetgo-sync-status' }).then(function (s) {
                    if (!s || s.error) {
                        $scope.syncStatusText = '';
                    } else if (s.lastError) {
                        $scope.syncStatusText = 'Last sync problem: ' + s.lastError;
                    } else if (s.lastPull) {
                        $scope.syncStatusText = 'Last synced ' + new Date(s.lastPull).toLocaleTimeString();
                    } else {
                        $scope.syncStatusText = '';
                    }
                });
            }

            function loadValues() {
                return Storage.getLocal(['syncProvider', 'theme', 'url', 'always-tab-update'])
                    .then(function (result) {
                        $scope.theme = (result.theme === 'light' || result.theme === 'dark') ? result.theme : 'system';
                        $scope.providerChoice = result.syncProvider || 'off';
                        $scope.url = result.url;
                        $scope.alwaysTabUpdate = result['always-tab-update'];
                        return refreshSyncStatus();
                    });
            }

            function getOptions() {
                return sendSync({ 'type': 'tabsetgo-sync-now' }).then(loadValues);
            }

            function getPermissions() {
                return Permissions.getAll()
                    .then(function (permissions) {
                        $scope.permissions = permissions;
                    });
            }

            $scope.save = function () {
                var options = {
                    'url': $scope.url,
                    'always-tab-update': $scope.alwaysTabUpdate
                };
                // storage.local is the source of truth; the sync engine
                // observes the change and propagates to the active provider.
                var promise = Storage.saveLocal(options);
                promise.then(function () {
                    $scope.show_saved = true;
                    $timeout(function () {
                        $scope.show_saved = false;
                    }, 3500);
                });
            };

            $scope.quickSave = function (url, e) {
                e.preventDefault();
                $scope.url = url;
                $scope.save();
            };

            $scope.cancel = function () {
                return getOptions();
            };

            $scope.changeTheme = function (selected) {
                var theme = (selected === 'light' || selected === 'dark') ? selected : 'system';
                Storage.saveLocal({'theme': theme});
            };

            $scope.changeSyncProvider = function (id) {
                sendSync({ 'type': 'tabsetgo-sync-set-provider', 'id': id })
                    .then(loadValues);
            };

            $scope.syncNow = function () {
                sendSync({ 'type': 'tabsetgo-sync-now' }).then(loadValues);
            };

            $scope.exportSettings = function () {
                Storage.getLocal(['url', 'always-tab-update', 'theme', 'syncStamps'])
                    .then(function (items) {
                        var settings = {};
                        ['url', 'always-tab-update', 'theme'].forEach(function (k) {
                            if (items[k] !== undefined) {
                                settings[k] = items[k];
                            }
                        });
                        var doc = {
                            'version': 1,
                            'updatedAt': Date.now(),
                            'settings': settings,
                            'stamps': items.syncStamps || {}
                        };
                        var blob = new Blob([JSON.stringify(doc, null, 2)], { 'type': 'application/json' });
                        var a = document.createElement('a');
                        a.href = URL.createObjectURL(blob);
                        a.download = 'tabsetgo-settings.json';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        $timeout(function () { URL.revokeObjectURL(a.href); }, 10000);
                    });
            };

            $scope.importSettingsClick = function () {
                document.getElementById('import-file').click();
            };

            var importInput = document.getElementById('import-file');
            if (importInput) {
                importInput.addEventListener('change', function () {
                    var file = importInput.files && importInput.files[0];
                    if (!file) {
                        return;
                    }
                    file.text().then(function (text) {
                        return chrome.runtime.sendMessage({
                            'type': 'tabsetgo-sync-import',
                            'doc': JSON.parse(text)
                        });
                    }).then(function () {
                        importInput.value = '';
                        $scope.$apply(function () {
                            loadValues();
                            $scope.show_saved = true;
                            $timeout(function () { $scope.show_saved = false; }, 3500);
                        });
                    }).catch(function (e) {
                        importInput.value = '';
                        $log.error('import failed', e);
                    });
                });
            }

            $scope.changeRedirect = function (selected) {
                Storage.saveLocal({'always-tab-update': selected});
            };

            $scope.grant = function (permission) {
                chrome.permissions.request({
                    permissions: [permission]
                }, function (result) {
                    $scope.$apply(function () {
                        console.log(result);
                    });
                });
            };

            $scope.deny = function (permission) {
                Permissions.revoke(permission);
            };

            $scope.$on('PermissionRemoved', function (evt, changed) {
                if (!angular.isObject($scope.permissions)) {
                    return;
                }
                changed.forEach(function (permission) {
                    $scope.permissions[permission] = false;
                });
                getPermissions();
            });
            $scope.$on('PermissionAdded', function (evt, changed) {
                if (!angular.isObject($scope.permissions)) {
                    return;
                }
                changed.forEach(function (permission) {
                    $scope.permissions[permission] = true;
                });
                getPermissions();
            });

            getOptions();
            getPermissions();
        }
    ]);
})(angular);