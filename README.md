# ljswitchboard-device_scanner
A library dedicated to finding ALL LabJack devices that are able to be connected to.  Uses LabJack-nodejs for LJM's scanning functionality as well as some special node additions.

For

This library enables devices to be discovered 

## Installation:
` npm install ljswitchboard-device_sacnner`

Require:
```
var device_scanner = require('../lib/ljswitchboard-device_scanner');
var deviceScanner = device_scanner.getDeviceScanner();
```

LabJack device discovery:
```
// Perform a LJM scan operation & read additional device information
deviceScanner.findAllDevices()
.then(function success(deviceTypes) {
    // An array of device types & found devices. See: "findAllDevices return example and format" below.
}, function error(error) {
    
});
```

## Usage Details:
* findAllDevices([currentDevices][,options])
* clearCachedScanResults()
* getLastFoundDevices([currentDevices])

### <promise> = findAllDevices([currentDevices][,options]):
* currentDevices: an array of open device objects from the [ljswitchboard-ljm_device_curator](https://www.npmjs.com/package/ljswitchboard-ljm_device_curator) library.  Options to only scan for certain LJM device types is not exposed, only their connection types.
```
currentDevices = [];
```

* options: an object with the following keys:
```
var options = {
    scanUSB: true,
    scanEthernet: true,
    scanEthernetTCP: true, // Defaults to false
    scanWiFi: true,
    scanWiFiTCP: true, // Defaults to false
}
```

### <promise> = clearChachedScanResults():
```
deviceScanner.getLastFoundDevices()
.then(function success(deviceTypes) {
    
}, function error(error) {
    
});
```

### <promise> = getLastFoundDevices([currentDevices]):
```
// Perform a LJM scan operation & read additional device information
deviceScanner.getLastFoundDevices()
.then(function success(deviceTypes) {
    
}, function error(error) {
    
});
```

## Mock device scanning:
To enable integration testing and demo-mode in Kipling, a feature called "mock device scanning" was added to the device_scanner library.  To implement K3's demo mode, this feature in combination with the curated device's mock mode must be used.

Mock devices can be added into the scan list to enable a demo-mode use-cases and live device scanning can be enabled/disabled to force device scanning to only find live devices or to enable both live and mock devices to be found during the same scan process.

Mock devices can be added in order to be returned.  Devices can be added one at a time, as an array, or removed.

### <promise> = disableDeviceScanning():
This function disables calls to the LJM library and forces the use of the mock scanning library.
```
deviceScanner.disableDeviceScanning()
```

### <promise> = enableDeviceScanning():
This function enables calls to the LJM library and allows live LabJack devices to be found.
```
deviceScanner.enableDeviceScanning()
```

### <promise> = addMockDevice(device_info_object):
applicable {device_info_object} keys are:
* deviceType: 'LJM_dtT7', or 'LJM_dtT4', ...
* connectionType: 'LJM_ctUSB', or 'LJM_ctEthernet', ...
* serialNumber: ex: 47001000 `note: will be made up if not given `
* ipAddress: '192.168.1.2' `note: will be made up if not given `

```
deviceScanner.addMockDevice({
    'deviceType': 'LJM_dtT7',
    'connectionType': 'LJM_ctUSB',
    'serialNumber': 1,
})
```

### <promise> = addMockDevices([device_info_object]):
```
deviceScanner.addMockDevices([
{
    'deviceType': 'LJM_dtT7',
    'connectionType': 'LJM_ctETHERNET',
    'serialNumber': 1,
},
{
    'deviceType': 'LJM_dtT7',
    'connectionType': 'LJM_ctUSB',
    'serialNumber': 1,
}])
```

### <promise> = removeAllMockDevices():
```
deviceScanner.removeAllMockDevices()
```

## findAllDevices return example and format:
The resolved promise returns an array of objects representing found device types.  Each device type object has a "devices" key.  The devices key is an array of objects representing found devices and contains a "connectionTypes" key.  The connectionTypes key is an array of objects representing available connectionTypes.
```json5
[
  {
    "deviceType": 7,
    // Integer device type

    "deviceTypeString": "LJM_dtT7",
    // The LJM device type

    "deviceTypeName": "T7",
    // A human-readable device type - never indicates device subclass

    "devices":
    // A list of devices, grouped by serial number
    [
      {
        "deviceType": 7,
        // Integer device type

        "deviceTypeString": "LJM_dtT7",
        // The LJM device type

        "deviceTypeName": "T7",
        // A human-readable device type - never indicates device subclass

        "serialNumber": 470010103,
        // Integer serial number

        "acquiredRequiredData": true,
        // true if data was collected successfully, false if not

        "isMockDevice": true,
        // True if mock device, false if real device

        "productType": "T7-Pro",
        // Human-readable device class / subclass name, e.g. "T7" or "T7-Pro"
n
        "modelType": "T7-Pro",
        // Same as productType

        "isActive": false,
        // true if user has connected to this device, false if not

        "connectionTypes":
        // Array of objects for each connection this device has
        [
          {
            "dt": 7,
            // Legacy, (non-canonical) integer LJM device type

            "ct": 3,
            // Legacy, (non-canonical) integer LJM connection type

            "connectionType": 3,
            // Integer LJM connection type

            "str": "LJM_ctETHERNET",
            // String LJM connection type

            "name": "Ethernet",
            // Human-readable connection type name

            "ipAddress": "192.168.1.207",
            // Human-readable IP address string. Meaningless if USB.

            "safeIP": "192_168_1_207",
            // ipAddress with underscores (_) instead of periods (.)

            "verified": true,
            // true if the device could be opened directly, false if not

            "isActive": false,
            // true if connection was previously opened by the user before scan, false if not

            "foundByAttribute": false,
            // true if found through checking device attributes, false if found in by scan

            "insertionMethod": "scan",
            // "attribute" foundByAttribute is true, "scan" if foundByAttribute is false
          },
          {
            // Another connection, e.g. for USB, WiFi, etc.
          }
        ]

        // The following attributes are controlled by ljswitchboard-ljm_device_curator
        "DEVICE_NAME_DEFAULT",
        "HARDWARE_INSTALLED",
        "ETHERNET_IP",
        "WIFI_STATUS",
        "WIFI_IP",
        "WIFI_RSSI",
        "FIRMWARE_VERSION",
        "DGT_INSTALLED_OPTIONS",
        // etc.
      },
      {
        // Another device of the same class with a different serial number
      }
    ]
  },
  {
    // Another device class, e.g. Digits
  }
]
```