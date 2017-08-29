"use strict";

const express = require('express');
const url = require("url");
const bodyParser = require("body-parser");
const syslog_drain = require("./syslog_drain");
const log = require('loglevel');
const basicAuth = require('basic-auth');
const client = require('prom-client');

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;


/*
 * Point structure:
 * {
 *    name: "metric name",
 *    help: "metric help" (Optional)
 *    value: "metric value",
 *    timestamp: metric timestamp as Date ( optional, now if not set )
 *    labels: { (Optional key-value labels)
 *      "key": "value"
 *    }
 * }
 */

function auth_middleware(req, res, next) {
    if (ACCESS_TOKEN) {
        const user = basicAuth(req);
        if (!user || user.name !== ACCESS_TOKEN) {
            res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
            return res.status(401).end();
        }
    }
    next();
}


function start_prometheus(app) {
    const collectDefaultMetrics = client.collectDefaultMetrics;
    const register = client.register;
    app.register = register;
    app.register.clear();

    collectDefaultMetrics({register});

    app.get('/metrics', (req, res) => {
        res.set('Content-Type', register.contentType);
        res.end(register.metrics());
    });
    log.info("Starting prometheus /metrics route");
}

/**
 * Contert points to prometheus gauges
 * @param app express app
 * @param points Array of points
 */
function populate_prometheus(app, points) {
    points.forEach((p) => {
        let gauge = app.register.getSingleMetric(p.name);
        if (!gauge) {
            gauge = new client.Gauge({
                name: p.name,
                help: p.help || 'Heroku metric',
                labelNames: Object.keys(p.labels || {}),
                registers: [ app.register ]
            });
        }
        gauge.set(p.labels, p.value, p.timestamp);
    });
}

/**
 * See https://devcenter.heroku.com/articles/log-drains#https-drains
 * for https log drain
 */

module.exports.start_server = function start_server(port) {
    const app = express();

    app.use(auth_middleware);
    app.use(bodyParser.text({
        defaultCharset: 'ascii',
        type: 'application/logplex-1'
    }));
    app.use(bodyParser.json());

    app.post('/logs/:source/', auth_middleware, (req, res) => {
        const source = req.params.source;
        syslog_drain.process_heroku_log(req.body, source)
            .then((points) => {
                if (points.length > 0) {
                    points.push({
                        name: "metrics_received",
                        labels: {
                            source: source
                        },
                        value: points.length
                    });
                    return populate_prometheus(app, points);
                }
            })
            .then(() => {
                res.status(204).end();
            })
            .catch(err => {
                log.error(err, err.stack);
                res.status(400).send(err.message);
            })

    });

    app.post('/push-logs/:source/', auth_middleware, (req, res) => {
        const source = req.params.source;
        const points = req.body;
        points.push({
            name: "metrics_received",
            labels: {
                source: source
            },
            value: points.length
        });
        points.forEach((p) => {
            const labels = p.labels || {};
            if (!labels.source) {
                labels.source = source;
                p.labels = labels;
            }
        });
        populate_prometheus(app, points);
        res.status(204).end();
    });

    app.get('/_syslog_debug/:source/', auth_middleware, (req, res) => {
        const source = req.params.source;
        res.status(200)
            .set("Content-Type", "text/plain")
            .send(syslog_drain.collector_text(source));
    });

    app.get('/_syslog_debug/', auth_middleware, (req, res) => {
        const source = req.params.source;
        res.status(200)
            .set("Content-Type", "text/html")
            .send(syslog_drain.collector_index());
    });

    start_prometheus(app);

    return app.listen(port, (err) => {
        if (!err) {
            log.info(`Starting prometheus heroku logs aggregator on port ${port}`);
        } else {
            log.error(`Error starting aggregator server! ${err}`);
            process.exit(-1);
        }
    })
};
