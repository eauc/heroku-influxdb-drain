"use strict";

const _ = require("lodash");
const express = require("express");
const url = require("url");
const bodyParser = require("body-parser");
const syslog_drain = require("./syslog_drain");
const log = require('loglevel');
const basicAuth = require('basic-auth');
const influx = require("./influx_adaptor");
const statusgator = require("./statusgator_adaptor");
const monitor = require("./monitor_adaptor");
const { MongoClient } = require("mongodb");


const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;
let db;
let Logs;
(async function() {
  if (MONGODB_URI) {
    console.log('Connecting to', MONGODB_URI);
    db = (await MongoClient.connect(MONGODB_URI)).db();
    Logs = db.collection('logs');
    console.log('Connected to', MONGODB_URI);
  }
})();

/*
 * Point structure:
 * {
 *    name: "metric name",
 *    help: "metric help" (Optional)
 *    value: "metric value",
 *    timestamp: metric timestamp as Date ( optional, now if not set )
 *    tags: { (Optional key-value influxdb tags)
 *      "key": "value"
 *    },
 *    fields { (Optional key-value influxdb fields, user value: this.value by default )
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

function flattenFields(point) {
  return {
    ...point,
    fields: _.mapValues(
      point.fields,
      (val) => (typeof val === "object") ? _.truncate(JSON.stringify(val), 200) : val,
    ),
  };
}

function isPointLoggable({ name }) {
  return name === "app" || name === "heroku_release";
}

function process_points(app, points) {
  const logs = _.filter(points, isPointLoggable);
  return Promise.all([
    influx.send(_.map(points, flattenFields)),
    Logs && logs.length > 0 && Logs.insertMany(logs),
  ]);
}

function extract_tags(req) {
    return req.query || {};
}

/**
 * See https://devcenter.heroku.com/articles/log-drains#https-drains
 * for https log drain
 */

module.exports.start_server = function start_server(port) {
    const app = express();

    app.use(bodyParser.text({
        defaultCharset: 'ascii',
        type: 'application/logplex-1'
    }));
    app.use(bodyParser.json());

    app.get('/status/', (req, res) => {
        res.status(200).send("ok");
    });

    app.post('/logs/:source/', auth_middleware, (req, res) => {
        const source = req.params.source;
        const tags = extract_tags(req);
        syslog_drain.process_heroku_log(req.body, source, tags)
            .then((points) => {
                const all_tags = Object.assign({}, tags, {
                    source: source,
                    type: "syslog"
                });
                points.push({
                    name: "metrics_received",
                    tags: all_tags,
                    value: points.length,
                    fields: {
                        state: 1
                    }
                });
                return process_points(app, points);
            })
            .then(() => {
                res.status(204).end();
            })
            .catch(err => {
                log.error(err, err.stack);
                res.status(400).send(err.message);
            })

    });

    app.get('/_syslog_debug/:source/', auth_middleware, (req, res) => {
        const source = req.params.source;
        res.status(200)
            .set("Content-Type", "text/plain")
            .send(syslog_drain.collector_text(source));
    });

    app.get('/_syslog_debug/', auth_middleware, (req, res) => {
        res.status(200)
            .set("Content-Type", "text/html")
            .send(syslog_drain.collector_index());
    });

    const influxRouter = express.Router();
    influxRouter.use(auth_middleware);
    influx.init(influxRouter);
    app.use('/influx', influxRouter);

    const statusgatorRouter = express.Router();
    statusgatorRouter.use(bodyParser.urlencoded({ extended: false }));
    statusgator.init(statusgatorRouter);
    app.use('/statusgator', statusgatorRouter);

    const monitorRouter = express.Router();
    monitor.init(monitorRouter);
    app.use('/monitor', monitorRouter);


    return app.listen(port, (err) => {
        if (!err) {
            log.info(`Starting heroku logs drain to influxdb on port ${port}`);
        } else {
            log.error(`Error starting aggregator server! ${err}`);
            process.exit(-1);
        }
    });
};
