const monitor = require("./monitor");
const log = require("loglevel");


const HerokuStatusMap = {
    'green': monitor.STATUS_OK,
    'yellow': monitor.STATUS_MINOR,
    'orange': monitor.STATUS_MAJOR,
    'red': monitor.STATUS_CRITICAL
};

const HEROKU_URL = "https://status.heroku.com/api/v3/current-status";

class HerokuMonitor extends monitor.Monitor {

    constructor() {
        super('Heroku');
    }

    is_enabled() {
        return true;
    }

    check() {
        return this.get_json_resource(HEROKU_URL)
            .then((res) => {
                const status = res.body['status']['Production'];
                log.debug("Heroku status", status);
                return HerokuStatusMap[status];
            })
            .catch((err) => {
                log.debug("Heroku error", err);
                return monitor.STATUS_UNKNOWN;
            })
    }
}

module.exports = HerokuMonitor;
