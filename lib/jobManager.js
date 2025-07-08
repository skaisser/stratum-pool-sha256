var events = require('events');
var crypto = require('crypto');

var bignum = require('./bignum-compat');



var algos = require('./algoProperties.js');
var util = require('./util.js');
var blockTemplate = require('./blockTemplate.js');
var transactions = require('./transactions.js');



/**
 * Generates unique extranonce values for each subscriber.
 * Uses instance ID to ensure uniqueness across pool instances.
 * 
 * @class ExtraNonceCounter
 * @param {number} [configInstanceId] - Optional instance ID for multi-instance deployments
 */
var ExtraNonceCounter = function(configInstanceId){

    var instanceId = configInstanceId || crypto.randomBytes(4).readUInt32LE(0);
    var counter = instanceId << 27;

    /**
     * Gets the next extranonce value.
     * 
     * @method next
     * @returns {string} Hex-encoded extranonce value
     */
    this.next = function(){
        var extraNonce = util.packUInt32BE(Math.abs(counter++));
        return extraNonce.toString('hex');
    };

    this.size = 4; //bytes
};

/**
 * Generates unique job IDs for each new block template.
 * Wraps around at 0xffff to prevent overflow.
 * 
 * @class JobCounter
 */
var JobCounter = function(){
    var counter = 0;

    /**
     * Gets the next job ID.
     * 
     * @method next
     * @returns {string} Hex-encoded job ID
     */
    this.next = function(){
        counter++;
        if (counter % 0xffff === 0)
            counter = 1;
        return this.cur();
    };

    /**
     * Gets the current job ID without incrementing.
     * 
     * @method cur
     * @returns {string} Current hex-encoded job ID
     */
    this.cur = function () {
        return counter.toString(16);
    };
};

/**
 * Manages mining jobs and validates submitted shares.
 * This class is responsible for creating new jobs from block templates,
 * tracking valid jobs, and processing share submissions.
 * 
 * @class JobManager
 * @extends {EventEmitter}
 * @param {Object} options - Configuration options
 * @param {Object} options.coin - Coin-specific configuration
 * @param {string} options.coin.algorithm - Mining algorithm
 * @param {string} options.coin.reward - Reward type ('POW' or 'POS')
 * @param {boolean} [options.coin.asicboost] - Whether ASICBoost is enabled
 * @param {Buffer} options.poolAddressScript - Pool's address script for coinbase
 * @param {number} [options.instanceId] - Instance ID for extranonce generation
 * 
 * @fires JobManager#newBlock - When a new block (previously unknown to the JobManager) is added
 * @fires JobManager#updatedBlock - When the current job is updated
 * @fires JobManager#share - When a worker submits a share
 * @fires JobManager#log - For logging events
 */
var JobManager = module.exports = function JobManager(options){


    //private members

    var _this = this;
    var jobCounter = new JobCounter();

    var shareMultiplier = algos[options.coin.algorithm].multiplier;
    
    //public members

    this.extraNonceCounter = new ExtraNonceCounter(options.instanceId);
    this.extraNoncePlaceholder = Buffer.from('f000000ff111111f', 'hex');
    this.extraNonce2Size = this.extraNoncePlaceholder.length - this.extraNonceCounter.size;

    this.currentJob;
    this.validJobs = {};

    var hashDigest = algos[options.coin.algorithm].hash(options.coin);

    var coinbaseHasher = (function(){
        switch(options.coin.algorithm){
            case 'keccak':
            case 'fugue':
            case 'groestl':
                if (options.coin.normalHashing === true)
                    return util.sha256d;
                else
                    return util.sha256;
            default:
                return util.sha256d;
        }
    })();


    var blockHasher = (function () {
        switch (options.coin.algorithm) {
            case 'scrypt':
                if (options.coin.reward === 'POS') {
                    return function (d) {
                        return util.reverseBuffer(hashDigest.apply(this, arguments));
                    };
                }
            case 'scrypt-jane':
                if (options.coin.reward === 'POS') {
                    return function (d) {
                        return util.reverseBuffer(hashDigest.apply(this, arguments));
                    };
                }
            case 'scrypt-n':
                return function (d) {
                    return util.reverseBuffer(util.sha256d(d));
                };
            default:
                return function () {
                    return util.reverseBuffer(hashDigest.apply(this, arguments));
                };
        }
    })();

    /**
     * Updates the current job with new RPC data without clearing valid jobs.
     * Used when updating an existing job with new transactions.
     * 
     * @method updateCurrentJob
     * @param {Object} rpcData - Block template data from daemon RPC
     * @returns {boolean} Always returns true to indicate success
     * @fires JobManager#updatedBlock
     */
    this.updateCurrentJob = function(rpcData){

        var tmpBlockTemplate = new blockTemplate(
            jobCounter.next(),
            rpcData,
            options.poolAddressScript,
            _this.extraNoncePlaceholder,
            options.coin.reward,
            options.coin.txMessages,
            options.recipients
        );

        _this.currentJob = tmpBlockTemplate;

        _this.emit('updatedBlock', tmpBlockTemplate, true);

        _this.validJobs[tmpBlockTemplate.jobId] = tmpBlockTemplate;
        
        return true;

    };

    /**
     * Processes a new block template from the daemon.
     * Determines if this is actually a new block and creates a new job if so.
     * 
     * @method processTemplate
     * @param {Object} rpcData - Block template data from daemon RPC
     * @returns {boolean} True if a new block was processed, false otherwise
     * @fires JobManager#newBlock
     */
    this.processTemplate = function(rpcData){

        /* Block is new if A) its the first block we have seen so far or B) the blockhash is different and the
           block height is greater than the one we have */
        var isNewBlock = typeof(_this.currentJob) === 'undefined';
        if  (!isNewBlock && _this.currentJob.rpcData.previousblockhash !== rpcData.previousblockhash){
            isNewBlock = true;

            //If new block is outdated/out-of-sync than return
            if (rpcData.height < _this.currentJob.rpcData.height)
                return false;
        }

        if (!isNewBlock) return false;


        var tmpBlockTemplate = new blockTemplate(
            jobCounter.next(),
            rpcData,
            options.poolAddressScript,
            _this.extraNoncePlaceholder,
            options.coin.reward,
            options.coin.txMessages,
            options.recipients
        );

        this.currentJob = tmpBlockTemplate;

        this.validJobs = {};
        _this.emit('newBlock', tmpBlockTemplate);

        this.validJobs[tmpBlockTemplate.jobId] = tmpBlockTemplate;

        return true;

    };

    /**
     * Processes a share submission from a miner.
     * Validates the share and checks if it meets block or share difficulty requirements.
     * 
     * @method processShare
     * @param {string} jobId - Job ID the share is for
     * @param {number} previousDifficulty - Previous difficulty (for vardiff)
     * @param {number} difficulty - Current worker difficulty
     * @param {string} extraNonce1 - Worker's assigned extranonce1
     * @param {string} extraNonce2 - Miner-generated extranonce2
     * @param {string} nTime - Block timestamp (hex)
     * @param {string} nonce - Miner's nonce (hex)
     * @param {string} ipAddress - Worker's IP address
     * @param {number} port - Port the worker connected to
     * @param {string} workerName - Worker identifier (username.workername)
     * @param {string} [version] - Version for ASICBoost (hex)
     * @param {number} [versionMask] - Client's negotiated version mask (BIP 310)
     * @returns {Object} Result object with error or success
     * @returns {Array} [result.error] - Error array [code, message] if share is invalid
     * @returns {boolean} [result.result] - True if share is valid
     * @returns {string} [result.blockHash] - Block hash if block was found
     * @fires JobManager#share
     */
    this.processShare = function(jobId, previousDifficulty, difficulty, extraNonce1, extraNonce2, nTime, nonce, ipAddress, port, workerName, version, versionMask){
        var shareError = function(error){
            _this.emit('share', {
                job: jobId,
                ip: ipAddress,
                worker: workerName,
                difficulty: difficulty,
                error: error[1]
            });
            return {error: error, result: null};
        };

        var submitTime = Date.now() / 1000 | 0;

        if (extraNonce2.length / 2 !== _this.extraNonce2Size)
            return shareError([20, 'incorrect size of extranonce2']);

        var job = this.validJobs[jobId];

        if (typeof job === 'undefined' || job.jobId != jobId ) {
            return shareError([21, 'job not found']);
        }

        if (nTime.length !== 8) {
            return shareError([20, 'incorrect size of ntime']);
        }

        var nTimeInt = parseInt(nTime, 16);
        if (nTimeInt < job.rpcData.curtime || nTimeInt > submitTime + 7200) {
            return shareError([20, 'ntime out of range']);
        }

        if (nonce.length !== 8) {
            return shareError([20, 'incorrect size of nonce']);
        }
        
        // ASICBoost version validation
        var versionInt = parseInt(version || job.rpcData.version, 16);
        
        // Log version for debugging (only first share from worker)
        // if (!this.loggedVersions) this.loggedVersions = {};
        // if (!this.loggedVersions[workerName]) {
        //     this.loggedVersions[workerName] = true;
        //     console.log('Worker ' + workerName + ' submitted version: 0x' + versionInt.toString(16) + 
        //                ' (decimal: ' + versionInt + ')' +
        //                ', job version: 0x' + job.rpcData.version.toString(16));
        // }
        
        if (options.coin.asicboost) {
            // BIP 310 compliant version validation with more lenient handling
            
            // Handle version 0x0 as a special case - use job version
            if (versionInt === 0) {
                console.log('Version 0x0 submitted, using job version: 0x' + job.rpcData.version.toString(16));
                versionInt = job.rpcData.version;
            }
            
            // Only reject if version is completely invalid (less than 4)
            if (versionInt < 0x00000004) {
                console.log('Version too low: 0x' + versionInt.toString(16) + ' (must be at least version 4)');
                return shareError([20, 'version too low']);
            }
            
            // Use client's negotiated mask if available, otherwise use job's default mask
            var effectiveMask = versionMask || job.versionMask;
            
            // For ASICBoost, validate version rolling per BIP 310
            // More lenient validation: only check that rolled bits are within mask
            if (versionInt !== job.rpcData.version) {
                // Calculate which bits were changed
                var rolledBits = versionInt ^ job.rpcData.version;
                
                // Check if any rolled bits are outside the allowed mask
                var invalidBits = rolledBits & ~effectiveMask;
                
                if (invalidBits !== 0) {
                    console.log('Version rolling outside negotiated mask - version: 0x' + versionInt.toString(16) + 
                               ', rolled bits: 0x' + rolledBits.toString(16) +
                               ', negotiated mask: 0x' + effectiveMask.toString(16) +
                               ', invalid bits: 0x' + invalidBits.toString(16));
                    return shareError([20, 'version rolling outside allowed mask']);
                }
                
                // Log successful version rolling for debugging
                if (rolledBits !== 0) {
                    _this.emit('debug', {
                        worker: workerName,
                        event: 'version_rolling',
                        version: versionInt.toString(16),
                        rolled_bits: rolledBits.toString(16),
                        mask: effectiveMask.toString(16)
                    });
                }
            }
        }

        if (!job.registerSubmit(extraNonce1, extraNonce2, nTime, nonce)) {
            return shareError([22, 'duplicate share']);
        }


        var extraNonce1Buffer = Buffer.from(extraNonce1, 'hex');
        var extraNonce2Buffer = Buffer.from(extraNonce2, 'hex');

        var coinbaseBuffer = job.serializeCoinbase(extraNonce1Buffer, extraNonce2Buffer);
        var coinbaseHash = coinbaseHasher(coinbaseBuffer);

        var merkleRoot = util.reverseBuffer(job.merkleTree.withFirst(coinbaseHash)).toString('hex');

        var headerBuffer = job.serializeHeader(merkleRoot, nTime, nonce, versionInt);
        var headerHash = hashDigest(headerBuffer, nTimeInt);
        var headerBigNum = bignum.fromBuffer(headerHash, {endian: 'little', size: 32});

        var blockHashInvalid;
        var blockHash;
        var blockHex;

        // Calculate share difficulty using BigInt to maintain precision
        // Formula: shareDiff = (max_target / current_target) * multiplier
        // Where max_target is diff1 (difficulty 1 target)
        var diff1BigInt = BigInt('0x00000000ffff0000000000000000000000000000000000000000000000000000');
        var headerBigInt = headerBigNum.value; // Access the underlying BigInt directly
        var multiplierBigInt = BigInt(shareMultiplier);
        
        // Debug logging
        // if (!this.debuggedShareCalc) {
        //     this.debuggedShareCalc = true;
        //     console.log('Share calculation debug:');
        //     console.log('  shareMultiplier:', shareMultiplier);
        //     console.log('  headerHash (hex):', headerHash.toString('hex'));
        //     console.log('  headerBigNum.toString(16):', headerBigNum.toString(16));
        //     console.log('  headerBigInt:', headerBigInt.toString());
        //     console.log('  diff1BigInt:', diff1BigInt.toString());
        //     console.log('  job.target.toString(16):', job.target.toString(16));
        //     console.log('  job.difficulty:', job.difficulty);
        // }
        
        // Perform division in BigInt space with proper precision
        // We multiply by a large factor before division to maintain precision, then convert back
        var precisionFactor = BigInt(1e18);
        var shareDiffBigInt = (diff1BigInt * multiplierBigInt * precisionFactor) / headerBigInt;
        var shareDiff = Number(shareDiffBigInt) / 1e18;

        var blockDiffAdjusted = job.difficulty * shareMultiplier;

        //Check if share is a block candidate (matched network difficulty)
        if (job.target.ge(headerBigNum)){
            // Extract username from workerName (before the dot)
            var username = workerName.split('.')[0];
            
            // Recreate coinbase with miner's name
            var customCoinbase = transactions.CreateGeneration(
                job.rpcData,
                options.poolAddressScript,
                extraNoncePlaceholder,
                options.coin.reward,
                options.coin.txMessages,
                options.recipients,
                username  // Pass the username
            );
            
            // Serialize the coinbase with the custom signature
            var customCoinbaseBuffer = Buffer.concat([
                customCoinbase[0],
                extraNonce1Buffer,
                extraNonce2Buffer,
                customCoinbase[1]
            ]);
            
            // Need to recalculate merkle root with new coinbase
            var coinbaseHash = util.sha256d(customCoinbaseBuffer);
            var merkleRoot = job.merkleTree.withFirst(coinbaseHash).toString('hex');
            
            // Recreate header with new merkle root
            headerBuffer = job.serializeHeader(merkleRoot, nTime, nonce, versionInt);
            headerHash = hashDigest(headerBuffer, nTimeInt);
            
            blockHex = job.serializeBlock(headerBuffer, customCoinbaseBuffer).toString('hex');
            if (options.coin.algorithm === 'blake' || options.coin.algorithm === 'neoscrypt') {                
                blockHash = util.reverseBuffer(util.sha256d(headerBuffer, nTime)).toString('hex');
            }
            else {
            	blockHash = blockHasher(headerBuffer, nTime).toString('hex');
            }
        }
        else {
            if (options.emitInvalidBlockHashes)
                blockHashInvalid = util.reverseBuffer(util.sha256d(headerBuffer)).toString('hex');

            //Check if share didn't reached the miner's difficulty)
            if (shareDiff / difficulty < 0.99){
                
                // Additional debug for MRR shares
                if (workerName && workerName.includes('mrr')) {
                    console.log('MRR Share Debug:');
                    console.log('  Worker difficulty:', difficulty);
                    console.log('  Share difficulty:', shareDiff);
                    console.log('  Ratio:', shareDiff / difficulty);
                    console.log('  Previous difficulty:', previousDifficulty);
                }

                //Check if share matched a previous difficulty from before a vardiff retarget
                if (previousDifficulty && shareDiff >= previousDifficulty){
                    difficulty = previousDifficulty;
                }
                else{
                    return shareError([23, 'low difficulty share of ' + shareDiff]);
                }

            }
        }


        _this.emit('share', {
            job: jobId,
            ip: ipAddress,
            port: port,
            worker: workerName,
            height: job.rpcData.height,
            blockReward: job.rpcData.coinbasevalue,
            difficulty: difficulty,
            shareDiff: shareDiff.toFixed(8),
            blockDiff : blockDiffAdjusted,
            blockDiffActual: job.difficulty,
            blockHash: blockHash,
            blockHashInvalid: blockHashInvalid
        }, blockHex);

        return {result: true, error: null, blockHash: blockHash};
    };
};
JobManager.prototype.__proto__ = events.EventEmitter.prototype;
