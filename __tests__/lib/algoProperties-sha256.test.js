const algos = require('../../lib/algoProperties-sha256');
const util = require('../../lib/util');

describe('algoProperties-sha256', () => {
    describe('SHA256 algorithm', () => {
        it('should have correct properties', () => {
            expect(algos.sha256).toBeDefined();
            expect(algos.sha256.multiplier).toBe(1);
            expect(algos.sha256.hash).toBeDefined();
            expect(typeof algos.sha256.hash).toBe('function');
        });

        it('should return a hash function that uses sha256d', () => {
            const hashFunc = algos.sha256.hash();
            expect(typeof hashFunc).toBe('function');
            
            // Test that it actually hashes data
            const testData = Buffer.from('test data');
            const hash = hashFunc(testData);
            expect(hash).toBeInstanceOf(Buffer);
            expect(hash.length).toBe(32); // SHA-256 produces 32 bytes
        });

        it('should produce consistent hashes', () => {
            const hashFunc = algos.sha256.hash();
            const testData = Buffer.from('test data');
            
            const hash1 = hashFunc(testData);
            const hash2 = hashFunc(testData);
            
            expect(hash1.toString('hex')).toBe(hash2.toString('hex'));
        });

        it('should produce different hashes for different data', () => {
            const hashFunc = algos.sha256.hash();
            
            const hash1 = hashFunc(Buffer.from('test data 1'));
            const hash2 = hashFunc(Buffer.from('test data 2'));
            
            expect(hash1.toString('hex')).not.toBe(hash2.toString('hex'));
        });
    });

    describe('SHA256 ASICBoost support', () => {
        it('should have getASICBoostHeader function', () => {
            expect(algos.sha256.getASICBoostHeader).toBeDefined();
            expect(typeof algos.sha256.getASICBoostHeader).toBe('function');
        });

        it('should adjust version to ASICBoost range', () => {
            // Below minimum
            expect(algos.sha256.getASICBoostHeader(0x10000000)).toBe(0x20000000);
            
            // Above maximum
            expect(algos.sha256.getASICBoostHeader(0x50000000)).toBe(0x3FFFFFFF);
            
            // Within range
            expect(algos.sha256.getASICBoostHeader(0x30000000)).toBe(0x30000000);
        });
    });

    describe('Global diff1 constant', () => {
        it('should be defined globally', () => {
            expect(global.diff1).toBeDefined();
            expect(global.diff1).toBe(0x00000000ffff0000000000000000000000000000000000000000000000000000);
        });
    });

    describe('Algorithm enumeration', () => {
        it('should only contain SHA256 algorithm', () => {
            const algoNames = Object.keys(algos);
            expect(algoNames).toEqual(['sha256']);
        });

        it('should have multiplier set', () => {
            expect(algos.sha256.multiplier).toBeDefined();
            expect(algos.sha256.multiplier).toBe(1);
        });
    });
});