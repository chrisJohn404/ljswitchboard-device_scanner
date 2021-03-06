// Legacy test for the old ListAll scan method. Expects to open real devices.

var deviceScanner;
var device_scanner = require('../../lib/ljswitchboard-device_scanner');
var test_util = require('../utils/test_util');
var printAvailableDeviceData = test_util.printAvailableDeviceData;
var printScanResultsData = test_util.printScanResultsData;
var printScanResultsKeys = test_util.printScanResultsKeys;
var verifyScanResults = test_util.verifyScanResults;
var testScanResults = test_util.testScanResults;

var expDeviceTypes = require('../utils/expected_devices').expectedDevices;
var reqDeviceTypes = require('../utils/required_devices').requiredDeviceTypes;

var device_curator = require('ljswitchboard-ljm_device_curator');

function getLogger(bool) {
    return function logger() {
        if(bool) {
            console.log.apply(console, arguments);
        }
    };
}

var DEBUG_SCAN_DATA = false;
var DEBUG_SCAN_TIME = false;
var debugScanData = getLogger(DEBUG_SCAN_DATA);
var debugScanTime = getLogger(DEBUG_SCAN_TIME);

var devices = [];
var expectedDeviceTypes = undefined;

exports.tests = {
	'Starting Basic Test': function(test) {
		console.log('');
		console.log('*** Starting Basic (OpenAll) Test ***');

		deviceScanner = device_scanner.getDeviceScanner('open_all');

		test.done();
	},
	'enable device scanning': function(test) {

		deviceScanner.enableDeviceScanning()
		.then(function() {
			test.done();
		});
	},
	'clear cached scan results': function(test) {
		deviceScanner.clearCachedScanResults()
		.then(function() {
			test.done();
		});
	},
	'perform initial cached read': function(test) {
		var startTime = new Date();
		console.log('  - Performing initial cached scan...');
		deviceScanner.getLastFoundDevices(devices)
		.then(function(deviceTypes) {
			// Due to this being called before a scan is performed, it should
			// return no devices.
			debugScanData('Finished initial cached scan', deviceTypes);
			printScanResultsData(deviceTypes);

			var endTime = new Date();
			debugScanTime('  - Duration'.cyan, (endTime - startTime)/1000);

			// Cerify that no devices were found.
			test.deepEqual(deviceTypes, [], 'Initial Cached Device Types should be an empty array');

			test.done();
		}, function(err) {
			console.log('Scanning Error');
			test.ok(false, 'Scan should have worked properly');
			test.done();
		});
	},
	/*
	 * This test determines what devices are currently available for other tests to compare results with.
	 */
	'perform initial scan': function(test) {
		var currentDeviceList = [];
		var startTime = new Date();
		console.log('  - Performing Initial scan...');
		deviceScanner.findAllDevices(devices)
		.then(function(deviceTypes) {
			expectedDeviceTypes = deviceTypes;
			debugScanData('Finished initial scan, scan data', deviceTypes);
			printScanResultsData(deviceTypes);

			verifyScanResults(deviceTypes, test, {debug: false});
			var endTime = new Date();
			// var testStatus = testScanResults(deviceTypes, expDeviceTypes, test, {'test': false, 'debug': false});
			// test.ok(testStatus, 'Unexpected test result');

			// var testStatus = testRequiredDevices(deviceTypes, reqDeviceTypes, test);
			// test.ok(testStatus, 'Unexpected test result');

			console.log('  - Duration'.cyan, (endTime - startTime)/1000);
			test.done();
		}, function(err) {
			console.log('Scanning Error');
			test.ok(false, 'Scan should have worked properly');
			test.done();
		});
	},
	/*
	 * Now we need to open a device.  This device will need to be properly detected as
	 * a "connected" device by the cached scan in the next test.
	 */
	'open device': function(test) {
		var device = new device_curator.device();
		devices.push(device);
		console.log('  - Opening Device...');
		console.log('**** Please connect a T7 via USB ****');
		device.open('LJM_dtT7', 'LJM_ctUSB', 'LJM_idANY')
		.then(function() {
			console.log('Opened Device', device.savedAttributes.serialNumber);
			test.done();
		}, function() {
			console.log('**** Please connect a T7 via USB ****');
			devices[0].destroy();
			devices = [];
			test.ok(false, 'Please connect a T7 via USB');
			test.done();
		});
	},
	'perform cached scan': function(test) {
		var device = devices[0];
		var startTime = new Date();
		console.log('  - Performing secondary cached scan...');
		deviceScanner.getLastFoundDevices(devices)
		.then(function(deviceTypes) {
			console.log('In cached scan');
			// Due to this being called before a scan is performed, it should
			// return no devices.
			debugScanData('Finished initial cached scan', deviceTypes);
			printScanResultsData(deviceTypes);

			var endTime = new Date();
			debugScanTime('  - Duration'.cyan, (endTime - startTime)/1000);


			function checkConnectionType(foundDevCT) {
				// console.log('FoundDevCT', foundDevCT);
				var ctn = device.savedAttributes.connectionTypeName;
				var fCTN = foundDevCT.connectionTypeName;

				
				if(ctn === fCTN){
					foundDeviceConnectionType = true;
					if(foundDevCT.insertionMethod === 'connected') {
						correctlyReportedDeviceAsOpen = true;
					}
				} 
			}
			function checkFoundDevice(foundDevice) {
				// console.log('in checkFoundDevice', foundDevice.serialNumber, device.savedAttributes.serialNumber);
				if(foundDevice.serialNumber == device.savedAttributes.serialNumber) {
					// We found the correct device.
					foundOpenDevice = true;
					foundDevice.connectionTypes.forEach(checkConnectionType);
				}
			}
			function checkForDeviceType(deviceType) {
				// console.log('in checkForDeviceType');
				var dtn = device.savedAttributes.deviceTypeName;
				// console.log('dtn', dtn, 'd.dtn', deviceType.deviceTypeName);
				if(deviceType.deviceTypeName === dtn) {
					// We found the device type
					appropriateDeviceTypeFound = true;
					deviceType.devices.forEach(checkFoundDevice);
				}
			}

			// Verify that we found the currently open device.
			var appropriateDeviceTypeFound = false;
			var foundOpenDevice = false;
			var foundDeviceConnectionType = false;
			var correctlyReportedDeviceAsOpen = false;


			deviceTypes.forEach(checkForDeviceType);

			test.ok(appropriateDeviceTypeFound, 'appropriateDeviceTypeFound was not true.'),
			test.ok(foundOpenDevice, 'foundOpenDevice was not true.'),
			test.ok(foundDeviceConnectionType, 'foundDeviceConnectionType was not true.'),
			test.ok(correctlyReportedDeviceAsOpen, 'correctlyReportedDeviceAsOpen was not true.'),
			test.done();
		}, function(err) {
			console.log('Scanning Error');
			test.ok(false, 'Scan should have worked properly');
			test.done();
		});
	},

	// 'perform secondary cached read': function(test) {
	// 	var startTime = new Date();
	// 	deviceScanner.getLastFoundDevices(devices)
	// 	.then(function(deviceTypes) {
	// 		console.log('Finished cached scan', deviceTypes);
	// 		printScanResultsData(deviceTypes);

	// 		var endTime = new Date();
	// 		console.log('  - Duration'.cyan, (endTime - startTime)/1000);

	// 		test.done();
	// 	}, function(err) {
	// 		console.log('Scanning Error');
	// 		test.ok(false, 'Scan should have worked properly');
	// 		test.done();
	// 	});
	// },
	'perform secondary scan': function(test) {
		// var currentDeviceList = [];
		// var startTime = new Date();
		// deviceScanner.findAllDevices(devices)
		// .then(function(deviceTypes) {
		// 	console.log('finished scanning, scan data', deviceTypes);
		// 	printScanResultsData(deviceTypes);
		// 	console.log('Finished printing scan results');
		// 	verifyScanResults(deviceTypes, test, {debug: false});
		// 	var endTime = new Date();
		// 	// var testStatus = testScanResults(deviceTypes, expDeviceTypes, test, {'test': false, 'debug': false});
		// 	// test.ok(testStatus, 'Unexpected test result');
		// 	console.log('  - Duration'.cyan, (endTime - startTime)/1000);
		// 	test.done();
		// }, function(err) {
		// 	console.log('Scanning Error');
		// 	test.ok(false, 'Scan should have worked properly');
		// 	test.done();
		// });


		var device = devices[0];
		var startTime = new Date();
		console.log('  - Performing secondary scan...');
		deviceScanner.findAllDevices(devices)
		.then(function(deviceTypes) {
			console.log('In secondary scan');
			// Due to this being called before a scan is performed, it should
			// return no devices.
			debugScanData('Finished initial cached scan', deviceTypes);
			printScanResultsData(deviceTypes);

			var endTime = new Date();
			debugScanTime('  - Duration'.cyan, (endTime - startTime)/1000);


			function checkConnectionType(foundDevCT) {
				// console.log('FoundDevCT', foundDevCT);
				var ctn = device.savedAttributes.connectionTypeName;
				var fCTN = foundDevCT.connectionTypeName;

				
				if(ctn === fCTN){
					foundDeviceConnectionType = true;
					if(foundDevCT.insertionMethod === 'connected') {
						correctlyReportedDeviceAsOpen = true;
					}
				} 
			}
			function checkFoundDevice(foundDevice) {
				// console.log('in checkFoundDevice', foundDevice.serialNumber, device.savedAttributes.serialNumber);
				if(foundDevice.serialNumber == device.savedAttributes.serialNumber) {
					// We found the correct device.
					foundOpenDevice = true;
					foundDevice.connectionTypes.forEach(checkConnectionType);
				}
			}
			function checkForDeviceType(deviceType) {
				// console.log('in checkForDeviceType');
				var dtn = device.savedAttributes.deviceTypeName;
				// console.log('dtn', dtn, 'd.dtn', deviceType.deviceTypeName);
				if(deviceType.deviceTypeName === dtn) {
					// We found the device type
					appropriateDeviceTypeFound = true;
					deviceType.devices.forEach(checkFoundDevice);
				}
			}

			// Verify that we found the currently open device.
			var appropriateDeviceTypeFound = false;
			var foundOpenDevice = false;
			var foundDeviceConnectionType = false;
			var correctlyReportedDeviceAsOpen = false;


			deviceTypes.forEach(checkForDeviceType);

			test.ok(appropriateDeviceTypeFound, 'appropriateDeviceTypeFound was not true.'),
			test.ok(foundOpenDevice, 'foundOpenDevice was not true.'),
			test.ok(foundDeviceConnectionType, 'foundDeviceConnectionType was not true.'),
			test.ok(correctlyReportedDeviceAsOpen, 'correctlyReportedDeviceAsOpen was not true.'),
			test.done();
		}, function(err) {
			console.log('Scanning Error');
			test.ok(false, 'Scan should have worked properly');
			test.done();
		});
	},
	// 'read device SERIAL_NUMBER': function(test) {
	// 	if(devices[0]) {
	// 		devices[0].iRead('SERIAL_NUMBER')
	// 		.then(function(res) {
	// 			console.log('  - SN Res:'.green, res.val);
	// 			test.done();
	// 		}, function(err) {
	// 			console.log('Failed to read SN:', err, devices[0].savedAttributes);
	// 			test.ok(false, 'Failed to read SN: ' + JSON.stringify(err));
	// 			test.done();
	// 		});
	// 	} else {
	// 		test.done();
	// 	}
	// },
	'close device': function(test) {
		if(devices[0]) {
			devices[0].close()
			.then(function() {
				test.done();
			}, function() {
				test.done();
			});
		} else {
			test.done();
		}
	},
	'unload': function(test) {
		device_scanner.unload();
		test.done();
	},
};