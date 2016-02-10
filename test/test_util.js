var printAvailableDeviceData = function(device) {
	if(device.connectionTypes) {
		console.log(
			'Connection Types',
			device.connectionTypes.length,
			device.deviceType,
			device.productType
		);
		device.connectionTypes.forEach(function(connectionType, i) {
			console.log(
				'  - ',
				connectionType.name,
				connectionType.insertionMethod,
				connectionType.verified,
				connectionType.isActive
			);
			// console.log('    - ', expectedConnectionType);
		});
	}
	console.log('Available Data:');
	var ignoredData = [
		'connectionTypes',
		'connectionType',
	];
	var availableKeys = Object.keys(device);
	availableKeys.forEach(function(key) {
		if(ignoredData.indexOf(key) < 0) {
			if(typeof(device[key].res) !== 'undefined') {
				console.log('  - ', key, '>>', device[key].val);
			} else {
				console.log('  - ', key, '>>', device[key]);
			}
		} else {
			console.log('  - ', key, '...');
		}
	});
};
exports.printAvailableDeviceData = printAvailableDeviceData;

var suppressTestingErrors = false;
var innerTestScanResults = function(deviceTypes, expDeviceTypes, test, options) {
	var debug;
	var performTests = true;
	if(options) {
		if(typeof(options.test) !== 'undefined') {
			performTests = options.test;
		}
		if(typeof(options.debug) !== 'undefined') {
			debug = options.debug;
		}
	}
	if(debug) {
		console.log('Finished Scanning');
		console.log('Number of Device Types', deviceTypes.length);
	}
	
	// Test to make sure the proper number of device types were found.
	var numDeviceTypes = deviceTypes.length;
	var numExpDeviceTypes = Object.keys(expDeviceTypes).length;
	if(performTests) {
		test.strictEqual(
			numDeviceTypes,
			numExpDeviceTypes,
			'Unexpected number of device types found'
		);
	} else {
		if(numDeviceTypes != numExpDeviceTypes) {
			suppressTestingErrors = true;
			console.log('Warning, unexpected number of device types');
			console.log('    Expected number:', numExpDeviceTypes);
			console.log('    Actual Number:', numDeviceTypes);
		}
	}

	// For each found device type, verify their results.
	deviceTypes.forEach(function(deviceType) {
		// Organize result data.
		var devices = deviceType.devices;
		var numDevices = devices.length;
		var deviceTypeName = deviceType.deviceTypeName;

		// Get expected data.
		var expDevices = expDeviceTypes[deviceTypeName].devices;
		var expNumDevices = expDevices.length;

		if(debug) {
			console.log(
				'Number of',
				deviceTypeName,
				'Devices:',
				numDevices
			);
		}
		// Test to make sure the proper number of devices were found per device
		// type.
		if(performTests) {
			test.strictEqual(
				numDevices,
				expNumDevices,
				'Unexpected number of found devices'
			);
		} else {
			if(numDevices != expNumDevices) {
				suppressTestingErrors = true;
				console.log('Warning, unexpected number of devices:');
				console.log('    Expected number:', expNumDevices);
				console.log('    Actual Number:', numDevices);
				console.log('List of Found Devices:');
				devices.forEach(function(device) {
					console.log('  Device Type', device.deviceTypeName, device.serialNumber);
					device.connectionTypes.forEach(function(connectionType) {
						console.log(
							'    Connection Type Name',
							connectionType.name,
							'method:',
							connectionType.insertionMethod
						);
					});
				});
			}
		}

		// For each found device check their expected results & connection types
		devices.forEach(function(device, i) {
			var expDevice = expDevices[i];
			var verifyConnectionTypeInfo = function(connectionType, expConnectionType) {
				var expectedKeys = Object.keys(expConnectionType);
				// Check each expected key.
				expectedKeys.forEach(function(key) {
					if(performTests) {
						test.strictEqual(
							connectionType[key],
							expConnectionType[key],
							'Unexpected connectionType Data'
						);
					}
				});
			};
			// Organize device results.
			var connectionTypes = device.connectionTypes;
			var numConnectionTypes = connectionTypes.length;

			// Get and organize expected device results.
			var expConnectionTypes = expDevice.connectionTypes;
			var expNumConnectionTypes = expConnectionTypes.length;

			if(device.isActive) {
				if(debug) {
					console.log(
						'Found Active Device',
						device.productType,
						device.serialNumber,
						numConnectionTypes
					);
				}
			}
			// Test to make sure the proper number of connection types were
			// found.
			if(performTests) {
				test.strictEqual(
					numConnectionTypes,
					expNumConnectionTypes,
					'Unexpected number of connection types'
				);
			}
			
			if(performTests) {
				if (expConnectionTypes.length == connectionTypes.length) {
					// For each connection type verify expected results.
					connectionTypes.forEach(function(connectionType, j) {
						// Organize device connection type results.
						// Get and organize expected connection type results.
						var expConnectionType = expConnectionTypes[j];
						verifyConnectionTypeInfo(connectionType, expConnectionType);
					});
				}
				else {
					console.log('For Device...', device.deviceTypeName, device.serialNumber);
					console.log(
						'Unexpected number of connection types, expected: ',
						expConnectionTypes.length,
						', got: ', connectionTypes.length
					);
					test.ok(false, 'unexpected number of connection types, see console.log');
				}
			}
			if(debug) {
				printAvailableDeviceData(device);
			}
			
		});
	});
};
var testScanResults = function(deviceTypes, expDeviceTypes, test, debug) {
	try {
		suppressTestingErrors = false;
		innerTestScanResults(deviceTypes, expDeviceTypes, test, debug);
		return true;
	} catch(err) {
		if(suppressTestingErrors) {
			console.log('Error being suppressed');
			return true;
		} else {
			console.log('Error testing results', err, err.stack);
			return false;
		}
	}
};
exports.testScanResults = testScanResults;