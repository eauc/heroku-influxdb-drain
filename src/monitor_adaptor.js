const log = require("loglevel");
const express = require('express');
const influx = require("./influx_adaptor");


const MONITOR_INTERVAL = parseInt(process.env.MONITOR_INTERVAL || "10000");


const MONITOR_CLASSES = [
    require("./monitor/github"),
    require("./monitor/heroku"),
    require("./monitor/travis_ci")
];


exports.init = function init(router) {
    log.info(`Service monitor started`);
    setInterval(() => monitor(MONITOR_CLASSES), MONITOR_INTERVAL);
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
