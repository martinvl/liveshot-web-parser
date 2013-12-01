var path = require('path');
var iconv = require('iconv-lite');
var decodeWord = require('bite').decodeWord;

// --- Constants ---
var EXT = {
    index:'.txt',
    series:'.TXT',
    shot:'.MLD'
};

var PAT = {
    index:/^index\.txt$/,
    series:/.+_\d+\.TXT$/,
    shots:/.+_\d+\.MLD$/
};

var ENCODING = 'UTF8';//ISO-8859-1';

var HEAD_LENGTH = 9;
var SHOT_LENGTH = 10;

// --- Exports ---
module.exports.isIndexPath = isIndexPath;
module.exports.isSeriesPath = isSeriesPath;
module.exports.isShotPath = isShotPath;

module.exports.getBasePath = getBasePath;
module.exports.getSeriesPath = getSeriesPath;
module.exports.getShotPath = getShotPath;
module.exports.getIndexPath = getIndexPath;

module.exports.parseIndex = parseIndex;
module.exports.parseSeries = parseSeries;
module.exports.parseShots = parseShots;
module.exports.parsePath = parsePath;

// --- Testers ---
function isIndexPath(fullpath) {
    var base = path.basename(fullpath);

    return PAT.index.test(base);
}

function isSeriesPath(fullpath) {
    var base = path.basename(fullpath);

    return PAT.series.test(base);
}

function isShotPath(fullpath) {
    var base = path.basename(fullpath);

    return PAT.shots.test(base);
}

// --- Extractors ---
function getBasePath(root, range, lane) {
    var base = range + '_' + lane;

    return path.join(root, base);
}

function getSeriesPath(basePath) {
    return basePath + EXT.series;
}

function getShotPath(basePath) {
    return basePath + EXT.shot;
}

function getIndexPath(root) {
    return path.join(root, 'index' + EXT.index);
}

// --- Parsers ---
function parseIndex(data) {
    var lines = data.split('\n');

    var cards = [];

    for (var idx in lines.slice(0, -1)) {
        var line = lines[idx];
        var fields = line.split(';');

        cards.push({
            range:fields[0],
            relay:fields[1],
            lane:fields[2],
            name:fields[3],
            club:fields[4],
            className:fields[5],
            category:fields[6],
            startsum:fields[7],
            targetID:fields[9].replace(/\r/g, '')
        });
    }

    return cards;
}

function parseSeries(data) {
    data = data.replace(/\r/g, '');
    data = data.replace(/.*=[ ]*/g, '');
    data = data.replace(/\[/g, '');
    data = data.replace(/\]/g, '');

    var lines = data.split('\n');

    return {
        seriesNum:parseInt(lines[1]),
        series:lines[2],
        startSum:lines[3],
        seriesSum:lines[4],
        totalSum:lines[5],
        numShots:parseInt(lines[6])
    };
}

function parseShots(buffer) {
    buffer = buffer.slice(HEAD_LENGTH);

    var shots = [];

    while (buffer.length >= SHOT_LENGTH) {
        var shotBuffer = buffer.slice(0, SHOT_LENGTH);
        shots.push(parseShot(shotBuffer));

        if (buffer.length < SHOT_LENGTH) {
            break;
        }

        buffer = buffer.slice(SHOT_LENGTH);
    }

    return shots;
}

function parseShot(buffer) {
    var shotNum = decodeWord(buffer.slice(0, 2));
    var value = decodeWord(buffer.slice(2, 4), true);
    var x = decodeWord(buffer.slice(4, 7), true);
    var y = -decodeWord(buffer.slice(7, 10), true);

    return {
        shotNum:shotNum,
        value:parseValue(value),
        x:x,
        y:y
    };
}

function parseValue(value) {
    value = Math.abs(value / 100);

    var prefix = Math.floor(value);
    var suffix = Math.floor((value - prefix) * 10);

    if (value  >= 10)
        prefix = "X";

    if (value >= 10.5)
        prefix = "*";

    return prefix + "." + suffix;
}

function parsePath(path) {
    var basePath = path;

    if (isIndexPath(path)) {
        basePath = path.substr(0, path.length - EXT.index.length);
    } else if (isSeriesPath(path)) {
        basePath = path.substr(0, path.length - EXT.series.length);
    } else if (isShotPath(path)) {
        basePath = path.substr(0, path.length - EXT.shot.length);
    } else {
        throw new Error('Unrecognized path could not be parsed: ' + path);
    }

    return basePath;
}
