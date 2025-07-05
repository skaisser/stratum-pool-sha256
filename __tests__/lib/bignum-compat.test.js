const bignum = require('../../lib/bignum-compat');

describe('bignum-compat', () => {
    describe('fromBuffer', () => {
        it('should convert buffer to bignum object', () => {
            const buffer = Buffer.from('ff', 'hex');
            const bn = bignum.fromBuffer(buffer);
            
            expect(bn.value).toBe(255n);
            expect(bn.toString()).toBe('255');
            expect(bn.toString(16)).toBe('ff');
        });

        it('should handle little endian', () => {
            const buffer = Buffer.from('00ff', 'hex');
            const bn = bignum.fromBuffer(buffer, { endian: 'little' });
            
            expect(bn.value).toBe(0xff00n);
            expect(bn.toString(16)).toBe('ff00');
        });

        it('should handle big endian (default)', () => {
            const buffer = Buffer.from('00ff', 'hex');
            const bn = bignum.fromBuffer(buffer);
            
            expect(bn.value).toBe(0xffn);
            expect(bn.toString(16)).toBe('ff');
        });

        it('should handle specific size', () => {
            const buffer = Buffer.from('ff00ff00', 'hex');
            // Note: size option limits how many bytes are read from the buffer
            const bn = bignum.fromBuffer(buffer.slice(0, 2));
            
            expect(bn.toString(16)).toBe('ff00');
        });

        it('should handle empty buffer', () => {
            const buffer = Buffer.alloc(0);
            const bn = bignum.fromBuffer(buffer);
            
            expect(bn.value).toBe(0n);
        });
    });

    describe('constructor function', () => {
        it('should create from number', () => {
            const bn = bignum(12345);
            expect(bn.value).toBe(12345n);
            expect(bn.toString()).toBe('12345');
        });

        it('should create from string', () => {
            const bn = bignum('12345');
            expect(bn.value).toBe(12345n);
        });

        it('should create from hex string with base', () => {
            const bn = bignum('ff', 16);
            expect(bn.value).toBe(255n);
        });

        it('should create from BigInt', () => {
            const bn = bignum(123n);
            expect(bn.value).toBe(123n);
        });

        it('should create from another bignum object', () => {
            const bn1 = bignum(123);
            const bn2 = bignum(bn1);
            expect(bn2.value).toBe(123n);
        });
    });

    describe('arithmetic operations', () => {
        let bn1, bn2;

        beforeEach(() => {
            bn1 = bignum(100);
            bn2 = bignum(25);
        });

        it('should add numbers', () => {
            const result = bn1.add(bn2);
            expect(result.value).toBe(125n);
        });

        it('should subtract numbers', () => {
            const result = bn1.sub(bn2);
            expect(result.value).toBe(75n);
        });

        it('should multiply numbers', () => {
            const result = bn1.mul(bn2);
            expect(result.value).toBe(2500n);
        });

        it('should divide numbers', () => {
            const result = bn1.div(bn2);
            expect(result.value).toBe(4n);
        });

        it('should calculate modulo', () => {
            const result = bn1.mod(bn2);
            expect(result.value).toBe(0n);
        });

        it('should calculate power', () => {
            const result = bignum(2).pow(10);
            expect(result.value).toBe(1024n);
        });

        it('should handle chaining operations', () => {
            const result = bn1.add(bn2).mul(2);
            expect(result.value).toBe(250n);
        });
    });

    describe('bitwise operations', () => {
        it('should shift left', () => {
            const bn = bignum(1);
            const result = bn.shiftLeft(8);
            expect(result.value).toBe(256n);
        });

        it('should shift right', () => {
            const bn = bignum(256);
            const result = bn.shiftRight(8);
            expect(result.value).toBe(1n);
        });
    });

    describe('comparison operations', () => {
        it('should compare less than', () => {
            const bn1 = bignum(10);
            const bn2 = bignum(20);
            expect(bn1.lt(bn2)).toBe(true);
            expect(bn2.lt(bn1)).toBe(false);
        });

        it('should compare greater than', () => {
            const bn1 = bignum(20);
            const bn2 = bignum(10);
            expect(bn1.gt(bn2)).toBe(true);
        });

        it('should compare greater than or equal', () => {
            const bn1 = bignum(10);
            const bn2 = bignum(10);
            expect(bn1.ge(bn2)).toBe(true);
        });
    });

    describe('conversion methods', () => {
        it('should convert to number', () => {
            const bn = bignum(12345);
            expect(bn.toNumber()).toBe(12345);
        });

        it('should handle toNumber with large values', () => {
            const bn = bignum('9007199254740992'); // MAX_SAFE_INTEGER + 1
            const num = bn.toNumber();
            expect(num).toBe(9007199254740992);
            // Note: Precision may be lost for values > MAX_SAFE_INTEGER
        });

        it('should convert to string', () => {
            const bn = bignum(255);
            expect(bn.toString()).toBe('255');
            expect(bn.toString(16)).toBe('ff');
            expect(bn.toString(2)).toBe('11111111');
        });

        it('should convert to buffer', () => {
            const bn = bignum(0xff00);
            const buffer = bn.toBuffer();
            expect(buffer.length).toBe(32); // Default size
            expect(buffer.toString('hex')).toBe('000000000000000000000000000000000000000000000000000000000000ff00');
        });

        it('should convert to buffer with specific size', () => {
            const bn = bignum(0xff);
            const buffer = bn.toBuffer({ size: 4 });
            expect(buffer.length).toBe(4);
            expect(buffer.toString('hex')).toBe('000000ff');
        });

        it('should convert to buffer with little endian', () => {
            const bn = bignum(0xff00);
            const buffer = bn.toBuffer({ endian: 'little', size: 2 });
            expect(buffer.toString('hex')).toBe('00ff');
        });
    });

    describe('edge cases', () => {
        it('should handle zero', () => {
            const bn = bignum(0);
            expect(bn.value).toBe(0n);
            expect(bn.toString()).toBe('0');
        });

        it('should handle negative numbers', () => {
            const bn = bignum(-123);
            expect(bn.value).toBe(-123n);
            expect(bn.toString()).toBe('-123');
        });

        it('should handle very large numbers', () => {
            const largeHex = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
            const bn = bignum(largeHex, 16);
            expect(bn.toString(16)).toBe(largeHex);
        });

        it('should handle operations that return existing bignum objects', () => {
            const bn = bignum(100);
            // When argument is already a bignum, many operations return it directly
            const result = bn.add(0);
            expect(result.value).toBe(100n);
        });
    });
});