/**
 * Example of how to parse difficulty from miner passwords
 * This shows how pool implementations can handle password-based difficulty settings
 */

/**
 * Parses difficulty from a password string
 * Supports formats like "d=500000" or "x,d=10000000"
 * 
 * @param {string} password - The password string from the miner
 * @returns {number|null} - The parsed difficulty or null if not found
 */
function parseDifficultyFromPassword(password) {
    if (!password || typeof password !== 'string') {
        return null;
    }
    
    // Match patterns like d=123 or d=123.456
    const difficultyMatch = password.match(/d=(\d+(?:\.\d+)?)/i);
    
    if (difficultyMatch && difficultyMatch[1]) {
        const difficulty = parseFloat(difficultyMatch[1]);
        
        // Validate the difficulty is reasonable
        if (difficulty > 0 && difficulty < Number.MAX_SAFE_INTEGER) {
            return difficulty;
        }
    }
    
    return null;
}

/**
 * Example authorization function that supports difficulty parsing
 * This is what pool implementations would provide to the stratum-pool library
 */
const authorizeFn = (ip, port, workerName, password, callback) => {
    // Parse difficulty from password
    const difficulty = parseDifficultyFromPassword(password);
    
    // Log for debugging
    if (difficulty) {
        console.log(`Worker ${workerName} requested difficulty: ${difficulty}`);
    }
    
    // Return authorization result with optional difficulty
    callback({
        error: null,
        authorized: true,
        disconnect: false,
        difficulty: difficulty  // This will be used by stratum.js to set custom difficulty
    });
};

// Example usage in pool configuration
const Stratum = require('stratum-pool-sha256');

const pool = Stratum.createPool({
    coin: {
        name: 'BitcoinCash',
        symbol: 'BCH',
        algorithm: 'sha256',
        asicboost: true
    },
    
    address: 'bitcoincash:qr95sy3j9xwd2ap32xkykttr4cvcu7as4y0qverfuy',
    
    ports: {
        3333: { diff: 16 },
        3335: { 
            diff: 65536,
            varDiff: {
                minDiff: 16384,
                maxDiff: 4294967296,
                targetTime: 10,
                retargetTime: 60,
                variancePercent: 20
            }
        }
    },
    
    daemons: [{
        host: '127.0.0.1',
        port: 8332,
        user: 'rpcuser',
        password: 'rpcpass'
    }]
}, authorizeFn);  // Use our custom authorization function

// Test the parser
console.log(parseDifficultyFromPassword('d=500000'));        // 500000
console.log(parseDifficultyFromPassword('x,d=10000000'));    // 10000000
console.log(parseDifficultyFromPassword('d=123.456'));       // 123.456
console.log(parseDifficultyFromPassword('worker1'));         // null
console.log(parseDifficultyFromPassword(''));                // null

module.exports = {
    parseDifficultyFromPassword,
    authorizeFn
};