(function(angular) {
    'use strict';

    var controllers = angular.module('newTab.controllers');

    controllers.controller('OptionsController', ['$scope', 'Storage', 'Permissions', '$log', 'popularPages', 'internalPages', '$timeout',
        function ($scope, Storage, Permissions, $log, popularPages, internalPages, $timeout) {
            $scope.selected = 'url';
            $scope.popular = popularPages;
            $scope.internal = internalPages;
            $scope.optional_permissions = Permissions.OPTIONAL;
            $scope.required_permissions = Permissions.REQUIRED;

            function getOptions() {
                return Storage.getLocal(['syncOptions'])
                    .then(function (result) {
                        var flag = result.syncOptions;
                        // pre-storage-API versions persisted the flag as a string
                        if (typeof flag === 'string') {
                            flag = (flag === 'true');
                            Storage.saveLocal({'syncOptions': flag});
                        }
                        // sync is opt-in: only an explicit true enables it
                        $scope.sync = flag === true;

                        return Storage[$scope.sync ? 'getSync' : 'getLocal'](['url', 'always-tab-update']);
                    })
                    .then(function (result) {
                        $scope.url = result.url;
                        $scope.alwaysTabUpdate = result['always-tab-update'];
                    });
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
                // The new tab page reads storage.local, so always write there
                // first; sync is the roaming copy, not the source of truth.
                // Relying on the background onChanged mirror breaks on
                // same-value saves because Chrome suppresses the event. (#235)
                var promise = Storage.saveLocal(options)
                    .then(function () {
                        return $scope.sync ? Storage.saveSync(options) : null;
                    });
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

            $scope.changeSync = function (selected) {
                selected = selected === true;
                Storage.saveLocal({'syncOptions': selected});
                // roam the flag itself so a fresh install on another machine
                // can restore settings at install time
                Storage.saveSync({'syncOptions': selected});
            };

            $scope.changeRedirect = function (selected) {
                Storage.saveLocal({'always-tab-update': selected});
            };

            $scope.getSyncedUrl = function () {
                Storage.getSync(['url'])
                    .then(function (result) {
                        // empty string is meaningful: it selects the apps page
                        if (result.url !== undefined) {
                            $scope.url = result.url;
                        }
                    })
                    .then(function () {
                        $scope.save();
                    });
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