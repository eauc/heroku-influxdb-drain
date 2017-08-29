"use strict";

const log = require('loglevel');
const server = require('./server');


const PORT = parseInt(process.env.PORT || "3030");
const LOG_LEVEL = process.env.LOG_LEVEL || "info";


log.setLevel(LOG_LEVEL);

server.start_server(PORT);
