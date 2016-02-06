/**
 * Creates and manages device scanner object.
 */

var device_scanner;
var driver;

var getListAllScanner = function(scanner) {
    device_scanner = require('./device_scanner').createDeviceScanner(driver);
}
var getOpenAllScanner = function() {
    device_scanner = require('./open_all_device_scanner').createDeviceScanner(driver);
}

var POTENTIALLY_ENABLE_OPEN_ALL_SCANNER = false;
exports.getDeviceScanner = function(whichScanner) {
    if(device_scanner) {
        // Nothing; we already have the device_scanner
    } else {
        // Load the LJM driver functions
        driver = require('LabJack-nodejs').driver();
        
        // Determine which version of the device_scanner to return.
        if (whichScanner === 'device_scanner') {
            getListAllScanner();
        }
        else if (whichScanner === 'open_all_device_scanner') {
            getOpenAllScanner();
        }
        else if (!driver.hasOpenAll) {
            getListAllScanner();
        }
        else {
            // getOpenAllScanner();

            // Return the ListAll scanner by default... for now...
            getListAllScanner();
        }
    }

    // Return the device_scanner.
    return device_scanner;
};

exports.eventList = require('./event_list').eventList;