
process.on('uncaughtException', function(err) {
    console.log('ERROR!!!', err);
    console.log(err.stack);
    process.exit();
});

exports.get_ljm_version = require('./get_ljm_version').tests;
// exports.unit_tests = require('./unit_tests').tests;
exports.basic_test = require('./basic_test').tests;
// exports.open_all_basic_test = require('./open_all_basic_test').tests;
exports.mock_test = require('./mock_test').tests;
exports.scan_connected_devices = require('./scan_connected_devices').tests;

// exports.crazy_test = require('./crazy_test').tests;