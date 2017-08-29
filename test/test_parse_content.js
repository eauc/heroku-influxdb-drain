const assert = require('assert');
const worker = require("../src/syslog_drain");
const log = require('loglevel');

log.setLevel("silent", true);


describe('Heroku log parser', function() {

    it('should be able to parse log with a valid content', function() {
        const message = `83 <40>1 2012-11-30T06:45:29+00:00 host app web.3 - State changed from starting to up
119 <40>1 2012-11-30T06:45:26+00:00 host app web.3 - Starting process with command \`bundle exec rackup config.ru -p 24405\`
323 <2>1 2017-08-22T06:40:26+00:00 host app web.3 - source=web.1 dyno=heroku.55681600.4fce2580-ea9f-492a-8837-a6f161bae67b sample#memory_total=254.70MB sample#memory_rss=242.35MB sample#memory_cache=3.37MB sample#memory_swap=8.99MB sample#memory_pgpgin=134057pages sample#memory_pgpgout=89550pages sample#memory_quota=512.00MB`;
        return worker.process_heroku_log(message, "test-source")
            .then((points) => {
                assert.equal(points.length, 7);
                const table = points.reduce((acc, v) => {
                    acc[v.name] = v;
                    return acc;
                }, {});
                assert.deepEqual(table.memory_total.labels, {
                    host: 'host', app: 'app', source: 'test-source'
                });
                assert.deepEqual(table.memory_total.value, 267072307);
                const all = points.map((p) => p.name).sort();
                assert.deepEqual(all, [
                    'memory_cache',
                    'memory_pgpgin',
                    'memory_pgpgout',
                    'memory_quota',
                    'memory_rss',
                    'memory_swap',
                    'memory_total'
                ]);
            });
    });

    it('should reject bad formatted logs', function() {
        const message = `83 <40>1 2012-11-30T06:45:29+00:00 host app web.3 - State changed from starting to up
110 <40>1 2012-11-30T06:45:26+00:00 host app web.3 - Starting process with command \`bundle exec rackup config.ru -p 24405\`
323 <2>1 2017-08-22T06:40:26+00:00 host app web.3 - source=web.1 dyno=heroku.55681600.4fce2580-ea9f-492a-8837-a6f161bae67b sample#memory_total=254.70MB sample#memory_rss=242.35MB sample#memory_cache=3.37MB sample#memory_swap=8.99MB sample#memory_pgpgin=134057pages sample#memory_pgpgout=89550pages sample#memory_quota=512.00MB`;
        return worker.process_heroku_log(message, "test-source")
            .then((points) => {
                assert.equal(points.length, 0);
            })
    });

    it('should raise if a log is empty', function() {
        const message = ``;
        return worker.process_heroku_log(message, "test-source")
            .then((points) => {
                assert.equal(points.length, 0);
            })
    });
});