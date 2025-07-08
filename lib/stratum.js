/**
 * @module stratum
 * @description Implements the Stratum mining protocol for cryptocurrency pools.
 * Handles client connections, message validation, and mining operations.
 */

var net = require('net');
var events = require('events');

var util = require('./util.js');

// Constants for input validation
var MAX_STRING_LENGTH = 1024;
var MAX_ARRAY_LENGTH = 100;
var ALLOWED_METHODS = [
    'mining.subscribe',
    'mining.authorize',
    'mining.submit',
    'mining.get_transactions',
    'mining.configure',
    'mining.extranonce.subscribe'
];


/**
 * Generates unique subscription IDs for Stratum clients.
 * The ID consists of a fixed prefix followed by a counter.
 * 
 * @class SubscriptionCounter
 * @private
 */
var SubscriptionCounter = function(){
    var count = 0;
    var padding = 'deadbeefcafebabe';
    return {
        next: function(){
            count++;
            if (Number.MAX_VALUE === count) count = 0;
            return padding + util.packInt64LE(count).toString('hex');
        }
    };
};


/**
 * Represents a connected Stratum mining client.
 * Handles all communication with individual miners.
 * 
 * @class StratumClient
 * @extends {EventEmitter}
 * @param {Object} options - Client configuration
 * @param {net.Socket} options.socket - Network socket for the client
 * @param {Object} options.banning - Ban configuration settings
 * @param {string} options.subscriptionId - Unique subscription ID
 * @param {Object} options.authorizeFn - Function to authorize workers
 * 
 * @fires StratumClient#subscription - When client subscribes
 * @fires StratumClient#submit - When client submits a share
 * @fires StratumClient#malformedMessage - On invalid message format
 * @fires StratumClient#socketError - On socket errors
 * @fires StratumClient#socketTimeout - On socket timeout
 * @fires StratumClient#socketDisconnect - When socket disconnects
 * @fires StratumClient#triggerBan - When client should be banned
 */
var StratumClient = function(options){
    var pendingDifficulty = null;
    //private members
    this.socket = options.socket;

    this.remoteAddress = options.socket.remoteAddress;

    var banning = options.banning;

    var _this = this;

    this.lastActivity = Date.now();

    this.shares = {valid: 0, invalid: 0};

    var considerBan = (!banning || !banning.enabled) ? function(){ return false } : function(shareValid){
        if (shareValid === true) _this.shares.valid++;
        else _this.shares.invalid++;
        var totalShares = _this.shares.valid + _this.shares.invalid;
        if (totalShares >= banning.checkThreshold){
            var percentBad = (_this.shares.invalid / totalShares) * 100;
            if (percentBad < banning.invalidPercent) //reset shares
                this.shares = {valid: 0, invalid: 0};
            else {
                _this.emit('triggerBan', _this.shares.invalid + ' out of the last ' + totalShares + ' shares were invalid');
                _this.socket.destroy();
                return true;
            }
        }
        return false;
    };

    /**
     * Initialize the Stratum client by setting up the socket
     * @returns {undefined}
     */
    this.init = function init(){
        setupSocket();
    };

    /**
     * Validates a stratum message
     * @param {Object} message Stratum message
     * @returns {Object} Validation result
     * @property {Boolean} valid True if the message is valid
     * @property {String|undefined} error Error message if the message is invalid
     */
    function validateMessage(message){
        // Basic structure validation
        if (!message || typeof message !== 'object') {
            return { valid: false, error: 'Invalid message format' };
        }

        // Validate method
        if (!message.method || typeof message.method !== 'string') {
            return { valid: false, error: 'Missing or invalid method' };
        }

        if (!ALLOWED_METHODS.includes(message.method)) {
            return { valid: false, error: 'Unknown method: ' + message.method };
        }

        // Validate id
        if (message.id !== null && message.id !== undefined) {
            if (typeof message.id !== 'string' && typeof message.id !== 'number') {
                return { valid: false, error: 'Invalid message id type' };
            }
            if (typeof message.id === 'string' && message.id.length > MAX_STRING_LENGTH) {
                return { valid: false, error: 'Message id too long' };
            }
        }

        // Validate params
        if (message.params !== undefined) {
            if (!Array.isArray(message.params)) {
                return { valid: false, error: 'Params must be an array' };
            }
            if (message.params.length > MAX_ARRAY_LENGTH) {
                return { valid: false, error: 'Too many parameters' };
            }

            // Validate each parameter
            for (var i = 0; i < message.params.length; i++) {
                var param = message.params[i];

                // Check string parameters
                if (typeof param === 'string') {
                    if (param.length > MAX_STRING_LENGTH) {
                        return { valid: false, error: 'Parameter ' + i + ' too long' };
                    }
                    // Check for null bytes or control characters
                    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(param)) {
                        return { valid: false, error: 'Invalid characters in parameter ' + i };
                    }
                }

                // Check arrays
                if (Array.isArray(param) && param.length > MAX_ARRAY_LENGTH) {
                    return { valid: false, error: 'Parameter ' + i + ' array too long' };
                }
            }
        }

        return { valid: true };
    }

    /**
     * Handles an incoming Stratum message. Emits a 'unknownStratumMethod'
     * event if the method is not implemented.
     *
     * @param {Object} message - Stratum message object
     * @private
     */
    function handleMessage(message){
        switch(message.method){
            case 'mining.subscribe':
                handleSubscribe(message);
                break;
            case 'mining.authorize':
                handleAuthorize(message, true /*reply to socket*/);
                break;
            case 'mining.submit':
                _this.lastActivity = Date.now();
                handleSubmit(message);
                break;
            case 'mining.get_transactions':
                sendJson({
                    id     : null,
                    result : [],
                    error  : true
                });
                break;
            case 'mining.configure':
                // Handle ASICBoost configuration
                handleConfigure(message);
                break;
            case 'mining.extranonce.subscribe':
                // MRR and other proxies need extranonce subscription support
                _this.extranonceSubscribed = true;
                sendJson({
                    id: message.id,
                    result: true,  // Enable extranonce subscription for MRR compatibility
                    error: null
                });
                break;
            case 'mining.set_version_mask':
                // BIP 310: Client acknowledging version mask update
                // This is a notification response, no reply needed
                break;
            default:
                _this.emit('unknownStratumMethod', message);
                break;
        }
    }

    /**
     * Handles a mining.subscribe stratum message
     * @param {Object} message - Stratum message object
     * @fires StratumClient#subscription
     * @private
     */
    function handleSubscribe(message){
        if (! _this._authorized ) {
            _this.requestedSubscriptionBeforeAuth = true;
        }
        _this.emit('subscription',
            {},
            function(error, extraNonce1, extraNonce2Size){
                if (error){
                    sendJson({
                        id: message.id,
                        result: null,
                        error: error
                    });
                    return;
                }
                _this.extraNonce1 = extraNonce1;
                sendJson({
                    id: message.id,
                    result: [
                        [
                            ["mining.set_difficulty", options.subscriptionId],
                            ["mining.notify", options.subscriptionId]
                        ],
                        extraNonce1,
                        extraNonce2Size
                    ],
                    error: null
                });
            }
        );
    }

    function handleAuthorize(message, replyToSocket){
        _this.workerName = message.params[0];
        _this.workerPass = message.params[1];
        options.authorizeFn(_this.remoteAddress, options.socket.localPort, _this.workerName, _this.workerPass, function(result) {
            _this.authorized = (!result.error && result.authorized);

            if (replyToSocket) {
                sendJson({
                        id     : message.id,
                        result : _this.authorized,
                        error  : result.error
                    });
            }

            // Set custom difficulty if provided in password
            if (result.difficulty && result.difficulty > 0) {
                _this.enqueueNextDifficulty(result.difficulty);
                // Send difficulty immediately for NiceHash compatibility
                sendJson({
                    id: null,
                    method: "mining.set_difficulty",
                    params: [result.difficulty]
                });
            }

            // If the authorizer wants us to close the socket lets do it.
            if (result.disconnect === true) {
                options.socket.destroy();
            }
        });
    }

    /**
     * Handles ASICBoost configuration message per BIP 310.
     *
     * @param {Object} message - Stratum message with parameters
     *
     * @returns {undefined}
     */
    function handleConfigure(message){
        // BIP 310 compliant mining.configure response
        var supported = {};

        // Validate parameters according to BIP 310
        if (!message.params || !Array.isArray(message.params) || message.params.length < 1) {
            sendJson({
                id: message.id,
                result: {},
                error: null
            });
            return;
        }

        var extensions = message.params[0];
        var extensionParams = message.params[1] || {};

        // Extensions must be an array per BIP 310
        if (!Array.isArray(extensions)) {
            sendJson({
                id: message.id,
                result: {},
                error: null
            });
            return;
        }

        // Process version-rolling extension if requested
        if (extensions.includes("version-rolling")) {
            // Get pool's allowed version mask (default to permissive mask for rental rigs)
            var poolVersionMask = options.versionMask || 0x3fffe000;
            
            // Get client's requested mask if provided
            var clientRequestedMask = extensionParams["version-rolling.mask"];
            var clientMinBitCount = extensionParams["version-rolling.min-bit-count"] || 16;
            
            // Calculate negotiated mask (intersection of pool and client masks)
            var negotiatedMask = poolVersionMask;
            if (clientRequestedMask) {
                var clientMask = parseInt(clientRequestedMask, 16);
                if (!isNaN(clientMask)) {
                    // Intersection: only bits allowed by both pool and client
                    negotiatedMask = poolVersionMask & clientMask;
                }
            }
            
            // Count bits in negotiated mask
            var bitCount = 0;
            var temp = negotiatedMask;
            while (temp) {
                bitCount += temp & 1;
                temp >>>= 1;
            }
            
            // Only enable if we have enough bits for the client
            if (bitCount >= clientMinBitCount) {
                supported["version-rolling"] = true;
                supported["version-rolling.mask"] = negotiatedMask.toString(16);
                supported["version-rolling.min-bit-count"] = bitCount;
                
                // Store negotiated mask on client for later use
                _this.asicboost = true;
                _this.versionMask = negotiatedMask;
            } else {
                // Not enough bits available after intersection
                supported["version-rolling"] = false;
            }
        }

        // Process other extensions if needed (placeholder for future extensions)
        if (extensions.includes("minimum-difficulty")) {
            var minDiff = extensionParams["minimum-difficulty.value"];
            if (minDiff && minDiff > 0) {
                supported["minimum-difficulty"] = true;
                supported["minimum-difficulty.value"] = minDiff;
                _this.minimumDifficulty = minDiff;
            }
        }

        if (extensions.includes("subscribe-extranonce")) {
            supported["subscribe-extranonce"] = true;
            _this.supportsExtranonceSubscribe = true;
        }

        sendJson({
            id: message.id,
            result: supported,
            error: null
        });
    }

    /**
     * Handles mining.submit messages from clients.
     *
     * @param {Object} message - Stratum message with parameters
     *
     * @returns {undefined}
     */
    function handleSubmit(message){
        if (!_this.authorized){
            sendJson({
                id    : message.id,
                result: null,
                error : [24, "unauthorized worker", null]
            });
            considerBan(false);
            return;
        }
        if (!_this.extraNonce1){
            sendJson({
                id    : message.id,
                result: null,
                error : [25, "not subscribed", null]
            });
            considerBan(false);
            return;
        }

        // Validate submit parameters
        if (!message.params || message.params.length < 5) {
            sendJson({
                id    : message.id,
                result: null,
                error : [20, "missing submit parameters", null]
            });
            considerBan(false);
            return;
        }

        // Validate each parameter
        var workerName = message.params[0];
        var jobId = message.params[1];
        var extraNonce2 = message.params[2];
        var nTime = message.params[3];
        var nonce = message.params[4];
        var version = message.params[5]; // Optional for ASICBoost

        // Validate types and formats
        if (typeof workerName !== 'string' || workerName.length > 128) {
            sendJson({
                id    : message.id,
                result: null,
                error : [20, "invalid worker name", null]
            });
            considerBan(false);
            return;
        }

        if (typeof jobId !== 'string' || !jobId.match(/^[0-9a-fA-F]+$/)) {
            sendJson({
                id    : message.id,
                result: null,
                error : [20, "invalid job id", null]
            });
            considerBan(false);
            return;
        }

        if (typeof extraNonce2 !== 'string' || !extraNonce2.match(/^[0-9a-fA-F]+$/)) {
            sendJson({
                id    : message.id,
                result: null,
                error : [20, "invalid extranonce2", null]
            });
            considerBan(false);
            return;
        }

        if (typeof nTime !== 'string' || !nTime.match(/^[0-9a-fA-F]{8}$/)) {
            sendJson({
                id    : message.id,
                result: null,
                error : [20, "invalid ntime", null]
            });
            considerBan(false);
            return;
        }

        if (typeof nonce !== 'string' || !nonce.match(/^[0-9a-fA-F]{8}$/)) {
            sendJson({
                id    : message.id,
                result: null,
                error : [20, "invalid nonce", null]
            });
            considerBan(false);
            return;
        }

        // Validate version if provided (ASICBoost)
        if (version !== undefined && version !== null) {
            if (typeof version !== 'string' || !version.match(/^[0-9a-fA-F]{8}$/)) {
                sendJson({
                    id    : message.id,
                    result: null,
                    error : [20, "invalid version", null]
                });
                considerBan(false);
                return;
            }
        }
        _this.emit('submit',
            {
                name        : message.params[0],
                jobId       : message.params[1],
                extraNonce2 : message.params[2],
                nTime       : message.params[3],
                nonce       : message.params[4],
                version     : message.params[5],  // ASICBoost version rolling
                versionMask : _this.versionMask   // BIP 310 negotiated mask
            },
            function(error, result){
                if (!considerBan(result)){
                    sendJson({
                        id: message.id,
                        result: result,
                        error: error
                    });
                }
            }
        );

    }

    /**
     * Helper function to send JSON data to the stratum client.
     * Can be given any number of arguments, which are JSON.stringified
     * and written to the socket with a newline appended to each argument.
     * @param {...Object} data - Data to send to the client.
     * @return {undefined}
     */
    function sendJson(){
        var response = '';
        for (var i = 0; i < arguments.length; i++){
            response += JSON.stringify(arguments[i]) + '\n';
        }
        options.socket.write(response);
    }

    /**
     * Set up the socket and associated event listeners.
     *
     * @emits socketDisconnect
     * @emits socketError
     * @emits socketFlooded
     * @emits tcpProxyError
     * @emits malformedMessage
     * @emits checkBan
     */
    function setupSocket(){
        var socket = options.socket;
        var dataBuffer = '';
        socket.setEncoding('utf8');

        if (options.tcpProxyProtocol === true) {
            socket.once('data', function (d) {
                if (d.indexOf('PROXY') === 0) {
                    _this.remoteAddress = d.split(' ')[2];
                }
                else{
                    _this.emit('tcpProxyError', d);
                }
                _this.emit('checkBan');
            });
        }
        else{
            _this.emit('checkBan');
        }
        socket.on('data', function(d){
            dataBuffer += d;
            if (Buffer.byteLength(dataBuffer, 'utf8') > 10240){ //10KB
                dataBuffer = '';
                _this.emit('socketFlooded');
                socket.destroy();
                return;
            }
            if (dataBuffer.indexOf('\n') !== -1){
                var messages = dataBuffer.split('\n');
                var incomplete = dataBuffer.slice(-1) === '\n' ? '' : messages.pop();
                messages.forEach(function(message){
                    if (message === '') return;
                    var messageJson;
                    try {
                        messageJson = JSON.parse(message);
                    } catch(e) {
                        if (options.tcpProxyProtocol !== true || d.indexOf('PROXY') !== 0){
                            _this.emit('malformedMessage', message);
                            socket.destroy();
                        }
                        return;
                    }

                    if (messageJson) {
                        var validation = validateMessage(messageJson);
                        if (!validation.valid) {
                            _this.emit('malformedMessage', message + ' - ' + validation.error);
                            sendJson({
                                id: messageJson.id || null,
                                result: null,
                                error: [20, validation.error, null]
                            });
                            considerBan(false);
                            return;
                        }
                        handleMessage(messageJson);
                    }
                });
                dataBuffer = incomplete;
            }
        });
        socket.on('close', function() {
            _this.emit('socketDisconnect');
        });
        socket.on('error', function(err){
            if (err.code !== 'ECONNRESET')
                _this.emit('socketError', err);
        });
    }


    /**
     * Return a string identifying this connection, of the form:
     * <workerName> [<ipAddress>]
     * If the worker is unauthorized, <workerName> will be "(unauthorized)"
     * @return {string}
     */
    this.getLabel = function(){
        return (_this.workerName || '(unauthorized)') + ' [' + _this.remoteAddress + ']';
    };

    /**
     * Queues a new difficulty for the next time the client requests a difficulty.
     * This is useful for when the upstream pool changes its difficulty.
     * @param {number} requestedNewDifficulty - The new difficulty to send to the client
     * @return {boolean} - Always true
     */
    this.enqueueNextDifficulty = function(requestedNewDifficulty) {
        pendingDifficulty = requestedNewDifficulty;
        return true;
    };

    //public members

    /**
     * IF the given difficulty is valid and new it'll send it to the client.
     * returns boolean
     **/
    this.sendDifficulty = function(difficulty){
        if (difficulty === this.difficulty)
            return false;

        _this.previousDifficulty = _this.difficulty;
        _this.difficulty = difficulty;
        sendJson({
            id    : null,
            method: "mining.set_difficulty",
            params: [difficulty]//[512],
        });
        return true;
    };

    /**
     * Send a new mining job to the client.
     *
     * If the client hasn't submitted a share in a while, this will disconnect the client.
     * If there's a pending difficulty, it'll send that first.
     * @param {array} jobParams - The parameters for the mining.notify method, typically [jobId, prevHash, coinb1, coinb2, merkleBranch, version, bits, target, timestamp, cleanJobs]
     * @return {undefined}
     */
    this.sendMiningJob = function(jobParams){

        var lastActivityAgo = Date.now() - _this.lastActivity;
        if (lastActivityAgo > options.connectionTimeout * 1000){
            _this.emit('socketTimeout', 'last submitted a share was ' + (lastActivityAgo / 1000 | 0) + ' seconds ago');
            _this.socket.destroy();
            return;
        }

        if (pendingDifficulty !== null){
            var result = _this.sendDifficulty(pendingDifficulty);
            pendingDifficulty = null;
            if (result) {
                _this.emit('difficultyChanged', _this.difficulty);
            }
        }
        sendJson({
            id    : null,
            method: "mining.notify",
            params: jobParams
        });

    };

    /**
     * Updates the version mask for this client (BIP 310).
     * Sends a mining.set_version_mask notification to the client.
     * @param {number} newMask - The new version mask to use
     * @return {boolean} - True if client supports version rolling
     */
    this.setVersionMask = function(newMask) {
        if (!_this.asicboost) {
            return false;
        }
        
        _this.versionMask = newMask;
        sendJson({
            id: null,
            method: "mining.set_version_mask",
            params: [newMask.toString(16)]
        });
        return true;
    };

    /**
     * Manually authorizes the client with the given username and password.
     * This is useful in tests where you want to connect a client to the pool
     * programatically.
     * @param {string} username - The username to authorize with
     * @param {string} password - The password to authorize with
     */
    this.manuallyAuthClient = function (username, password) {
        handleAuthorize({id: 1, params: [username, password]}, false /*do not reply to miner*/);
    };

    /**
     * Copy the extraNonce1, previousDifficulty and difficulty from another StratumClient instance.
     * @param {StratumClient} otherClient - The other StratumClient instance to copy from.
     */
    this.manuallySetValues = function (otherClient) {
        _this.extraNonce1        = otherClient.extraNonce1;
        _this.previousDifficulty = otherClient.previousDifficulty;
        _this.difficulty         = otherClient.difficulty;
    };
};
StratumClient.prototype.__proto__ = events.EventEmitter.prototype;




/**
 * The Stratum protocol server implementation.
 * Manages multiple ports, client connections, and mining job broadcasts.
 * 
 * @class StratumServer
 * @extends {EventEmitter}
 * @param {Object} options - Server configuration
 * @param {Object} options.ports - Port configurations (port number -> config)
 * @param {number} options.connectionTimeout - Client connection timeout (ms)
 * @param {number} options.jobRebroadcastTimeout - Job rebroadcast timeout (seconds)
 * @param {Object} [options.banning] - IP banning configuration
 * @param {boolean} options.banning.enabled - Whether banning is enabled
 * @param {number} options.banning.time - Ban duration in seconds
 * @param {number} options.banning.purgeInterval - Interval to purge old bans
 * @param {boolean} [options.tcpProxyProtocol] - Whether to use HAProxy PROXY protocol
 * @param {Function} authorizeFn - Function to authorize workers
 * 
 * @fires StratumServer#client.connected - When a new miner connects
 * @fires StratumServer#client.disconnected - When a miner disconnects
 * @fires StratumServer#started - When the server is up and running
 * @fires StratumServer#broadcastTimeout - When job broadcast timeout occurs
 * @fires StratumServer#bootedBannedWorker - When a banned worker is kicked
 */
var StratumServer = exports.Server = function StratumServer(options, authorizeFn){

    //private members

    //ports, connectionTimeout, jobRebroadcastTimeout, banning, haproxy, authorizeFn

    var bannedMS = options.banning ? options.banning.time * 1000 : null;

    var _this = this;
    var stratumClients = {};
    var subscriptionCounter = SubscriptionCounter();
    var rebroadcastTimeout;
    var bannedIPs = {};


    /**
     * Check if the client is banned and act accordingly.
     * If banned, it will be disconnected and receive a 'kickedBannedIP' event.
     * If the ban has expired, the client will receive a 'forgaveBannedIP' event.
     * @param {StratumClient} client - The stratum client to check.
     */
    function checkBan(client){
        if (options.banning && options.banning.enabled && client.remoteAddress in bannedIPs){
            var bannedTime = bannedIPs[client.remoteAddress];
            var bannedTimeAgo = Date.now() - bannedTime;
            var timeLeft = bannedMS - bannedTimeAgo;
            if (timeLeft > 0){
                client.socket.destroy();
                client.emit('kickedBannedIP', timeLeft / 1000 | 0);
            }
            else {
                delete bannedIPs[client.remoteAddress];
                client.emit('forgaveBannedIP');
            }
        }
    }

    /**
     * Handle a new incoming client connection.
     * This method is called for every new client and returns the subscriptionId for the client.
     * @param {net.Socket} socket - The new client socket.
     * @returns {String} The subscriptionId for the client.
     */
    this.handleNewClient = function (socket){

        socket.setKeepAlive(true);
        var subscriptionId = subscriptionCounter.next();
        var client = new StratumClient(
            {
                subscriptionId: subscriptionId,
                authorizeFn: authorizeFn,
                socket: socket,
                banning: options.banning,
                connectionTimeout: options.connectionTimeout,
                tcpProxyProtocol: options.tcpProxyProtocol
            }
        );

        stratumClients[subscriptionId] = client;
        _this.emit('client.connected', client);
        client.on('socketDisconnect', function() {
            _this.removeStratumClientBySubId(subscriptionId);
            _this.emit('client.disconnected', client);
        }).on('checkBan', function(){
            checkBan(client);
        }).on('triggerBan', function(){
            _this.addBannedIP(client.remoteAddress);
        }).init();
        return subscriptionId;
    };


    /**
     * Broadcasts a new mining job to all connected clients.
     * @param {Object} jobParams - The parameters of the new mining job.
     * @fires StratumServer#broadcastTimeout
     * @see {@link StratumClient#sendMiningJob}
     */
    this.broadcastMiningJobs = function(jobParams){
        for (var clientId in stratumClients) {
            var client = stratumClients[clientId];
            client.sendMiningJob(jobParams);
        }
        /* Some miners will consider the pool dead if it doesn't receive a job for around a minute.
           So every time we broadcast jobs, set a timeout to rebroadcast in X seconds unless cleared. */
        clearTimeout(rebroadcastTimeout);
        rebroadcastTimeout = setTimeout(function(){
            _this.emit('broadcastTimeout');
        }, (options.jobRebroadcastTimeout || 55) * 1000);
    };



    (function init(){

        //Interval to look through bannedIPs for old bans and remove them in order to prevent a memory leak
        if (options.banning && options.banning.enabled){
            setInterval(function(){
                for (ip in bannedIPs){
                    var banTime = bannedIPs[ip];
                    if (Date.now() - banTime > options.banning.time)
                        delete bannedIPs[ip];
                }
            }, 1000 * options.banning.purgeInterval);
        }


        //SetupBroadcasting();


        var serversStarted = 0;
        Object.keys(options.ports).forEach(function(port){
            net.createServer({allowHalfOpen: false}, function(socket) {
                _this.handleNewClient(socket);
            }).listen(parseInt(port), function() {
                serversStarted++;
                if (serversStarted == Object.keys(options.ports).length)
                    _this.emit('started');
            });
        });
    })();


    //public members

    /**
     * Bans a given IP address.
     * @param {String} ipAddress - The IP address of the client to ban.
     * @fires StratumServer#bootedBannedWorker
     */
    this.addBannedIP = function(ipAddress){
        bannedIPs[ipAddress] = Date.now();
        /*for (var c in stratumClients){
            var client = stratumClients[c];
            if (client.remoteAddress === ipAddress){
                _this.emit('bootedBannedWorker');
            }
        }*/
    };

    /**
     * Returns an object with all currently connected clients, where the keys are the subscriptionIds
     * and the values are StratumClient instances.
     * @return {Object} The object with all currently connected clients.
     */
    this.getStratumClients = function () {
        return stratumClients;
    };

    /**
     * Removes a client from the list of connected clients by its subscriptionId.
     * @param {String} subscriptionId - The subscriptionId of the client to remove.
     */
    this.removeStratumClientBySubId = function (subscriptionId) {
        delete stratumClients[subscriptionId];
    };

    /**
     * Manually adds a stratum client to the pool's list of connected clients. Useful for testing.
     * @param {Object} clientObj - An object containing the following properties:
     *                              - `socket`: The socket object of the client.
     *                              - `workerName`: The worker name of the client.
     *                              - `workerPass`: The worker password of the client.
     */
    this.manuallyAddStratumClient = function(clientObj) {
        var subId = _this.handleNewClient(clientObj.socket);
        if (subId != null) { // not banned!
            stratumClients[subId].manuallyAuthClient(clientObj.workerName, clientObj.workerPass);
            stratumClients[subId].manuallySetValues(clientObj);
        }
    };

};
StratumServer.prototype.__proto__ = events.EventEmitter.prototype;
