// Optimized for SHA256 (Bitcoin Cash) with ASICBoost support
var bignum = require('./bignum-compat');
var util = require('./util.js');

var diff1 = global.diff1 = 0x00000000ffff0000000000000000000000000000000000000000000000000000;

var algos = module.exports = global.algos = {
    sha256: {
        hash: function(){
            return function(){
                return util.sha256d.apply(this, arguments);
            }
        },
        // ASICBoost support
        getASICBoostHeader: function(version) {
            // ASICBoost uses version rolling in the range 0x20000000 to 0x3FFFFFFF
            // This provides 2^29 possible versions for rolling
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