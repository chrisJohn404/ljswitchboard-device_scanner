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

var DEBUG_COLLECTED_DEVICE_DATA = false;
var DEBUG_MANAGED_DEVICE = true;
var DEBUG_DEVICE_MANAGER = false;
var DEBUG_OPEN_ALL_SCAN = false;

var DEBUG_CONNECTION_TYPE_SORTING = false;
var DEBUG_DEVICE_SCAN_RESULT_SAVING = false;

var DEVICE_DATA_COLLECTION_TIMEOUT = 30000;

var reportAsyncError = function(err) {
    console.log('open_all_device_scanner.js reportAsyncError', err, err.stack);
};

/* Define what the open all device scanner is trying to do */
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
    if(DEBUG_MANAGED_DEVICE) {
        console.log('Creating Managed Device', deviceHandle, openParameters);
    }

    this.log = function() {
        if(DEBUG_MANAGED_DEVICE) {
            console.log.apply(this, arguments);
        }
    }
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
    this.cachedDeviceResults = {};
    this.collectingDeviceData = false;
    this.collectedDeviceData = false;

    // This is a "debugging" function that prints out the important attributes
    // of the data being queried from a device.
    function printCollectedDeviceData(results) {
        var dataToKeep = {
            'AIN0': 'val',
            'FIRMWARE_VERSION': 'val',
            'WIFI_IP': 'str',
            'ETHERNET_IP': 'str',
            'WIFI_RSSI': 'str',
            'WIFI_VERSION': 'val',
            'SERIAL_NUMBER': 'val',
            'HARDWARE_INSTALLED': 'productType',
        };
        var vals = [];
        results.forEach(function(result) {
            result = result.data;
            var data = {};
            var keyToKeep = 'res';
            if(dataToKeep[result.name]) {
                keyToKeep = dataToKeep[result.name];
            }
            data[result.name] = result.res;
            if(result[keyToKeep]) {
                data[result.name] = result[keyToKeep];
            }
            vals.push(data)
        });

        if(DEBUG_COLLECTED_DEVICE_DATA) {
            console.log('Connection Type', self.curatedDevice.savedAttributes.connectionTypeName);
            console.log('Serial Number', self.curatedDevice.savedAttributes.serialNumber);
            console.log('Read Data', self.curatedDevice.getDevice().handle,':');
            console.log(vals);
        }
    }

    // Save Data to the cached device results object...
    function saveCollectedDeviceData(results) {
        self.log('Finished Collecting Data from Device:', self.handle);

        // Loop through each of the results.
        results.forEach(function(result) {
            // De-reference the actual data
            var data = result.data;

            // Determine what register was saved
            var name = data.name;

            // Save the data to the cached device results object.
            self.cachedDeviceResults[name] = data;
        });
    }

    // Link supplied device handle to the curated device object 
    // and collect the required information from the device.
    function innerCollectDeviceData(infoToCache) {
        var defered = q.defer();

        self.log('Collecting Data from a handle', self.handle);

        var deviceHandle = self.handle;
        var dt = self.openParameters.deviceType;
        var ct = self.openParameters.connectionType;
        var id = self.openParameters.identifier;

        // Link the device handle to the curated device object.
        self.curatedDevice.linkToHandle(deviceHandle, dt, ct, id)
        .then(function finishedLinkingHandle(res) {
            self.log(
                'Finished linking to a handle',
                deviceHandle,
                self.curatedDevice.savedAttributes.connectionTypeName
            );
            
            // Create a data collection timeout.
            var collectionTimeout = setTimeout(function dataCollectionTimeout() {
                self.log('Data collection from a handle is taking a long time...', deviceHandle);
            }, DEVICE_DATA_COLLECTION_TIMEOUT);

            // Collect information from the curated device.
            self.curatedDevice.iReadMultiple(infoToCache)
            .then(function finishedCollectingData(results) {
                // Clear the data collection timeout
                clearTimeout(collectionTimeout);

                self.log('Collecting data from a handle', deviceHandle);
                printCollectedDeviceData(results);
                saveCollectedDeviceData(results);

                // Report that the device is finished collecting data.
                self.collectedDeviceData = true;
                self.collectingDeviceData = false;

                defered.resolve();
            }, function(err) {
                defered.resolve();
            });
        }, function errorLinkingHandle(err) {
            console.error('Error linking to handle...');
            defered.resolve();
        });
        return defered.promise;
    }

    // This function gets called to cache the device results.  It returns a 
    // promise that gets resolved when the results are finished being collected.
    this.collectDeviceData = function(infoToCache) {
        var promise = undefined;
        // If the device isn't already collecting data and that it hasn't 
        // already been collected.
        if((!self.collectingDeviceData) && (!self.collectedDeviceData)) {
            self.collectingDeviceData = true;
            self.cachedDeviceResults = {};
            promise = innerCollectDeviceData(infoToCache);
        } else {
            // If we are already collecting data/it has already been collected 
            // than just return a promise that has been resolved.
            var defered = q.defer();
            defered.resolve();
            promise = defered.promise;
        }
        return promise;
    };

    function innerCollectDataFromCuratedDevice(curatedDevice, infoToCache) {
        var defered = q.defer();

        self.log('Collecting data from a curated device');
        self.curatedDevice = curatedDevice;
        var ljmDevice = curatedDevice.getDevice();
        var deviceHandle = ljmDevice.handle;

        // Create a data collection timeout.
        var collectionTimeout = setTimeout(function dataCollectionTimeout() {
            self.log('Data collection from a handle is taking a long time...', deviceHandle);
        }, DEVICE_DATA_COLLECTION_TIMEOUT);

        self.curatedDevice.iReadMultiple(infoToCache)
            .then(function finishedCollectingData(results) {
                // Clear the data collection timeout
                clearTimeout(collectionTimeout);

                printCollectedDeviceData(results);
                saveCollectedDeviceData(results);

                // Report that the device is finished collecting data.
                self.collectedDeviceData = true;
                self.collectingDeviceData = false;

                defered.resolve();
            }, function(err) {
                defered.resolve();
            });
        return defered.promise;
    }

    this.collectDataFromCuratedDevice = function(curatedDevice, infoToCache) {
        var promise = undefined;
        // If the device isn't already collecting data and that it hasn't 
        // already been collected.
        if((!self.collectingDeviceData) && (!self.collectedDeviceData)) {
            self.collectingDeviceData = true;
            self.cachedDeviceResults = {};
            
            promise = innerCollectDataFromCuratedDevice(
                curatedDevice,
                infoToCache
            );
        } else {
            // If we are already collecting data/it has already been collected 
            // than just return a promise that has been resolved.
            var defered = q.defer();
            defered.resolve();
            promise = defered.promise;
        }
        return promise;
    };

    var self = this;
}

function createDeviceManager() {
    
    this.log = function() {
        if(DEBUG_DEVICE_MANAGER) {
            console.log.apply(this, arguments);
        }
    }
    this.openDevices = [];

    // Call this function to add a single device handle that needs to become
    // a managed device.
    this.addDevice = function(deviceHandle, requiredInfo, openInfo) {
        var promise = undefined;

        // Check to see if the device handle already exists.
        var deviceExists = self.openDevices.some(function(openDevice) {
            if (openDevice.handle == deviceHandle) {
                return true;
            } else {
                return false;
            }
        });

        if(!deviceExists) {
            self.log('Adding a device handle');
            // Create a new managed device.
            var newDevice = new createManagedDevice(deviceHandle, openInfo);

            // Tell the device to collect information about itself.
            promise = newDevice.collectDeviceData(requiredInfo);

            // Save the created curated device object.
            self.openDevices.push(newDevice);
        } else {
            self.log('Not adding device', deviceHandle);
            // Return a resolved promise... aka do nothing...
            var defered = q.defer();
            defered.resolve();
            promise = defered.promise;
        }

        return promise;
    };

    // Call this function when adding multiple device handles.
    this.addDevices = function(deviceHandles, requiredInfo, openInfos) {
        var promises = [];
        deviceHandles.forEach(function(deviceHandle, i) {
            var openInfo = openInfos[i];
            promises.push(self.addDevice(deviceHandle, requiredInfo, openInfo));
        });
        return promises;
    };

    this.addCuratedDevice = function(curatedDevice) {
        var promise = undefined;

        var ljmDevice = curatedDevice.getDevice();
        var deviceHandle = ljmDevice.handle;

        // make the deviceTypeString a more accessable variable.
        var deviceTypeString = curatedDevice.savedAttributes.deviceTypeString;

        // Create a dummy openInfo object.
        var openInfo = {
            'deviceType': 'curatedDevice...',
            'connectionType': 'curatedDevice...',
            'identifier': 'curatedDevice...',
        };

        // Determine what information is required from the device.
        var requiredInfo = REQUIRED_INFO_BY_DEVICE[deviceTypeString];

        // Check to see if the device handle for the curatedDevice has already
        // been added as a managed device.
        var deviceExists = self.openDevices.some(function(openDevice) {
            if (openDevice.handle == deviceHandle) {
                return true;
            } else {
                return false;
            }
        });

        if(!deviceExists) {
            // Unlike the case of adding a device handle, we already have a
            // curated device...
            self.log('adding curated device');

            // Create a new managed device.
            var newDevice = new createManagedDevice(deviceHandle, openInfo);

            // Tell the managed device that it should collect data from a
            // currently connected, curated device.
            promise = newDevice.collectDataFromCuratedDevice(
                curatedDevice,
                requiredInfo
            );

            // Save the created curated device object.
            self.openDevices.push(newDevice);
        } else {
            // Return a resolved promise... aka do nothing...
            self.log('Not adding curated device', deviceHandle);

            var defered = q.defer();
            defered.resolve();
            promise = defered.promise;
        }

        return promise;
    };

    this.addCuratedDevices = function(curatedDevices) {
        return curatedDevices.map(self.addCuratedDevice);
    };

    // Call this function to mark the active devices.
    this.markActiveDevices = function(deviceHandles) {

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

    function createScannedDeviceManager() {
        var defered = q.defer();
        self.deviceManager = new createDeviceManager();
        defered.resolve();
        return defered.promise;
    }

    /*
     * The function "markAndAddActiveDevices" does...
    */
    function markAndAddActiveDevices() {
        var defered = q.defer();
        var promises = self.deviceManager.addCuratedDevices(
            self.cachedCurrentDevices
        );
        
        // Wait for all of the curated devices to get added.
        q.allSettled(promises)
        .then(function() {
            defered.resolve();
        }, function() {
            defered.resolve();
        });

        return defered.promise;
    }

    /*
     * The function performOpenAllScanIteration does...
     */
    function performOpenAllScanIteration(scanMethod, cb) {
        var dt = scanMethod.deviceType;
        var ct = scanMethod.connectionType;
        var requiredInfo = scanMethod.addresses;

        function onErr(err) {
            cb();
        }
        function onSuccess(openedHandles) {
            /* openedHandles is an array of objects aka [ {handle: 0}, {handle: 1}, ... ] */
            if(DEBUG_OPEN_ALL_SCAN) {
                console.log('Called OpenAll, in onSuccess, data:', dt, ct, openedHandles);
            }

            // Build an array of promises indicating when all opened devices are finished being opened.
            var promises = openedHandles.map(function(openedHandle) {
                var openInfo = {
                    'deviceType': dt,
                    'connectionType': ct,
                    'identifier': 'LJM_idANY',
                };
                if(DEBUG_OPEN_ALL_SCAN) {
                    console.log('Managing device...', openedHandle.handle);
                }
                return self.deviceManager.addDevice(openedHandle.handle, requiredInfo, openInfo);
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

        // Execute the LJM openAll function.
        self.driver.openAll(dt, ct, onErr, onSuccess);
    }

    /*
     * The function performOpenAllScanMethod does...
     */
    function performOpenAllScanMethod(scanMethod, cb) {
        var scanIterations = [];
        var numAttempts = scanMethod.numAttempts;
        for(var i = 0; i < numAttempts; i++) {
            scanIterations.push(scanMethod);
        }

        var performAsync = scanMethod.async;

        function finishedScanning() {
            if(DEBUG_OPEN_ALL_SCAN) {
                console.log('Finished performing scanMethod...');
                // We are finished scanning...
                console.log(
                    'Finished performing openAll scans, sm:',
                    scanMethod.deviceType,
                    scanMethod.connectionType
                );
            }
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

        // Save the scan request list to a local variable w/ a shorter name.
        var scanMethods = OPEN_ALL_SCAN_REQUEST_LIST;

        // Save async vs sync option to a local variable w/ a shorter name.
        var performAsync = PERFORM_SCAN_REQUESTS_ASYNCHRONOUSLY;

        var startTime = new Date();
        function finishedScanning() {
            var stopTime = new Date();
            var duration = stopTime - startTime;
            duration = parseFloat((duration/1000).toFixed(3));

            // We are finished scanning...
            if(DEBUG_OPEN_ALL_SCAN) {
                console.log(
                    'Finished performing all openAll scans. Duration:',
                    duration
                );
            }
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
        // We need to make sure that we have collected the required information
        // from devices that are currently open by the user.

        // Meh... this function is sorta useless... At this point this function
        // is implemented when a device becomes a "managed device".
        
        var defered = q.defer();
        // console.log('Delaying for device reads...');
        // setTimeout(function() {
        //     console.log('Done waiting for device reads...');
        //     defered.resolve();
        // }, 2000);
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
            // Create the device manager object.
            createScannedDeviceManager()

            // Mark the devices that are currently open and should not be closed.
            .then(markAndAddActiveDevices, getOnError('createDeviceManager'))

            // Incrementally open as many devices as possible via USB and UDP connections.
            .then(openAllAvailableDevices, getOnError('markAndAddActiveDevices'))

            // Collect the required information about each opened device.
            .then(collectRequiredDeviceInfo, getOnError('openAllAvailableDevices'))

            // Close the devices that aren't currently open.
            .then(closeInactiveDevices, getOnError('collectRequiredDeviceInfo'))

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
