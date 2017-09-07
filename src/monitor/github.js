const monitor = require("./monitor");
const log = require("loglevel");


const GitHubStatusMap = {
    'good': monitor.STATUS_OK,
    'major': monitor.STATUS_MAJOR,
    'minor': monitor.STATUS_MINOR
};

const GITHUB_URL = "https://status.github.com/api/status.json";

class GithubMonitor extends monitor.Monitor {

    constructor() {
        super('GitHub');
    }

    check() {
        return this.get_json_resource(GITHUB_URL)
            .then((res) => {
                log.debug("Github status", res.body['status']);
                return GitHubStatusMap[res.body['status']];
            })
            .catch((err) => {
                log.debug("Github status", err);
                return monitor.STATUS_UNKNOWN;
            })
    }
}

module.exports = GithubMonitor;
