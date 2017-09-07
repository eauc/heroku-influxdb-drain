const monitor = require("./monitor");
const log = require("loglevel");


// To create token check : https://docs.travis-ci.com/api/?http#authentication

const TRAVIS_TOKEN = process.env.TRAVIS_TOKEN;


const TravisStatusMap = {
    'green': monitor.STATUS_OK,
    'yellow': monitor.STATUS_MINOR,
    'orange': monitor.STATUS_MAJOR,
    'red': monitor.STATUS_CRITICAL
};

const TRAVIS_URL = "https://api.travis-ci.com/repos/";

class TravisCIMonitor extends monitor.Monitor {

    constructor() {
        super('TravisCI');
    }

    update_api_call(req) {
        return req
            .set("Accept", "application/vnd.travis-ci.2+json")
            .set("Authorization", `Token ${TRAVIS_TOKEN}`)
    }

    is_enabled() {
        return !!TRAVIS_TOKEN;
    }

    check() {
        if (!TRAVIS_TOKEN) {
            return Promise.resolve();
        }
        return this.get_json_resource(TRAVIS_URL)
            .then((res) => {
                const repos = res.body;
                log.debug("TravisCI repos", JSON.stringify(repos, null, 4));
                return monitor.STATUS_OK;
            })
            .catch((err) => {
                log.debug("TravisCI error", err);
                return monitor.STATUS_UNKNOWN;
            })
    }
}

module.exports = TravisCIMonitor;
