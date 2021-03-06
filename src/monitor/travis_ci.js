const monitor = require("./monitor");


class TravisCIMonitor extends monitor.StatusPageMonitor {

    constructor() {
        super('TravisCI');
    }

    is_enabled() {
        return true;
    }

    get_service_url() {
        return "https://www.traviscistatus.com/";
    }
}

module.exports = TravisCIMonitor;
