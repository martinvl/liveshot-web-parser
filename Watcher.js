var EventEmitter = require('events').EventEmitter;
var inherits = require('inherits');

var REFRESH = 100;

function Watcher(file, refresh) {
    this.file = file;
    this.refresh = refresh || REFRESH;
}

module.exports = Watcher;
inherits(Watcher, EventEmitter);

Watcher.prototype.start = function () {
    this.lastModified = 0;

    var self = this;
    this.interval = setInterval(function () {
        self.update();
    }, this.refresh);

    this.update();
};

Watcher.prototype.stop = function () {
    clearInterval(this.interval);
};

Watcher.prototype.update = function () {
    var lastModified = this.file.lastModifiedDate.valueOf();

    if (lastModified > this.lastModified) {
        this.lastModified = lastModified;
        this.emit('update');
    }
};
