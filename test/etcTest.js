var assert = require('chai').assert;
var fs = require('fs');
var etc = require('../etc');

suite('etc', function() {
    test('Parses shots correctly', function () {
        var buffer = new Buffer([0x61, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x0B, 0x02, 0x01, 0x00, 0xE1, 0xFB, 0x72, 0x1D, 0x00, 0xD4, 0x3C,
            0x00, 0x02, 0x00, 0xEB, 0x02, 0xC5, 0x74, 0xFE, 0xD8, 0x5A, 0xFF]);

        var shots = etc.parseShots(buffer);
        var expectedShots = [{shotNum: 1, value: '*.5', x: 7538, y: -15572 },
        {shotNum: 2, value: '7.4', x: -101179, y: 42280 }];

        assert.deepEqual(shots, expectedShots);
    });
});
