var http = require('http');
var cp = require('child_process');
var events = require('events');

var async = require('async');

// Constants for security and reliability
const REQUEST_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // Initial retry delay in ms

// Whitelist of allowed RPC methods
const ALLOWED_RPC_METHODS = [
    'getinfo', 'getmininginfo', 'getblocktemplate', 'submitblock',
    'validateaddress', 'getaddressinfo', 'getbalance', 'getpeerinfo',
    'getnetworkinfo', 'getrawtransaction', 'sendrawtransaction',
    'getblock', 'getblockcount', 'getblockhash', 'getblockheader',
    'gettransaction', 'getwork', 'help', 'stop', 'getgenerate',
    'gethashespersec', 'getdifficulty', 'getnetworkhashps',
    'setgenerate', 'getaccountaddress', 'getaccount',
    'importprivkey', 'dumpprivkey', 'keypoolrefill',
    'walletpassphrase', 'walletlock', 'sendtoaddress',
    'sendfrom', 'sendmany', 'addmultisigaddress', 'getreceivedbyaddress',
    'getreceivedbyaccount', 'listreceivedbyaddress', 'listreceivedbyaccount',
    'backupwallet', 'encryptwallet', 'walletpassphrasechange', 'getnewaddress',
    'signmessage', 'verifymessage', 'listaccounts', 'listaddressgroupings',
    'settxfee', 'listsinceblock', 'listtransactions', 'listlockunspent',
    'listunspent', 'lockunspent', 'move', 'createmultisig', 'createrawtransaction',
    'decoderawtransaction', 'decodescript', 'fundrawtransaction', 'signrawtransaction',
    'signrawtransactionwithkey', 'signrawtransactionwithwallet',
    'getrawchangeaddress', 'gettxout', 'gettxoutsetinfo', 'getblockchaininfo',
    'verifychain', 'getbestblockhash', 'getconnectioncount', 'ping',
    'addnode', 'getaddednodeinfo', 'getchaintips', 'getmempoolinfo',
    'getrawmempool', 'getmempoolentry', 'prioritisetransaction',
    'estimatefee', 'estimatepriority', 'estimatesmartfee', 'estimatesmartpriority'
];

/**
 * The daemon interface interacts with the coin daemon by using the rpc interface.
 * in order to make it work it needs, as constructor, an array of objects containing
 * - 'host'    : hostname where the coin lives
 * - 'port'    : port where the coin accepts rpc connections
 * - 'user'    : username of the coin for the rpc interface
 * - 'password': password for the rpc interface of the coin
**/

function DaemonInterface(daemons, logger){

    //private members
    var _this = this;
    logger = logger || function(severity, message){
        console.log(severity + ': ' + message);
    };


    var instances = (function(){
        for (var i = 0; i < daemons.length; i++)
            daemons[i]['index'] = i;
        return daemons;
    })();


    function init(){
        isOnline(function(online){
            if (online)
                _this.emit('online');
        });
    }

    function isOnline(callback){
        cmd('getpeerinfo', [], function(results){
            var allOnline = results.every(function(result){
                return !results.error;
            });
            callback(allOnline);
            if (!allOnline)
                _this.emit('connectionFailed', results);
        });
    }


    function validateInput(method, params) {
        // Validate method name
        if (typeof method !== 'string' || method.length === 0) {
            return { valid: false, error: 'Invalid method name' };
        }
        
        // Check if method is in whitelist
        if (!ALLOWED_RPC_METHODS.includes(method)) {
            return { valid: false, error: 'Method not allowed: ' + method };
        }
        
        // Validate params is an array
        if (!Array.isArray(params)) {
            return { valid: false, error: 'Parameters must be an array' };
        }
        
        // Validate parameter types and values
        for (var i = 0; i < params.length; i++) {
            var param = params[i];
            
            // Check for potentially dangerous values
            if (typeof param === 'string') {
                // Prevent injection attacks
                if (param.includes('\n') || param.includes('\r')) {
                    return { valid: false, error: 'Invalid parameter: contains newline' };
                }
                // Limit string length
                if (param.length > 10000) {
                    return { valid: false, error: 'Parameter too long' };
                }
            }
            
            // Validate numbers
            if (typeof param === 'number') {
                if (!isFinite(param)) {
                    return { valid: false, error: 'Invalid number parameter' };
                }
            }
        }
        
        return { valid: true };
    }

    function performHttpRequest(instance, jsonData, callback, retryCount){
        retryCount = retryCount || 0;
        
        var options = {
            hostname: (typeof(instance.host) === 'undefined' ? '127.0.0.1' : instance.host),
            port    : instance.port,
            method  : 'POST',
            auth    : instance.user + ':' + instance.password,
            headers : {
                'Content-Length': jsonData.length,
                'Content-Type': 'application/json'
            },
            timeout: REQUEST_TIMEOUT
        };

        var parseJson = function(res, data){
            var dataJson;

            if (res.statusCode === 401){
                logger('error', 'Unauthorized RPC access - invalid RPC username or password');
                return;
            }

            try{
                dataJson = JSON.parse(data);
            }
            catch(e){
                if (data.indexOf(':-nan') !== -1){
                    data = data.replace(/:-nan,/g, ":0");
                    parseJson(res, data);
                    return;
                }
                logger('error', 'Could not parse rpc data from daemon instance  ' + instance.index
                    + '\nRequest Data: ' + jsonData
                    + '\nReponse Data: ' + data);

            }
            if (dataJson)
                callback(dataJson.error, dataJson, data);
        };

        var req = http.request(options, function(res) {
            var data = '';
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                data += chunk;
            });
            res.on('end', function(){
                parseJson(res, data);
            });
        });

        req.on('error', function(e) {
            if (e.code === 'ECONNREFUSED') {
                callback({type: 'offline', message: e.message}, null);
            } else if ((e.code === 'ETIMEDOUT' || e.code === 'ESOCKETTIMEDOUT') && retryCount < MAX_RETRIES) {
                // Retry with exponential backoff
                var delay = RETRY_DELAY * Math.pow(2, retryCount);
                logger('warn', 'Request timeout, retrying in ' + delay + 'ms (attempt ' + (retryCount + 1) + '/' + MAX_RETRIES + ')');
                setTimeout(function() {
                    performHttpRequest(instance, jsonData, callback, retryCount + 1);
                }, delay);
            } else {
                callback({type: 'request error', message: e.message}, null);
            }
        });
        
        req.on('timeout', function() {
            req.abort();
            logger('warn', 'Request timeout after ' + REQUEST_TIMEOUT + 'ms');
        });

        req.end(jsonData);
    }



    //Performs a batch JSON-RPC command - only uses the first configured rpc daemon
    /* First argument must have:
     [
         [ methodName, [params] ],
         [ methodName, [params] ]
     ]
     */

    function batchCmd(cmdArray, callback){

        var requestJson = [];

        for (var i = 0; i < cmdArray.length; i++){
            // Validate each command
            var validation = validateInput(cmdArray[i][0], cmdArray[i][1]);
            if (!validation.valid) {
                callback({type: 'validation error', message: validation.error}, null);
                return;
            }
            
            requestJson.push({
                method: cmdArray[i][0],
                params: cmdArray[i][1],
                id: Date.now() + Math.floor(Math.random() * 10) + i
            });
        }

        var serializedRequest = JSON.stringify(requestJson);

        performHttpRequest(instances[0], serializedRequest, function(error, result){
            callback(error, result);
        });

    }

    /* Sends a JSON RPC (http://json-rpc.org/wiki/specification) command to every configured daemon.
       The callback function is fired once with the result from each daemon unless streamResults is
       set to true. */
    function cmd(method, params, callback, streamResults, returnRawData){
        // Validate input
        var validation = validateInput(method, params);
        if (!validation.valid) {
            var error = {type: 'validation error', message: validation.error};
            if (streamResults) {
                callback({error: error, response: null, instance: null});
            } else {
                callback([{error: error, response: null, instance: null}]);
            }
            return;
        }

        var results = [];

        async.each(instances, function(instance, eachCallback){

            var itemFinished = function(error, result, data){

                var returnObj = {
                    error: error,
                    response: (result || {}).result,
                    instance: instance
                };
                if (returnRawData) returnObj.data = data;
                if (streamResults) callback(returnObj);
                else results.push(returnObj);
                eachCallback();
                itemFinished = function(){};
            };

            var requestJson = JSON.stringify({
                method: method,
                params: params,
                id: Date.now() + Math.floor(Math.random() * 10)
            });

            performHttpRequest(instance, requestJson, function(error, result, data){
                itemFinished(error, result, data);
            });


        }, function(){
            if (!streamResults){
                callback(results);
            }
        });

    }


    //public members

    this.init = init;
    this.isOnline = isOnline;
    this.cmd = cmd;
    this.batchCmd = batchCmd;
}

DaemonInterface.prototype.__proto__ = events.EventEmitter.prototype;

exports.interface = DaemonInterface;
