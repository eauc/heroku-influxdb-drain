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
        const message = `79 <2>1 2012-11-30T06:45:29+00:00 host app - - sample#service.dataset_count=19071`;
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
});