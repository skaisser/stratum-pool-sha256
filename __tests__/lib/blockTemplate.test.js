const BlockTemplate = require('../../lib/blockTemplate');

// Mock multi-hashing module
jest.mock('multi-hashing', () => ({
    sha256: (buffer) => {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(buffer).digest();
    },
    sha256d: (buffer) => {
        const crypto = require('crypto');
        const hash1 = crypto.createHash('sha256').update(buffer).digest();
        return crypto.createHash('sha256').update(hash1).digest();
    }
}));

// Need to mock transactions module as well
jest.mock('../../lib/transactions', () => ({
    CreateGeneration: jest.fn(() => [
        Buffer.from('0100000001', 'hex'), // mock p1
        Buffer.from('0200000002', 'hex')  // mock p2
    ])
}));

describe('BlockTemplate', () => {
    let rpcData;
    let poolAddressScript;
    let extraNoncePlaceholder;
    let reward;

    beforeEach(() => {
        rpcData = {
            height: 700000,
            version: 536870912,
            previousblockhash: '00000000000000000001234567890abcdef1234567890abcdef1234567890abc',
            transactions: [],
            coinbaseaux: {
                flags: ''
            },
            coinbasevalue: 625000000,
            target: '00000000ffff0000000000000000000000000000000000000000000000000000',
            mintime: 1234567890,
            mutable: ['time', 'transactions', 'prevblock'],
            noncerange: '00000000ffffffff',
            sizelimit: 1000000,
            curtime: 1234567895,
            bits: '1d00ffff',
            coinbase_payload: ''
        };

        // Mock pool address script (P2PKH script)
        poolAddressScript = Buffer.concat([
            Buffer.from([0x76, 0xa9, 0x14]), // OP_DUP OP_HASH160 PUSH(20)
            Buffer.alloc(20), // 20 byte pubkey hash
            Buffer.from([0x88, 0xac]) // OP_EQUALVERIFY OP_CHECKSIG
        ]);

        extraNoncePlaceholder = Buffer.from('f000000ff111111f', 'hex');
        reward = 'POW';
    });

    describe('constructor', () => {
        it('should create block template with basic data', () => {
            const template = new BlockTemplate(
                '1',
                rpcData,
                poolAddressScript,
                extraNoncePlaceholder,
                reward,
                false,
                [],
                null
            );

            expect(template.rpcData).toEqual(rpcData);
            expect(template.jobId).toBe('1');
            expect(template.target).toBeDefined();
            expect(template.difficulty).toBeDefined();
        });

        it('should handle transactions correctly', () => {
            rpcData.transactions = [{
                data: '01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff0804ffff001d02fd04ffffffff0100f2052a01000000434104f5eeb2b10c944c6b9fbcfff94c35bdeecd93df977882babc7f3a2cf7f5c81d3b09a68db7f0e04f21de5d4230e75e6dbe7ad16eefe0d4325a62067c6f0ac2a0ac00000000',
                txid: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
                hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
                fee: 10000
            }];

            const template = new BlockTemplate(
                '2',
                rpcData,
                poolAddressScript,
                extraNoncePlaceholder,
                reward,
                false,
                [],
                null
            );

            expect(template.rpcData.transactions.length).toBe(1);
            expect(template.merkleTree).toBeDefined();
        });

        it('should generate generation transaction', () => {
            const template = new BlockTemplate(
                '3',
                rpcData,
                poolAddressScript,
                extraNoncePlaceholder,
                reward,
                false,
                [],
                null
            );

            expect(template.generationTransaction).toBeDefined();
            expect(template.generationTransaction).toHaveLength(2);
            expect(template.generationTransaction[0]).toBeInstanceOf(Buffer);
            expect(template.generationTransaction[1]).toBeInstanceOf(Buffer);
        });
    });

    describe('serializeCoinbase', () => {
        it('should serialize coinbase with extra nonces', () => {
            const template = new BlockTemplate(
                '4',
                rpcData,
                poolAddressScript,
                extraNoncePlaceholder,
                reward,
                false,
                [],
                null
            );

            const extraNonce1 = Buffer.from('00000000', 'hex');
            const extraNonce2 = Buffer.from('00000000', 'hex');
            
            const coinbase = template.serializeCoinbase(extraNonce1, extraNonce2);
            
            expect(coinbase).toBeInstanceOf(Buffer);
            expect(coinbase.length).toBeGreaterThan(0);
        });
    });

    describe('serializeBlock', () => {
        it('should serialize complete block', () => {
            const template = new BlockTemplate(
                '5',
                rpcData,
                poolAddressScript,
                extraNoncePlaceholder,
                reward,
                false,
                [],
                null
            );

            const headerBuffer = Buffer.alloc(80);
            const coinbaseBuffer = template.serializeCoinbase(
                Buffer.from('00000000', 'hex'),
                Buffer.from('00000000', 'hex')
            );

            const block = template.serializeBlock(headerBuffer, coinbaseBuffer);
            
            expect(block).toBeInstanceOf(Buffer);
            expect(block.length).toBeGreaterThan(80); // Header + transactions
        });
    });

    describe('job parameters', () => {
        it('should generate correct job parameters', () => {
            const template = new BlockTemplate(
                '6',
                rpcData,
                poolAddressScript,
                extraNoncePlaceholder,
                reward,
                false,
                [],
                null
            );

            const params = template.getJobParams();
            
            expect(params).toBeInstanceOf(Array);
            expect(params[0]).toBe('6'); // jobId
            expect(params[1]).toBe(template.prevHashReversed);
            expect(params[2]).toBe(template.generationTransaction[0].toString('hex'));
            expect(params[3]).toBe(template.generationTransaction[1].toString('hex'));
            expect(params[4]).toBeInstanceOf(Array); // merkle branches
            expect(params[5]).toBe(rpcData.version.toString(16));
            expect(params[6]).toBe(rpcData.bits);
            expect(params[7]).toBe(rpcData.curtime.toString(16));
            expect(params[8]).toBe(true); // clean jobs
        });
    });

    describe('masternode payments', () => {
        it('should handle masternode payment data', () => {
            rpcData.masternode_payments = true;
            rpcData.masternode = {
                payee: '1MasternodePaymentAddress123456789',
                amount: 100000000
            };

            const template = new BlockTemplate(
                '7',
                rpcData,
                poolAddressScript,
                extraNoncePlaceholder,
                reward,
                false,
                [],
                null
            );

            expect(template.rpcData.masternode).toBeDefined();
            expect(template.rpcData.masternode.payee).toBe('1MasternodePaymentAddress123456789');
        });
    });

    describe('registerSubmit', () => {
        it('should register share submission', () => {
            const template = new BlockTemplate(
                '8',
                rpcData,
                poolAddressScript,
                extraNoncePlaceholder,
                reward,
                false,
                [],
                null
            );

            const extraNonce1 = '00000000';
            const extraNonce2 = '00000000';
            const nTime = rpcData.curtime.toString(16);
            const nonce = '12345678';

            const result = template.registerSubmit(extraNonce1, extraNonce2, nTime, nonce);
            expect(result).toBe(true);

            // Duplicate should return false
            const duplicate = template.registerSubmit(extraNonce1, extraNonce2, nTime, nonce);
            expect(duplicate).toBe(false);
        });
    });
});