const log = require("loglevel");
const express = require('express');
const influx = require("./influx_adaptor");


function status_to_int(status) {
    if (status === "warn") {
        return -1;
    } else if (status === "down") {
        return -2;
    } else if (status === "up") {
        return 1;
    } else if (status === "unknown") {
        return 0;
    }
    log.warn(`Unknown statusgator status '${status}'`);
    return 0;
}


exports.init = function init(router) {
    log.info(`StatusGathor webhook mounted`);
    router.post('/', (req, res) => {
        log.info("StatusGathor request", req);
        const content = req.body || {};
        const status = status_to_int(content.current_status);
        const points = [{
            measurement: "cloud_status",
            fields: {
                status: status
            },
            tags: Object.assign({
                "service_name": content.service_name,
                "current_status": content.current_status,
                "last_status": content.last_status
            }),
            timestamp: content.occurred_at
        }];
        influx.write(points)
            .then(() => {
                res.status(204).end();
            })
            .catch((ex) => {
                res.status(400).send(ex.message);
            })
    });
    return router;
};
