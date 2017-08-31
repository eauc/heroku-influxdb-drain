const Influx = require('influx');
const log = require("loglevel");


const INFLUX_URL = process.env.INFLUX_URL || "http://localhost:8086/heroku";

let DEBUG_WRITER = null;

exports._set_debug_writer = function(writer) {
    DEBUG_WRITER = writer;
};


exports.init = function init() {
    log.info(`Use influxdb adapter at url: ${INFLUX_URL}`);
};

exports.send = function send(points) {
    const influxClient = new Influx.InfluxDB(INFLUX_URL);
    const influxPoints = points.map((p) => {
        return {
            measurement: p.name,
            tags: p.tags,
            fields: Object.assign({
                value: p.value
            }, p.fields || {}),
            timestamp: p.timestamp
        };
    });
    if (DEBUG_WRITER) {
        DEBUG_WRITER(influxPoints);
        return Promise.resolve(influxPoints);
    } else {
        return influxClient.writePoints(influxPoints);
    }
};

