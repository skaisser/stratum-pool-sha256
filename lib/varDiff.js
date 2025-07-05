/**
 * @module varDiff
 * @description Variable difficulty adjustment for Stratum mining pools.
 * Automatically adjusts worker difficulty based on share submission rate.
 * Ported from stratum-mining share-limiter.
 * @see {@link https://github.com/ahmedbodi/stratum-mining/blob/master/mining/basic_share_limiter.py}
 */

var events = require('events');

/**
 * Ring buffer implementation for storing time intervals between shares.
 * Used to calculate rolling average of share submission times.
 * 
 * @class RingBuffer
 * @private
 * @param {number} maxSize - Maximum number of elements to store
 */
function RingBuffer(maxSize){
    var data = [];
    var cursor = 0;
    var isFull = false;
    this.append = function(x){
        if (isFull){
            data[cursor] = x;
            cursor = (cursor + 1) % maxSize;
        }
        else{
            data.push(x);
            cursor++;
            if (data.length === maxSize){
                cursor = 0;
                isFull = true;
            }
        }
    };
    this.avg = function(){
        var sum = data.reduce(function(a, b){ return a + b });
        return sum / (isFull ? maxSize : cursor);
    };
    this.size = function(){
        return isFull ? maxSize : cursor;
    };
    this.clear = function(){
        data = [];
        cursor = 0;
        isFull = false;
    };
}

/**
 * Truncates a number to a fixed amount of decimal places.
 * 
 * @function toFixed
 * @private
 * @param {number} num - Number to truncate
 * @param {number} len - Number of decimal places
 * @returns {number} Truncated number
 */
function toFixed(num, len) {
    return parseFloat(num.toFixed(len));
}

/**
 * Variable difficulty controller for automatically adjusting miner difficulty.
 * Monitors share submission rate and adjusts difficulty to maintain target time between shares.
 * 
 * @class varDiff
 * @extends {EventEmitter}
 * @param {number} port - Port number this vardiff instance manages
 * @param {Object} varDiffOptions - Variable difficulty configuration
 * @param {number} varDiffOptions.minDiff - Minimum allowed difficulty
 * @param {number} varDiffOptions.maxDiff - Maximum allowed difficulty
 * @param {number} varDiffOptions.targetTime - Target seconds between shares
 * @param {number} varDiffOptions.retargetTime - Seconds between difficulty adjustments
 * @param {number} varDiffOptions.variancePercent - Allowed variance from target time (%)
 * 
 * @fires varDiff#newDifficulty - When difficulty should be changed for a client
 */
var varDiff = module.exports = function varDiff(port, varDiffOptions){
    var _this = this;

    var bufferSize, tMin, tMax;

    //if (!varDiffOptions) return;

    var variance = varDiffOptions.targetTime * (varDiffOptions.variancePercent / 100);

    
    bufferSize = varDiffOptions.retargetTime / varDiffOptions.targetTime * 4;
    tMin       = varDiffOptions.targetTime - variance;
    tMax       = varDiffOptions.targetTime + variance;



    /**
     * Manages variable difficulty for a connected client.
     * Monitors the client's share submission rate and adjusts difficulty accordingly.
     * 
     * @method manageClient
     * @param {Object} client - Stratum client object to manage
     */
    this.manageClient = function(client){

        var stratumPort = client.socket.localPort;

        if (stratumPort != port) {
            console.error("Handling a client which is not of this vardiff?");
        }
        var options = varDiffOptions;

        var lastTs;
        var lastRtc;
        var timeBuffer;

        client.on('submit', function(){

            var ts = (Date.now() / 1000) | 0;

            if (!lastRtc){
                lastRtc = ts - options.retargetTime / 2;
                lastTs = ts;
                timeBuffer = new RingBuffer(bufferSize);
                return;
            }

            var sinceLast = ts - lastTs;

            timeBuffer.append(sinceLast);
            lastTs = ts;

            if ((ts - lastRtc) < options.retargetTime && timeBuffer.size() > 0)
                return;

            lastRtc = ts;
            var avg = timeBuffer.avg();
            var ddiff = options.targetTime / avg;

            if (avg > tMax && client.difficulty > options.minDiff) {
                if (options.x2mode) {
                    ddiff = 0.5;
                }
                if (ddiff * client.difficulty < options.minDiff) {
                    ddiff = options.minDiff / client.difficulty;
                }
            } else if (avg < tMin) {
                if (options.x2mode) {
                    ddiff = 2;
                }
                var diffMax = options.maxDiff;
                if (ddiff * client.difficulty > diffMax) {
                    ddiff = diffMax / client.difficulty;
                }
            }
            else{
                return;
            }

            var newDiff = toFixed(client.difficulty * ddiff, 8);
            timeBuffer.clear();
            _this.emit('newDifficulty', client, newDiff);
        });
    };
};
varDiff.prototype.__proto__ = events.EventEmitter.prototype;
