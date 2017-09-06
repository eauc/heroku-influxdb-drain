const log = require("loglevel");
const express = require('express');
const influx = require("./influx_adaptor");
const http = require('http');
const request = require('superagent');

const STATUS_WARN = -1;
const STATUS_DOWN = -2;
const STATUS_UNKNOWN = 0;
const STATUS_UP = 1;


exports.init = function init(router) {
    log.info(`Service monitor started`);
    setInterval(() => monitor([GithubMonitor]), 10000);
};


function get_resource(url) {
    return new Promise((resolve, reject) => {
        request
            .get(url)
            .set('Accept', 'application/json')
            .end(function(err, res){
                if (err) {
                    reject(err);
                } else {
                    resolve(res);
                }
            });
    });
}

function monitor(class_list) {
    class_list.forEach((cl) => {
        const item = new cl();
        item.check().then((status) => {
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
    });
}


class Monitor {
    constructor(name) {
        this.name = name;
    }

    check() {
        return STATUS_UNKNOWN;
    }

}

const GitHubStatusMap = {
    'good': STATUS_UP,
    'major': STATUS_DOWN,
    'minor': STATUS_WARN
};

class GithubMonitor extends Monitor {

    constructor() {
        super('GitHub');
        this.name = 'GitHub';
        this.status_url = 'https://status.github.com/api/status.json';
    }

    check() {
        return get_resource(this.status_url)
            .then((res) => {
                log.debug("Github status", res.body['status']);
                return GitHubStatusMap[res.body['status']];
            })
            .catch((err) => {
                log.debug("Github status", err);
                return STATUS_DOWN;
            })
    }
}