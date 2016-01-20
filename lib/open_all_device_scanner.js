/**
 * Device scanner by OpenAll
 */

var EventEmitter = require('events').EventEmitter;
var util = require('util');
var q = require('q');
var async = require('async');
var deepcopy = require('deepcopy');
var driver_const = require('ljswitchboard-ljm_driver_constants');
var data_parser = require('ljswitchboard-data_parser');
var curatedDevice = require('ljswitchboard-ljm_device_curator');
var modbus_map = require('ljswitchboard-modbus_map');
var constants = modbus_map.getConstants();

var eventList = require('./event_list').eventList;
var mock_device_scanner = require('./mock_open_all_device_scanner');

// TODO: Probably should move shared things to a separate file
var orig_dev_scan = require('./device_scanner');
var REQUIRED_INFO_BY_DEVICE = orig_dev_scan.REQUIRED_INFO_BY_DEVICE;

var ds_util = require('../lib/device_scanner_util');

var DEBUG_CONNECTION_TYPE_SORTING = false;
var DEBUG_DEVICE_SCAN_RESULT_SAVING = false;

var reportAsyncError = function(err) {
    console.log('open_all_device_scanner.js reportAsyncError', err, err.stack);
};

var OPEN_ALL_SCAN_REQUEST_LIST = [
    {
        'deviceType': driver_const.LJM_DT_DIGIT,
        'connectionType': driver_const.LJM_CT_USB,
        'addresses': REQUIRED_INFO_BY_DEVICE.LJM_dtDIGIT
    },
    {
        'deviceType': driver_const.LJM_DT_T7,
        'connectionType': driver_const.USB,
        'addresses': REQUIRED_INFO_BY_DEVICE.LJM_dtT7
    },
    {
        'deviceType': driver_const.LJM_DT_T7,
        'connectionType': driver_const.UDP,
        'addresses': REQUIRED_INFO_BY_DEVICE.LJM_dtT7
    },
];

var openAllDeviceScanner = function() {
    this.scanResults = [];
    this.activeDeviceResults = [];
    this.scanInProgress = false;
    this.sortedResults = [];

    this.mockDeviceScanner = new mock_device_scanner.createMockDeviceScanner();

    var deviceScanningEnabled = true;
    this.disableDeviceScanning = function() {
        var defered = q.defer();
        deviceScanningEnabled = false;
        defered.resolve();
        return defered.promise;
    };

    this.enableDeviceScanning = function() {
        var defered = q.defer();
        deviceScanningEnabled = true;
        defered.resolve();
        return defered.promise;
    };

    this.getDeviceScanningState = function() {
        var defered = q.defer();
        defered.resolve(deviceScanningEnabled);
        return defered.promise;
    };


    /**
     * Desc: Calls openAll to discover devices, afterwards closing the devices
     *       that were not previously open.
     **/
    var scanByOpenAllPeek = function(scanRequest) {
        var defered = q.defer();
        var promises = [];
        scanRequest.scanNum = 0;
        scanRequest.scanTypes = [];

        scanRequest.scanTypes.push('openAllPeek');
        promises.push(openAllPeek(scanRequest));

        q.allSettled(promises)
        .then(function(results) {
            defered.resolve();
        }, function(err) {
            console.error("singleScan error", err);
            defered.reject();
        });
        return defered.promise;
    };

    var getCurrentDeviceListing = function(currentDevices) {
        var defered = q.defer();
        self.activeDeviceResults = [];
        var currentDeviceListing = [];
        var promises = [];
        var deviceKeys = Object.keys(currentDevices);
        deviceKeys.forEach(function(deviceKey) {
            console.log('deviceKey', deviceKey);
            // Create an object that will get populated with device info
            var devInfo = {
                'key': deviceKey
            };
            // Save a reference of the object to the currentDeviceListing array
            currentDeviceListing.push(devInfo);
            // Pass the object reference to the populateDeviceInfo function to
            // have it populated with data.
            promises.push(populateDeviceInfo(devInfo, currentDevices));
        });

        q.allSettled(promises)
        .then(function(res) {
            self.activeDeviceResults = currentDeviceListing;
            defered.resolve();
        }, function(err) {
            console.error('Error finalizeScanResult');
            defered.reject();
        });
        return defered.promise;
    };
    var createInternalFindAllDevices = function(scanMethod, requestList) {
        var internalFindAllDevices = function() {
            var currentDevices = self.cachedCurrentDevices;
            var defered = q.defer();

            // Perform scans
            var promises = requestList.map(scanMethod);

            // Request data from already connected devices
            if(currentDevices) {
                if(Object.keys(currentDevices).length > 0) {
                    // Add task that queries currently connected devices for their data.
                    promises.push(getCurrentDeviceListing(currentDevices));
                }
            }

            // When all requests finish do...
            q.allSettled(promises)
            .then(function(res) {
                self.emit(eventList.COMBINING_SCAN_RESULTS);
                combineScanResults()
                .then(defered.resolve, defered.reject);
            }, function(err) {
                // console.log("scan error", err);
                defered.reject(self.scanResults);
            });

            return defered.promise;
        };
        return internalFindAllDevices;
    };

    this.originalOldfwState = 0;

    this.cachedCurrentDevices = [];
    this.findAllDevices = function(currentDevices) {
        var defered = q.defer();
        if (self.scanInProgress) {
            defered.reject('Scan in progress');
            return defered.promise;
        }

        self.scanInProgress = true;
        if(currentDevices) {
            self.cachedCurrentDevices = currentDevices;
        } else {
            self.cachedCurrentDevices = [];
        }
        var numToDelete;
        var i;
        // Empty the cached scanResults
        numToDelete = self.scanResults.length;
        for(i = 0; i < numToDelete; i++) {
            delete self.scanResults[i];
        }
        self.scanResults = [];

        // Empty the cached activeDeviceResults
        numToDelete = self.activeDeviceResults.length;
        for(i = 0; i < numToDelete; i++) {
            delete self.activeDeviceResults[i];
        }
        self.activeDeviceResults = [];

        // Empty the cached sortedResults
        numToDelete = self.sortedResults.length;
        for(i = 0; i < numToDelete; i++) {
            delete self.sortedResults[i];
        }
        self.sortedResults = [];

        var getOnError = function(msg) {
            return function(err) {
                console.error('An Error', err, msg, err.stack);
                var errDefered = q.defer();
                errDefered.reject(err);
                return errDefered.promise;
            };
        };

        if(deviceScanningEnabled) {
            console.log('hasOpenAll');
            createInternalFindAllDevices(
                scanByOpenAllPeek,
                OPEN_ALL_SCAN_REQUEST_LIST
            )()
            .then(markActiveDevices, getOnError('findAllByOpenAllPeek'))
            .then(sortResultConnectionTypes, getOnError('markActiveDevices'))
            .then(sortScanResults, getOnError('sortResultConnectionTypes'))
            .then(returnResults, getOnError('sortScanResults'))
            .then(defered.resolve, defered.reject);
        } else {
            internalFindMockDevices()
            .then(populateMissingScanData, getOnError('internalFindMockDevices'))
            .then(markActiveDevices, getOnError('populateMissingScanData'))
            .then(sortResultConnectionTypes, getOnError('markActiveDevices'))
            .then(sortScanResults, getOnError('sortResultConnectionTypes'))
            .then(returnResults, getOnError('sortScanResults'))
            .then(defered.resolve, defered.reject);
        }
        return defered.promise;
    };

    this.getLastFoundDevices = function() {
        var defered = q.defer();
        if(!self.scanInProgress) {
            defered.resolve(self.sortedResults);
        } else {
            defered.resolve([]);
        }
        return defered.promise;
    };

    this.addMockDevice = function(device) {
        return self.mockDeviceScanner.addDevice(device);
    };

    this.addMockDevices = function(devices) {
        return self.mockDeviceScanner.addDevices(devices);
    };

    var self = this;
};
util.inherits(openAllDeviceScanner, EventEmitter);

exports.openAllDeviceScanner = openAllDeviceScanner;

var createDeviceScanner = function(driver) {
    var ds = new openAllDeviceScanner();
    ds.driver = driver;
    ds.hasOpenAll = driver.hasOpenAll;
    return ds;
}

exports.createDeviceScanner = createDeviceScanner;
