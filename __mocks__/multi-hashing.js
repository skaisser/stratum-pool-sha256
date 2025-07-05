const crypto = require('crypto');

module.exports = {
    sha256: function(buffer) {
        return crypto.createHash('sha256').update(buffer).digest();
    },
    sha256d: function(buffer) {
        const hash1 = crypto.createHash('sha256').update(buffer).digest();
        return crypto.createHash('sha256').update(hash1).digest();
    },
    scrypt: function(buffer) {
        return crypto.createHash('sha256').update(buffer).digest(); // Mock
    },
    scryptn: function(buffer) {
        return crypto.createHash('sha256').update(buffer).digest(); // Mock
    },
    keccak: function(buffer, format) {
        return crypto.createHash('sha256').update(buffer).digest(); // Mock
    },
    x11: function(buffer) {
        return crypto.createHash('sha256').update(buffer).digest(); // Mock
    },
    x13: function(buffer) {
        return crypto.createHash('sha256').update(buffer).digest(); // Mock
    },
    x15: function(buffer) {
        return crypto.createHash('sha256').update(buffer).digest(); // Mock
    },
    x16r: function(buffer) {
        return crypto.createHash('sha256').update(buffer).digest(); // Mock
    },
    x16rv2: function(buffer) {
        return crypto.createHash('sha256').update(buffer).digest(); // Mock
    },
    nist5: function(buffer) {
        return crypto.createHash('sha256').update(buffer).digest(); // Mock
    },
    quark: function(buffer) {
        return crypto.createHash('sha256').update(buffer).digest(); // Mock
    },
    qubit: function(buffer) {
        return crypto.createHash('sha256').update(buffer).digest(); // Mock
    },
    groestl: function(buffer) {
        return crypto.createHash('sha256').update(buffer).digest(); // Mock
    },
    groestlmyriad: function(buffer) {
        return crypto.createHash('sha256').update(buffer).digest(); // Mock
    },
    blake: function(buffer) {
        return crypto.createHash('sha256').update(buffer).digest(); // Mock
    },
    blake2s: function(buffer) {
        return crypto.createHash('sha256').update(buffer).digest(); // Mock
    },
    skein: function(buffer) {
        return crypto.createHash('sha256').update(buffer).digest(); // Mock
    },
    bcrypt: function(buffer) {
        return crypto.createHash('sha256').update(buffer).digest(); // Mock
    }
};