var Watcher = require('../Watcher');
var Parser = require('../Parser');
var io = require('socket.io-client');
var ObjSync = require('objsync');

var selector = document.createElement('input');
selector.type = 'file';
selector.multiple = true;

var modified = 0;

var sync;
var transport = io.connect('http://173.246.41.179', {'force new connection':true});

var hostName = 'Nordstrand SKL';

transport.on('connect', function () {
    console.log('connected to host');
    sync = new ObjSync(transport, {delimiter:'/', subscribe:false, publish:true});

});

transport.on('error', function (err) {
    console.error(err);
});

transport.on('disconnect', function (err) {
    console.info('disconnected from server');
});

selector.addEventListener('change', function () {
    var parser = new Parser(selector.files);

    for (var idx in parser.ranges) {
        parser.ranges[idx].host = hostName;
    }

    sync.setObject(parser.ranges);

    parser.on('update', function () {
        console.log('update');
        var ranges = parser.ranges;

        for (var idx in parser.ranges) {
            parser.ranges[idx].host = hostName;
        }

        sync.setObject(ranges);
    });
    parser.start();

    /*
    var files = selector.files;

    for (var i = 0; i < files.length; ++i) {
        var file = files[i];

        console.log(file.name);
    }
    */

    //setup(selector.files[0]);

    /*
    var f = files[0];

    console.log(f.name + ' ' + f.type + ' ' + f.size + ' ' + f.lastModifiedDate);

    setInterval(function () {
        if (f.lastModifiedDate.valueOf() > modified) {
            modified = f.lastModifiedDate.valueOf();

            console.log('File changed');
        }
    }, 100);

       reader.onloadend = function (e) {
       var buffer = new Buffer(new Uint8Array(e.target.result));

       var s = '';
       for (var i = 0; i < buffer.length; ++i) {
       s += buffer.readUInt8(i) + ' ';
       }

       console.log(s);
       console.log(buffer.length);
       };

       reader.readAsArrayBuffer(f);
       */
}, false);
document.body.appendChild(selector);

function setup(file) {
    var watcher = new Watcher(file);
    //var reader = new FileReader();

    var numChanges = 0;
    watcher.on('update', function () {
        console.log('File change ' + (++numChanges));
    });
    watcher.start();
}
