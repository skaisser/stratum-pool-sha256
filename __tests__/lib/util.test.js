const util = require('../../lib/util');
const crypto = require('crypto');

describe('util', () => {
    describe('addressFromEx', () => {
        it('should convert address from example format', () => {
            const exAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
            const ripdm160Key = '62e907b15cbf27d5425399ebf6f0fb50ebb88f18';
            const result = util.addressFromEx(exAddress, ripdm160Key);
            expect(result).toBeTruthy();
            expect(typeof result).toBe('string');
        });

        it('should handle CashAddr format', () => {
            // Mock Bitcoin Cash CashAddr
            const exAddress = 'bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a';
            const ripdm160Key = '76a04053bda0a88bda5177b86a15c3b29f559873';
            const result = util.addressFromEx(exAddress, ripdm160Key);
            expect(result).toBeTruthy();
        });

        it('should return null for invalid input', () => {
            const result = util.addressFromEx('invalid', 'invalid');
            expect(result).toBeNull();
        });
    });

    describe('sha256', () => {
        it('should compute SHA256 hash', () => {
            const data = Buffer.from('hello world');
            const hash = util.sha256(data);
            const expected = crypto.createHash('sha256').update(data).digest();
            expect(hash).toEqual(expected);
        });
    });

    describe('sha256d', () => {
        it('should compute double SHA256 hash', () => {
            const data = Buffer.from('hello world');
            const hash = util.sha256d(data);
            const hash1 = crypto.createHash('sha256').update(data).digest();
            const expected = crypto.createHash('sha256').update(hash1).digest();
            expect(hash).toEqual(expected);
        });
    });

    describe('reverseBuffer', () => {
        it('should reverse buffer bytes', () => {
            const buffer = Buffer.from([1, 2, 3, 4, 5]);
            const reversed = util.reverseBuffer(buffer);
            expect(reversed).toEqual(Buffer.from([5, 4, 3, 2, 1]));
        });

        it('should handle empty buffer', () => {
            const buffer = Buffer.alloc(0);
            const reversed = util.reverseBuffer(buffer);
            expect(reversed).toEqual(Buffer.alloc(0));
        });
    });

    describe('reverseHex', () => {
        it('should reverse hex string', () => {
            const hex = '0102030405';
            const reversed = util.reverseHex(hex);
            expect(reversed).toBe('0504030201');
        });
    });

    describe('varIntBuffer', () => {
        it('should encode small numbers < 0xfd', () => {
            const buffer = util.varIntBuffer(100);
            expect(buffer.length).toBe(1);
            expect(buffer[0]).toBe(100);
        });

        it('should encode numbers <= 0xffff', () => {
            const buffer = util.varIntBuffer(1000);
            expect(buffer.length).toBe(3);
            expect(buffer[0]).toBe(0xfd);
        });

        it('should encode numbers <= 0xffffffff', () => {
            const buffer = util.varIntBuffer(100000);
            expect(buffer.length).toBe(5);
            expect(buffer[0]).toBe(0xfe);
        });

        it('should encode large numbers', () => {
            const buffer = util.varIntBuffer(10000000000);
            expect(buffer.length).toBe(9);
            expect(buffer[0]).toBe(0xff);
        });
    });

    describe('packInt64LE', () => {
        it('should pack 64-bit integer in little endian', () => {
            const num = 1234567890;
            const buffer = util.packInt64LE(num);
            expect(buffer.length).toBe(8);
            expect(buffer.readUInt32LE(0)).toBe(num % Math.pow(2, 32));
            expect(buffer.readUInt32LE(4)).toBe(Math.floor(num / Math.pow(2, 32)));
        });
    });

    describe('serializeNumber', () => {
        it('should serialize small numbers 1-16', () => {
            const buffer = util.serializeNumber(10);
            expect(buffer.length).toBe(1);
            expect(buffer[0]).toBe(0x50 + 10);
        });

        it('should serialize larger numbers', () => {
            const buffer = util.serializeNumber(256);
            expect(buffer.length).toBeGreaterThan(1);
            expect(buffer[0]).toBe(2); // length byte
        });
    });

    describe('addressToScript', () => {
        it('should convert legacy address to script', () => {
            const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
            const script = util.addressToScript(address);
            expect(script).toBeInstanceOf(Buffer);
            expect(script[0]).toBe(0x76); // OP_DUP
            expect(script[1]).toBe(0xa9); // OP_HASH160
            expect(script[2]).toBe(0x14); // Push 20 bytes
        });

        it('should handle CashAddr format', () => {
            const cashAddr = 'bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a';
            expect(() => util.addressToScript(cashAddr)).not.toThrow();
        });

        it('should throw on invalid address', () => {
            expect(() => util.addressToScript('invalid')).toThrow();
        });
    });

    describe('getReadableHashRateString', () => {
        it('should format hash rates correctly', () => {
            expect(util.getReadableHashRateString(1000)).toBe('1000.00 KH');
            expect(util.getReadableHashRateString(1024)).toBe('1.00 MH');
            expect(util.getReadableHashRateString(1048576)).toBe('1.00 GH');
            expect(util.getReadableHashRateString(1073741824)).toBe('1.00 TH');
            expect(util.getReadableHashRateString(1099511627776)).toBe('1.00 PH');
        });
    });

    describe('range', () => {
        it('should generate range of numbers', () => {
            expect(util.range(5)).toEqual([0, 1, 2, 3, 4]);
            expect(util.range(2, 5)).toEqual([2, 3, 4]);
            expect(util.range(0, 10, 2)).toEqual([0, 2, 4, 6, 8]);
            expect(util.range(5, 0, -1)).toEqual([5, 4, 3, 2, 1]);
        });
    });
});