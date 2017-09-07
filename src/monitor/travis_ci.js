const monitor = require("./monitor");
const log = require("loglevel");


const TravisStatusMap = {
    'none': monitor.STATUS_OK,
    'minor': monitor.STATUS_MINOR,
    'maintenance': monitor.STATUS_MINOR,
    'major': monitor.STATUS_MAJOR,
    'critical': monitor.STATUS_CRITICAL
};

const TRAVIS_URL = "https://www.traviscistatus.com/";


class TravisCIMonitor extends monitor.Monitor {

    constructor() {
        super('TravisCI');
    }

    is_enabled() {
        return true;
    }

    check() {
        return this.get_json_resource(TRAVIS_URL)
            .then((res) => {
                const status = res.body["status"]["indicator"];
                log.debug("TravisCI status", status);
                return TravisStatusMap[status];
            })
            .catch((err) => {
                log.debug("TravisCI error", err);
                return monitor.STATUS_UNKNOWN;
            })
    }
}

module.exports = TravisCIMonitor;
