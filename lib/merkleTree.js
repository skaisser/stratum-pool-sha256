/**
 * @module merkleTree
 * @description Merkle tree implementation for calculating transaction merkle roots.
 * Used in block construction to create the merkle root from transaction hashes.
 * Ported from stratum-mining Python implementation.
 * @see {@link https://github.com/slush0/stratum-mining/blob/master/lib/merkletree.py}
 */

var util = require('./util.js');

/**
 * Constructs a Merkle tree from transaction data.
 * The tree is used to calculate the merkle root for block headers.
 * 
 * @class MerkleTree
 * @param {Array<Buffer>} data - Array of transaction hashes (as buffers)
 */
var MerkleTree = module.exports = function MerkleTree(data){

    function merkleJoin(h1, h2){
        var joined = Buffer.concat([h1, h2]);
        var dhashed = util.sha256d(joined);
        return dhashed;
    }

    function calculateSteps(data){
        var L = data;
        var steps = [];
        var PreL = [null];
        var StartL = 2;
        var Ll = L.length;

        if (Ll > 1){
            while (true){

                if (Ll === 1)
                    break;

                steps.push(L[1]);

                if (Ll % 2)
                    L.push(L[L.length - 1]);

                var Ld = [];
                var r = util.range(StartL, Ll, 2);
                r.forEach(function(i){
                    Ld.push(merkleJoin(L[i], L[i + 1]));
                });
                L = PreL.concat(Ld);
                Ll = L.length;
            }
        }
       return steps;
    }

    this.data = data;
    this.steps = calculateSteps(data);

}
MerkleTree.prototype = {
    /**
     * Calculates the merkle root by combining the first element with the tree steps.
     * Used to get the final merkle root when the coinbase transaction hash is known.
     * 
     * @method withFirst
     * @param {Buffer} f - First element (usually coinbase transaction hash)
     * @returns {Buffer} The calculated merkle root
     */
    withFirst: function(f){
        this.steps.forEach(function(s){
            f = util.sha256d(Buffer.concat([f, s]));
        });
        return f;
    }
};