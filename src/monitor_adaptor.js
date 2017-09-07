const log = require("loglevel");
const express = require('express');
const influx = require("./influx_adaptor");


const MONITOR_INTERVAL = parseInt(process.env.MONITOR_INTERVAL || "60000");
const MONITORS = process.env.MONITORS ? process.env.MONITORS.split(",").map((s) => s.trim()) : [];



exports.init = function init(router) {
    if (MONITORS.length > 0) {
        log.info(`Service monitor started for service [${MONITORS.join("|")}] with interval: ${MONITOR_INTERVAL} ms`);
        const monitor_classes = MONITORS.map((m) => {
            return require(`./monitor/${m}`)
        });
        setInterval(() => monitor(monitor_classes), MONITOR_INTERVAL);
    }
};

function monitor(class_list) {
    class_list.forEach((cl) => {
        const item = new cl();
        if (item.is_enabled()) {
            item.check()
                .then((status) => {
                    const points = [{
                        measurement: "cloud_status",
                        fields: {
                            status: status
                        },
                        tags: Object.assign({
                            "service_name": item.name
                        })
                    }];
                    return influx.write(points);
                });
        }
    });
}
