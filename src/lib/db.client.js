/**
 * @fileOverview A simple example module that exposes a getClient function.
 *
 * The client is replaced if it is disconnected.
 */

var style = require('ansi-styles');
var mysql = require('mysql');
var q = require('q');
const { color } = require('../utils');

var schema;

var pool = mysql.createPool({
  host     : process.env.DB_HOST || 'localhost',
  port     : process.env.DB_PORT || '3000',
  user     : process.env.DB_USER || 'root',
  password : process.env.DB_PASSWORD || 'root',
  database : (schema = process.env.DB_SCHEMA || null),
  connectionLimit: 100,
  multipleStatements: true
});

let totalConnections = 0;

pool.on('connection', function () {
  totalConnections += 1;
  // console.log('new connection made:', totalConnections, 'active');
});

pool.on('enqueue', function () {
  console.log('waiting for available connection slot');
});

const cyan = color('cyan');
const green = color('green');

const log = (str, params) => {
  let formattedStr = str;
  if (params) {
    formattedStr = mysql.format(str, params);
  }
  const notification = (/^\w+/).exec(formattedStr);
  if (process.env.DEBUG) {
    return formattedStr.replace(/( [A-Z_]+|[A-Z_]+ )/g, (s, m) => cyan(m));
  }
  return notification ? cyan(notification[0]) : 'QUERY: null';
};

const spinner = () => {
  if (!process.env.DEBUG) {
    return () => {};
  }
  const start = new Date();
  let count = 0;
  let interval = null;
  let spinning = false;
  const character = ['\\', '|', '/', '-', '\\', '|', '/', '-'];
  const startSpinning = () => {
    interval = setInterval(() => {
      process.stdout.write(`\r${character[count % 8]}`);
      count += 1;
    }, 75);
    spinning = true;
  };
  const delay = setTimeout(startSpinning, 10000);
  return () => {
    if (spinning) {
      clearInterval(interval);
    } else {
      clearTimeout(delay);
    }
    green(`\r${Math.round((Number(new Date()) - start) / 1000).toString()} sec`);
  };
};

exports.schema = schema;

exports.escapeKey = pool.escapeId.bind(pool);
exports.escapeValue = value => {
  if (value === 'NULL') {
    return value;
  }
  return pool.escape(value);
};

exports.ping = function() {
  return new Promise((resolve, reject) => {
    pool.getConnection(function(err, connection) {
      if (err) {
        return reject(err);
      }
      connection.ping(function() {
        if (err) {
          reject(err);
        }
        console.log('connected to mysql:', exports.getDate());
        connection.release();
        resolve();
      });
    });
  });
};

exports.getClient = function(cbFn) {
  pool.getConnection(function(err, connection) {
    cbFn(connection);
  });
};

exports.formatQuery = function(str, params) {
  var queryString = mysql.format(str, params);
  return queryString;
};

exports.query = function (str, params, silent = false) {
  return new Promise((resolve, reject) => {
    pool.getConnection(function(err, connection) {
      if (err) {
        return reject(err);
      }

      if (!silent) {
        console.log(log(str, params));
      }
      const interval = spinner();
      connection.query(str, params, function(error, data) {
        interval();
        if (error) {
          return reject(error);
        }
        resolve(data);
        connection.release();
      });
    });
  });
};

exports.close = function(callbackFn) {
  setTimeout(() => pool.end(callbackFn), 0);
};

exports.getDate = function(dayShift) {
  var date;
  date = new Date();
  date.setDate(date.getDate() + (dayShift || 0));
  date = date.getUTCFullYear() + '-' +
    ('00' + (date.getUTCMonth() + 1)).slice(-2) + '-' +
    ('00' + date.getUTCDate()).slice(-2) + ' ' +
    ('00' + date.getUTCHours()).slice(-2) + ':' +
    ('00' + date.getUTCMinutes()).slice(-2) + ':' +
    ('00' + date.getUTCSeconds()).slice(-2);

  return date;
};
