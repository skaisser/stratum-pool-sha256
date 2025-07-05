const JobManager = require('../../lib/jobManager');
const util = require('../../lib/util');

// Mock dependencies
jest.mock('../../lib/blockTemplate');
jest.mock('../../lib/bignum-compat', () => ({
    fromBuffer: (buffer) => ({
        toNumber: () => parseInt(buffer.toString('hex'), 16),
        toString: () => buffer.toString('hex'),
        mul: function(other) { return this; },
        div: function(other) { return this; },
        lt: function(other) { return false; },
        le: function(other) { return true; },
        ge: function(other) { return true; }
    }),
    __esModule: true,
    default: (num) => ({
        toNumber: () => num,
        toString: () => num.toString(),
        mul: function(other) { return this; },
        div: function(other) { return this; }
    })
}));

describe('JobManager', () => {
    let jobManager;
    let options;
    
    beforeEach(() => {
        options = {
            address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
            coin: {
                name: 'bitcoin',
                symbol: 'BTC',
                algorithm: 'sha256',
                reward: 'POW'
            },
            instanceId: 'test-instance',
            recipients: []
        };
        
        jobManager = new JobManager(options);
    });

    describe('constructor', () => {
        it('should initialize with correct properties', () => {
            expect(jobManager.extraNonceCounter).toBeDefined();
            expect(jobManager.extraNoncePlaceholder).toBeInstanceOf(Buffer);
            expect(jobManager.extraNoncePlaceholder.toString('hex')).toBe('f000000ff111111f');
            expect(jobManager.validJobs).toEqual({});
        });
    });

    describe('processTemplate', () => {
        it('should process block template and create new job', () => {
            const rpcData = {
                height: 700000,
                previousblockhash: '00000000000000000001234567890abcdef1234567890abcdef1234567890ab',
                transactions: [],
                coinbasevalue: 625000000,
                bits: '1a0fffff',
                target: '00000000ffff0000000000000000000000000000000000000000000000000000',
                curtime: Math.floor(Date.now() / 1000),
                mintime: Math.floor(Date.now() / 1000) - 600,
                mutable: ['time', 'transactions', 'prevblock'],
                noncerange: '00000000ffffffff',
                sizelimit: 1000000,
                curtime: 1234567890,
                bits: '1d00ffff'
            };

            const publicKey = util.addressToScript(options.address);
            jobManager.processTemplate(rpcData);

            expect(jobManager.currentJob).toBeDefined();
            expect(jobManager.currentJob.rpcData).toEqual(rpcData);
            expect(Object.keys(jobManager.validJobs).length).toBeGreaterThan(0);
        });
    });

    describe('processShare', () => {
        let job;
        let mockCallback;

        beforeEach(() => {
            // Setup a valid job
            const rpcData = {
                height: 700000,
                previousblockhash: '00000000000000000001234567890abcdef1234567890abcdef1234567890ab',
                transactions: [],
                coinbasevalue: 625000000,
                bits: '1d00ffff',
                target: '00000000ffff0000000000000000000000000000000000000000000000000000',
                curtime: Math.floor(Date.now() / 1000),
                mintime: Math.floor(Date.now() / 1000) - 600,
                mutable: ['time', 'transactions', 'prevblock'],
                noncerange: '00000000ffffffff',
                sizelimit: 1000000
            };

            const publicKey = util.addressToScript(options.address);
            jobManager.processTemplate(rpcData);
            job = jobManager.currentJob;
            
            mockCallback = jest.fn();
        });

        it('should reject share with invalid job id', () => {
            const shareData = {
                jobId: 'invalid_job_id',
                extraNonce2: '00000000',
                nTime: 'abcdef12',
                nonce: '12345678'
            };

            jobManager.processShare(
                shareData.jobId,
                {},  // client
                shareData.extraNonce2,
                shareData.nTime,
                shareData.nonce,
                '', // ipAddress
                '', // port  
                '', // workerName
                mockCallback
            );

            expect(mockCallback).toHaveBeenCalledWith(
                expect.stringContaining('job not found'),
                false
            );
        });

        it('should reject duplicate share', () => {
            const shareData = {
                jobId: job.jobId,
                extraNonce2: '00000000',
                nTime: job.rpcData.curtime.toString(16),
                nonce: '12345678'
            };

            // First submission
            job.registerSubmit('extraNonce1', shareData.extraNonce2, shareData.nTime, shareData.nonce);

            // Duplicate submission
            jobManager.processShare(
                shareData.jobId,
                { extraNonce1: 'extraNonce1' },
                shareData.extraNonce2,
                shareData.nTime,
                shareData.nonce,
                '', '', '',
                mockCallback
            );

            expect(mockCallback).toHaveBeenCalledWith(
                expect.stringContaining('duplicate share'),
                false
            );
        });

        it('should reject share with invalid nonce size', () => {
            const shareData = {
                jobId: job.jobId,
                extraNonce2: '00000000',
                nTime: job.rpcData.curtime.toString(16),
                nonce: '123' // Too short
            };

            jobManager.processShare(
                shareData.jobId,
                { extraNonce1: '00000000' },
                shareData.extraNonce2,
                shareData.nTime,
                shareData.nonce,
                '', '', '',
                mockCallback
            );

            expect(mockCallback).toHaveBeenCalledWith(
                expect.stringContaining('incorrect size of nonce'),
                false
            );
        });

        it('should reject share with invalid extraNonce2 size', () => {
            const shareData = {
                jobId: job.jobId,
                extraNonce2: '00', // Too short
                nTime: job.rpcData.curtime.toString(16),
                nonce: '12345678'
            };

            jobManager.processShare(
                shareData.jobId,
                { extraNonce1: '00000000' },
                shareData.extraNonce2,
                shareData.nTime,
                shareData.nonce,
                '', '', '',
                mockCallback
            );

            expect(mockCallback).toHaveBeenCalledWith(
                expect.stringContaining('incorrect size of extranonce2'),
                false
            );
        });

        it('should reject share with nTime out of range', () => {
            const shareData = {
                jobId: job.jobId,
                extraNonce2: '00000000',
                nTime: '00000000', // Too old
                nonce: '12345678'
            };

            jobManager.processShare(
                shareData.jobId,
                { extraNonce1: '00000000' },
                shareData.extraNonce2,
                shareData.nTime,
                shareData.nonce,
                '', '', '',
                mockCallback
            );

            expect(mockCallback).toHaveBeenCalledWith(
                expect.stringContaining('ntime out of range'),
                false
            );
        });
    });

    describe('updateCurrentJob', () => {
        it('should update job with new transaction data', () => {
            const rpcData = {
                height: 700000,
                previousblockhash: '00000000000000000001234567890abcdef1234567890abcdef1234567890ab',
                transactions: [],
                coinbasevalue: 625000000,
                bits: '1d00ffff',
                target: '00000000ffff0000000000000000000000000000000000000000000000000000',
                curtime: Math.floor(Date.now() / 1000)
            };

            jobManager.processTemplate(rpcData);
            const oldJobId = jobManager.currentJob.jobId;

            // Update with new transaction
            rpcData.transactions = [{
                data: '01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff0804ffff001d02fd04ffffffff0100f2052a01000000434104f5eeb2b10c944c6b9fbcfff94c35bdeecd93df977882babc7f3a2cf7f5c81d3b09a68db7f0e04f21de5d4230e75e6dbe7ad16eefe0d4325a62067c6f0ac2a0ac00000000',
                txid: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
                hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
                fee: 10000
            }];

            const updatedJob = jobManager.updateCurrentJob(rpcData);
            
            expect(updatedJob).toBe(true);
            expect(jobManager.currentJob.jobId).not.toBe(oldJobId);
        });
    });
});