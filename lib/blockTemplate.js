var bignum = require('./bignum-compat');

var merkleTree = require('./merkleTree.js');
var transactions = require('./transactions.js');
var util = require('./util.js');


/**
 * The BlockTemplate class holds a single mining job.
 * It encapsulates block template data from the daemon and provides methods
 * to serialize block data and validate share submissions.
 * 
 * @class BlockTemplate
 * @param {string} jobId - Unique identifier for this job
 * @param {Object} rpcData - Block template data from getblocktemplate RPC
 * @param {Buffer} poolAddressScript - Pool's address script for coinbase output
 * @param {Buffer} extraNoncePlaceholder - Placeholder for extranonce in coinbase
 * @param {string} reward - Reward type ('POW' or 'POS')
 * @param {Array} txMessages - Additional messages to include in coinbase
 * @param {Array} recipients - Fee recipients for coinbase outputs
 */
var BlockTemplate = module.exports = function BlockTemplate(jobId, rpcData, poolAddressScript, extraNoncePlaceholder, reward, txMessages, recipients){

    //private members

    var submits = [];

    function getMerkleHashes(steps){
        return steps.map(function(step){
            return step.toString('hex');
        });
    }

    function getTransactionBuffers(txs){
        var txHashes = txs.map(function(tx){
            if (tx.txid !== undefined) {
                return util.uint256BufferFromHash(tx.txid);
            }
            return util.uint256BufferFromHash(tx.hash);
        });
        return [null].concat(txHashes);
    }

    function getVoteData(){
        if (!rpcData.masternode_payments) return Buffer.alloc(0);

        return Buffer.concat(
            [util.varIntBuffer(rpcData.votes.length)].concat(
                rpcData.votes.map(function (vt) {
                    return Buffer.from(vt, 'hex');
                })
            )
        );
    }

    //public members

    this.rpcData = rpcData;
    this.jobId = jobId;

    // ASICBoost support - version rolling mask (BIP 310)
    // More permissive mask to support MiningRigRentals and other rental services
    this.versionMask = 0x3fffe000;  // Allows bit 0x20000000 used by many rental rigs
    // More permissive version range to accept all miners
    this.minVersion = 0x00000004;   // Accept version 4 and above (very permissive)
    this.maxVersion = 0x7FFFFFFF;   // Accept almost any version

    this.target = rpcData.target ?
        bignum(rpcData.target, 16) :
        util.bignumFromBitsHex(rpcData.bits);

    // Calculate difficulty using BigInt to maintain precision
    var diff1BigInt = BigInt('0x00000000ffff0000000000000000000000000000000000000000000000000000');
    var targetBigInt = this.target.value; // Access the underlying BigInt directly
    var precisionFactor = BigInt(1e9);
    var difficultyBigInt = (diff1BigInt * precisionFactor) / targetBigInt;
    this.difficulty = Number(difficultyBigInt) / 1e9;





    this.prevHashReversed = util.reverseByteOrder(Buffer.from(rpcData.previousblockhash, 'hex')).toString('hex');
    this.transactionData = Buffer.concat(rpcData.transactions.map(function(tx){
        return Buffer.from(tx.data, 'hex');
    }));
    this.merkleTree = new merkleTree(getTransactionBuffers(rpcData.transactions));
    this.merkleBranch = getMerkleHashes(this.merkleTree.steps);
    this.generationTransaction = transactions.CreateGeneration(
        rpcData,
        poolAddressScript,
        extraNoncePlaceholder,
        reward,
        txMessages,
        recipients
    );

    /**
     * Serializes the coinbase transaction with the provided extranonces.
     * 
     * @method serializeCoinbase
     * @param {Buffer} extraNonce1 - Worker's extranonce1
     * @param {Buffer} extraNonce2 - Miner's extranonce2
     * @returns {Buffer} Complete serialized coinbase transaction
     */
    this.serializeCoinbase = function(extraNonce1, extraNonce2){
        return Buffer.concat([
            this.generationTransaction[0],
            extraNonce1,
            extraNonce2,
            this.generationTransaction[1]
        ]);
    };

    /**
     * Serializes a block header according to Bitcoin protocol specification.
     * @see {@link https://en.bitcoin.it/wiki/Protocol_specification#Block_Headers}
     * 
     * @method serializeHeader
     * @param {string} merkleRoot - Merkle root hash (hex)
     * @param {string} nTime - Block timestamp (hex)
     * @param {string} nonce - Mining nonce (hex)
     * @param {number} [version] - Block version for ASICBoost support
     * @returns {Buffer} 80-byte serialized block header
     */
    this.serializeHeader = function(merkleRoot, nTime, nonce, version){

        var header =  Buffer.alloc(80);
        var position = 0;
        
        // Bitcoin block header format (before reversal):
        // version (4) + prevhash (32) + merkleroot (32) + time (4) + bits (4) + nonce (4)
        header.writeUInt32LE(version || rpcData.version, position);
        header.write(rpcData.previousblockhash, position += 4, 32, 'hex');
        header.write(merkleRoot, position += 32, 32, 'hex');
        header.writeUInt32LE(parseInt(nTime, 16), position += 32);
        header.write(rpcData.bits, position += 4, 4, 'hex');
        header.writeUInt32LE(parseInt(nonce, 16), position += 4);
        
        return header;
    };

    /**
     * Serializes a complete block including header and all transactions.
     * 
     * @method serializeBlock
     * @param {Buffer} header - Serialized block header
     * @param {Buffer} coinbase - Serialized coinbase transaction
     * @returns {Buffer} Complete serialized block ready for submission
     */
    this.serializeBlock = function(header, coinbase){
        return Buffer.concat([
            header,

            util.varIntBuffer(this.rpcData.transactions.length + 1),
            coinbase,
            this.transactionData,

            getVoteData(),

            //POS coins require a zero byte appended to block which the daemon replaces with the signature
            reward === 'POS' ? Buffer.from([0]) : Buffer.alloc(0)
        ]);
    };

    /**
     * Registers a share submission to prevent duplicate shares.
     * 
     * @method registerSubmit
     * @param {string} extraNonce1 - Worker's extranonce1
     * @param {string} extraNonce2 - Miner's extranonce2
     * @param {string} nTime - Block timestamp
     * @param {string} nonce - Mining nonce
     * @returns {boolean} True if this is a new submission, false if duplicate
     */
    this.registerSubmit = function(extraNonce1, extraNonce2, nTime, nonce){
        var submission = extraNonce1 + extraNonce2 + nTime + nonce;
        if (submits.indexOf(submission) === -1){
            submits.push(submission);
            return true;
        }
        return false;
    };

    /**
     * Gets the job parameters for Stratum mining.notify message.
     * 
     * @method getJobParams
     * @returns {Array} Job parameters array for Stratum protocol
     * @returns {string} params[0] - Job ID
     * @returns {string} params[1] - Previous block hash (reversed)
     * @returns {string} params[2] - Coinbase part 1
     * @returns {string} params[3] - Coinbase part 2
     * @returns {Array} params[4] - Merkle branch
     * @returns {string} params[5] - Block version
     * @returns {string} params[6] - Encoded difficulty (bits)
     * @returns {string} params[7] - Current time
     * @returns {boolean} params[8] - Clean jobs flag
     */
    this.getJobParams = function(){
        if (!this.jobParams){
            this.jobParams = [
                this.jobId,
                this.prevHashReversed,
                this.generationTransaction[0].toString('hex'),
                this.generationTransaction[1].toString('hex'),
                this.merkleBranch,
                util.packInt32BE(this.rpcData.version).toString('hex'),
                this.rpcData.bits,
                util.packUInt32BE(this.rpcData.curtime).toString('hex'),
                true
            ];
        }
        return this.jobParams;
    };
};
