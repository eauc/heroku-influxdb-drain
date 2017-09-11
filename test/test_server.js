"use strict";

const request = require('supertest');
const assert = require("assert");
const log = require('loglevel');
const influx = require("../src/influx_adaptor");

log.setLevel("silent");

const auth = process.env.ACCESS_TOKEN = "fake-one";


describe('Push log server', function () {
    let server;
    let influx_points;

    beforeEach(function () {
        server = require('../src/server').start_server(3124);
        influx_points = null;
        influx._set_debug_writer((p) => {
            influx_points = p;
        });
    });

    afterEach(function () {
        server.close();
    });

    it('404 on root /', () => {
        return request(server)
            .get('/')
            .expect(404);
    });

    it('200 on /status/', function testPath() {
        return request(server)
            .get('/status/')
            .expect(200);
    });

    describe('influxdb', () => {
        it('401 on POST /influx/write without authorization', function testPath() {
            return request(server)
                .post('/influx/write/test-source?env=production')
                .set('Content-Type', 'application/json')
                .send([{}])
                .expect(401);
        });

        it('204 on POST /influx/write with authorization', function testPath() {
            return request(server)
                .post('/influx/write/test-source?env=production')
                .set('Content-Type', 'application/json')
                .auth(auth, '')
                .send([{
                    measurement: 'response_times',
                    fields: {
                        path: "/test",
                        duration: 1778
                    },
                    tags: {
                        'host': "localhost"
                    }
                }])
                .expect(204)
                .then(() => {
                    assert.equal(influx_points.length, 1);
                    const p0 = influx_points[0];
                    assert.equal(p0.measurement, "response_times");
                    assert.deepEqual(p0.tags, {
                        'host': "localhost",
                        source: "test-source",
                        env: "production"
                    });
                    assert.deepEqual(p0.fields, {
                        path: "/test",
                        duration: 1778
                    });
                });
        });

        it('should filter empty tags', function testPath() {
            return request(server)
                .post('/influx/write/test-source?env=production')
                .set('Content-Type', 'application/json')
                .auth(auth, '')
                .send([{
                    measurement: 'response_times',
                    fields: {
                        path: "/test",
                        duration: 1778
                    },
                    tags: {
                        'wrong': "",
                        'host': "localhost"
                    }
                }])
                .expect(204)
                .then(() => {
                    assert.equal(influx_points.length, 1);
                    const p0 = influx_points[0];
                    assert.equal(p0.measurement, "response_times");
                    assert.deepEqual(p0.tags, {
                        'host': "localhost",
                        source: "test-source",
                        env: "production"
                    });
                    assert.deepEqual(p0.fields, {
                        path: "/test",
                        duration: 1778
                    });
                });
        });
    })
});