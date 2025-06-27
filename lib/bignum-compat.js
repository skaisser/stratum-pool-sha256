// BigInt compatibility layer to replace bignum package
// This provides a bignum-like API using native BigInt

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

    // Static method to create from buffer
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

    // Convert to buffer
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

    // Convert to number (may lose precision for large values)
    toNumber() {
        if (this.value > Number.MAX_SAFE_INTEGER) {
            // Suppress warning - Bitcoin Cash difficulty naturally exceeds MAX_SAFE_INTEGER
            // console.warn('BigNumCompat.toNumber(): Value exceeds MAX_SAFE_INTEGER, precision may be lost');
        }
        return Number(this.value);
    }

    // Multiplication
    mul(other) {
        const otherValue = other instanceof BigNumCompat ? other.value : BigInt(other);
        return new BigNumCompat(this.value * otherValue);
    }

    // Power
    pow(exponent) {
        const exp = exponent instanceof BigNumCompat ? exponent.value : BigInt(exponent);
        return new BigNumCompat(this.value ** exp);
    }

    // Greater than or equal
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

    // Convert to string
    toString(base = 10) {
        return this.value.toString(base);
    }
}

// Factory function to mimic bignum() constructor
function bignum(value, base) {
    return new BigNumCompat(value, base);
}

// Add static methods to factory function
bignum.fromBuffer = BigNumCompat.fromBuffer;

// For backward compatibility with require('bignum')
module.exports = bignum;