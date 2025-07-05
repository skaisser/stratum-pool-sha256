/**
 * @module bignum-compat
 * @description BigInt compatibility layer to replace the native bignum package.
 * Provides a bignum-like API using JavaScript's native BigInt for arbitrary precision arithmetic.
 * This avoids native module compilation issues while maintaining API compatibility.
 */

/**
 * BigInt wrapper class that mimics the bignum module API.
 * Handles arbitrary precision integer arithmetic operations.
 * 
 * @class BigNumCompat
 * @param {*} value - Value to initialize the BigNum with
 * @param {number} [base] - Base for string parsing (e.g., 16 for hex)
 */
class BigNumCompat {
    constructor(value, base) {
        if (value instanceof BigNumCompat) {
            this.value = value.value;
        } else if (typeof value === 'string' && base) {
            // Parse string with specific base (e.g., hex with base 16)
            this.value = BigInt(base === 16 ? '0x' + value : parseInt(value, base).toString());
        } else if (typeof value === 'number' || typeof value === 'string') {
            this.value = BigInt(value);
        } else if (typeof value === 'bigint') {
            this.value = value;
        } else {
            throw new Error('Invalid value type for BigNumCompat');
        }
    }

    /**
     * Creates a BigNumCompat instance from a buffer.
     * 
     * @static
     * @param {Buffer} buffer - Buffer to convert
     * @param {Object} [options={}] - Conversion options
     * @param {string} [options.endian='big'] - Byte order ('big' or 'little')
     * @param {number} [options.size] - Expected buffer size
     * @returns {BigNumCompat} New BigNumCompat instance
     */
    static fromBuffer(buffer, options = {}) {
        const { endian = 'big', size } = options;
        let hex = '';
        
        if (endian === 'little') {
            // Reverse the buffer for little endian
            const reversed = Buffer.from(buffer).reverse();
            hex = reversed.toString('hex');
        } else {
            hex = buffer.toString('hex');
        }
        
        // Handle empty or zero buffers
        if (hex === '' || hex === '00') {
            return new BigNumCompat(0);
        }
        
        return new BigNumCompat(hex, 16);
    }

    /**
     * Converts the BigNum to a buffer.
     * 
     * @method toBuffer
     * @param {Object} [options={}] - Conversion options
     * @param {string} [options.endian='big'] - Byte order ('big' or 'little')
     * @param {number} [options.size=32] - Output buffer size
     * @returns {Buffer} Buffer representation
     */
    toBuffer(options = {}) {
        const { endian = 'big', size = 32 } = options;
        let hex = this.value.toString(16);
        
        // Pad with zeros if necessary
        if (hex.length % 2 !== 0) {
            hex = '0' + hex;
        }
        
        let buffer = Buffer.from(hex, 'hex');
        
        // Pad to requested size
        if (buffer.length < size) {
            const padding = Buffer.alloc(size - buffer.length);
            buffer = Buffer.concat([padding, buffer]);
        }
        
        if (endian === 'little') {
            buffer = buffer.reverse();
        }
        
        return buffer;
    }

    /**
     * Converts to JavaScript number.
     * Note: May lose precision for values > Number.MAX_SAFE_INTEGER.
     * 
     * @method toNumber
     * @returns {number} JavaScript number representation
     */
    toNumber() {
        if (this.value > Number.MAX_SAFE_INTEGER) {
            // Suppress warning - Bitcoin Cash difficulty naturally exceeds MAX_SAFE_INTEGER
            // console.warn('BigNumCompat.toNumber(): Value exceeds MAX_SAFE_INTEGER, precision may be lost');
        }
        return Number(this.value);
    }

    /**
     * Multiplies this BigNum by another value.
     * 
     * @method mul
     * @param {BigNumCompat|number|string|bigint} other - Value to multiply by
     * @returns {BigNumCompat} Result of multiplication
     */
    mul(other) {
        const otherValue = other instanceof BigNumCompat ? other.value : BigInt(other);
        return new BigNumCompat(this.value * otherValue);
    }

    // Power
    pow(exponent) {
        const exp = exponent instanceof BigNumCompat ? exponent.value : BigInt(exponent);
        return new BigNumCompat(this.value ** exp);
    }

    /**
     * Checks if this BigNum is greater than or equal to another value.
     * 
     * @method ge
     * @param {BigNumCompat|number|string|bigint} other - Value to compare with
     * @returns {boolean} True if this >= other
     */
    ge(other) {
        const otherValue = other instanceof BigNumCompat ? other.value : BigInt(other);
        return this.value >= otherValue;
    }

    // Less than
    lt(other) {
        const otherValue = other instanceof BigNumCompat ? other.value : BigInt(other);
        return this.value < otherValue;
    }

    // Greater than
    gt(other) {
        const otherValue = other instanceof BigNumCompat ? other.value : BigInt(other);
        return this.value > otherValue;
    }

    // Addition
    add(other) {
        const otherValue = other instanceof BigNumCompat ? other.value : BigInt(other);
        return new BigNumCompat(this.value + otherValue);
    }

    // Subtraction
    sub(other) {
        const otherValue = other instanceof BigNumCompat ? other.value : BigInt(other);
        return new BigNumCompat(this.value - otherValue);
    }

    // Division
    div(other) {
        const otherValue = other instanceof BigNumCompat ? other.value : BigInt(other);
        return new BigNumCompat(this.value / otherValue);
    }

    // Modulo
    mod(other) {
        const otherValue = other instanceof BigNumCompat ? other.value : BigInt(other);
        return new BigNumCompat(this.value % otherValue);
    }

    // Bitwise shift left
    shiftLeft(bits) {
        const bitCount = bits instanceof BigNumCompat ? bits.value : BigInt(bits);
        return new BigNumCompat(this.value << bitCount);
    }

    // Bitwise shift right
    shiftRight(bits) {
        const bitCount = bits instanceof BigNumCompat ? bits.value : BigInt(bits);
        return new BigNumCompat(this.value >> bitCount);
    }

    /**
     * Converts to string representation.
     * 
     * @method toString
     * @param {number} [base=10] - Numeric base for string conversion
     * @returns {string} String representation
     */
    toString(base = 10) {
        return this.value.toString(base);
    }
}

/**
 * Factory function to create BigNumCompat instances.
 * Mimics the original bignum module's API.
 * 
 * @function bignum
 * @param {*} value - Value to initialize the BigNum with
 * @param {number} [base] - Base for string parsing
 * @returns {BigNumCompat} New BigNumCompat instance
 */
function bignum(value, base) {
    return new BigNumCompat(value, base);
}

// Add static methods to factory function
bignum.fromBuffer = BigNumCompat.fromBuffer;

// For backward compatibility with require('bignum')
module.exports = bignum;