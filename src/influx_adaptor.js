const Influx = require('influx');
const log = require("loglevel");

exports.init = function init() {
    if (process.env.INFLUX_URL) {
        log.info(`Use influxdb adapter at url: ${process.env.INFLUX_URL}`);
    }
};

exports.send = function send(points) {
    if (process.env.INFLUX_URL) {
        const influxClient = new Influx.InfluxDB(process.env.INFLUX_URL);
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
        return influxClient.writePoints(influxPoints);
    } else {
        return Promise.resolve(points);
    }
};

