// --- Constants ---
var REFRESH = 100;
var DELIMITER = '/';
var TARGET_ID_MAP = {
    '30':'NO_DFS_15M',
    '31':'NO_DFS_100M',
    '32':'NO_DFS_200M',
    '33':'NO_DFS_300M'
};

var TARGET_SCALE_MAP = {
    '30':40000,
    '31':300000,
    '32':500000,
    '33':750000
};

var GAUGE_SIZE_MAP = {
    '30':0,
    '31':8000/300000,
    '32':8000/500000,
    '33':8000/750000
};

var EXT = {
    index:'.txt',
    series:'.TXT',
    shot:'.MLD'
};

// --- Imports ---
var fs = require('fs');
var etc = require('./etc');
var inherits = require('util').inherits;
var path = require('path');
var EventEmitter = require('events').EventEmitter;
var Watcher = require('./Watcher');
var LiveShot = require('liveshot-protocol');
var CardBuilder = LiveShot.CardBuilder;
var RangeBuilder = LiveShot.RangeBuilder;

function Parser(files) {
    this.setupHandles(files);
}

module.exports = Parser;
inherits(Parser, EventEmitter);

// --- Initialization ---
Parser.prototype.setupHandles = function (files) {
    var index;
    var groups = {};

    for (var i = 0; i < files.length; ++i) {
        var file = files[i];

        if (file.name == 'index.txt') {
            index = file;
        } else {
            var ext = path.extname(file.name);
            var base = path.basename(file.name, ext);

            if (ext == EXT.series || ext == EXT.shot) {
                if (!groups.hasOwnProperty(base)) {
                    groups[base] = {};
                }

                groups[base][ext] = file;
            }
        }
    }

    var self = this;
    this.cardHandles = {};

    for (var idx in groups) {
        var fileGroup = groups[idx];

        if (!fileGroup.hasOwnProperty(EXT.series) || !fileGroup.hasOwnProperty(EXT.shot)) {
            continue;
        }

        var handle = new CardHandle(fileGroup[EXT.series], fileGroup[EXT.shot]);
        this.cardHandles[idx] = handle;

        handle.on('update', function (handle) {
            return function (seriesData, shotBuffer) {
            self.parseCard(handle);
        }} (handle));
    }

    this.indexHandle = new IndexHandle(index);
    this.indexHandle.on('update', function (data) {
        self.parseIndex(data);
    });
};

Parser.prototype.setupRanges = function () {
    this.ranges = [];
};

Parser.prototype.getCardHandle = function (range, lane) {
    return this.cardHandles[range + '_' + lane];
};

Parser.prototype.start = function () {
    this.indexHandle.start();

    for (var idx in this.cardHandles) {
        this.cardHandles[idx].start();
    }
};

Parser.prototype.stop = function () {
    this.indexHandle.stop();

    for (var idx in this.cardHandles) {
        this.cardHandles[idx].stop();
    }
};

// --- Index handling ---
Parser.prototype.parseIndex = function (buffer) {
    var cards = etc.parseIndex(buffer);

    for (var idx in cards) {
        var cardData = cards[idx];
        cardData.target = new Target();

        var handle = this.getCardHandle(cardData.range, cardData.lane);
        var card = handle.card;

        for (var idx in cardData) {
            card[idx] = cardData[idx];
        }
    }

    this.commit();
};

// --- Card handling ---
Parser.prototype.parseCard = function (handle) {
    this.parseSeries(handle);
    this.parseShots(handle);

    this.commit();
};

Parser.prototype.parseSeries = function (handle) {
    var card = handle.card;
    var seriesData = etc.parseSeries(handle.seriesData);

    card.series = seriesData.series;
    card.seriesSum = seriesData.seriesSum;
    card.totalSum = seriesData.totalSum;
};

Parser.prototype.parseShots = function (handle) {
    var card = handle.card;
    var shots = etc.parseShots(handle.shotBuffer);
    var scale = TARGET_SCALE_MAP[card.targetID];

    card.shots = {};

    for (var idx in shots) {
        var shot = shots[idx];

        card.shots[idx] = {
            x:shot.x / scale,
            y:shot.y / scale,
            value:shot.value
        };
    }
};

Parser.prototype.commit = function () {
    this.assembleRanges();
};

// --- Range assembly ---
Parser.prototype.assembleRanges = function () {
    var rangeBuilders = {};
    var cardBuilder = new CardBuilder();

    for (var idx in this.cardHandles) {
        var handle = this.cardHandles[idx];
        var cardData = handle.card;
        var range = cardData.range;

        var rangeBuilder = rangeBuilders[range];

        if (!rangeBuilders.hasOwnProperty(range)) {
            rangeBuilder = new RangeBuilder()
                .setName(range)
                .setRelay(cardData.relay);

            rangeBuilders[range] = rangeBuilder;
        }

        cardBuilder.reset()
            .setLane(cardData.lane)
            .setName(cardData.name)
            .setClub(cardData.club)
            .setClassName(cardData.className)
            .setCategory(cardData.category)
            .setSeriesName(cardData.series)
            .setSeriesSum(cardData.seriesSum)
            .setTotalSum(cardData.totalSum)
            .setGaugeSize(GAUGE_SIZE_MAP[cardData.targetID]) //XXX
            .setTargetID(TARGET_ID_MAP[cardData.targetID]);

        for (var idx in cardData.shots) {
            var shot = cardData.shots[idx];

            cardBuilder.addShotData(shot.x, shot.y, shot.value);
        }

        rangeBuilder.addCard(cardBuilder.getCard());
    }

    var ranges = [];
    for (var idx in rangeBuilders) {
        ranges.push(rangeBuilders[idx].getRange());
    }

    this.ranges = ranges;
    this.emit('update');
};


// --- Internal class CardHandle ---
function CardHandle(seriesFile, shotFile) {
    this.seriesFile = seriesFile;
    this.shotFile = shotFile;

    this.init();
}

inherits(CardHandle, EventEmitter);

// --- Public methods ---
CardHandle.prototype.start = function () {
    this.seriesWatcher.start();
    this.shotWatcher.start();

    this.stage();
};

CardHandle.prototype.stop = function () {
    this.seriesWatcher.stop();
    this.shotWatcher.stop();
};

// --- Private methods ---
CardHandle.prototype.init = function () {
    this.seriesQueued = false;
    this.shotQueued = false;
    this.card = new Card();

    this.setupReaders();
    this.setupWatchers();
};

CardHandle.prototype.setupReaders = function () {
    var self = this;

    this.seriesReader = new FileReader();
    this.seriesReader.onloadend = function () {
        self.seriesQueued = false;
        self.seriesData = self.seriesReader.result;

        if (!self.isQueued()) self.publish();
    };

    this.shotReader = new FileReader();
    this.shotReader.onloadend = function () {
        self.shotQueued = false;
        self.shotBuffer = new Buffer(new Uint8Array(self.shotReader.result));

        if (!self.isQueued()) self.publish();
    };
};

CardHandle.prototype.setupWatchers = function () {
    var self = this;

    this.seriesWatcher = new Watcher(this.seriesFile);
    this.seriesWatcher.on('update', function () {
        self.stage();
    });

    this.shotWatcher = new Watcher(this.shotFile);
    this.shotWatcher.on('update', function () {
        self.stage();
    });
};

CardHandle.prototype.stage = function () {
    if (this.isQueued()) {
        return;
    }

    this.queue();
};

CardHandle.prototype.isQueued = function () {
    return this.seriesQueued || this.shotQueued;
};

CardHandle.prototype.queue = function () {
    this.queueSeries();
    this.queueShot();
};

CardHandle.prototype.queueSeries = function () {
    this.seriesQueued = true;
    this.seriesReader.readAsText(this.seriesFile, 'ISO-8859-1');
};

CardHandle.prototype.queueShot = function () {
    this.shotQueued = true;
    this.shotReader.readAsArrayBuffer(this.shotFile);
};

CardHandle.prototype.publish = function () {
    this.emit('update', this.seriesData, this.shotBuffer);
};

// --- Internal class IndexHandle ---
function IndexHandle(file, handles) {
    this.file = file;
    this.handles = handles;
    this.init();
}

inherits(IndexHandle, EventEmitter);

// --- Public methods ---
IndexHandle.prototype.start = function () {
    this.watcher.start();
    this.stage();
};

IndexHandle.prototype.stop = function () {
    this.watcher.stop();
};

// --- Private methods ---
IndexHandle.prototype.init = function () {
    this.queued = false;

    this.setupReader();
    this.setupWatcher();
};

IndexHandle.prototype.setupReader = function () {
    var self = this;

    this.reader = new FileReader();
    this.reader.onloadend = function () {
        self.queued = false;
        self.data = self.reader.result;

        if (!self.isQueued()) self.publish();
    };
};

IndexHandle.prototype.setupWatcher = function () {
    var self = this;

    this.watcher = new Watcher(this.file);
    this.watcher.on('update', function () {
        self.stage();
    });
};


IndexHandle.prototype.stage = function () {
    if (this.isQueued()) return;

    this.queue();
};

IndexHandle.prototype.isQueued = function () {
    return this.queued;
};

IndexHandle.prototype.queue = function () {
    this.queued = true;
    this.reader.readAsText(this.file, 'ISO-8859-1');
};

IndexHandle.prototype.publish = function () {
    this.emit('update', this.data);
};

// --- protocol reference classes ---
function Card() {
    this.name = '';
    this.lane = '';
    this.club = '';
    this.range = '';
    this.className = '';
    this.category = '';
    this.shots = {};
    this.series = '';
    this.seriesSum = '';
    this.totalSum = '';
    this.targetID = '';
    this.target = new Target();
}

function Target() {
    this.ringSizes = [1., .9, .8, .7, .6, .5, .4, .3, .2, .1, .05];
    this.gauge = 0.0133;
    this.blackSize = .4;
    this.numbersFrom = 1;
    this.numbersTo = 9;
    this.scale = 300000;
}
