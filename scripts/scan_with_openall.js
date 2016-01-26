var ljm_ffi = require('ljm-ffi');
var ljm = ljm_ffi.load();
process.on('uncaughtException', (err) => {
  console.log(`Caught exception: ${err}`);
  console.log('Stack', err.stack);
  ljm.LJM_CloseAll();
  process.exit();
});
process.on('unhandledRejection', (reason, p) => {
    console.log("Unhandled Rejection at: Promise ", p, " reason: ", reason);
    // application specific logging, throwing an error, or other logic here
});
/*
 * This is a script that performs a scan for devices so that you can see what LabJack devices
 * are currently available.
*/
var deviceScanner = require('../lib/ljswitchboard-device_scanner')
	.getDeviceScanner('open_all_device_scanner');


var foundDevices = {};

// This is an array of curated devices produced by the ljswitchboard-ljm_device_curator module.
var connectedDevices = [];

// Perform Scan
console.log('Performing Scan with OpenAll');
deviceScanner.findAllDevices(connectedDevices)
.then(function(deviceTypes) {
	ljm.LJM_CloseAll();
	console.log('Scan Results');
	console.log(JSON.stringify(deviceTypes, null, 2));

}, function(err) {
	console.log('Scanning Error', err);
});