var events = require('events');
var async = require('async');

var varDiff = require('./varDiff.js');
var daemon = require('./daemon.js');
var peer = require('./peer.js');
var stratum = require('./stratum.js');
var jobManager = require('./jobManager.js');
var util = require('./util.js');

/*process.on('uncaughtException', function(err) {
    console.log(err.stack);
    throw err;
});*/

/**
 * Main pool orchestrator class that manages all components of a Stratum mining pool.
 * This class coordinates the daemon interface, job management, stratum server, and
 * handles the overall pool lifecycle.
 *
 * @class Pool
 * @extends {EventEmitter}
 * @param {Object} options - Pool configuration options
 * @param {Object} options.coin - Coin-specific configuration
 * @param {string} options.coin.name - Name of the cryptocurrency
 * @param {string} options.coin.symbol - Symbol of the cryptocurrency
 * @param {string} options.coin.algorithm - Mining algorithm (e.g., 'sha256', 'scrypt')
 * @param {string} options.coin.reward - Reward type ('POW' or 'POS')
 * @param {boolean} [options.coin.asicboost] - Whether ASICBoost is enabled
 * @param {string} options.address - Pool's address for receiving rewards
 * @param {Object} options.ports - Port configurations for Stratum connections
 * @param {Object} options.daemons - Array of daemon connection configurations
 * @param {number} [options.blockRefreshInterval] - Interval for polling new blocks (ms)
 * @param {Object} [options.p2p] - P2P network configuration
 * @param {Object} [options.api] - API configuration
 * @param {Function} authorizeFn - Function to authorize workers
 *
 * @fires Pool#started - When the pool has successfully started
 * @fires Pool#share - When a share is submitted (valid or invalid)
 * @fires Pool#difficultyUpdate - When a client's difficulty is updated
 * @fires Pool#log - For all logging events
 * @fires Pool#banIP - When an IP should be banned
 */
var pool = module.exports = function pool(options, authorizeFn){

    this.options = options;
    
    // Set default values if not provided
    if (!options.jobRebroadcastTimeout) {
        options.jobRebroadcastTimeout = 55;
    }

    var _this = this;
    var blockPollingIntervalId;


    var emitLog        = function(text) { _this.emit('log', 'debug'  , text); };
    var emitWarningLog = function(text) { _this.emit('log', 'warning', text); };
    var emitErrorLog   = function(text) { _this.emit('log', 'error'  , text); };
    var emitSpecialLog = function(text) { _this.emit('log', 'special', text); };



    if (!(options.coin.algorithm in algos)){
        emitErrorLog('The ' + options.coin.algorithm + ' hashing algorithm is not supported.');
        throw new Error();
    }



    /**
     * Starts the mining pool by initializing all components in the correct order.
     * This includes setting up daemons, job management, stratum server, and other services.
     *
     * @method start
     * @fires Pool#started - Emitted when the pool has successfully started
     */
    this.start = function(){
        SetupVarDiff();
        SetupApi();
        SetupDaemonInterface(function(){
            DetectCoinData(function(){
                SetupRecipients();
                SetupJobManager();
                OnBlockchainSynced(function(){
                    GetFirstJob(function(){
                        SetupBlockPolling();
                        SetupPeer();
                        StartStratumServer(function(){
                            OutputPoolInfo();
                            _this.emit('started');
                        });
                    });
                });
            });
        });
    };



    /**
     * Gets the first job to be sent to clients upon startup.
     * If getblocktemplate fails, the pool will not start.
     *
     * @method GetFirstJob
     * @param {Function} finishedCallback - Called when first job is retrieved
     *
     * @fires Pool#log - If network difficulty is lower than a port's difficulty
     */
    function GetFirstJob(finishedCallback){

        GetBlockTemplate(function(error, result){
            if (error) {
                emitErrorLog('Error with getblocktemplate on creating first job, server cannot start');
                return;
            }

            var portWarnings = [];

            var networkDiffAdjusted = options.initStats.difficulty;

            Object.keys(options.ports).forEach(function(port){
                var portDiff = options.ports[port].diff;
                if (networkDiffAdjusted < portDiff)
                    portWarnings.push('port ' + port + ' w/ diff ' + portDiff);
            });

            //Only let the first fork show synced status or the log wil look flooded with it
            if (portWarnings.length > 0 && (!process.env.forkId || process.env.forkId === '0')) {
                var warnMessage = 'Network diff of ' + networkDiffAdjusted + ' is lower than '
                    + portWarnings.join(' and ');
                emitWarningLog(warnMessage);
            }

            finishedCallback();

        });
    }


    /**
     * Prints out a formatted string containing information about the pool.
     * Only one fork will print this out to avoid log spam.
     *
     * @method OutputPoolInfo
     * @fires Pool#log - Emits a specialized log message with pool information
     *
     * @private
     */
    function OutputPoolInfo(){

        var startMessage = 'Stratum Pool Server Started for ' + options.coin.name +
            ' [' + options.coin.symbol.toUpperCase() + '] {' + options.coin.algorithm + '}';
        if (process.env.forkId && process.env.forkId !== '0'){
            emitLog(startMessage);
            return;
        }
        var infoLines = [startMessage,
                'Network Connected:\t' + (options.testnet ? 'Testnet' : 'Mainnet'),
                'Detected Reward Type:\t' + options.coin.reward,
                'Current Block Height:\t' + _this.jobManager.currentJob.rpcData.height,
                'Current Connect Peers:\t' + options.initStats.connections,
                'Current Block Diff:\t' + _this.jobManager.currentJob.difficulty * algos[options.coin.algorithm].multiplier,
                'Network Difficulty:\t' + options.initStats.difficulty,
                'Network Hash Rate:\t' + util.getReadableHashRateString(options.initStats.networkHashRate),
                'Stratum Port(s):\t' + _this.options.initStats.stratumPorts.join(', '),
                'Pool Fee Percent:\t' + _this.options.feePercent + '%'
        ];

        if (typeof options.blockRefreshInterval === "number" && options.blockRefreshInterval > 0)
            infoLines.push('Block polling every:\t' + options.blockRefreshInterval + ' ms');

        emitSpecialLog(infoLines.join('\n\t\t\t\t\t\t'));
    }


    /**
     * Periodically checks if the daemon is synced with the network by calling `getblocktemplate` and checking
     * for errors. If the daemon is not synced, then it will log a message and wait 5 seconds before
     * checking again. If the daemon is synced, then it will call the `syncedCallback` function.
     *
     * @method OnBlockchainSynced
     * @param {Function} syncedCallback - Called when the daemon is synced with the network
     *
     * @fires Pool#errorLog - Daemon is still syncing with network
     * @fires Pool#warningLog - Downloaded X% of blockchain from Y peers
     * @private
     */
    function OnBlockchainSynced(syncedCallback){

        var checkSynced = function(displayNotSynced){
            _this.daemon.cmd('getblocktemplate', [{"capabilities": [ "coinbasetxn", "workid", "coinbase/append" ], "rules": [ "segwit" ]}], function(results){
                var synced = results.every(function(r){
                    return !r.error || r.error.code !== -10;
                });
                if (synced){
                    syncedCallback();
                }
                else{
                    if (displayNotSynced) displayNotSynced();
                    setTimeout(checkSynced, 5000);

                    //Only let the first fork show synced status or the log wil look flooded with it
                    if (!process.env.forkId || process.env.forkId === '0')
                        generateProgress();
                }

            });
        };
        checkSynced(function(){
            //Only let the first fork show synced status or the log wil look flooded with it
            if (!process.env.forkId || process.env.forkId === '0')
                emitErrorLog('Daemon is still syncing with network (download blockchain) - server will be started once synced');
        });


        var generateProgress = function(){

            var cmd = options.coin.hasGetInfo ? 'getinfo' : 'getblockchaininfo';
            _this.daemon.cmd(cmd, [], function(results) {
                var blockCount = results.sort(function (a, b) {
                    return b.response.blocks - a.response.blocks;
                })[0].response.blocks;

                //get list of peers and their highest block height to compare to ours
                _this.daemon.cmd('getpeerinfo', [], function(results){

                    var peers = results[0].response;
                    var totalBlocks = peers.sort(function(a, b){
                        return b.startingheight - a.startingheight;
                    })[0].startingheight;

                    var percent = (blockCount / totalBlocks * 100).toFixed(2);
                    emitWarningLog('Downloaded ' + percent + '% of blockchain from ' + peers.length + ' peers');
                });

            });
        };

    }


    /**
     * Sets up the API with the given options and starts it
     *
     * @function SetupApi
     * @private
     */
    function SetupApi() {
        if (typeof(options.api) !== 'object' || typeof(options.api.start) !== 'function') {
            return;
        } else {
            options.api.start(_this);
        }
    }


    /**
     * Sets up the p2p block notify if the coin configuration supports it
     *
     * @function SetupPeer
     * @private
     */
    function SetupPeer(){
        if (!options.p2p || !options.p2p.enabled)
            return;

        if (options.testnet && !options.coin.peerMagicTestnet){
            emitErrorLog('p2p cannot be enabled in testnet without peerMagicTestnet set in coin configuration');
            return;
        }
        else if (!options.coin.peerMagic){
            emitErrorLog('p2p cannot be enabled without peerMagic set in coin configuration');
            return;
        }

        _this.peer = new peer(options);
        _this.peer.on('connected', function() {
            emitLog('p2p connection successful');
        }).on('connectionRejected', function(){
            emitErrorLog('p2p connection failed - likely incorrect p2p magic value');
        }).on('disconnected', function(){
            emitWarningLog('p2p peer node disconnected - attempting reconnection...');
        }).on('connectionFailed', function(e){
            emitErrorLog('p2p connection failed - likely incorrect host or port');
        }).on('socketError', function(e){
            emitErrorLog('p2p had a socket error ' + JSON.stringify(e));
        }).on('error', function(msg){
            emitWarningLog('p2p had an error ' + msg);
        }).on('blockFound', function(hash){
            _this.processBlockNotify(hash, 'p2p');
        });
    }


    /**
     * Set up variable difficulty for each port
     * @private
     */
    function SetupVarDiff(){
        _this.varDiff = {};
        Object.keys(options.ports).forEach(function(port) {
            if (options.ports[port].varDiff)
                _this.setVarDiff(port, options.ports[port].varDiff);
        });
    }


    /**
     * Submits a new block to the daemon.
     * Coin daemons either use submitblock or getblocktemplate for submitting new blocks.
     *
     * @function SubmitBlock
     * @param {string} blockHex - Hex-encoded block data to submit
     * @param {Function} callback - Called after block submission attempt
     * @private
     */
    function SubmitBlock(blockHex, callback){

        var rpcCommand, rpcArgs;
        if (options.hasSubmitMethod){
            rpcCommand = 'submitblock';
            rpcArgs = [blockHex];
        }
        else{
            rpcCommand = 'getblocktemplate';
            rpcArgs = [{'mode': 'submit', 'data': blockHex}];
        }


        _this.daemon.cmd(rpcCommand,
            rpcArgs,
            function(results){
                for (var i = 0; i < results.length; i++){
                    var result = results[i];
                    if (result.error) {
                        emitErrorLog('rpc error with daemon instance ' +
                                result.instance.index + ' when submitting block with ' + rpcCommand + ' ' +
                                JSON.stringify(result.error)
                        );
                        return;
                    }
                    else if (result.response === 'rejected') {
                        emitErrorLog('Daemon instance ' + result.instance.index + ' rejected a supposedly valid block');
                        return;
                    }
                }
                emitLog('Submitted Block using ' + rpcCommand + ' successfully to daemon instance(s)');
                callback();
            }
        );

    }


    /**
     * Sets up the reward recipients and calculates the pool fee percentage.
     * Converts addresses to script format for use in generation transactions.
     *
     * @function SetupRecipients
     * @private
     */
    function SetupRecipients(){
        var recipients = [];
        options.feePercent = 0;
        options.rewardRecipients = options.rewardRecipients || {};
        for (var r in options.rewardRecipients){
            var percent = options.rewardRecipients[r];
            var rObj = {
                percent: percent / 100
            };
            try {
                if (r.length === 40)
                    rObj.script = util.miningKeyToScript(r);
                else
                    rObj.script = util.addressToScript(r);
                recipients.push(rObj);
                options.feePercent += percent;
            }
            catch(e){
                emitErrorLog('Error generating transaction output script for ' + r + ' in rewardRecipients');
            }
        }
        if (recipients.length === 0){
            emitErrorLog('No rewardRecipients have been setup which means no fees will be taken');
        }
        options.recipients = recipients;
    }

    /**
     * Initializes the job manager and sets up event handlers for new blocks and shares.
     *
     * @function SetupJobManager
     * @fires Pool#share - When a share is submitted
     * @fires Pool#log - For various logging events
     * @private
     */
    function SetupJobManager(){

        _this.jobManager = new jobManager(options);

        _this.jobManager.on('newBlock', function(blockTemplate){
            //Check if stratumServer has been initialized yet
            if (_this.stratumServer) {
                _this.stratumServer.broadcastMiningJobs(blockTemplate.getJobParams());
            }
        }).on('updatedBlock', function(blockTemplate){
            //Check if stratumServer has been initialized yet
            if (_this.stratumServer) {
                var job = blockTemplate.getJobParams();
                job[8] = false;
                _this.stratumServer.broadcastMiningJobs(job);
            }
        }).on('share', function(shareData, blockHex){
            var isValidShare = !shareData.error;
            var isValidBlock = !!blockHex;
            var emitShare = function(){
                _this.emit('share', isValidShare, isValidBlock, shareData);
            };

            /*
            If we calculated that the block solution was found,
            before we emit the share, lets submit the block,
            then check if it was accepted using RPC getblock
            */
            if (!isValidBlock)
                emitShare();
            else{
                SubmitBlock(blockHex, function(){
                    CheckBlockAccepted(shareData.blockHash, function(isAccepted, tx){
                        isValidBlock = isAccepted;
                        shareData.txHash = tx;
                        emitShare();

                        GetBlockTemplate(function(error, result, foundNewBlock){
                            if (foundNewBlock)
                                emitLog('Block notification via RPC after block submission');
                        });

                    });
                });
            }
        }).on('log', function(severity, message){
            _this.emit('log', severity, message);
        });
    }


    /**
     * Sets up the daemon interface for communication with the cryptocurrency daemon.
     * Validates that at least one daemon is configured.
     *
     * @function SetupDaemonInterface
     * @param {Function} finishedCallback - Called when daemon is online
     * @fires Pool#log - For error and warning messages
     * @private
     */
    function SetupDaemonInterface(finishedCallback){

        if (!Array.isArray(options.daemons) || options.daemons.length < 1){
            emitErrorLog('No daemons have been configured - pool cannot start');
            return;
        }

        _this.daemon = new daemon.interface(options.daemons, function(severity, message){
            _this.emit('log', severity , message);
        });

        _this.daemon.once('online', function(){
            finishedCallback();

        }).on('connectionFailed', function(error){
            emitErrorLog('Failed to connect daemon(s): ' + JSON.stringify(error));

        }).on('error', function(message){
            emitErrorLog(message);

        });

        _this.daemon.init();
    }


    /**
     * Detects coin-specific data from the daemon including address validation,
     * network type, and protocol version. Determines if the coin is POW or POS.
     *
     * @function DetectCoinData
     * @param {Function} finishedCallback - Called when detection is complete
     * @private
     */
    function DetectCoinData(finishedCallback){

        var batchRpcCalls = [
            ['validateaddress', [options.address]],
            ['getdifficulty', []],
            ['getmininginfo', []],
            ['submitblock', []]
        ];

        if (options.coin.hasGetInfo) {
            batchRpcCalls.push(['getinfo', []]);
        } else {
            batchRpcCalls.push(['getblockchaininfo', []], ['getnetworkinfo', []]);
        }
        _this.daemon.batchCmd(batchRpcCalls, function(error, results){
            if (error || !results){
                emitErrorLog('Could not start pool, error with init batch RPC call: ' + JSON.stringify(error));
                return;
            }

            var rpcResults = {};

            for (var i = 0; i < results.length; i++){
                var rpcCall = batchRpcCalls[i][0];
                var r = results[i];
                rpcResults[rpcCall] = r.result || r.error;

                if (rpcCall !== 'submitblock' && (r.error || !r.result)){
                    emitErrorLog('Could not start pool, error with init RPC ' + rpcCall + ' - ' + JSON.stringify(r.error));
                    return;
                }
            }

            if (!rpcResults.validateaddress.isvalid){
                emitErrorLog('Daemon reports address is not valid');
                return;
            }

            if (!options.coin.reward) {
                if (isNaN(rpcResults.getdifficulty) && 'proof-of-stake' in rpcResults.getdifficulty)
                    options.coin.reward = 'POS';
                else
                    options.coin.reward = 'POW';
            }


            /* POS coins must use the pubkey in coinbase transaction, and pubkey is
               only given if address is owned by wallet.*/
            if (options.coin.reward === 'POS' && typeof(rpcResults.validateaddress.pubkey) == 'undefined') {
                emitErrorLog('The address provided is not from the daemon wallet - this is required for POS coins.');
                return;
            }

            options.poolAddressScript = (function(){
                switch(options.coin.reward){
                    case 'POS':
                        return util.pubkeyToScript(rpcResults.validateaddress.pubkey);
                    case 'POW':
                        // For Bitcoin Cash, use scriptPubKey directly if available (handles CashAddr)
                        if (rpcResults.validateaddress.scriptPubKey) {
                            return Buffer.from(rpcResults.validateaddress.scriptPubKey, 'hex');
                        }
                        // Fallback to legacy address parsing
                        return util.addressToScript(rpcResults.validateaddress.address || options.address);
                }
            })();

            options.testnet = options.coin.hasGetInfo ? rpcResults.getinfo.testnet : (rpcResults.getblockchaininfo.chain === 'test') ? true : false;

            options.protocolVersion = options.coin.hasGetInfo ? rpcResults.getinfo.protocolversion : rpcResults.getnetworkinfo.protocolversion;

            var difficulty = options.coin.hasGetInfo ? rpcResults.getinfo.difficulty : rpcResults.getblockchaininfo.difficulty;
            if (typeof(difficulty) == 'object') {
                difficulty = difficulty['proof-of-work'];
            }

            options.initStats = {
                connections: (options.coin.hasGetInfo ? rpcResults.getinfo.connections : rpcResults.getnetworkinfo.connections),
                difficulty: difficulty * algos[options.coin.algorithm].multiplier,
                networkHashRate: rpcResults.getmininginfo.networkhashps
            };


            if (rpcResults.submitblock.message === 'Method not found'){
                options.hasSubmitMethod = false;
            }
            else if (rpcResults.submitblock.code === -1){
                options.hasSubmitMethod = true;
            }
            else {
                emitErrorLog('Could not detect block submission RPC method, ' + JSON.stringify(results));
                return;
            }

            finishedCallback();

        });
    }



    /**
     * Starts the Stratum server and sets up all client event handlers.
     * Broadcasts initial mining jobs once the server is started.
     *
     * @function StartStratumServer
     * @param {Function} finishedCallback - Called when server is started
     * @fires Pool#difficultyUpdate - When client difficulty changes
     * @fires Pool#share - When share is submitted
     * @fires Pool#banIP - When IP should be banned
     * @fires Pool#log - For various client events
     * @private
     */
    function StartStratumServer(finishedCallback){
        _this.stratumServer = new stratum.Server(options, authorizeFn);

        _this.stratumServer.on('started', function(){
            options.initStats.stratumPorts = Object.keys(options.ports);
            _this.stratumServer.broadcastMiningJobs(_this.jobManager.currentJob.getJobParams());
            finishedCallback();

        }).on('broadcastTimeout', function(){
            emitLog('No new blocks for ' + (options.jobRebroadcastTimeout || 55) + ' seconds - updating transactions & rebroadcasting work');

            GetBlockTemplate(function(error, rpcData, processedBlock){
                if (error || processedBlock) return;
                _this.jobManager.updateCurrentJob(rpcData);
            });

        }).on('client.connected', function(client){
            if (typeof(_this.varDiff[client.socket.localPort]) !== 'undefined') {
                _this.varDiff[client.socket.localPort].manageClient(client);
            }

            client.on('difficultyChanged', function(diff){
                _this.emit('difficultyUpdate', client.workerName, diff);

            }).on('subscription', function(params, resultCallback){

                var extraNonce = _this.jobManager.extraNonceCounter.next();
                var extraNonce2Size = _this.jobManager.extraNonce2Size;
                resultCallback(null,
                    extraNonce,
                    extraNonce2Size
                );

                if (typeof(options.ports[client.socket.localPort]) !== 'undefined' && options.ports[client.socket.localPort].diff) {
                    this.sendDifficulty(options.ports[client.socket.localPort].diff);
                } else {
                    this.sendDifficulty(8);
                }

                this.sendMiningJob(_this.jobManager.currentJob.getJobParams());

            }).on('submit', function(params, resultCallback){
                var result =_this.jobManager.processShare(
                    params.jobId,
                    client.previousDifficulty,
                    client.difficulty,
                    client.extraNonce1,
                    params.extraNonce2,
                    params.nTime,
                    params.nonce,
                    client.remoteAddress,
                    client.socket.localPort,
                    params.name,
                    params.version,      // ASICBoost version parameter
                    params.versionMask   // Negotiated mask
                );

                resultCallback(result.error, result.result ? true : null);

            }).on('malformedMessage', function (message) {
                emitWarningLog('Malformed message from ' + client.getLabel() + ': ' + message);

            }).on('socketError', function(err) {
                emitWarningLog('Socket error from ' + client.getLabel() + ': ' + JSON.stringify(err));

            }).on('socketTimeout', function(reason){
                emitWarningLog('Connected timed out for ' + client.getLabel() + ': ' + reason)

            }).on('socketDisconnect', function() {
                //emitLog('Socket disconnected from ' + client.getLabel());

            }).on('kickedBannedIP', function(remainingBanTime){
                emitLog('Rejected incoming connection from ' + client.remoteAddress + ' banned for ' + remainingBanTime + ' more seconds');

            }).on('forgaveBannedIP', function(){
                emitLog('Forgave banned IP ' + client.remoteAddress);

            }).on('unknownStratumMethod', function(fullMessage) {
                emitLog('Unknown stratum method from ' + client.getLabel() + ': ' + fullMessage.method);

            }).on('socketFlooded', function() {
                emitWarningLog('Detected socket flooding from ' + client.getLabel());

            }).on('tcpProxyError', function(data) {
                emitErrorLog('Client IP detection failed, tcpProxyProtocol is enabled yet did not receive proxy protocol message, instead got data: ' + data);

            }).on('bootedBannedWorker', function(){
                emitWarningLog('Booted worker ' + client.getLabel() + ' who was connected from an IP address that was just banned');

            }).on('triggerBan', function(reason){
                emitWarningLog('Banned triggered for ' + client.getLabel() + ': ' + reason);
                _this.emit('banIP', client.remoteAddress, client.workerName);
            });
        });
    }



    /**
     * Sets up periodic polling for new blocks using getblocktemplate.
     * Only enabled if blockRefreshInterval is configured.
     *
     * @function SetupBlockPolling
     * @fires Pool#log - When new blocks are found via polling
     * @private
     */
    function SetupBlockPolling(){
        if (typeof options.blockRefreshInterval !== "number" || options.blockRefreshInterval <= 0){
            emitLog('Block template polling has been disabled');
            return;
        }

        var pollingInterval = options.blockRefreshInterval;

        blockPollingIntervalId = setInterval(function () {
            GetBlockTemplate(function(error, result, foundNewBlock){
                if (foundNewBlock)
                    emitLog('Block notification via RPC polling');
            });
        }, pollingInterval);
    }



    /**
     * Retrieves a new block template from the daemon and processes it.
     *
     * @function GetBlockTemplate
     * @param {Function} callback - Called with (error, response, processedNewBlock)
     * @param {Error|null} callback.error - Error if the RPC call failed
     * @param {Object} callback.response - Raw block template from daemon
     * @param {boolean} callback.processedNewBlock - Whether a new block was processed
     * @private
     */
    function GetBlockTemplate(callback){
        _this.daemon.cmd('getblocktemplate',
            [{"capabilities": [ "coinbasetxn", "workid", "coinbase/append" ], "rules": [ "segwit" ]}],
            function(result){
                if (result.error){
                    emitErrorLog('getblocktemplate call failed for daemon instance ' +
                        result.instance.index + ' with error ' + JSON.stringify(result.error));
                    callback(result.error);
                } else {
                    // Debug logging for Bitcoin Cash daemon response
                    emitLog('DEBUG: getblocktemplate raw response received');
                    emitLog('DEBUG: RPC response version field: ' + result.response.version);
                    emitLog('DEBUG: RPC response version (hex): 0x' + result.response.version.toString(16));
                    emitLog('DEBUG: RPC response previousblockhash: ' + result.response.previousblockhash);
                    emitLog('DEBUG: RPC response height: ' + result.response.height);
                    
                    var processedNewBlock = _this.jobManager.processTemplate(result.response);
                    callback(null, result.response, processedNewBlock);
                    callback = function(){};
                }
            }, true
        );
    }



    /**
     * Checks if a submitted block was accepted by the daemon.
     * Queries the daemon to verify the block exists in the blockchain.
     *
     * @function CheckBlockAccepted
     * @param {string} blockHash - Hash of the block to check
     * @param {Function} callback - Called with (accepted, txHash)
     * @param {boolean} callback.accepted - Whether the block was accepted
     * @param {string} callback.txHash - Transaction hash if block was accepted
     * @private
     */
    function CheckBlockAccepted(blockHash, callback){
        //setTimeout(function(){
            _this.daemon.cmd('getblock',
                [blockHash],
                function(results){
                    var validResults = results.filter(function(result){
                        return result.response && (result.response.hash === blockHash)
                    });

                    if (validResults.length >= 1){
                        callback(true, validResults[0].response.tx[0]);
                    }
                    else{
                        callback(false);
                    }
                }
            );
        //}, 500);
    }



    /**
     * Processes a block notification from either RPC polling or P2P network.
     * This method is called when a new block is discovered by the daemon,
     * allowing the pool to inform miners about the newly found block.
     *
     * @method processBlockNotify
     * @param {string} blockHash - Hash of the newly discovered block
     * @param {string} sourceTrigger - Source of the notification ('RPC' or 'p2p')
     */
    this.processBlockNotify = function(blockHash, sourceTrigger) {
        emitLog('Block notification via ' + sourceTrigger);
        if (typeof(_this.jobManager.currentJob) !== 'undefined' && blockHash !== _this.jobManager.currentJob.rpcData.previousblockhash){
            GetBlockTemplate(function(error, result){
                if (error)
                    emitErrorLog('Block notify error getting block template for ' + options.coin.name);
            })
        }
    };


    /**
     * Relinquishes control of miners matching a filter function.
     * This is used for pool switching or removing specific miners.
     *
     * @method relinquishMiners
     * @param {Function} filterFn - Filter function to select which miners to relinquish
     * @param {Function} resultCback - Callback with array of relinquished client objects
     */
    this.relinquishMiners = function(filterFn, resultCback) {
        var origStratumClients = this.stratumServer.getStratumClients();

        var stratumClients = [];
        Object.keys(origStratumClients).forEach(function (subId) {
            stratumClients.push({subId: subId, client: origStratumClients[subId]});
        });
        async.filter(
            stratumClients,
            filterFn,
            function (clientsToRelinquish) {
                clientsToRelinquish.forEach(function(cObj) {
                    cObj.client.removeAllListeners();
                    _this.stratumServer.removeStratumClientBySubId(cObj.subId);
                });

                process.nextTick(function () {
                    resultCback(
                        clientsToRelinquish.map(
                            function (item) {
                                return item.client;
                            }
                        )
                    );
                });
            }
        )
    };


    /**
     * Attaches an array of miners to this pool instance.
     * Used when transferring miners from another pool instance.
     *
     * @method attachMiners
     * @param {Array<Object>} miners - Array of miner client objects to attach
     */
    this.attachMiners = function(miners) {
        miners.forEach(function (clientObj) {
            _this.stratumServer.manuallyAddStratumClient(clientObj);
        });
        _this.stratumServer.broadcastMiningJobs(_this.jobManager.currentJob.getJobParams());

    };

    /**
     * Gets the Stratum server instance.
     *
     * @method getStratumServer
     * @returns {Object} The Stratum server instance
     */
    this.getStratumServer = function() {
        return _this.stratumServer;
    };

    /**
     * Sets up variable difficulty configuration for a specific port.
     *
     * @method setVarDiff
     * @param {number} port - Port number to configure variable difficulty for
     * @param {Object} varDiffConfig - Variable difficulty configuration
     * @param {number} varDiffConfig.minDiff - Minimum difficulty
     * @param {number} varDiffConfig.maxDiff - Maximum difficulty
     * @param {number} varDiffConfig.targetTime - Target time between shares (seconds)
     * @param {number} varDiffConfig.retargetTime - Time between difficulty adjustments (seconds)
     * @param {number} varDiffConfig.variancePercent - Allowed variance percentage
     */
    this.setVarDiff = function(port, varDiffConfig) {
        if (typeof(_this.varDiff[port]) != 'undefined' ) {
            _this.varDiff[port].removeAllListeners();
        }
        var varDiffInstance = new varDiff(port, varDiffConfig);
        _this.varDiff[port] = varDiffInstance;
        _this.varDiff[port].on('newDifficulty', function(client, newDiff) {

            /* We request to set the newDiff @ the next difficulty retarget
             (which should happen when a new job comes in - AKA BLOCK) */
            client.enqueueNextDifficulty(newDiff);

            if (options.varDiff && options.varDiff.mode === 'fast'){
                 //Send new difficulty, then force miner to use new diff by resending the
                 //current job parameters but with the "clean jobs" flag set to false
                 //so the miner doesn't restart work and submit duplicate shares
                client.sendDifficulty(newDiff);
                var job = _this.jobManager.currentJob.getJobParams();
                job[8] = false;
                client.sendMiningJob(job);
            }

        });
    };

};
pool.prototype.__proto__ = events.EventEmitter.prototype;
