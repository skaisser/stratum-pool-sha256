/**
 * @module node-stratum-pool
 * @description Main entry point for the Stratum pool server library.
 * Provides factory methods to create mining pool instances and exposes key modules.
 * 
 * @example
 * const stratum = require('node-stratum-pool');
 * 
 * const pool = stratum.createPool({
 *     coin: {
 *         name: 'Bitcoin',
 *         symbol: 'BTC',
 *         algorithm: 'sha256'
 *     },
 *     address: 'yourPoolAddress',
 *     ports: {
 *         3333: { diff: 8 }
 *     },
 *     daemons: [{
 *         host: '127.0.0.1',
 *         port: 8332,
 *         user: 'rpcuser',
 *         password: 'rpcpass'
 *     }]
 * }, function(ip, workerName, password, callback){
 *     // Custom authorization function
 *     callback(true); // authorized
 * });
 * 
 * pool.start();
 */

var net = require('net');
var events = require('events');

//Gives us global access to everything we need for each hashing algorithm
require('./algoProperties.js');

var pool = require('./pool.js');

/**
 * Daemon interface module for RPC communication.
 * @type {module:daemon}
 */
exports.daemon = require('./daemon.js');

/**
 * Variable difficulty module for automatic difficulty adjustment.
 * @type {module:varDiff}
 */
exports.varDiff = require('./varDiff.js');

/**
 * Creates a new mining pool instance.
 * 
 * @function createPool
 * @param {Object} poolOptions - Pool configuration options
 * @param {Function} authorizeFn - Worker authorization callback
 * @returns {Pool} New pool instance
 */
exports.createPool = function(poolOptions, authorizeFn){
    var newPool = new pool(poolOptions, authorizeFn);
    return newPool;
};
