const monitor = require("./monitor");
const log = require("loglevel");


const AwsS3StatusMap = {
    'up': monitor.STATUS_OK,
    'maintenance': monitor.STATUS_MINOR,
    'down': monitor.STATUS_CRITICAL
};

const MONITOR_URL = "https://cloudharmony.com/api/status?serviceIds=aws%3As3";


class AwsS3Monitor extends monitor.Monitor {

    constructor() {
        super('AwsS3');
    }

    is_enabled() {
        return true;
    }

    aggregate_status(list) {
        let max = monitor.STATUS_UNKNOWN;
        list.forEach((l) => {
            const s = AwsS3StatusMap[l.status] || 0;
            if (s > max) {
                max = s;
            }
        });
        return max;
    }

    check() {
        return this.get_json_resource(MONITOR_URL)
            .then((res) => {
                const status = this.aggregate_status(res.body);
                log.debug("AwsS3 status", res.body.map((s) => `${s.region}=${s.status}`).join(" | "));
                return status;
            })
            .catch((err) => {
                log.debug("AwsS3 error", err);
                return monitor.STATUS_UNKNOWN;
            })
    }
}

module.exports = AwsS3Monitor;
