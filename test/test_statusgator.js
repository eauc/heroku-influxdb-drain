"use strict";

const request = require('supertest');
const assert = require("assert");
const log = require('loglevel');
const influx = require("../src/influx_adaptor");

log.setLevel("silent");


describe('Statusgator webhook', function () {
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



    it('200 on POST /statusgator', function testPath() {
        return request(server)
            .post('/statusgator/')
            .set('Content-Type', 'application/x-www-form-urlencoded')
            .send({
                "service_name": "Papertrail",
                "favicon_url": "https://dwxjd9cd6rwno.cloudfront.net/favicons/papertrail.ico",
                "status_page_url": "http://www.papertrailstatus.com",
                "home_page_url": "https://papertrailapp.com",
                "current_status": "warn",
                "last_status": "up",
                "occurred_at": "2015-04-15T16:48:52+00:00"
            })
            .expect(204)
            .then(() => {
                assert.equal(influx_points.length, 1);
                const p0 = influx_points[0];
                assert.equal(p0.measurement, "cloud_status");
                assert.deepEqual(p0.tags, {
                    service_name: "Papertrail",
                    current_status: "warn",
                    last_status: "up"
                });
                assert.deepEqual(p0.fields, {
                    status: -1
                });
            });
    });
});