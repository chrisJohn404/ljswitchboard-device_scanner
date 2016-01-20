# ljswitchboard-device_scanner
A node project dedicated to finding ALL labjack devices that are able to be connected to.  Uses LabJack-nodejs for LJM's scanning functionality as well as some special node additions.



## findAllDevices
Takes an optional parameter of a list of connected device objects.

Returns an array.
    Each item of array represents one device type (T7/Digit/etc.) as an object.
        Each of those device types have an array "devices", which group devices by serial number.

Format:
[
    {
        "deviceType": // Integer device type - e.g. 7
        "deviceTypeString": // The LJM device type - e.g. "LJM_dtT7",
        "deviceTypeName": // A human-readable device type. - e.g. "T7", (Does not distinguish between device subclass.)
        "devices": // A list of devices, grouped by serial number
        [
            {
                "deviceType": // Integer device type - e.g. 7
                "deviceTypeString": // The LJM device type - e.g. "LJM_dtT7",
                "deviceTypeName": // A human-readable device type. - e.g. "T7", (Does not distinguish between device subclass.)
                "serialNumber", // Integer serial number
                "acquiredRequiredData", // true if data was collected successfully, false if not

                "isMockDevice": // True if mock device, false if real device
                "productType" // Human-readable device class / subclass name, e.g. "T7" or "T7-Pro"
                "modelType" // Same as productType
                "isActive", // true if user has connected to this device, false if not

                "connectionTypes": // Array of objects for each connection this device has
                [
                    {
                        "dt": // Legacy, (non-canonical) integer LJM device type
                        "ct": // Legacy, (non-canonical) integer LJM connection type
                        "connectionType": // Integer LJM connection type, e.g. 3
                        "str": // String LJM connection type, e.g. "LJM_ctETHERNET"
                        "name": // Human-readable connection type name, e.g. "Ethernet"
                        "ipAddress": // Human-readable IP address. Meaningless if USB. 192.168.1.207
                        "safeIP": // IP address with underscores (_) instead of periods (.). Meaningless if USB. // e.g. 192_168_1_207
                        "verified": // true if the device could be opened directly, false if not
                        "isActive": // true if connection was previously opened by the user before scan, false if not
                        "foundByAttribute": // true if found through checking device attributes, false if found in by scan
                        "insertionMethod": // "attribute" foundByAttribute is true, "scan" if foundByAttribute is false
                    },
                    {
                        // Another connection
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
        // Another device class, e.g. for all found Digits
    }
]
