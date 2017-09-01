const Influx = require('influx');
const log = require("loglevel");
const express = require('express');


const INFLUX_URL = process.env.INFLUX_URL || "http://localhost:8086/heroku";

let DEBUG_WRITER = null;

exports._set_debug_writer = function(writer) {
    DEBUG_WRITER = writer;
};

function write(influxPoints) {
    if (DEBUG_WRITER) {
        DEBUG_WRITER(influxPoints);
        return Promise.resolve(influxPoints);
    } else {
        const influxClient = new Influx.InfluxDB(INFLUX_URL);
        return influxClient.writePoints(influxPoints);
    }
}

exports.init = function init(router) {
    log.info(`Use influxdb adapter at url: ${INFLUX_URL}`);
    router.post('/write', (req, res) => {
        write(req.body)
            .then(() => {
                res.status(204).end();
            })
            .catch((ex) => {
                res.status(400).send(ex.message);
            })
    });
    return router;
};

exports.send = function send(points) {
    const influxPoints = points.map((p) => {
        const fields = p.value !== undefined ? {value: p.value} : {};
        return {
            measurement: p.name,
            tags: p.tags,
            fields: Object.assign(fields, p.fields || {}),
            timestamp: p.timestamp
        };
    });
    return write(influxPoints);
};

