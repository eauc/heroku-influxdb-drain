"use strict";

process.env.DEBUG_SYSLOG = "true";


const request = require('supertest');
const assert = require("assert");
const influx = require("../src/influx_adaptor");


const auth = process.env.ACCESS_TOKEN = "fake-one";
const log = require('loglevel');

log.setLevel("error");

function values(obj) {
    return Object.keys(obj).map((k) => obj[k]);
}

describe('Syslog drain server', function () {
    let server;
    let influx_points = null;

    beforeEach(function () {
        server = require('../src/server').start_server(3125);
        influx_points = null;
        influx._set_debug_writer((p) => {
            influx_points = p;
        });
    });

    afterEach(function () {
        server.close();
    });

    function pushMessage(message) {
        return request(server)
            .post('/logs/test-source/')
            .auth(auth, '')
            .set('Content-Type', 'application/logplex-1')
            .send(message)
            .expect(204);
    }

    it('should be able to post logs via /logs/SOURCE/', () => {
        const message = `91 <2>1 2012-11-30T06:45:29+00:00 host app - - tag#x=hello sample#service.dataset_count=19071`;
        return request(server)
            .post('/logs/test-source/?env=testing')
            .auth(auth, '')
            .set('Content-Type', 'application/logplex-1')
            .send(message)
            .expect(204)
            .then(() => {
                assert.equal(influx_points.length, 2);
                const p0 = influx_points[0];
                assert.equal(p0.measurement, "service_dataset_count");
                assert.deepEqual(p0.tags, {
                    env: 'testing',
                    app: 'app',
                    x: 'hello',
                    source: 'test-source'
                });
                assert.deepEqual(p0.fields, {
                    value: 19071
                });
                const p1 = influx_points[1];
                assert.equal(p1.measurement, "metrics_received");
                assert.deepEqual(p1.tags, {
                    env: 'testing',
                    source: 'test-source',
                    type: 'syslog'
                });
                assert.deepEqual(p1.fields, {
                    value: 1,
                    state: 1
                });
            })
    });

    it('should be able to collect syslog metrics', () => {
        const message = `79 <2>1 2012-11-30T06:45:29+00:00 host app - - sample#service.dataset_count=19071`;
        return request(server)
            .post('/logs/test-source/')
            .auth(auth, '')
            .set('Content-Type', 'application/logplex-1')
            .send(message)
            .expect(204)
            .then(() => {
                return request(server)
                    .get("/_syslog_debug/test-source/")
                    .auth(auth, '');
            })
            .then((res) => {
                assert.notEqual(res.text.indexOf(message), -1);
            });
    });

    it("should be able to parse state changes", () => {
        return pushMessage(`102 <45>1 2017-08-30T07:11:32.216326+00:00 host heroku scheduler.9200 - State changed from starting to up`)
            .then(() => {
                const p0 = influx_points[0];
                assert.equal(p0.measurement, "heroku_state");
                assert.deepEqual(p0.tags, {
                    app: 'heroku',
                    source: 'test-source',
                    process: 'scheduler',
                    pid: 'scheduler.9200'
                });
                assert.deepEqual(p0.timestamp, new Date("2017-08-30T07:11:32.216326+00:00"));
                assert.deepEqual(p0.fields, {
                    value: 2,
                    old_state: 'starting',
                    new_state: 'up'
                });
            })
    });

    it ("should be able to parse completed state", () => {
        return pushMessage(`102 <45>1 2017-08-30T07:08:55.471533+00:00 host heroku scheduler.6388 - State changed from up to complete`)
            .then(() => {
                assert.equal(influx_points.length, 2);
                const p0 = influx_points[0];
                assert.equal(p0.measurement, "heroku_state");
                assert.deepEqual(p0.tags, {
                    app: 'heroku',
                    source: 'test-source',
                    process: 'scheduler',
                    pid: 'scheduler.6388'
                });
                assert.deepEqual(p0.timestamp, new Date("2017-08-30T07:08:55.471Z"));
                assert.deepEqual(p0.fields, {
                    value: 3,
                    old_state: 'up',
                    new_state: 'complete'
                });
            })
    });

    it ("should be able to parse heroku route", () => {
        return pushMessage(`310 <158>1 2017-08-31T14:43:56.612173+00:00 host heroku router - at=info method=GET path="/api/profiles/f61aa57d-1913-4a10-bc1d-0759e9566de0/" host=api-staging.myotest.cloud request_id=b9337f92-c562-4a76-8d85-b530cda7d7c2 fwd="188.60.67.169" dyno=web.1 connect=0ms service=10ms status=401 bytes=315 protocol=https
`)
            .then(() => {
                assert.equal(influx_points.length, 2);
                const p0 = influx_points[0];
                assert.equal(p0.measurement, "router_access_time");
                assert.deepEqual(p0.tags,  {
                    method: 'get',
                    status: 401,
                    path: '/api/profiles/f61aa57d-1913-4a10-bc1d-0759e9566de0/',
                    ip: '188.60.67.169',
                    app: 'heroku',
                    source: 'test-source',
                    process: 'router',
                    pid: 'router'
                });
                assert.deepEqual(p0.timestamp, new Date("2017-08-31T14:43:56.612173+00:00"));
                assert.deepEqual(p0.fields, {
                    duration: 10,
                    size: 315,
                    count: 1
                });
            })
    });

    it("should generate errors from heroku dyno", () => {
        const message = `142 <172>1 2017-08-31T14:47:14+00:00 host heroku logplex - Error L10 (output buffer overflow): 2 messages dropped since 2017-08-31T14:44:12+00:00.203 <45>1 2017-08-31T14:47:13.830178+00:00 host heroku web.1 - source=web.1 dyno=heroku.55681600.b0bc8784-5574-4f35-9508-5ea02d47d251 sample#load_avg_1m=0.00 sample#load_avg_5m=0.00 sample#load_avg_15m=0.00
334 <45>1 2017-08-31T14:47:13.830269+00:00 host heroku web.1 - source=web.1 dyno=heroku.55681600.b0bc8784-5574-4f35-9508-5ea02d47d251 sample#memory_total=201.71MB sample#memory_rss=190.07MB sample#memory_cache=0.33MB sample#memory_swap=11.30MB sample#memory_pgpgin=88604pages sample#memory_pgpgout=53146pages sample#memory_quota=512.00MB`;
        return pushMessage(message)
            .then(() => {
                assert.equal(influx_points.length, 12);
                const p0 = influx_points[0];
                assert.equal(p0.measurement, "heroku_error");
                assert.deepEqual(p0.tags,   {
                    app: 'heroku',
                    source: 'test-source',
                    process: 'logplex',
                    error: 'L10',
                    pid: 'logplex'
                });
                assert.deepEqual(p0.timestamp, new Date("2017-08-31T14:47:14.000Z"));
                assert.deepEqual(p0.fields, {
                    count: 1,
                    error: 'L10'
                });

                const p1 = influx_points[1];
                assert.equal(p1.measurement, "load_avg_1m");
                assert.deepEqual(p1.tags,   {
                    app: 'heroku',
                    source: 'test-source',
                    process: 'web',
                    pid: 'web.1'
                });
                assert.deepEqual(p1.timestamp, new Date("2017-08-31T14:47:13.830Z"));
                assert.deepEqual(p1.fields, {
                    value: 0.00
                });
            });
    });
    it("should generate errors from heroku router", () => {
        const message = `263 <158>1 2018-03-29T14:18:26.133358+00:00 host heroku router - at=error code=H10 desc="App crashed" method=GET path="/" host=scrooge.niteo.co request_id=7a2a1014-6826-4d46-86b0-db4668cbf8c0 fwd="77.208.20.53" dyno= connect= service= status=503 bytes= protocol=http`;
        return pushMessage(message)
            .then(() => {
                assert.equal(influx_points.length, 2);
                const p0 = influx_points[0];
                assert.equal(p0.measurement, "heroku_error");
                assert.deepEqual(p0.tags,   {
                    app: 'heroku',
                    source: 'test-source',
                    process: 'router',
                    error: 'H10',
                    pid: 'router'
                });
                assert.deepEqual(p0.timestamp, new Date("2018-03-29T14:18:26.133Z"));
                assert.deepEqual(p0.fields, {
                    count: 1,
                    error: 'H10'
                });
            });
    });
});
