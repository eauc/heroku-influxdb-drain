# Heroku log draining prometheus exporter

## Environment variable configuration

### ```PORT```

port on what the server is listening to receive heroku log drain


### ```LOG_LEVEL```

Change log level, set to 'info' for default.


### ```ACCESS_TOKEN```


(optional) if set this will check for a basic auth username name ACCESS_TOKEN


i.e. https://ACCESS_TOKEN@my-server/logs/:source/


## Setup

### Enable heroku https log drains

    $ heroku drains:add https://ACCESS_TOKEN@mylogdrain.herokuapp.com/logs/:source/ --app APP_NAME


### Enable heroku runtime metrics

    $ heroku labs:enable log-runtime-metrics --app APP_NAME


## Local testing

Start your server

     npm start

Send fake data

     curl -X POST -H "Content-Type: application/logplex-1" --data @./samples/sample0.txt  http://jojo@localhost:3030/logs/test/ -v

Get back data

    curl http://jojo@localhost:3030/metrics/