"use strict";

process.env.DEBUG_SYSLOG = "true";


const request = require('supertest');
const assert = require("assert");


const auth = process.env.ACCESS_TOKEN = "fake-one";


describe('Syslog drain server', function () {
    let server;

    beforeEach(function () {
        server = require('../src/server').start_server(3125);
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
            .post('/logs/test-source/')
            .auth(auth, '')
            .set('Content-Type', 'application/logplex-1')
            .send(message)
            .expect(204)
            .then(() => {
                return request(server)
                    .get("/metrics")
                    .auth(auth, '');
            })
            .then((res) => {
                assert.notEqual(res.text.indexOf(`service_dataset_count{host="host",app="app",source="test-source"} 19071`), -1);
            });
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
                const gauge = server.registry.getSingleMetric("heroku_state");
                assert.ok(gauge);
            })
    })
});