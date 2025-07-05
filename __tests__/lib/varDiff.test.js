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
            localPort: port // Use localPort to match the actual implementation
        };
        client.difficulty = difficulty;
        client.setDifficulty = jest.fn();
        client.enqueueNextDifficulty = jest.fn();
        return client;
    };
    
    beforeEach(() => {
        port = 3032; // Use actual port number instead of object
        
        const varDiffOptions = {
            minDiff: 8,
            maxDiff: 512,
            targetTime: 15,
            retargetTime: 90,
            variancePercent: 30
        };
        
        options = {
            coin: {
                algorithm: 'sha256'
            }
        };
        
        // Create a mock port configuration that matches what the pool.js would pass
        const portConfig = {
            varDiff: varDiffOptions
        };
        
        varDiff = new VariableDifficulty(port, varDiffOptions);
        
        // Mock log function
        varDiff._emitLog = jest.fn();
    });

    describe('basic functionality', () => {
        it('should create instance without errors', () => {
            expect(varDiff).toBeDefined();
        });
    });

    describe('manageClient', () => {
        let client;
        
        beforeEach(() => {
            client = createMockClient();
        });

        it('should manage client without errors', () => {
            expect(() => varDiff.manageClient(client)).not.toThrow();
        });
    });
});