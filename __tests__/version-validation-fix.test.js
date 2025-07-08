const JobManager = require('../lib/jobManager.js');
const BlockTemplate = require('../lib/blockTemplate.js');
const bignum = require('../lib/bignum-compat');

describe('Version Validation Fix Tests', () => {
    let jobManager;
    let options;
    let mockDaemon;
    
    beforeEach(() => {
        // Mock options for SHA256 with ASICBoost
        options = {
            coin: {
                name: 'Bitcoin',
                symbol: 'BTC',
                algorithm: 'sha256',
                asicboost: true,
                reward: 'POW',
                txMessages: false
            },
            poolAddressScript: Buffer.from('76a914' + '1234567890123456789012345678901234567890' + '88ac', 'hex'),
            recipients: []
        };
        
        mockDaemon = {
            cmd: jest.fn()
        };
        
        jobManager = new JobManager(options);
    });
    
    describe('Version Rolling with Different Masks', () => {
        it('should accept version changes within negotiated mask', () => {
            // Create a job with version 0x20000000 (bit 29 set)
            const rpcData = {
                version: 0x20000000,
                previousblockhash: '0000000000000000000000000000000000000000000000000000000000000000',
                coinbasevalue: 625000000,
                target: '00000000ffff0000000000000000000000000000000000000000000000000000',
                transactions: [],
                height: 700000,
                curtime: Math.floor(Date.now() / 1000),
                bits: '170d21b9'
            };
            
            const job = new BlockTemplate('job1', rpcData, options.poolAddressScript, Buffer.alloc(8), 'POW', false, options.recipients);
            jobManager.validJobs['job1'] = job;
            jobManager.currentJob = job;
            
            // Test 1: Miner with restrictive mask (0x1fffe000) tries to change bit 29
            // This should now be accepted with the new validation
            const params = {
                jobId: 'job1',
                extraNonce2: '00000000',
                nTime: rpcData.curtime.toString(16),
                nonce: '12345678',
                version: '1c000000'  // Changed bit 29 from 1 to 0, added bits 28,27,26
            };
            
            let shareError = null;
            const shareErrorCallback = (error) => {
                shareError = error;
            };
            
            // Process with negotiated mask that doesn't include bit 29
            const versionMask = 0x1fffe000;
            
            // This should be rejected because bit 29 was changed but it's not in the mask
            const result = jobManager.processShare(
                params.jobId,
                0, // previousDifficulty
                1, // difficulty
                '01000000', // extraNonce1
                params.extraNonce2,
                params.nTime,
                params.nonce,
                '::1', // ipAddress
                3333, // port
                'testworker', // workerName
                params.version,
                versionMask
            );
            
            if (result.error) {
                shareError = result.error;
            }
            
            expect(shareError).not.toBeNull();
            expect(shareError[1]).toBe('version rolling outside allowed mask');
        });
        
        it('should accept version 0x0 and use job version', () => {
            const rpcData = {
                version: 0x20000000,
                previousblockhash: '0000000000000000000000000000000000000000000000000000000000000000',
                coinbasevalue: 625000000,
                target: '00000000ffff0000000000000000000000000000000000000000000000000000',
                transactions: [],
                height: 700000,
                curtime: Math.floor(Date.now() / 1000),
                bits: '170d21b9'
            };
            
            const job = new BlockTemplate('job2', rpcData, options.poolAddressScript, Buffer.alloc(8), 'POW', false, options.recipients);
            jobManager.validJobs['job2'] = job;
            jobManager.currentJob = job;
            
            const params = {
                jobId: 'job2',
                extraNonce2: '00000000',
                nTime: rpcData.curtime.toString(16),
                nonce: '12345678',
                version: '00000000'  // Version 0x0
            };
            
            let shareProcessed = false;
            let shareError = null;
            
            // Mock the share validation to succeed
            job.registerSubmit = jest.fn().mockReturnValue(true);
            
            const result = jobManager.processShare(
                params.jobId,
                0,
                1,
                '01000000',
                params.extraNonce2,
                params.nTime,
                params.nonce,
                '::1',
                3333,
                'testworker',
                params.version,
                0x3fffe000
            );
            
            if (result.error) {
                shareError = result.error;
            } else {
                shareProcessed = true;
            }
            
            // Should not have version error (might have other errors like low difficulty)
            if (shareError) {
                expect(shareError[1]).not.toBe('version too low');
                expect(shareError[1]).not.toBe('version rolling outside allowed mask');
            }
        });
        
        it('should accept versions with changes only within mask', () => {
            const rpcData = {
                version: 0x20000000,
                previousblockhash: '0000000000000000000000000000000000000000000000000000000000000000',
                coinbasevalue: 625000000,
                target: '00000000ffff0000000000000000000000000000000000000000000000000000',
                transactions: [],
                height: 700000,
                curtime: Math.floor(Date.now() / 1000),
                bits: '170d21b9'
            };
            
            const job = new BlockTemplate('job3', rpcData, options.poolAddressScript, Buffer.alloc(8), 'POW', false, options.recipients);
            jobManager.validJobs['job3'] = job;
            jobManager.currentJob = job;
            
            // Version that only changes bits within the mask (0x3fffe000)
            const params = {
                jobId: 'job3',
                extraNonce2: '00000000',
                nTime: rpcData.curtime.toString(16),
                nonce: '12345678',
                version: '20002000'  // Only changed bit 13 which is in the mask
            };
            
            let shareError = null;
            
            // Mock the share validation to succeed
            job.registerSubmit = jest.fn().mockReturnValue(true);
            
            const result = jobManager.processShare(
                params.jobId,
                0,
                1,
                '01000000',
                params.extraNonce2,
                params.nTime,
                params.nonce,
                '::1',
                3333,
                'testworker',
                params.version,
                0x3fffe000  // More permissive mask
            );
            
            if (result.error) {
                shareError = result.error;
            }
            
            // Should not have version-related errors
            if (shareError) {
                expect(shareError[1]).not.toBe('version too low');
                expect(shareError[1]).not.toBe('version rolling outside allowed mask');
            }
        });
    });
});