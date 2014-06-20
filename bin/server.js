'use strict';

var fs = require('fs');
var path = require('path');
var bouncy = require('bouncy');
var express = require('express');
var body = require('body-parser');
var forever = require('forever');
var api = express();

var config = JSON.parse(fs.readFileSync('configuration.json', 'utf8'));
var PORT = config.port || 3000;
var API_PORT = config['api-port'] || 3001;

function direct(req, bounce) {
  var host = req.headers.host;
  if (config.hosts[host] && config.hosts[host].port) {
    console.log('bounce ' + config.hosts[host].port);
    return bounce(config.hosts[host].port);
  } else {
    return bounce(API_PORT);
  }
}

var updatedTimeout;
function updated() {
  clearTimeout(updatedTimeout);
  updatedTimeout = setTimeout(function () {
    fs.writeFile('configuration.json', JSON.stringify(config, null, '  '), function (err) {
      // todo handle this better
      if (err) throw err;
    });
  }, 200);
}
var toKill = [];
var processingKillList = false;
function processKillList() {
  if (processingKillList) return;
  processingKillList = true;
  function next() {
    if (toKill.length) {
      var kill = toKill.shift();
      forever.list(null, function (err, processes) {
        var stopped = (processes || []).some(function (p) {
          if (p.uid === kill.uid) {
            forever.stop(kill.uid);
            delete config.ports[kill.port];
            updated();
            return true;
          } else {
            return false;
          }
        });
        if (stopped) return setTimeout(next, 2000);
        else return next();
      });
    } else {
      processingKillList = false;
    }
  }
  next();
}
function check() {
  forever.list(null, function (err, processes) {
    if (err) throw err; // todo: fix thiss
    var running = (processes || []).filter(function (proc) {
      return proc.sourceDir.substr(0, process.cwd().length) === process.cwd();
    }).map(function (proc) {
      return proc.sourceDir;
    });
    var portsInActiveUse = [];
    Object.keys(config.hosts).map(function (host) {
      return config.hosts[host];
    }).filter(function (host) {
      return host.location;
    }).forEach(function (host) {
      var folder = path.resolve(host.location);
      if (running.indexOf(folder) === -1) {
        var port = 3005;
        while (config.ports[port]) {
          port++;
        }
        var env = {};
        Object.keys(host.env || {}).forEach(function (key) {
          env[key] = host.env[key];
        });
        env.PORT = port;
        // see https://github.com/nodejitsu/forever-monitor for options
        var monitor = forever.startDaemon('server.js', {
          sourceDir: folder,
          cwd: folder,
          uid: 'mongo_agent_' + port,
          env: env
        });
        config.ports[port] = {uid: 'mongo_agent_' + port, port: port};
        portsInActiveUse.push(port);
        updated();
        setTimeout(function () {
          host.port = port;
          updated();
        }, 1000);
      } else {
        portsInActiveUse.push(host.port);
      }
    });
    var uids = (processes || []).map(function (p) { return p.uid; });
    Object.keys(config.ports).forEach(function (port) {
      if (uids.indexOf(config.ports[port].uid) === -1 && portsInActiveUse.indexOf(+port) === -1) {
        delete config.ports[port];
        updated();
      } else if (portsInActiveUse.indexOf(+port) === -1) {
        if (config.ports[port].killAfter && config.ports[port].killAfter < Date.now()) {
          toKill.push(config.ports[port]);
          processKillList();
        } else if (!config.ports[port].killAfter) {
          config.ports[port].killAfter = Date.now() + 10000;
          updated();
        }
      }
    });
  });
}

api.use(function (req, res, next) {
  // todo: authentication
  next();
});
api.get('/hosts', function (req, res, next) {
  res.json(config.hosts);
});
api.get('/list', function (req, res, next) {
  check();
  forever.list(null, function (err, processes) {
    if (err) return next(err);
    res.json(processes.map(function (p) {
      return {sourceDir: p.sourceDir, uid: p.uid};
    }));
  });
});
api.post('/start', body.json(), function (req, res, next) {
  assert(typeof req.body.host === 'string');
  assert(typeof req.body.location === 'string');
  assert(typeof req.body.env === 'object');
  config.hosts[req.body.host] = config.hosts[req.body.host] || {};
  config.hosts[req.body.host].location = req.body.location;
  config.hosts[req.body.host].env = req.body.env;
  check();
  setTimeout(function () {
    res.send(200);
  }, 1000);
});


api.listen(API_PORT);
bouncy(direct).listen(PORT);
check();
