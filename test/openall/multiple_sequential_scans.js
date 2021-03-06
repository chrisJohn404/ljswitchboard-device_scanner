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

var device_curator = require('ljswitchboard-ljm_device_curator');

var devices = [];

exports.tests = {
	'Starting Basic Test': function(test) {
		console.log('');
		console.log('*** Starting Multiple Sequential Scans (OpenAll) Test ***');

		deviceScanner = device_scanner.getDeviceScanner('open_all');

		test.done();
	},
	// 'open device': function(test) {
	// 	var device = new device_curator.device();
	// 	devices.push(device);
	// 	device.open('LJM_dtT7', 'LJM_ctEthernet', 'LJM_idANY')
	// 	.then(function() {
	// 		test.done();
	// 	}, function() {
	// 		devices[0].destroy();
	// 		devices = [];
	// 		test.done();
	// 	});
	// },
	'enable device scanning': function(test) {
		deviceScanner.enableDeviceScanning()
		.then(function() {
			test.done();
		});
	},
	'first scan': function(test) {
		console.log('Starting first scan');
		var currentDeviceList = [];
		var startTime = new Date();
		deviceScanner.findAllDevices(devices)
		.then(function(deviceTypes) {
			printScanResultsData(deviceTypes);
			verifyScanResults(deviceTypes, test, {debug: false});
			var endTime = new Date();
			// var testStatus = testScanResults(deviceTypes, expDeviceTypes, test, {'test': false, 'debug': false});
			// test.ok(testStatus, 'Unexpected test result');
			console.log('  - Duration'.cyan, (endTime - startTime)/1000);
			test.done();
		}, function(err) {
			console.log('Scanning Error');
			test.done();
		});
	},
	'second scan': function(test) {
		console.log('Starting second scan');
		var currentDeviceList = [];
		var startTime = new Date();
		deviceScanner.findAllDevices(devices)
		.then(function(deviceTypes) {
			printScanResultsData(deviceTypes);
			verifyScanResults(deviceTypes, test, {debug: false});
			var endTime = new Date();
			// var testStatus = testScanResults(deviceTypes, expDeviceTypes, test, {'test': false, 'debug': false});
			// test.ok(testStatus, 'Unexpected test result');
			console.log('  - Duration'.cyan, (endTime - startTime)/1000);
			test.done();
		}, function(err) {
			console.log('Scanning Error');
			test.done();
		});
	},
	'third scan': function(test) {
		console.log('Starting third scan');
		var currentDeviceList = [];
		var startTime = new Date();
		deviceScanner.findAllDevices(devices)
		.then(function(deviceTypes) {
			printScanResultsData(deviceTypes);
			verifyScanResults(deviceTypes, test, {debug: false});
			var endTime = new Date();
			// var testStatus = testScanResults(deviceTypes, expDeviceTypes, test, {'test': false, 'debug': false});
			// test.ok(testStatus, 'Unexpected test result');
			console.log('  - Duration'.cyan, (endTime - startTime)/1000);
			test.done();
		}, function(err) {
			console.log('Scanning Error');
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
	// 			console.log('Failed to read SN:', err, devices[0].savedAttributes.serialNumber);
	// 			test.ok(false, 'Failed to read SN: ' + JSON.stringify(err));
	// 			test.done();
	// 		});
	// 	} else {
	// 		test.done();
	// 	}
	// },
	// 'close device': function(test) {
	// 	if(devices[0]) {
	// 		devices[0].close()
	// 		.then(function() {
	// 			test.done();
	// 		}, function() {
	// 			test.done();
	// 		});
	// 	} else {
	// 		test.done();
	// 	}
	// },
	'unload': function(test) {
		device_scanner.unload();
		test.done();
	},
};