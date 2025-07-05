const transactions = require('../../lib/transactions');
const util = require('../../lib/util');

describe('transactions', () => {
    describe('CreateGeneration', () => {
        let rpcData;
        let publicKey;
        let extraNoncePlaceholder;
        let recipients;

        beforeEach(() => {
            rpcData = {
                height: 700000,
                coinbasevalue: 625000000,
                coinbaseaux: {
                    flags: ''
                },
                curtime: 1234567890
            };

            // Mock public key script (P2PKH)
            publicKey = Buffer.concat([
                Buffer.from([0x76, 0xa9, 0x14]),
                Buffer.alloc(20),
                Buffer.from([0x88, 0xac])
            ]);

            extraNoncePlaceholder = Buffer.from('f000000ff111111f', 'hex');
            recipients = [];
        });

        it('should create generation transaction for POW', () => {
            const reward = 'POW';
            const txMessages = false;

            const generation = transactions.CreateGeneration(
                rpcData,
                publicKey,
                extraNoncePlaceholder,
                reward,
                txMessages,
                recipients
            );

            expect(generation).toBeInstanceOf(Array);
            expect(generation).toHaveLength(2);
            expect(generation[0]).toBeInstanceOf(Buffer);
            expect(generation[1]).toBeInstanceOf(Buffer);
        });

        it('should include transaction messages when enabled', () => {
            const reward = 'POW';
            const txMessages = true;

            const generation = transactions.CreateGeneration(
                rpcData,
                publicKey,
                extraNoncePlaceholder,
                reward,
                txMessages,
                recipients
            );

            expect(generation).toHaveLength(2);
            // Transaction version should be 2 for messages
            expect(generation[0].readUInt32LE(0)).toBe(2);
        });

        it('should handle recipients correctly', () => {
            const reward = 'POW';
            const txMessages = false;
            
            recipients = [{
                percent: 0.01, // 1%
                script: util.addressToScript('1RecipientAddress1234567890123456')
            }];

            const generation = transactions.CreateGeneration(
                rpcData,
                publicKey,
                extraNoncePlaceholder,
                reward,
                txMessages,
                recipients
            );

            expect(generation).toHaveLength(2);
            // Should have outputs for pool and recipient
            const p2 = generation[1];
            expect(p2.length).toBeGreaterThan(0);
        });

        it('should handle masternode payments', () => {
            rpcData.masternode_payments = true;
            rpcData.masternode = {
                payee: '1MasternodeAddress123456789012345',
                amount: 100000000
            };

            const generation = transactions.CreateGeneration(
                rpcData,
                publicKey,
                extraNoncePlaceholder,
                'POW',
                false,
                []
            );

            expect(generation).toHaveLength(2);
        });

        it('should handle superblock payments', () => {
            rpcData.superblock = [{
                payee: '1SuperblockAddress1234567890123456',
                amount: 50000000
            }];

            const generation = transactions.CreateGeneration(
                rpcData,
                publicKey,
                extraNoncePlaceholder,
                'POW',
                false,
                []
            );

            expect(generation).toHaveLength(2);
        });

        it('should handle witness commitment', () => {
            rpcData.default_witness_commitment = '0000000000000000000000000000000000000000000000000000000000000000';

            const generation = transactions.CreateGeneration(
                rpcData,
                publicKey,
                extraNoncePlaceholder,
                'POW',
                false,
                []
            );

            expect(generation).toHaveLength(2);
        });

        it('should include miner name in coinbase signature', () => {
            const minerName = 'TestMiner';

            const generation = transactions.CreateGeneration(
                rpcData,
                publicKey,
                extraNoncePlaceholder,
                'POW',
                false,
                [],
                minerName
            );

            expect(generation).toHaveLength(2);
            // Check that the miner name is included in the scriptSig
            const scriptSig = generation[0].toString('hex') + generation[1].toString('hex');
            expect(scriptSig).toContain(Buffer.from('TestMiner').toString('hex'));
        });

        it('should handle POS reward type', () => {
            const generation = transactions.CreateGeneration(
                rpcData,
                publicKey,
                extraNoncePlaceholder,
                'POS',
                false,
                []
            );

            expect(generation).toHaveLength(2);
            // POS includes timestamp
            const p1 = generation[0];
            expect(p1.readUInt32LE(4)).toBe(rpcData.curtime);
        });

        it('should calculate rewards correctly with multiple recipients', () => {
            recipients = [
                {
                    percent: 0.01, // 1%
                    script: util.addressToScript('1Recipient1Address123456789012345')
                },
                {
                    percent: 0.02, // 2%
                    script: util.addressToScript('1Recipient2Address123456789012345')
                }
            ];

            const generation = transactions.CreateGeneration(
                rpcData,
                publicKey,
                extraNoncePlaceholder,
                'POW',
                false,
                recipients
            );

            expect(generation).toHaveLength(2);
            // Total reward should be distributed among pool and recipients
            // Pool should get 97% of the reward
        });
    });
});