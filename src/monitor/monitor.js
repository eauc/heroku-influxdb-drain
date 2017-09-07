const request = require('superagent');

const STATUS_UNKNOWN = -1;
const STATUS_OK = 1;
const STATUS_MINOR = 2;
const STATUS_MAJOR = 3;
const STATUS_CRITICAL = 4;


class Monitor {
    constructor(name) {
        this.name = name;
    }

    check() {
        return STATUS_UNKNOWN;
    }

    get_json_resource(url) {
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

}

module.exports = {Monitor, STATUS_UNKNOWN, STATUS_OK, STATUS_MINOR, STATUS_MAJOR, STATUS_CRITICAL};
