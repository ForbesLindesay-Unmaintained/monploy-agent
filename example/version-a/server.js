'use strict';

var express = require('express');
var app = express();

app.get('/', function (req, res) {
  res.send('I am example version-a\n' + JSON.stringify(process.env, null, '    ') + '\n');
});
app.listen(process.env.PORT || 3010);
