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

exports.getDeviceScanner = function(whichScanner) {
    if(device_scanner) {
        // Nothing; we already have the device_scanner
    } else {
        driver = require('LabJack-nodejs').driver();

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
            getOpenAllScanner();
        }
    }
return device_scanner;
};

exports.eventList = require('./event_list').eventList;