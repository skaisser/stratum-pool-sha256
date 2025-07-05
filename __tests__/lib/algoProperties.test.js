const algos = require('../../lib/algoProperties');

describe('algoProperties', () => {
    describe('SHA256 algorithms', () => {
        it('should have sha256 algorithm defined', () => {
            expect(algos.sha256).toBeDefined();
            expect(algos.sha256.multiplier).toBe(1);
            expect(typeof algos.sha256.hash).toBe('function');
        });

        it('should have sha256asicboost algorithm defined', () => {
            expect(algos.sha256asicboost).toBeDefined();
            expect(algos.sha256asicboost.multiplier).toBe(1);
            expect(typeof algos.sha256asicboost.hash).toBe('function');
        });

        it('should produce valid hash functions', () => {
            const hashFunc = algos.sha256.hash();
            const testData = Buffer.from('test');
            const result = hashFunc(testData);
            
            expect(result).toBeInstanceOf(Buffer);
            expect(result.length).toBe(32);
        });
    });

    describe('Algorithm properties', () => {
        it('should only contain SHA-256 algorithms', () => {
            const algoList = Object.keys(algos);
            expect(algoList).toHaveLength(2);
            expect(algoList).toContain('sha256');
            expect(algoList).toContain('sha256asicboost');
        });

        it('should have multiplier for all algorithms', () => {
            Object.values(algos).forEach(algo => {
                expect(algo.multiplier).toBeDefined();
                expect(algo.multiplier).toBeGreaterThan(0);
            });
        });

        it('should have hash function for all algorithms', () => {
            Object.values(algos).forEach(algo => {
                expect(algo.hash).toBeDefined();
                expect(typeof algo.hash).toBe('function');
                
                const hashFunc = algo.hash();
                expect(typeof hashFunc).toBe('function');
            });
        });
    });

    describe('Global exports', () => {
        it('should export algos globally', () => {
            expect(global.algos).toBe(algos);
        });

        it('should export diff1 globally', () => {
            expect(global.diff1).toBeDefined();
            expect(global.diff1).toBe(0x00000000ffff0000000000000000000000000000000000000000000000000000);
        });
    });
});