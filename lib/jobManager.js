var events = require('events');
var crypto = require('crypto');

var bignum = require('./bignum-compat');



var util = require('./util.js');
var blockTemplate = require('./blockTemplate.js');
var transactions = require('./transactions.js');



//Unique extranonce per subscriber
var ExtraNonceCounter = function(configInstanceId){

    var instanceId = configInstanceId || crypto.randomBytes(4).readUInt32LE(0);
    var counter = instanceId << 27;

    this.next = function(){
        var extraNonce = util.packUInt32BE(Math.abs(counter++));
        return extraNonce.toString('hex');
    };

    this.size = 4; //bytes
};

//Unique job per new block template
var JobCounter = function(){
    var counter = 0;

    this.next = function(){
        counter++;
        if (counter % 0xffff === 0)
            counter = 1;
        return this.cur();
    };

    this.cur = function () {
        return counter.toString(16);
    };
};

/**
 * Emits:
 * - newBlock(blockTemplate) - When a new block (previously unknown to the JobManager) is added, use this event to broadcast new jobs
 * - share(shareData, blockHex) - When a worker submits a share. It will have blockHex if a block was found
**/
var JobManager = module.exports = function JobManager(options){


    //private members

    var _this = this;
    var jobCounter = new JobCounter();

    var shareMultiplier = algos[options.coin.algorithm].multiplier;
    console.log('JobManager initialized with algorithm:', options.coin.algorithm, 'multiplier:', shareMultiplier);
    
    //public members

    this.extraNonceCounter = new ExtraNonceCounter(options.instanceId);
    this.extraNoncePlaceholder = new Buffer('f000000ff111111f', 'hex');
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

    };

    //returns true if processed a new block
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

    this.processShare = function(jobId, previousDifficulty, difficulty, extraNonce1, extraNonce2, nTime, nonce, ipAddress, port, workerName, version){
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
        if (!this.loggedVersions) this.loggedVersions = {};
        if (!this.loggedVersions[workerName]) {
            this.loggedVersions[workerName] = true;
            console.log('Worker ' + workerName + ' submitted version: 0x' + versionInt.toString(16) + 
                       ' (decimal: ' + versionInt + ')' +
                       ', job version: 0x' + job.rpcData.version.toString(16));
        }
        
        if (options.coin.asicboost) {
            // More flexible version validation for broader miner compatibility
            
            // Only reject if version is completely invalid (less than 4)
            if (versionInt < 0x00000004) {
                console.log('Version too low: 0x' + versionInt.toString(16) + ' (must be at least version 4)');
                return shareError([20, 'version too low']);
            }
            
            // For ASICBoost, we only validate if miner is actually using version rolling
            // If version matches job version exactly, no validation needed
            if (versionInt !== job.rpcData.version) {
                // Check if rolled bits are within allowed mask
                var rolledBits = versionInt ^ job.rpcData.version;
                var rolledBitsOnly = rolledBits & job.versionMask;
                
                // Only validate version rolling if miner actually rolled version bits
                if (rolledBitsOnly !== 0) {
                    // Check if ALL rolled bits are within the mask
                    if ((rolledBits & ~job.versionMask) !== 0) {
                        console.log('Warning: Version rolling outside mask - version: 0x' + versionInt.toString(16) + 
                                   ', rolled bits: 0x' + rolledBits.toString(16) + 
                                   ', mask: 0x' + job.versionMask.toString(16) + 
                                   ' - but accepting share anyway');
                        // Don't reject - just warn. Some miners may use different version schemes
                    }
                }
            }
        }

        if (!job.registerSubmit(extraNonce1, extraNonce2, nTime, nonce)) {
            return shareError([22, 'duplicate share']);
        }


        var extraNonce1Buffer = new Buffer(extraNonce1, 'hex');
        var extraNonce2Buffer = new Buffer(extraNonce2, 'hex');

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
        if (!this.debuggedShareCalc) {
            this.debuggedShareCalc = true;
            console.log('Share calculation debug:');
            console.log('  shareMultiplier:', shareMultiplier);
            console.log('  headerHash (hex):', headerHash.toString('hex'));
            console.log('  headerBigNum.toString(16):', headerBigNum.toString(16));
            console.log('  headerBigInt:', headerBigInt.toString());
            console.log('  diff1BigInt:', diff1BigInt.toString());
            console.log('  job.target.toString(16):', job.target.toString(16));
            console.log('  job.difficulty:', job.difficulty);
        }
        
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
