/**
 * @module algoProperties
 * @description SHA-256 algorithm properties for Bitcoin and Bitcoin Cash mining.
 * This module is optimized for SHA-256 only, removing all other algorithms
 * to maintain zero native dependencies.
 */

var bignum = require('./bignum-compat');
var util = require('./util.js');

/**
 * Difficulty 1 target - the maximum target value for difficulty 1.
 * @constant {number} diff1
 */
var diff1 = global.diff1 = 0x00000000ffff0000000000000000000000000000000000000000000000000000;

/**
 * SHA-256 algorithm definitions for cryptocurrency mining.
 * 
 * @namespace algos
 * @global
 */
var algos = module.exports = global.algos = {
    /**
     * SHA-256 double hash algorithm (Bitcoin, Bitcoin Cash).
     * Uses Node.js built-in crypto module - no external dependencies.
     * @memberof algos
     */
    sha256: {
        //Uncomment diff if you want to use hardcoded truncated diff
        //diff: '00000000ffff0000000000000000000000000000000000000000000000000000',
        multiplier: 1,
        hash: function(){
            return function(){
                return util.sha256d.apply(this, arguments);
            }
        }
    },
    /**
     * SHA-256 with ASICBoost support.
     * Allows version rolling for improved mining efficiency (up to 20% power savings).
     * Uses same hash function as standard SHA-256.
     * @memberof algos
     */
    sha256asicboost: {
        multiplier: 1,
        hash: function(){
            return function(){
                return util.sha256d.apply(this, arguments);
            }
        }
    }
};

// Set default multiplier for any algo that doesn't have one
for (var algo in algos){
    if (!algos[algo].multiplier)
        algos[algo].multiplier = 1;
}