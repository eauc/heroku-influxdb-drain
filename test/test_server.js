"use strict";

const request = require('supertest');
const assert = require("assert");
const log = require('loglevel');

log.setLevel("silent");

const auth = process.env.ACCESS_TOKEN = "fake-one";


describe('Push log server', function () {
    let server;

    beforeEach(function () {
        server = require('../src/server').start_server(3124);
    });

    afterEach(function () {
        server.close();
    });

    it('should be able to post logs via /push-post/SOURCE/', () => {
        return request(server)
            .post('/push-logs/test-source/')
            .auth(auth, '')
            .set('Accept', 'application/json')
            .send([
                {
                    "name": "metric_one",
                    "value": 123.4,
                    "labels": {
                        "one": "1",
                        "two": "2"
                    }
                }
            ])
            .expect(204)
            .then(() => {
                return request(server)
                    .get("/metrics")
                    .auth(auth, '');
            })
            .then((res) => {
                assert.notEqual(res.text.indexOf(`metric_one{one="1",two="2",source="test-source"} 123.4`), -1);
            });
    });

    it('401 without authorization', () => {
        return request(server)
            .get('/')
            .expect(401);
    });

    it('404 everything else', function testPath() {
        return request(server)
            .get('/')
            .auth(auth, '')
            .expect(404);
    });
});