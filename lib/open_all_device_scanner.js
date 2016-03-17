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

var REQUIRED_INFO_BY_DEVICE = require('./required_device_info').requiredInfo;
var ds_util = require('../lib/device_scanner_util');

// A variable that will store a reference to the ljm driver
var ljm;
var ljmUtils;

// A variable that will store a reference to the labjack-nodejs driver
var ljmDriver;

var DEBUG_COLLECTED_DEVICE_DATA = true;
var DEBUG_MANAGED_DEVICE = true;
var DEBUG_DEVICE_MANAGER = false;
var DEBUG_OPEN_ALL_SCAN = true;

var DEBUG_CONNECTION_TYPE_SORTING = false;
var DEBUG_DEVICE_SCAN_RESULT_SAVING = false;

var DEVICE_DATA_COLLECTION_TIMEOUT = 30000;

var reportAsyncError = function(err) {
    console.log('open_all_device_scanner.js reportAsyncError', err, err.stack);
};

/* Define what the open all device scanner is trying to do */
var PERFORM_SCAN_REQUESTS_ASYNCHRONOUSLY = true;
var OPEN_ALL_SCAN_REQUEST_LIST = [
    // {
    //     'deviceType': driver_const.LJM_DT_DIGIT,
    //     'connectionType': driver_const.LJM_CT_USB,
    //     'addresses': REQUIRED_INFO_BY_DEVICE.LJM_dtDIGIT,
    //     'numAttempts': 1,
    //     'async': false,
    // },
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
        'numAttempts': 2,
        'async': false,
    },
];

var curatedDeviceEvents = [
    'DEVICE_DISCONNECTED',
    'DEVICE_RECONNECTED',
    'DEVICE_ERROR',
    'DEVICE_RECONNECTING',
    'DEVICE_ATTRIBUTES_CHANGED',
];
var deviceDataParsers = {
    'HARDWARE_INSTALLED': {
        'val': function(data) {
            return {
                'highResADC': data.highResADC,
                'wifi': data.wifi,
                'rtc': data.rtc,
                'sdCard': data.sdCard,
                'productType': data.productType,
            };
        }
    },
    'DEVICE_NAME_DEFAULT': {
        'name': 'deviceName',
    },
    'ETHERNET_IP': {
        'name': 'ethernetIP',
    },
    'WIFI_IP': {
        'name': 'wifiIP',
    },
    'WIFI_RSSI': {
        'name': 'wifiRSSI',
        'val': function(data) {
            return {
                str: data.str,
                val: data.val,
                imageName: data.imageName,
            };
        }
    }
};

function parseDeviceInfo(info, registers) {
    registers.forEach(function(register) {
        var regName = register.split('_').map(function(str) {
            str = str.toLowerCase();
            str = str.charAt(0).toUpperCase() + str.slice(1);
            return str;
        }).join('');
        regName = regName.charAt(0).toLowerCase() + regName.slice(1);

        var dp;
        if(deviceDataParsers[register]) {
            dp = deviceDataParsers[register];
            if(dp.name) {
                regName = dp.name;
            }
        }
        // console.log('Register Name', register, regName);
        var rawVal = info[register];
        var val = rawVal.val;
        var isError = typeof(rawVal.errorCode) !== 'undefined';
        if(!isError) {
            if(deviceDataParsers[register]) {
                dp = deviceDataParsers[register];
                if(dp.val) {
                    val = dp.val(rawVal);
                }
            }
        }
        info[regName] = val;
        // console.log(regName, val);
    });
}

function createManagedDevice(openedDevice, openParameters, curatedDevice) {
    this.log = function() {
        if(DEBUG_MANAGED_DEVICE) {
            console.log.apply(this, arguments);
        }
    };

    this.openedDevice = openedDevice;
    var deviceHandle = openedDevice.handle;
    // Save initialization data to this context.
    this.handle = deviceHandle;
    this.openParameters = openParameters;
    if(curatedDevice) {
        this.openParameters = curatedDevice.savedAttributes.openParameters;
    }
    this.curatedDevice = curatedDevice;


    var dt = driver_const.deviceTypes[this.openParameters.deviceType];
    var dcNames = driver_const.DRIVER_DEVICE_TYPE_NAMES;
    var ljmDTName = dcNames[dt];
    this.requiredInfo = REQUIRED_INFO_BY_DEVICE[ljmDTName];
    this.collectedDeviceData = {};

    function getDeviceInfo() {
        var defered = q.defer();
        ljmUtils.getDeviceInfo(
            self.handle,
            self.requiredInfo,
            function(data) {
                parseDeviceInfo(data, self.requiredInfo);
                self.collectedDeviceData = data;
                defered.resolve();
            });
        return defered.promise;
    }

    function collectDataFromDeviceHandle() {
        self.log('in collectDeviceData', self.handle);
        return getDeviceInfo();
        // var promise;
        // var defered = q.defer();
        // defered.resolve();
        // promise = defered.promise;
        // return promise;
    }
    function collectDataFromCuratedDevice() {
        self.log('in collectDataFromCuratedDevice', self.handle);
        return getDeviceInfo();
        // var promise;
        // var defered = q.defer();
        // defered.resolve();
        // promise = defered.promise;
        // return promise;
    }

    this.collectDeviceData = function() {
        if(self.curatedDevice) {
            return collectDataFromCuratedDevice();
        } else {
            return collectDataFromDeviceHandle();
        }
    };
    this.closeDevice = function() {
        self.log('in closeDevice');
        var promise;
        var defered = q.defer();
        defered.resolve();
        promise = defered.promise;
        return promise;
    };
    var self = this;
}



function createDeviceManager() {
    
    this.log = function() {
        if(DEBUG_DEVICE_MANAGER) {
            console.log.apply(this, arguments);
        }
    };
    this.openDevices = [];

    // Call this function to add a single device handle that needs to become
    // a managed device.
    this.addDevice = function(openedDevice, requiredInfo, openInfo) {
        var promise = undefined;

        var deviceHandle = openedDevice.handle;

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
            var newDevice = new createManagedDevice(openedDevice, openInfo);

            // Tell the device to collect information about itself.
            // promise = newDevice.collectDeviceData(requiredInfo);

            var defered = q.defer();
            defered.resolve();
            promise = defered.promise;
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
            var newDevice = new createManagedDevice({
                    'handle': deviceHandle,
                },
                openInfo,
                curatedDevice
            );

            // Tell the managed device that it should collect data from a
            // currently connected, curated device.
            // promise = newDevice.collectDataFromCuratedDevice(
            //     curatedDevice,
            //     requiredInfo
            // );

            var defered = q.defer();
            defered.resolve();
            promise = defered.promise;

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

    // Call this function to close the devices that were opened by the device
    // scanner.
    this.closeDevicesOpenedByScanner = function() {
        var defered = q.defer();
        
        // Close all of the devices opened by the device scanner.
        var promises = self.openDevices.map(function(openDevice) {
            return openDevice.closeDevice();
        });

        // Wait for all of the devices to be closed.
        q.allSettled(promises)
        .then(function(results) {
            // Empty the array of open devices.
            self.openDevices = [];
            defered.resolve();
        }, function(err) {
            // Empty the array of open devices.
            self.openDevices = [];
            defered.resolve();
        });
        return defered.promise;
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

    function createScannedDeviceManager(bundle) {
        var defered = q.defer();
        self.deviceManager = new createDeviceManager();
        defered.resolve(bundle);
        return defered.promise;
    }

    /*
     * The function "markAndAddActiveDevices" does...
    */
    function markAndAddActiveDevices(bundle) {
        var defered = q.defer();
        var promises = self.deviceManager.addCuratedDevices(
            self.cachedCurrentDevices
        );
        
        // Wait for all of the curated devices to get added.
        q.allSettled(promises)
        .then(function() {
            defered.resolve(bundle);
        }, function() {
            defered.resolve(bundle);
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
        function onSuccess(openAllData) {
            var stopTime = new Date();
            var deltaTime = parseFloat(((stopTime - startTime)/1000).toFixed(2));
            console.log('Successfully called openAll',deltaTime);
            var openedHandles = openAllData.handles;

            var openedDevices = [];
            openedHandles.forEach(function(openedHandle) {
                openedDevices.push({
                    'handle': openedHandle,
                });
            });


            /* openedHandles is an array of objects aka [ {handle: 0}, {handle: 1}, ... ] */
            if(DEBUG_OPEN_ALL_SCAN) {
                console.log('OpenAll Finished, in onSuccess, data:', dt, ct, openAllData);
            }

            // Build an array of promises indicating when all opened devices are finished being opened.
            var promises = openedDevices.map(function(openedDevice) {
                var openInfo = {
                    'deviceType': dt,
                    'connectionType': ct,
                    'identifier': 'LJM_idANY',
                };
                if(DEBUG_OPEN_ALL_SCAN) {
                    console.log('Managing device...', openedDevice);
                }
                var promise = self.deviceManager.addDevice(
                    openedDevice,
                    requiredInfo,
                    openInfo
                );
                return promise;
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
        var startTime = new Date();
        console.log('Calling OpenAll', dt, ct);
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
    function openAllAvailableDevices(bundle) {
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
            defered.resolve(bundle);
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
    function collectRequiredDeviceInfo(bundle) {
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
        var openDevices = self.deviceManager.openDevices;
        var openDeviceAttributes = [];
        var scannedData = {};
        function getDeviceKey(deviceInfo) {
            var dt = deviceInfo.dt;
            var sn = deviceInfo.serialNumber;
            if(typeof(dt) === 'undefined') {
                console.log("ERR", deviceInfo);
            }
            return [dt.toString(), sn.toString()].join('_');
        }

        function createDeviceConnectionObj(ct, ip) {
            var obj = {
                'ct': ct,
                'connectionType': ct,
                'connectionTypeStr': driver_const.DRIVER_CONNECTION_TYPE_NAMES[ct],
                'connectionTypeName': driver_const.CONNECTION_TYPE_NAMES[ct],
                'isVerified': false,
                'isScanned': false,
            };
            if(ip) {
                obj.ip = ip;
                // Define the port as the modbus 502 port.
                obj.port = 502;
            }
            return obj;
        }
        function getDeviceConnectionTypesData(deviceInfo) {
            var connectionTypes = [];

            var foundUSB = false;
            var usbInfo = {};
            var foundEth = false;
            var ethInfo = {};
            var foundWiFi = false;
            var wifiInfo = {};

            var usbCT = driver_const.connectionTypes.usb;
            var ethCT = driver_const.connectionTypes.ethernet;
            var wifiCT = driver_const.connectionTypes.wifi;
            if(deviceInfo.ct === usbCT) {
                usbInfo = createDeviceConnectionObj(deviceInfo.ct);
                usbInfo.isVerified = true;
                usbInfo.isScanned = true;
                foundUSB = true;
            } else if(deviceInfo.ct === ethCT) {
                ethInfo = createDeviceConnectionObj(
                    deviceInfo.ct,
                    deviceInfo.ip
                );
                ethInfo.isVerified = true;
                ethInfo.isScanned = true;
                foundEth = true;
            } else if(deviceInfo.ct === wifiCT) {
                wifiInfo = createDeviceConnectionObj(
                    deviceInfo.ct,
                    deviceInfo.ip
                );
                wifiInfo.isVerified = true;
                wifiInfo.isScanned = true;
                foundWiFi = true;
            } else {
                console.error('openall_d_s, Encountered Invalid Connection Type', deviceInfo.ct);
            }

            if(!foundEth) {
                if(deviceInfo.ETHERNET_IP.isReal) {
                    ethInfo = createDeviceConnectionObj(
                        ethCT,
                        deviceInfo.ethernetIP
                    );
                    foundEth = true;
                }
            }
            if(!foundWiFi) {
                if(deviceInfo.WIFI_IP.isReal) {
                    wifiInfo = createDeviceConnectionObj(
                        wifiCT,
                        deviceInfo.wifiIP
                    );
                    foundWiFi = true;
                }
            }

            if(foundUSB) {connectionTypes.push(usbInfo);}
            if(foundEth) {connectionTypes.push(ethInfo);}
            if(foundWiFi) {connectionTypes.push(wifiInfo);}

            // console.log('device connection types', deviceInfo.ct, deviceInfo.WIFI_IP, deviceInfo.ETHERNET_IP);

            return connectionTypes;
        }
        function appendDeviceConnectionTypesData(origCTs, newCTs, di) {
            newCTs.forEach(function(newCT) {
                var isFound = origCTs.some(function(origCT) {
                    if(origCT.connectionType === newCT.connectionType) {
                        return true;
                    } else {
                        return false;
                    }
                });

                if(!isFound) {
                    console.log('New CT!', di.serialNumber, newCT.connectionTypeName);
                    origCTs.push(newCT);
                } else {
                    console.log('Dup CT!', di.serialNumber, newCT.connectionTypeName);
                }
            });
            return origCTs;
        }
        function saveDeviceInfo(deviceInfo) {
            console.log('in saveDeviceInfo');
            var key = getDeviceKey(deviceInfo);
            var connectionTypes = [];
            var newConnectionTypes = getDeviceConnectionTypesData(deviceInfo);

            if(scannedData[key]) {
                // The data has already been added.
                connectionTypes = scannedData[key].connectionTypes;
                    
            } else {
                scannedData[key] = {};
                // The data has not been added.
            }

            // console.log('Appending.... SN', deviceInfo.serialNumber);
            console.log('Initial CTS', connectionTypes.length, newConnectionTypes.length);
            connectionTypes = appendDeviceConnectionTypesData(
                connectionTypes,
                newConnectionTypes,
                deviceInfo
            );
            console.log('Appended CTS', connectionTypes.length);
            scannedData[key].numConnectionTypes = connectionTypes.length;
            scannedData[key].connectionTypeNames = connectionTypes.map(function(ct) {
                return ct.connectionTypeName;
            });
            scannedData[key].connectionTypes = connectionTypes;

            // scannedData[key] = deviceInfo;
        }

        var printedAttrs = false;
        // Iterate through all of the open devices.
        
        // console.log('In collectRequiredDeviceInfo', openDeviceAttributes);
        // defered.resolve(bundle);

        var promises = self.deviceManager.openDevices.map(function(openDevice) {
            return openDevice.collectDeviceData();
        });

        q.allSettled(promises)
        .then(function() {
            openDevices.forEach(function(openDevice) {
                var cd = openDevice.collectedDeviceData;
                try {
                    saveDeviceInfo(cd);
                } catch(err) {
                    console.log('ERR', err);
                }
                // console.log('collected data', Object.keys(cd));
            });
            console.log('Scanned Data', scannedData);
            defered.resolve(bundle);
        }, function(err) {
            defered.resolve(bundle);
        });
        return defered.promise;
    }

    function organizeCollectedDeviceData(bundle) {
        var defered = q.defer();
        var validSecondaryIPs = [];
        var openDevices = self.deviceManager.openDevices;
        defered.resolve(bundle);
        return defered.promise;
    }
    function generateListOfIPsToCheck(bundle) {
        var defered = q.defer();
        var validSecondaryIPs = [];
        var openDevices = self.deviceManager.openDevices;
        defered.resolve(bundle);
        return defered.promise;
    }

    /*
     * The function "closeInactiveDevices" does...
    */
    function closeInactiveDevices(bundle) {
        console.log('in closeInactiveDevices');
        var defered = q.defer();

        self.deviceManager.closeDevicesOpenedByScanner()
        .then(function() {
            defered.resolve(bundle);
        })
        .catch(function() {
            defered.resolve(bundle);
        });
        return defered.promise;
    }

    /*
     * The function "testInactiveDeviceConnections" does...
    */
    function testInactiveDeviceConnections(bundle) {
        console.log('in testInactiveDeviceConnections');
        var defered = q.defer();
        defered.resolve(bundle);
        return defered.promise;
    }

    /*
     * The function "returnResults" does...
    */
    function returnResults(bundle) {
        console.log('in returnResults');
        var defered = q.defer();
        defered.resolve(bundle);
        return defered.promise;
    }

    function createFindAllDevicesBundle() {
        return {
            'findAllBundle': 'me!!',
            'secondaryIPAddresses': [],
        };
    }
    this.originalOldfwState = 0;

    this.cachedCurrentDevices = [];
    this.findAllDevices = function(currentDevices) {
        console.log('Finding all devices...');
        var defered = q.defer();
        if (self.scanInProgress) {
            defered.reject('Scan in progress');
            return defered.promise;
        }

        self.scanInProgress = true;
        if(currentDevices) {
            if(Array.isArray(currentDevices)) {
                self.cachedCurrentDevices = currentDevices;
            } else {
                self.cachedCurrentDevices = [];
            }
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

        var bundle = createFindAllDevicesBundle();

        if(deviceScanningEnabled) {
            // Create the device manager object.
            createScannedDeviceManager(bundle)

            // Mark the devices that are currently open and should not be closed.
            .then(markAndAddActiveDevices, getOnError('createDeviceManager'))

            // Incrementally open as many devices as possible via USB and UDP connections.
            .then(openAllAvailableDevices, getOnError('markAndAddActiveDevices'))

            // Collect the required information about each opened device.
            .then(collectRequiredDeviceInfo, getOnError('openAllAvailableDevices'))

            // Generate a list of secondary IP addresses to try and connect to.
            .then(generateListOfIPsToCheck, getOnError('collectRequiredDeviceInfo'))

            // Close the devices that aren't currently open.
            .then(closeInactiveDevices, getOnError('generateListOfIPsToCheck'))

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
}
util.inherits(openAllDeviceScanner, EventEmitter);

exports.openAllDeviceScanner = openAllDeviceScanner;

var createDeviceScanner = function(driver) {
    var ds = new openAllDeviceScanner();
    ds.driver = driver;
    ds.hasOpenAll = driver.hasOpenAll;
    ljm = require('ljm-ffi').load();
    ljmUtils = require('./ljm_utils/ljm_utils');
    ljmDriver = driver;
    return ds;
};

exports.createDeviceScanner = createDeviceScanner;
