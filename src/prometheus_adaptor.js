const client = require('prom-client');
const log = require("loglevel");


function isEnabled() {
    let enabled = true;
    let env = process.env.PROMETHEUS;
    if (env) {
        env = env.toLowerCase();
        if (env === "false" || env === "off" || env === "no" || env === "disabled") {
            enabled = false;
        }
    }
    return enabled;
}


exports.init = function init(app) {
    if (isEnabled()) {
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
};


exports.send = function send(points, app) {
    if (isEnabled()) {
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
    return Promise.resolve(points);
};
