#!/usr/bin/env node

var forever = require('forever');
var request = require('then-request');

var command = process.argv[2];

function start() {
  // see https://github.com/nodejitsu/forever-monitor for options
  forever.startDaemon('server.js', {
    sourceDir: __dirname,
    cwd: process.cwd(),
    uid: 'monploy-agent'
  });
}
function stop() {
  forever.list(null, function (err, processes) {
    if (err) throw err;
    if ((processes || []).some(function (proc, index) {
      if (proc.uid === 'monploy_agent') {
        forever.stop(index);
        return true;
      } else {
        return false;
      }
    })) {
      setTimeout(stop, 1000);
    } else {
      console.log('stopped');
    }
  });
}

switch (command) {
  case 'start':
    start();
    break;
  case 'stop':
    stop();
    break;
  case 'list':
    request('http://localhost:3000/list').done(function (res) {
      console.dir(JSON.parse(res.getBody()));
    });
    break;
}
