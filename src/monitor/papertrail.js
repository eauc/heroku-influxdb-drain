const monitor = require("./monitor");


class TravisCIMonitor extends monitor.StatusPageMonitor {

    constructor() {
        super('Papertrail');
    }

    is_enabled() {
        return true;
    }

    get_service_url() {
        return "http://www.papertrailstatus.com/";
    }
}

module.exports = TravisCIMonitor;
