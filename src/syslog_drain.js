const syslogParser = require('glossy').Parse;
const filesizeParser = require('filesize-parser');
const durationParser = require('parse-duration');

const log = require('loglevel');


const MAX_MESSAGE_SIZE = 50;

const messagesBySources = {};


const DYNO_STATES = {
    "crashed": -2,
    "down": -1,
    "idle": 0,
    "starting": 1,
    "up": 2
};


if (process.env.DEBUG_SYSLOG === "true") {
    log.warn("Syslog log drain is in debug (DEBUG_SYSLOG=true), this may impact memory");
}

function collect_messages(source, body) {
    if (process.env.DEBUG_SYSLOG === "true") {
        const collector = messagesBySources[source] || [];
        collector.unshift(body);
        messagesBySources[source] = collector.slice(0, MAX_MESSAGE_SIZE);
    }
}

/**
 * Parse log value from human readable size form i.e. 25.6MB
 * @param value the string value
 * @returns {*}
 */
function parse_size_value(value) {
    try {
        return filesizeParser(value);
    } catch (ex) {
        try {
            return parseFloat(value);
        } catch (ex) {
            return value;
        }
    }
}

/**
 * Parse log value from human readable size form i.e. 25.6MB
 * @param value the string value
 * @returns {*}
 */
function parse_duration_value(value) {
    try {
        return durationParser(value);
    } catch (ex) {
        try {
            return parseFloat(value);
        } catch (ex) {
            return value;
        }
    }
}

/**
 * Parse heroku release information
 * @param value message
 * @returns {[version, user_email]}
 */
function parse_heroku_release(value) {
    // Release v16 created by user test@test.com
    const releaseRegexp = new RegExp(`^Release (v[0-9]+) created by user (.*)$`);
    const match = releaseRegexp.exec(value);
    if (!match) {
        return null;
    }
    return [match[1], match[2]];
}
exports.parse_heroku_release = parse_heroku_release;


/**
 * Parse heroku dyno state changed
 * @param value message
 * @returns {[old_state, new_state]}
 */
function parse_heroku_state_changed(value) {
    // State changed from starting to up
    const releaseRegexp = new RegExp(`^State changed from ([a-zA-Z0-9_]+) to ([a-zA-Z0-9_]+)$`);
    const match = releaseRegexp.exec(value);
    if (!match) {
        return null;
    }
    return [match[1], match[2]];
}
exports.parse_heroku_state_changed = parse_heroku_state_changed;

/**
 * handle heroku log-runtime-metrics
 * @param message Heroku parsed message
 * @param labels label associated to the message
 * @returns {Array.<*>}
 */
function handle_heroku_runtime_metrics(message, labels) {
    return message.message
        .split(" ").map((item) => {
            if (item.indexOf("sample#") !== -1) {
                const [key, value] = item.substring(7).split("=");
                const metric_name = key.replace(/[\W_]+/g,"_");
                return {
                    timestamp: message.time,
                    name: metric_name,
                    labels: labels,
                    value: parse_size_value(value)
                }
            } else {
                return null;
            }
        })
        .filter((i) => i !== null);
}
exports.handle_heroku_runtime_metrics = handle_heroku_runtime_metrics;

/**
 * handle heroku logs router
 * @param message heroku router message
 * @param labels labels associated to the message
 * @returns {Array.<*>}
 */
function handle_heroku_router(message, labels) {
    const key_values = message.message
        .split(" ").reduce((acc, item) => {
            const [key, value] = item.split("=");
            acc[key] = value;
            return acc;
        }, {});
    const all_labels = Object.assign({
        method: key_values["method"].toLowerCase(),
        status: parseInt(key_values["status"]),
        path: key_values["path"].replace(/"/g, ""),
        ip: key_values["fwd"].replace(/"/g, "")
    }, labels);
    return [
        {
            timestamp: message.time,
            name: "router_access_time",
            labels: all_labels,
            value: parse_duration_value(key_values["service"])
        }, {
            timestamp: message.time,
            name: "router_access_bytes",
            labels: all_labels,
            value: parse_size_value(key_values["bytes"])
        }
    ];
}


function handle_heroku_release(message, labels) {
    const result = parse_heroku_release(message.message);
    if (!result) {
        return [];
    }
    const all_labels = Object.assign({
        user: result[1],
        version: result[0]
    }, labels);
    return [
        {
            timestamp: message.time,
            name: "heroku_release",
            labels: all_labels,
            value: 1
        }
    ]
}


function handle_heroku_state_changed(message, labels) {
    const result = parse_heroku_state_changed(message.message);
    if (!result) {
        return [];
    }
    return [
        {
            timestamp: message.time,
            name: "heroku_state",
            labels: labels,
            value: DYNO_STATES[result[1]] || -10
        }
    ]
}

/**
 * Convert a syslog message to a influxDB point
 * @param message syslog ( glossy ) message
 * @param source string source of the log ( drain )
 * @returns Array of influx IPoint
 */
function message_to_points(message, source) {
    const labels = {
        host: message.host,
        app: message.appName,
        source: source
    };

    if (message.message.indexOf("sample#") !== -1) {
        return handle_heroku_runtime_metrics(message, labels);
    } else if (message.message.indexOf("protocol=https") !== -1) {
        return handle_heroku_router(message, labels);
    } else if (message.message.indexOf("created by user") !== -1) {
        return handle_heroku_release(message, labels);
    } else if (message.message.indexOf("State changed from") !== -1) {
        return handle_heroku_state_changed(message, labels);
    }
    return [];
}


/**
 * Process heroku log from a request body as text
 * @param body : String, message body
 * @param source : String, source of the message
 * @returns {Promise}
 */
exports.process_heroku_log = function process_heroku_log(body, source) {
    collect_messages(source, body);
    return new Promise((resolve) => {
        const buffer = body;
        const messages = [];
        let pos = 0;
        let new_pos = body.indexOf(" ", pos);
        while (new_pos !== -1) {
            const len_str = buffer.substring(pos, new_pos);
            const len = parseInt(len_str);
            if (isNaN(len)) {
                log.debug(`-------- BODY START ------\n${body}\n-------- BODY END ---------\n`);
                log.error(`Unable to parse message length at position ${pos} text found '${len_str}'`);
                new_pos = -1;
                continue;
            }
            const message = buffer.substring(new_pos + 1, new_pos + len);

            messages.push(syslogParser.parse(message));
            pos = new_pos + len;
            new_pos = body.indexOf(" ", pos);
        }
        log.debug(`messages=${JSON.stringify(messages, null, 4)}`);
        const points = messages
            .map((m) => message_to_points(m, source))
            .filter((p) => p.length > 0)
            .reduce((a, b) => a.concat(b), []);
        resolve(points);
    });
};

exports.collector_text = function collector_text(source) {
    return (messagesBySources[source] || []).join("\n--------------------------------------------------------\n");
};


exports.collector_index = function collector_index() {
    if (process.env.DEBUG_SYSLOG !== "true") {
        return `<html><body><h1>Syslog debug not activated</h1><p>Set DEBUG_SYSLOG=true to enable it.</p></body>`;
    }
    const collectors = Object.keys(messagesBySources).map((c) => {
        return `<li><a href="/_syslog_debug/${c}/">${c}</a></li>`;
    });
    return `
        <html>
            <body>
                <h1>Syslog debug collector list</h1>
                 <ul>
                    ${collectors}
                </ul>
            </body>
        </html>`;
};
