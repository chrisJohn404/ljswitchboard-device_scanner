// Legacy test for the old ListAll scan method. Expects to open real devices.

var deviceScanner;

var test_util = require('./test_util');
var printAvailableDeviceData = test_util.printAvailableDeviceData;
var testScanResults = test_util.testScanResults;

var expDeviceTypes = require('./expected_devices').expectedDevices;

exports.tests = {
	'Starting Basic Test': function(test) {
		console.log('');
		console.log('*** Starting Basic (ListAll) Test ***');

		deviceScanner = require(
			'../lib/ljswitchboard-device_scanner'
		).getDeviceScanner('device_scanner');

		test.done();
	},
	'basic test': function(test) {
		var currentDeviceList = {};
		var startTime = new Date();
		deviceScanner.findAllDevices(currentDeviceList)
		.then(function(deviceTypes) {
			var endTime = new Date();
			console.log('Results', currentDeviceList);
			var testStatus = testScanResults(deviceTypes, expDeviceTypes, test, {'test': false, 'debug': true});
			test.ok(testStatus, 'Unexpected test result');
			console.log('Duration', (endTime - startTime)/1000);
			test.done();
		}, function(err) {
			console.log('Scanning Error');
			test.done();
		});
	}
};