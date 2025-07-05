/**
 * @module util
 * @description Utility functions for cryptocurrency operations including address manipulation,
 * hashing, buffer operations, and protocol-specific encoding/decoding.
 */

var crypto = require('crypto');

var base58 = require('bs58');
var bchaddr = require('bchaddrjs');
var bignum = require('./bignum-compat');

/**
 * Creates an address from an example address and a RIPEMD-160 hash.
 * Supports both legacy and CashAddr formats for Bitcoin Cash.
 *
 * @function addressFromEx
 * @param {string} exAddress - Example address to extract version byte from
 * @param {string} ripdm160Key - RIPEMD-160 hash in hex format
 * @returns {string|null} Generated address in same format as example, or null on error
 */
exports.addressFromEx = function(exAddress, ripdm160Key){
    try {
        var versionByte = exports.getVersionByte(exAddress);
        var addrBase = Buffer.concat([versionByte, Buffer.from(ripdm160Key, 'hex')]);
        var checksum = exports.sha256d(addrBase).slice(0, 4);
        var address = Buffer.concat([addrBase, checksum]);
        var legacyAddress = base58.encode(address);

        // If the example address was CashAddr, return CashAddr format
        if (bchaddr.isCashAddress(exAddress)) {
            return bchaddr.toCashAddress(legacyAddress);
        }

        return legacyAddress;
    }
    catch(e){
        return null;
    }
};


/**
 * Extracts the version byte from a cryptocurrency address.
 * Handles both legacy and CashAddr formats.
 *
 * @function getVersionByte
 * @param {string} addr - Cryptocurrency address
 * @returns {Buffer} Single byte buffer containing version
 * @throws {Error} If address format is invalid
 */
exports.getVersionByte = function(addr){
    var address = addr;

    // Convert CashAddr to legacy if needed
    if (bchaddr.isCashAddress(address)) {
        try {
            address = bchaddr.toLegacyAddress(address);
        } catch (err) {
            throw new Error('Invalid CashAddr format');
        }
    }

    var versionByte = base58.decode(address).slice(0, 1);
    return versionByte;
};

/**
 * Computes SHA-256 hash of a buffer.
 *
 * @function sha256
 * @param {Buffer} buffer - Input buffer to hash
 * @returns {Buffer} 32-byte hash result
 */
exports.sha256 = function(buffer){
    var hash1 = crypto.createHash('sha256');
    hash1.update(buffer);
    return hash1.digest();
};

/**
 * Computes double SHA-256 hash (SHA-256(SHA-256(buffer))).
 * Commonly used in Bitcoin protocol.
 *
 * @function sha256d
 * @param {Buffer} buffer - Input buffer to hash
 * @returns {Buffer} 32-byte hash result
 */
exports.sha256d = function(buffer){
    return exports.sha256(exports.sha256(buffer));
};

/**
 * Reverses the byte order of a buffer.
 *
 * @function reverseBuffer
 * @param {Buffer} buff - Buffer to reverse
 * @returns {Buffer} New buffer with reversed byte order
 */
exports.reverseBuffer = function(buff){
    var reversed = Buffer.alloc(buff.length);
    for (var i = buff.length - 1; i >= 0; i--)
        reversed[buff.length - i - 1] = buff[i];
    return reversed;
};

/**
 * Reverses a hex string by converting to buffer, reversing, and converting back.
 *
 * @function reverseHex
 * @param {string} hex - Hex string to reverse
 * @returns {string} Reversed hex string
 */
exports.reverseHex = function(hex){
    return exports.reverseBuffer(Buffer.from(hex, 'hex')).toString('hex');
};

/**
 * Reverses byte order of 32-bit integers within a buffer.
 * Used for endianness conversion.
 *
 * @function reverseByteOrder
 * @param {Buffer} buff - Buffer to process (must be multiple of 4 bytes)
 * @returns {Buffer} Buffer with reversed byte order
 */
exports.reverseByteOrder = function(buff){
    for (var i = 0; i < 8; i++) buff.writeUInt32LE(buff.readUInt32BE(i * 4), i * 4);
    return exports.reverseBuffer(buff);
};

/**
 * Converts a hash hex string to a 256-bit buffer with reversed byte order.
 * Pads with zeros if input is less than 32 bytes.
 *
 * @function uint256BufferFromHash
 * @param {string} hex - Hash in hex format
 * @returns {Buffer} 32-byte buffer with reversed byte order
 */
exports.uint256BufferFromHash = function(hex){

    var fromHex = Buffer.from(hex, 'hex');

    if (fromHex.length != 32){
        var empty = Buffer.alloc(32);
        empty.fill(0);
        fromHex.copy(empty);
        fromHex = empty;
    }

    return exports.reverseBuffer(fromHex);
};

/**
 * Converts a reversed buffer back to hex string.
 *
 * @function hexFromReversedBuffer
 * @param {Buffer} buffer - Buffer with reversed byte order
 * @returns {string} Hex string representation
 */
exports.hexFromReversedBuffer = function(buffer){
    return exports.reverseBuffer(buffer).toString('hex');
};


/**
 * Creates a variable length integer buffer as defined in Bitcoin protocol.
 * @see {@link https://en.bitcoin.it/wiki/Protocol_specification#Variable_length_integer}
 *
 * @function varIntBuffer
 * @param {number} n - Integer to encode
 * @returns {Buffer} Variable length encoded integer
 */
exports.varIntBuffer = function(n){
    if (n < 0xfd)
        return Buffer.from([n]);
    else if (n <= 0xffff){
        var buff = Buffer.alloc(3);
        buff[0] = 0xfd;
        buff.writeUInt16LE(n, 1);
        return buff;
    }
    else if (n <= 0xffffffff){
        var buff = Buffer.alloc(5);
        buff[0] = 0xfe;
        buff.writeUInt32LE(n, 1);
        return buff;
    }
    else{
        var buff = Buffer.alloc(9);
        buff[0] = 0xff;
        exports.packInt64LE(n).copy(buff, 1);
        return buff;
    }
};

/**
 * Creates a variable length string buffer with length prefix.
 *
 * @function varStringBuffer
 * @param {string} string - String to encode
 * @returns {Buffer} Length-prefixed string buffer
 */
exports.varStringBuffer = function(string){
    var strBuff = Buffer.from(string);
    return Buffer.concat([exports.varIntBuffer(strBuff.length), strBuff]);
};

/**
 * Serializes a number for use in script signatures (CScript format).
 * Implements BIP-0034 specification for number serialization.
 * @see {@link https://github.com/bitcoin/bips/blob/master/bip-0034.mediawiki#specification}
 * @see {@link https://en.bitcoin.it/wiki/Script}
 *
 * @function serializeNumber
 * @param {number} n - Number to serialize
 * @returns {Buffer} Serialized number in CScript format
 */
exports.serializeNumber = function(n){

    /* Old version that is bugged
    if (n < 0xfd){
        var buff = Buffer.alloc(2);
        buff[0] = 0x1;
        buff.writeUInt8(n, 1);
        return buff;
    }
    else if (n <= 0xffff){
        var buff = Buffer.alloc(4);
        buff[0] = 0x3;
        buff.writeUInt16LE(n, 1);
        return buff;
    }
    else if (n <= 0xffffffff){
        var buff = Buffer.alloc(5);
        buff[0] = 0x4;
        buff.writeUInt32LE(n, 1);
        return buff;
    }
    else{
        return Buffer.concat([Buffer.from([0x9]), binpack.packUInt64(n, 'little')]);
    }*/

    //New version from TheSeven
    if (n >= 1 && n <= 16) return Buffer.from([0x50 + n]);
    var l = 1;
    var buff = Buffer.alloc(9);
    while (n > 0x7f)
    {
        buff.writeUInt8(n & 0xff, l++);
        n >>= 8;
    }
    buff.writeUInt8(l, 0);
    buff.writeUInt8(n, l++);
    return buff.slice(0, l);

};


/**
 * Serializes a string for use in script signatures.
 * Uses variable length encoding based on string length.
 *
 * @function serializeString
 * @param {string} s - String to serialize
 * @returns {Buffer} Serialized string with length prefix
 */
exports.serializeString = function(s){

    if (s.length < 253)
        return Buffer.concat([
            Buffer.from([s.length]),
            Buffer.from(s)
        ]);
    else if (s.length < 0x10000)
        return Buffer.concat([
            Buffer.from([253]),
            exports.packUInt16LE(s.length),
            Buffer.from(s)
        ]);
    else if (s.length < 0x100000000)
        return Buffer.concat([
            Buffer.from([254]),
            exports.packUInt32LE(s.length),
            Buffer.from(s)
        ]);
    else
        return Buffer.concat([
            Buffer.from([255]),
            exports.packUInt16LE(s.length),
            Buffer.from(s)
        ]);
};



/**
 * Packs an unsigned 16-bit integer in little-endian format.
 *
 * @function packUInt16LE
 * @param {number} num - Number to pack (0-65535)
 * @returns {Buffer} 2-byte buffer
 */
exports.packUInt16LE = function(num){
    var buff = Buffer.alloc(2);
    buff.writeUInt16LE(num, 0);
    return buff;
};
/**
 * Packs a signed 32-bit integer in little-endian format.
 *
 * @function packInt32LE
 * @param {number} num - Number to pack
 * @returns {Buffer} 4-byte buffer
 */
exports.packInt32LE = function(num){
    var buff = Buffer.alloc(4);
    buff.writeInt32LE(num, 0);
    return buff;
};
/**
 * Packs a signed 32-bit integer in big-endian format.
 *
 * @function packInt32BE
 * @param {number} num - Number to pack
 * @returns {Buffer} 4-byte buffer
 */
exports.packInt32BE = function(num){
    var buff = Buffer.alloc(4);
    buff.writeInt32BE(num, 0);
    return buff;
};
/**
 * Packs an unsigned 32-bit integer in little-endian format.
 *
 * @function packUInt32LE
 * @param {number} num - Number to pack (0-4294967295)
 * @returns {Buffer} 4-byte buffer
 */
exports.packUInt32LE = function(num){
    var buff = Buffer.alloc(4);
    buff.writeUInt32LE(num, 0);
    return buff;
};
/**
 * Packs an unsigned 32-bit integer in big-endian format.
 *
 * @function packUInt32BE
 * @param {number} num - Number to pack (0-4294967295)
 * @returns {Buffer} 4-byte buffer
 */
exports.packUInt32BE = function(num){
    var buff = Buffer.alloc(4);
    buff.writeUInt32BE(num, 0);
    return buff;
};
/**
 * Packs a 64-bit integer in little-endian format.
 * Note: JavaScript numbers lose precision above 2^53.
 *
 * @function packInt64LE
 * @param {number} num - Number to pack
 * @returns {Buffer} 8-byte buffer
 */
exports.packInt64LE = function(num){
    var buff = Buffer.alloc(8);
    buff.writeUInt32LE(num % Math.pow(2, 32), 0);
    buff.writeUInt32LE(Math.floor(num / Math.pow(2, 32)), 4);
    return buff;
};


/**
 * Python-style range function for generating sequences of numbers.
 * @see {@link http://stackoverflow.com/a/8273091}
 *
 * @function range
 * @param {number} start - Start value (or stop if only one arg)
 * @param {number} [stop] - Stop value (exclusive)
 * @param {number} [step=1] - Step increment
 * @returns {Array<number>} Array of numbers in range
 */
exports.range = function(start, stop, step){
    if (typeof stop === 'undefined'){
        stop = start;
        start = 0;
    }
    if (typeof step === 'undefined'){
        step = 1;
    }
    if ((step > 0 && start >= stop) || (step < 0 && start <= stop)){
        return [];
    }
    var result = [];
    for (var i = start; step > 0 ? i < stop : i > stop; i += step){
        result.push(i);
    }
    return result;
};




/**
 * Converts a public key to a pay-to-pubkey script for POS coins.
 * Creates a script that can be redeemed by the holder of the private key.
 *
 * @function pubkeyToScript
 * @param {string} key - Public key in hex format (66 characters)
 * @returns {Buffer} Script buffer (35 bytes)
 * @throws {Error} If public key is not 66 characters
 */
exports.pubkeyToScript = function(key){
    if (key.length !== 66) {
        console.error('Invalid pubkey: ' + key);
        throw new Error();
    }
    var pubkey = Buffer.alloc(35);
    pubkey[0] = 0x21;
    pubkey[34] = 0xac;
    Buffer.from(key, 'hex').copy(pubkey, 1);
    return pubkey;
};


/**
 * Converts a mining key (RIPEMD-160 hash) to a pay-to-pubkey-hash script.
 *
 * @function miningKeyToScript
 * @param {string} key - Mining key in hex format (40 characters)
 * @returns {Buffer} P2PKH script buffer
 */
exports.miningKeyToScript = function(key){
    var keyBuffer = Buffer.from(key, 'hex');
    return Buffer.concat([Buffer.from([0x76, 0xa9, 0x14]), keyBuffer, Buffer.from([0x88, 0xac])]);
};

/**
 * Converts a wallet address to a pay-to-pubkey-hash script for POW coins.
 * Supports both legacy and CashAddr formats for Bitcoin Cash.
 *
 * @function addressToScript
 * @param {string} addr - Cryptocurrency address
 * @returns {Buffer} P2PKH script buffer
 * @throws {Error} If address format is invalid
 */
exports.addressToScript = function(addr){
    var address = addr;

    // Check if it's a CashAddr format
    if (bchaddr.isCashAddress(address)) {
        try {
            // Convert CashAddr to legacy format
            address = bchaddr.toLegacyAddress(address);
        } catch (err) {
            console.error('Invalid CashAddr format: ' + addr);
            throw new Error('Invalid CashAddr format');
        }
    }

    // Now process as legacy address
    var decoded = base58.decode(address);

    if (decoded.length != 25){
        console.error('invalid address length for ' + address);
        throw new Error('Invalid address length');
    }

    var pubkey = decoded.slice(1,-4);

    return Buffer.concat([Buffer.from([0x76, 0xa9, 0x14]), pubkey, Buffer.from([0x88, 0xac])]);
};


/**
 * Converts a hashrate value to a human-readable string with units.
 *
 * @function getReadableHashRateString
 * @param {number} hashrate - Hashrate in hashes per second
 * @returns {string} Formatted string (e.g., "125.50 MH")
 */
exports.getReadableHashRateString = function(hashrate){
    var i = -1;
    var byteUnits = [ ' KH', ' MH', ' GH', ' TH', ' PH' ];
    do {
        hashrate = hashrate / 1024;
        i++;
    } while (hashrate >= 1024);
    return hashrate.toFixed(2) + byteUnits[i];
};




/**
 * Creates a difficulty target by right-shifting the maximum uint256 value.
 * Used to calculate difficulty 1 target for different algorithms.
 *
 * @function shiftMax256Right
 * @param {number} shiftRight - Number of bits to shift right
 * @returns {Buffer} 32-byte buffer representing the shifted value
 */
exports.shiftMax256Right = function(shiftRight){

    //Max value uint256 (an array of ones representing 256 enabled bits)
    var arr256 = Array.apply(null, new Array(256)).map(Number.prototype.valueOf, 1);

    //An array of zero bits for how far the max uint256 is shifted right
    var arrLeft = Array.apply(null, new Array(shiftRight)).map(Number.prototype.valueOf, 0);

    //Add zero bits to uint256 and remove the bits shifted out
    arr256 = arrLeft.concat(arr256).slice(0, 256);

    //An array of bytes to convert the bits to, 8 bits in a byte so length will be 32
    var octets = [];

    for (var i = 0; i < 32; i++){

        octets[i] = 0;

        //The 8 bits for this byte
        var bits = arr256.slice(i * 8, i * 8 + 8);

        //Bit math to add the bits into a byte
        for (var f = 0; f < bits.length; f++){
            var multiplier = Math.pow(2, f);
            octets[i] += bits[f] * multiplier;
        }

    }

    return Buffer.from(octets);
};


/**
 * Converts a target buffer to compact bits representation.
 * Used in Bitcoin's difficulty encoding.
 *
 * @function bufferToCompactBits
 * @param {Buffer} startingBuff - Target value as buffer
 * @returns {Buffer} 4-byte compact representation
 */
exports.bufferToCompactBits = function(startingBuff){
    var bigNum = bignum.fromBuffer(startingBuff);
    var buff = bigNum.toBuffer();

    buff = buff.readUInt8(0) > 0x7f ? Buffer.concat([Buffer.from([0x00]), buff]) : buff;

    buff = Buffer.concat([Buffer.from([buff.length]), buff]);
    var compact = buff.slice(0, 4);
    return compact;
};

/**
 * Converts compact bits representation to a bignum target value.
 * Used to decode the 'bits' field from getblocktemplate.
 * @see {@link https://en.bitcoin.it/wiki/Target}
 *
 * @function bignumFromBitsBuffer
 * @param {Buffer} bitsBuff - Compact bits buffer (4 bytes)
 * @returns {Object} Bignum representing the target
 */
exports.bignumFromBitsBuffer = function(bitsBuff){
    var numBytes = bitsBuff.readUInt8(0);
    var bigBits = bignum.fromBuffer(bitsBuff.slice(1));
    var target = bigBits.mul(
        bignum(2).pow(
            bignum(8).mul(
                    numBytes - 3
            )
        )
    );
    return target;
};

/**
 * Converts compact bits hex string to a bignum target value.
 *
 * @function bignumFromBitsHex
 * @param {string} bitsString - Compact bits in hex format
 * @returns {Object} Bignum representing the target
 */
exports.bignumFromBitsHex = function(bitsString){
    var bitsBuff = Buffer.from(bitsString, 'hex');
    return exports.bignumFromBitsBuffer(bitsBuff);
};

/**
 * Converts compact bits to a full 256-bit target buffer.
 *
 * @function convertBitsToBuff
 * @param {Buffer} bitsBuff - Compact bits buffer
 * @returns {Buffer} 32-byte target buffer
 */
exports.convertBitsToBuff = function(bitsBuff){
    var target = exports.bignumFromBitsBuffer(bitsBuff);
    var resultBuff = target.toBuffer();
    var buff256 = Buffer.alloc(32);
    buff256.fill(0);
    resultBuff.copy(buff256, buff256.length - resultBuff.length);
    return buff256;
};

/**
 * Gets a truncated difficulty target for a given shift value.
 * Combines shifting and compact bits conversion.
 *
 * @function getTruncatedDiff
 * @param {number} shift - Number of bits to shift for difficulty
 * @returns {Buffer} Truncated difficulty target buffer
 */
exports.getTruncatedDiff = function(shift){
    return exports.convertBitsToBuff(exports.bufferToCompactBits(exports.shiftMax256Right(shift)));
};
