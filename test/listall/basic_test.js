// Legacy test for the old ListAll scan method. Expects to open real devices.

var deviceScanner;

var test_util = require('../utils/test_util');
var printAvailableDeviceData = test_util.printAvailableDeviceData;
var printScanResultsData = test_util.printScanResultsData;
var testScanResults = test_util.testScanResults;
var device_curator = require('ljswitchboard-ljm_device_curator');
var device_scanner = require('../../lib/ljswitchboard-device_scanner');
var expDeviceTypes = require('../utils/expected_devices').expectedDevices;
var devices = [];
var device;
exports.tests = {
	'Starting Basic Test': function(test) {
		console.log('');
		console.log('*** Starting Basic (ListAll) Test ***');

		deviceScanner = device_scanner.getDeviceScanner('device_scanner');

		test.done();
	},
	'open device': function(test) {
		device = new device_curator.device();
		devices.push(device);
		device.open('LJM_dtT7', 'LJM_ctUSB', 'LJM_idANY')
		.then(function() {
			console.log('Opened Device');
			test.done();
		}, function(err) {
			console.log('Failed....', err)
			devices[0].destroy();
			devices = [];
			test.done();
		});
	},
	'enable device scanning': function(test) {
		deviceScanner.enableDeviceScanning()
		.then(function() {
			test.done();
		});
	},
	'basic test': function(test) {
		var startTime = new Date();
		console.log('Starting Scan');
		deviceScanner.findAllDevices(devices)
		.then(function(deviceTypes) {
			// printAvailableDeviceData(deviceTypes);
			printScanResultsData(deviceTypes);
			var endTime = new Date();
			var testStatus = testScanResults(deviceTypes, expDeviceTypes, test, {'test': false, 'debug': false});
			test.ok(testStatus, 'Unexpected test result');
			console.log('  - Duration'.cyan, (endTime - startTime)/1000);
			test.done();
		}, function(err) {
			console.log('Scanning Error');
			test.done();
		});
	},
	'read device SN': function(test) {
		if(device) {
			device.iRead('SERIAL_NUMBER')
			.then(function(res) {
				console.log('  - SN Res:'.green, res.val);
				test.done();
			}, function(err) {
				console.log('Failed to read SN:', err, device.savedAttributes);
				console.log('Connect a T7 via USB!!!!!!!!!');
				test.ok(false, 'Failed to read SN: ' + JSON.stringify(err));
				test.done();
			});
		} else {
			test.done();
		}
	},
	'close device': function(test) {
		if(device) {
			console.log('Closing Device');
			device.close()
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