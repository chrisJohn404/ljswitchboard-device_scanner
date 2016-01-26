/**
 * Device scanner by OpenAll
 */

var EventEmitter = require('events').EventEmitter;
var util = require('util');
var q = require('q');
var async = require('async');
var driver_const = require('ljswitchboard-ljm_driver_constants');
var data_parser = require('ljswitchboard-data_parser');
var device_curator = require('ljswitchboard-ljm_device_curator');
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

var PERFORM_SCAN_REQUESTS_ASYNCHRONOUSLY = true;
var OPEN_ALL_SCAN_REQUEST_LIST = [
    {
        'deviceType': driver_const.LJM_DT_DIGIT,
        'connectionType': driver_const.LJM_CT_USB,
        'addresses': REQUIRED_INFO_BY_DEVICE.LJM_dtDIGIT,
        'numAttempts': 1,
        'async': false,
    },
    {
        'deviceType': driver_const.LJM_DT_T7,
        'connectionType': driver_const.LJM_CT_USB,
        'addresses': REQUIRED_INFO_BY_DEVICE.LJM_dtT7,
        'numAttempts': 1,
        'async': false,
    },
    {
        'deviceType': driver_const.LJM_DT_T7,
        'connectionType': driver_const.LJM_CT_UDP,
        'addresses': REQUIRED_INFO_BY_DEVICE.LJM_dtT7,
        'numAttempts': 1,
        'async': false,
    },
];

function createManagedDevice(deviceHandle, openParameters) {
    console.log('creating Managed Device', deviceHandle, openParameters);
    // Save initialization data to this context.
    this.handle = deviceHandle;
    this.openParameters = openParameters;

    // Initialize a curated device object.
    this.curatedDevice = new device_curator.device();

    // Initialize a variety of parameters related to a device.
    this.serialNumber = 0;
    this.deviceType = 0;
    this.connectionType = 0;
    this.port = 0;
    
    // Initialize variables related to the state of the managed device.
    this.requiredDeviceAddresses = [];
    this.collectingDeviceData = false;
    this.collectedDeviceData = false;

    function queryAndSaveData(registerName) {

    }

    function finishedCollectingDeviceData(err) {
        console.log('Finished Collecting Device Data');
    }

    function innerCollectDeviceData(infoToCache) {
        var defered = q.defer();

        console.log('Collecting Device Data', self.handle, infoToCache, self.openParameters);

        var deviceHandle = self.handle;
        var dt = self.openParameters.deviceType;
        var ct = self.openParameters.connectionType;
        var id = self.openParameters.identifier;
        self.curatedDevice.linkToHandle(deviceHandle, dt, ct, id)
        .then(function(res) {
            console.log('Finished collecting device info', self.curatedDevice.savedAttributes);
            defered.resolve();
        });
        return defered.promise;
    }

    this.collectDeviceData = function(infoToCache) {
        var promise = undefined;
        if(!self.collectingDeviceData) {
            self.collectingDeviceData = true;
            promise = innerCollectDeviceData(infoToCache);
        } else {
            var defered = q.defer();
            defered.resolve();
            promise = defered.promise;
        }
        return promise;
    }
    var self = this;
}

function createDeviceManager() {
    this.openDevices = [];

    this.addDevice = function(deviceHandle, requiredInfo, openInfo) {
        var promise = undefined;
        var addDevice = true;

        // Check to see if the device handle already exists.
        var deviceExists = self.openDevices.some(function(scannedDevice) {
            if (scannedDevice.handle == deviceHandle) {
                return true;
            } else {
                return false;
            }
        });

        if(!deviceExists) {
            // Create a new managed device.
            var newDevice = new createManagedDevice(deviceHandle, openInfo);
            promise = newDevice.collectDeviceData(requiredInfo);
            self.openDevices.push(newDevice);
        } else {
            // Do nothing...
            var defered = q.defer();
            defered.resolve();
            promise = defered.promise;
        }

        return promise;
    };

    this.addDevices = function(deviceHandles, requiredInfo, openInfos) {
        var promises = [];
        deviceHandles.forEach(function(deviceHandle, i) {
            var openInfo = openInfos[i];
            promises.push(self.addDevice(deviceHandle, requiredInfo, openInfo));
        });
        return promises;
    };


    var self = this;
}

function openAllDeviceScanner() {
    this.driver = undefined;
    this.deviceManager = undefined;

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

    function createScannedDeviceManager() {
        var defered = q.defer();
        self.deviceManager = new createDeviceManager();
        defered.resolve();
        return defered.promise;
    }

    function performOpenAllScanIteration(scanMethod, cb) {
        var dt = scanMethod.deviceType;
        var ct = scanMethod.connectionType;
        var requiredInfo = scanMethod.addresses;

        function onErr(err) {
            cb();
        }
        function onSuccess(openAllData) {
            console.log('Called OpenAll, in onSuccess, data:', dt, ct, openAllData);
            var promises = openAllData.map(function(deviceData) {
                var openInfo = {
                    'deviceType': dt,
                    'connectionType': ct,
                    'identifier': 'LJM_idANY',
                };
                console.log('Managing device...', deviceData.handle);
                return self.deviceManager.addDevice(deviceData.handle, requiredInfo, openInfo);
            });

            // When all devices have been added to the device manager we can return.
            q.allSettled(promises)
            .then(function() {
                cb();
            }, function(err) {
                console.error('Error in performOpenAllScanIteration', err);
                cb();
            });
        }
        self.driver.openAll(dt, ct, onErr, onSuccess);
    }

    function performOpenAllScanMethod(scanMethod, cb) {
        var scanIterations = [];
        var numAttempts = scanMethod.numAttempts;
        for(var i = 0; i < numAttempts; i++) {
            scanIterations.push(scanMethod);
        }

        var performAsync = scanMethod.async;

        function finishedScanning() {
            console.log('Finished performing scanMethod...');
            // We are finished scanning...
            console.log(
                'Finished performing openAll scans, sm:',
                scanMethod.deviceType,
                scanMethod.connectionType
            );
            cb();
        }

        if(performAsync) {
            async.each(
                scanIterations,
                performOpenAllScanIteration,
                finishedScanning
            );
        } else {
            async.eachSeries(
                scanIterations,
                performOpenAllScanIteration,
                finishedScanning
            );
        }
    }
    /*
     * The function "openAllAvailableDevices" performs several OpenAll function calls to 
     * build up a list of all the currently available LabJack devices.
    */
    function openAllAvailableDevices() {
        var defered = q.defer();

        // Empty the array of currently open devices.
        var scanMethods = OPEN_ALL_SCAN_REQUEST_LIST;

        var performAsync = PERFORM_SCAN_REQUESTS_ASYNCHRONOUSLY;

        var startTime = new Date();
        function finishedScanning() {
            var stopTime = new Date();
            var duration = stopTime - startTime;
            duration = parseFloat((duration/1000).toFixed(3))
            // We are finished scanning...
            console.log(
                'Finished performing all openAll scans. Duration:',
                duration
            );
            defered.resolve();
        }

        if(performAsync) {
            async.each(
                scanMethods,
                performOpenAllScanMethod,
                finishedScanning
            );
        } else {
            async.eachSeries(
                scanMethods,
                performOpenAllScanMethod,
                finishedScanning
            );
        }
        return defered.promise;
    }

    /*
     * The function "collectRequiredDeviceInfo" does...
    */
    function collectRequiredDeviceInfo() {
        var defered = q.defer();
        console.log('Delaying for device reads...');
        setTimeout(function() {
            console.log('Done waiting for device reads...');
            defered.resolve();
        }, 2000);
        return defered.promise;
    }

    /*
     * The function "markActiveDevices" does...
    */
    function markActiveDevices() {
        var defered = q.defer();
        defered.resolve();
        return defered.promise;
    }

    /*
     * The function "closeInactiveDevices" does...
    */
    function closeInactiveDevices() {
        var defered = q.defer();
        defered.resolve();
        return defered.promise;
    }

    /*
     * The function "testInactiveDeviceConnections" does...
    */
    function testInactiveDeviceConnections() {
        var defered = q.defer();
        defered.resolve();
        return defered.promise;
    }

    /*
     * The function "returnResults" does...
    */
    function returnResults() {
        var defered = q.defer();
        defered.resolve();
        return defered.promise;
    }

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
            console.log('Creating Scan Managers');

            // Create the device manager object.
            createScannedDeviceManager()

            // Incrementally open as many devices as possible via USB and UDP connections.
            .then(openAllAvailableDevices, getOnError('createDeviceManager'))

            // Collect the required information about each opened device.
            .then(collectRequiredDeviceInfo, getOnError('openAllAvailableDevices'))

            // Mark the devices that are currently open and should not be closed.
            .then(markActiveDevices, getOnError('collectRequiredDeviceInfo'))

            // Close the devices that aren't currently open.
            .then(closeInactiveDevices, getOnError('markActiveDevices'))

            // Test the connections to the found devices that aren't currently open.
            .then(testInactiveDeviceConnections, getOnError('closeInactiveDevices'))

            // Compile the data that needs to be returned to the user.
            .then(returnResults, getOnError('testInactiveDeviceConnections'))

            // Resolve or reject the promise.
            .then(defered.resolve, defered.reject);
            // console.log('hasOpenAll');
            // createInternalFindAllDevices(
            //     scanByOpenAllPeek,
            //     OPEN_ALL_SCAN_REQUEST_LIST
            // )()
            // .then(markActiveDevices, getOnError('findAllByOpenAllPeek'))
            // .then(sortResultConnectionTypes, getOnError('markActiveDevices'))
            // .then(sortScanResults, getOnError('sortResultConnectionTypes'))
            // .then(returnResults, getOnError('sortScanResults'))
            // .then(defered.resolve, defered.reject);
            // defered.resolve({'data':'dummy data'});
        } else {
            // internalFindMockDevices()
            // .then(populateMissingScanData, getOnError('internalFindMockDevices'))
            // .then(markActiveDevices, getOnError('populateMissingScanData'))
            // .then(sortResultConnectionTypes, getOnError('markActiveDevices'))
            // .then(sortScanResults, getOnError('sortResultConnectionTypes'))
            // .then(returnResults, getOnError('sortScanResults'))
            // .then(defered.resolve, defered.reject);
            defered.resolve({'data':'dummy data'});
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
