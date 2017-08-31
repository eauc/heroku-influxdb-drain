"use strict";

const request = require('supertest');
const assert = require("assert");
const log = require('loglevel');

log.setLevel("silent");



describe('Push log server', function () {
    let server;

    beforeEach(function () {
        server = require('../src/server').start_server(3124);
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

});