/**
 * @module algoProperties-sha256
 * @description Optimized SHA-256 algorithm properties for Bitcoin Cash with ASICBoost support.
 * This is a minimal version containing only SHA-256 for BCH solo mining.
 */

var bignum = require('./bignum-compat');
var util = require('./util.js');

/**
 * Difficulty 1 target - the maximum target value for difficulty 1.
 * @constant {number} diff1
 */
var diff1 = global.diff1 = 0x00000000ffff0000000000000000000000000000000000000000000000000000;

/**
 * SHA-256 specific algorithm properties.
 * @namespace algos
 */
var algos = module.exports = global.algos = {
    /**
     * SHA-256 double hash algorithm configuration (Bitcoin/Bitcoin Cash).
     * @memberof algos
     * @property {number} multiplier - Difficulty multiplier (1 for SHA-256)
     * @property {Function} hash - Returns the double SHA-256 hash function
     * @property {Function} getASICBoostHeader - Validates version for ASICBoost compatibility
     */
    sha256: {
        multiplier: 1,
        
        /**
         * Returns the SHA-256 double hash function.
         * @returns {Function} Hash function that performs SHA256(SHA256(data))
         */
        hash: function(){
            return function(){
                return util.sha256d.apply(this, arguments);
            }
        },
        
        /**
         * Validates and adjusts block version for ASICBoost compatibility.
         * ASICBoost uses version rolling in the range 0x20000000 to 0x3FFFFFFF.
         * This provides 2^29 possible versions for rolling.
         * 
         * @param {number} version - Proposed block version
         * @returns {number} Version adjusted to ASICBoost range
         */
        getASICBoostHeader: function(version) {
            var minVersion = 0x20000000;  // BIP9 version bits minimum
            var maxVersion = 0x3FFFFFFF;  // Maximum version for ASICBoost
            
            // Ensure version is within ASICBoost range
            if (version < minVersion) version = minVersion;
            if (version > maxVersion) version = maxVersion;
            
            return version;
        }
    }
};

// For BCH solo mining, we only need SHA256
// Remove all other algorithms to reduce complexity