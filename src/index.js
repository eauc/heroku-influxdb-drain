"use strict";

const express = require('express');
const url = require("url");
const bodyParser = require("body-parser");
const worker = require("./worker");
const log = require('loglevel');
const basicAuth = require('basic-auth');
const client = require('prom-client');


const PORT = parseInt(process.env.PORT || "3030");
const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;


log.setLevel(LOG_LEVEL);

/*
 * Point struture:
 * {
 *    name: "metric name",
 *    help: "metric help" (Optional)
 *    value: "metric value",
 *    timestamp: metric timestamp as Date ( optional)
 *    labels: { (Optional)
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

    collectDefaultMetrics({register});

    app.get('/metrics', (req, res) => {
        res.set('Content-Type', register.contentType);
        res.end(register.metrics());
    });
    log.info("Starting prometheus /metrics route");
}

/**
 * Contert points to prometheus gauges
 * @param points Array of points
 */
function populate_prometheus(points) {
    points.forEach((p) => {
        if (p.fields.value) {
            const gauge = new client.Gauge({
                name: p.name,
                help: p.help || 'Heroku metric',
                labelNames: Object.keys(p.tags || {})
            });
            gauge.set(p.labels, p.value, p.timestamp);
        }
    });
}

/**
 * See https://devcenter.heroku.com/articles/log-drains#https-drains
 * for https log drain
 */

function start_server() {
    const app = express();

    app.use(auth_middleware);
    app.use(bodyParser.text({type: 'application/logplex-1'}));

    app.post('/logs/:source/', auth_middleware, (req, res) => {
        const source = req.params.source;
        worker.process_heroku_log(req.body, source)
            .then((points) => {
                if (points.length > 0) {
                    points.push({
                        name: "metrics_received",
                        labels: {
                            source: source
                        },
                        value: points.length
                    });
                    return populate_prometheus(points);
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

    start_prometheus(app);

    app.listen(PORT, (err) => {
        if (!err) {
            log.info(`Starting prometheus heroku logs aggregator on port ${PORT}`);
        } else {
            log.error(`Error starting aggregator server! ${err}`);
            process.exit(-1);
        }
    })
}

start_server();
