const _ = require('lodash');
const { dot } = require('dot-object');
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
  "up": 2,
  "complete": 3
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
function parse_sample_value(value) {
  const is_numeric = /^[\d.]+$/.test(value);
  if (!is_numeric) {
    try {
      return filesizeParser(value);
    } catch (ex) {
    }
  }
  const ret = parseFloat(value);
  return Number.isNaN(ret) ? -1 : ret;
}
exports.parse_sample_value = parse_sample_value;


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
      const ret = parseFloat(value);
      return Number.isNaN(ret) ? -1 : ret;
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
 * Parse heroku dyno errors
 * @param value message
 * @returns error code
 */
function parse_heroku_errors(value) {
  var errorRegexp = new RegExp(`^Error (L|R)([0-9]{2,})`);
  var match = errorRegexp.exec(value);

  if (!match) {
    errorRegexp = new RegExp(`^at=error code=(H)([0-9]{2,})`);
    match = errorRegexp.exec(value);
  }

  if (!match) {
    return null;
  }
  return match[1]+match[2];
}

/**
 * handle heroku log-runtime-metrics
 * @param message Heroku parsed message
 * @param tags tags associated to the message
 * @returns {Array.<*>}
 */
function handle_heroku_runtime_metrics(message, tags) {
  const local_tags = { ...tags };
  return message.message
    .split(" ").map((item) => {
      if (item.indexOf("sample#") !== -1) {
        const [key, value] = item.substring(7).split("=");
        const metric_name = key.replace(/[\W_]+/g, "_");
        return {
          timestamp: message.time,
          name: metric_name,
          tags,
          value: parse_sample_value(value)
        };
      } else if (item.indexOf("tag#") !== -1) {
        // add tag to all samples
        const [key, value] = item.substring(4).split("=");
        local_tags[key] = value;
        return null;
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
 * @param tags tags associated to the message
 * @returns {Array.<*>}
 */
function handle_heroku_router(message, tags) {
  const key_values = _.fromPairs(
    message.message
      .split(" ").
      map((item) => item.split("="))
  );
  return [{
    timestamp: message.time,
    name: "router_access_time",
    tags,
    fields: {
      method: key_values["method"].toLowerCase(),
      status: parseInt(key_values["status"]),
      path: key_values["path"].replace(/"/g, ""),
      ip: key_values["fwd"].replace(/"/g, ""),
      duration: parse_duration_value(key_values["service"]),
      size: parse_sample_value(key_values["bytes"]),
      count: 1
    }
  }];
}


function handle_heroku_release(message, tags) {
  const result = parse_heroku_release(message.message);
  if (!result) {
    return [];
  }
  return [
    {
      timestamp: message.time,
      name: "heroku_release",
      fields: {
        version: result[0],
        user: result[1]
      },
      value: 1,
      tags,
    }
  ];
}


function handle_heroku_state_changed(message, tags) {
  const result = parse_heroku_state_changed(message.message);
  if (!result) {
    return [];
  }
  return [
    {
      timestamp: message.time,
      name: "heroku_state",
      tags: tags,
      value: DYNO_STATES[result[1]] || -10,
      fields: {
        old_state: result[0],
        new_state: result[1],
      }
    }
  ];
}

function handle_heroku_errors(message, tags) {
  const result = parse_heroku_errors(message.message);
  if (!result) {
    return [];
  }
  return [
    {
      timestamp: message.time,
      name: "heroku_error",
      tags,
      fields: {
        error: result
      },
      value: 1
    }
  ];
}

/**
 * handle structlog
 * @param message structlog-formatted message
 * @param tags tags associated to the message
 * @returns {Array.<*>}
 */
function handle_structlog(message, tags) {
  const [header, jsonPayload] = message.originalMessage.split(" - ");
  const payload = JSON.parse(jsonPayload);
  const all_tags = Object.assign({
    level: payload.level,
  }, tags);
  return [{
    timestamp: message.time,
    name: "app",
    tags: all_tags,
    value: 1,
    fields: dot(_.omit(payload, 'level')),
  }];
}

/**
 * Convert a syslog message to a influxDB point
 * @param message syslog ( glossy ) message
 * @param source string source of the log ( drain )
 * @param tags Object tags
 * @returns Array of influx IPoint
 */
function message_to_points(message, source, tags={}) {
  const all_tags = Object.assign({}, tags, {
    app: message.appName,
    source: source
  });
  if (message.pid) {
    all_tags["process"] = message.pid.split(".")[0];
  }
  let result = [];
  if (message.appName === "app") {
    result = handle_structlog(message, all_tags);
  } else {
    if (message.message.indexOf("sample#") !== -1) {
      result = handle_heroku_runtime_metrics(message, all_tags);
    } else if (message.message.indexOf("protocol=https") !== -1) {
      result = handle_heroku_router(message, all_tags);
    } else if (message.message.indexOf("created by user") !== -1) {
      result = handle_heroku_release(message, all_tags);
    } else if (message.message.indexOf("State changed from") !== -1) {
      result = handle_heroku_state_changed(message, all_tags);
    } else if ((message.message.indexOf("Error ") === 0) ||
               (message.message.indexOf("at=error code=")) === 0) {
      result = handle_heroku_errors(message, all_tags);
    }
  }
  // ensure "source" was not changed, by re-setting it.
  result.forEach((p) => {
    if (p.tags) {
      p.tags.source = source;
    }
  });
  return result;
}


/**
 * Process heroku log from a request body as text
 * @param body : String, message body
 * @param source : String, source of the message
 * @param tags : Object key values tags
 * @returns {Promise}
 */
exports.process_heroku_log = function process_heroku_log(body, source, tags={}) {
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
      const message = buffer.substring(new_pos + 1, new_pos + len + 1).trim();
      messages.push(syslogParser.parse(message));
      pos = new_pos + len + 1;
      new_pos = body.indexOf(" ", pos);
    }
    log.debug(`messages=${JSON.stringify(messages, null, 4)}`);
    const points = messages
          .map((m) => message_to_points(m, source, tags))
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
