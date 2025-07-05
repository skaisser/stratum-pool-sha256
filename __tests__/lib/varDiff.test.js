const VariableDifficulty = require('../../lib/varDiff');
const events = require('events');

describe('VariableDifficulty', () => {
    let varDiff;
    let port;
    let options;
    
    // Helper function to create a mock client
    const createMockClient = (difficulty = 16) => {
        const client = new events.EventEmitter();
        client.socket = {
            stratumPort: port // Add the port reference to avoid console errors
        };
        client.difficulty = difficulty;
        client.setDifficulty = jest.fn();
        client.enqueueNextDifficulty = jest.fn();
        return client;
    };
    
    beforeEach(() => {
        port = {
            varDiff: {
                minDiff: 8,
                maxDiff: 512,
                targetTime: 15,
                retargetTime: 90,
                variancePercent: 30
            }
        };
        
        options = {
            coin: {
                algorithm: 'sha256'
            }
        };
        
        varDiff = new VariableDifficulty(port, options);
        
        // Mock log function
        varDiff._emitLog = jest.fn();
    });

    describe('constructor', () => {
        it('should initialize with correct settings', () => {
            expect(varDiff.variance).toBe(0.3);
            expect(varDiff.bufferSize).toBe(6); // retargetTime / targetTime
            expect(varDiff.tMin).toBe(10.5); // targetTime * (1 - variance)
            expect(varDiff.tMax).toBe(19.5); // targetTime * (1 + variance)
        });

        it('should use network difficulty when maxDiff is null', () => {
            port.varDiff.maxDiff = null;
            varDiff = new VariableDifficulty(port, options);
            expect(varDiff.maxDiff).toBeNull();
        });
    });

    describe('manageClient', () => {
        let client;
        
        beforeEach(() => {
            client = createMockClient();
        });

        it('should add client to management', () => {
            varDiff.manageClient(client);
            
            expect(varDiff.stratumClients[client]).toBeDefined();
            expect(varDiff.stratumClients[client].validJobs).toBeDefined();
            expect(varDiff.stratumClients[client].difficulty).toBe(16);
        });

        it('should handle client with no initial difficulty', () => {
            client.difficulty = undefined;
            varDiff.manageClient(client);
            
            expect(varDiff.stratumClients[client].difficulty).toBeNull();
        });
    });

    describe('removeClient', () => {
        let client;
        
        beforeEach(() => {
            client = createMockClient();
            varDiff.manageClient(client);
        });

        it('should remove client from management', () => {
            expect(varDiff.stratumClients[client]).toBeDefined();
            
            varDiff.removeClient(client);
            
            expect(varDiff.stratumClients[client]).toBeUndefined();
        });
    });

    describe('setNetworkDifficulty', () => {
        it('should update network difficulty', () => {
            varDiff.setNetworkDifficulty(1024);
            expect(varDiff.maxDiff).toBe(1024);
        });

        it('should use original maxDiff when network difficulty is lower', () => {
            varDiff.setNetworkDifficulty(256);
            expect(varDiff.maxDiff).toBe(512); // Original maxDiff
        });

        it('should handle null maxDiff', () => {
            port.varDiff.maxDiff = null;
            varDiff = new VariableDifficulty(port, options);
            varDiff.setNetworkDifficulty(1024);
            expect(varDiff.maxDiff).toBe(1024);
        });
    });

    describe('processShare', () => {
        let client;
        let jobId;
        
        beforeEach(() => {
            client = createMockClient();
            jobId = 'job123';
            varDiff.manageClient(client);
        });

        it('should update lastShareTime on valid share', () => {
            varDiff.processShare(client, jobId, true);
            
            const clientData = varDiff.stratumClients[client];
            expect(clientData.lastShareTime).toBeGreaterThan(0);
            expect(clientData.validJobs[jobId]).toBe(true);
        });

        it('should not process invalid shares', () => {
            const initialTime = Date.now() / 1000;
            varDiff.stratumClients[client].lastShareTime = initialTime;
            
            varDiff.processShare(client, jobId, false);
            
            expect(varDiff.stratumClients[client].lastShareTime).toBe(initialTime);
        });

        it('should add time to buffer after second share', () => {
            // First share
            varDiff.processShare(client, jobId, true);
            
            // Wait a bit
            const clientData = varDiff.stratumClients[client];
            clientData.lastShareTime = Date.now() / 1000 - 5; // Simulate 5 seconds ago
            
            // Second share
            varDiff.processShare(client, 'job124', true);
            
            expect(clientData.timeBuffer.size()).toBe(1);
        });
    });

    describe('retarget', () => {
        let client;
        
        beforeEach(() => {
            jest.useFakeTimers();
            client = createMockClient();
            varDiff.manageClient(client);
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should not retarget without enough data', () => {
            varDiff.retarget();
            expect(client.setDifficulty).not.toHaveBeenCalled();
        });

        it('should increase difficulty when shares come too fast', () => {
            const clientData = varDiff.stratumClients[client];
            
            // Simulate fast shares (5 seconds average)
            for (let i = 0; i < 6; i++) {
                clientData.timeBuffer.append(5);
            }
            clientData.lastRetarget = Date.now() / 1000 - 100; // Make retarget due
            
            varDiff.retarget();
            
            expect(client.setDifficulty).toHaveBeenCalledWith(32); // Doubled from 16
        });

        it('should decrease difficulty when shares come too slow', () => {
            const clientData = varDiff.stratumClients[client];
            
            // Simulate slow shares (30 seconds average)
            for (let i = 0; i < 6; i++) {
                clientData.timeBuffer.append(30);
            }
            clientData.lastRetarget = Date.now() / 1000 - 100;
            
            varDiff.retarget();
            
            expect(client.setDifficulty).toHaveBeenCalledWith(8); // Halved from 16
        });

        it('should respect minimum difficulty', () => {
            const clientData = varDiff.stratumClients[client];
            client.difficulty = 8; // Already at minimum
            
            // Simulate very slow shares
            for (let i = 0; i < 6; i++) {
                clientData.timeBuffer.append(60);
            }
            clientData.lastRetarget = Date.now() / 1000 - 100;
            
            varDiff.retarget();
            
            expect(client.setDifficulty).not.toHaveBeenCalled();
        });

        it('should respect maximum difficulty', () => {
            const clientData = varDiff.stratumClients[client];
            client.difficulty = 512; // Already at maximum
            
            // Simulate very fast shares
            for (let i = 0; i < 6; i++) {
                clientData.timeBuffer.append(1);
            }
            clientData.lastRetarget = Date.now() / 1000 - 100;
            
            varDiff.retarget();
            
            expect(client.setDifficulty).not.toHaveBeenCalled();
        });

        it('should clear buffer after retarget', () => {
            const clientData = varDiff.stratumClients[client];
            
            // Add data to buffer
            for (let i = 0; i < 6; i++) {
                clientData.timeBuffer.append(5);
            }
            clientData.lastRetarget = Date.now() / 1000 - 100;
            
            varDiff.retarget();
            
            expect(clientData.timeBuffer.size()).toBe(0);
        });

        it('should handle queue when retarget happens', () => {
            const queueClient = createMockClient(32);
            
            varDiff.manageClient(queueClient);
            const clientData = varDiff.stratumClients[queueClient];
            
            // Simulate shares requiring difficulty increase
            for (let i = 0; i < 6; i++) {
                clientData.timeBuffer.append(5);
            }
            clientData.lastRetarget = Date.now() / 1000 - 100;
            
            varDiff.retarget(queueClient);
            
            expect(queueClient.enqueueNextDifficulty).toHaveBeenCalledWith(64);
        });
    });

    describe('RingBuffer', () => {
        it('should calculate average correctly', () => {
            const client = createMockClient();
            varDiff.manageClient(client);
            
            const timeBuffer = varDiff.stratumClients[client].timeBuffer;
            
            timeBuffer.append(10);
            timeBuffer.append(20);
            timeBuffer.append(30);
            
            expect(timeBuffer.avg()).toBe(20);
            expect(timeBuffer.size()).toBe(3);
        });

        it('should handle buffer overflow correctly', () => {
            const client = createMockClient();
            varDiff.manageClient(client);
            const timeBuffer = varDiff.stratumClients[client].timeBuffer;
            
            // Fill buffer beyond capacity (bufferSize is 6)
            for (let i = 1; i <= 10; i++) {
                timeBuffer.append(i);
            }
            
            // Should only keep last 6 values: 5,6,7,8,9,10
            expect(timeBuffer.size()).toBe(6);
            expect(timeBuffer.avg()).toBe(7.5); // (5+6+7+8+9+10)/6
        });
    });
});