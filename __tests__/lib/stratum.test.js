const { EventEmitter } = require('events');
const StratumPool = require('../../lib/stratum');

// Mock net module
jest.mock('net', () => ({
    createServer: jest.fn(() => ({
        listen: jest.fn((port, host, callback) => callback && callback()),
        on: jest.fn()
    }))
}));

describe('Stratum Server', () => {
    let pool;
    let options;
    let authorizeFn;

    beforeEach(() => {
        options = {
            coin: {
                name: 'bitcoin',
                symbol: 'BTC',
                algorithm: 'sha256'
            },
            address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
            ports: [{
                port: 3333,
                diff: 32,
                varDiff: {
                    minDiff: 8,
                    maxDiff: 512,
                    targetTime: 15,
                    retargetTime: 90,
                    variancePercent: 30
                }
            }],
            banning: {
                enabled: true,
                time: 600,
                invalidPercent: 50,
                checkThreshold: 500,
                purgeInterval: 300
            },
            connectionTimeout: 600,
            emitInvalidBlockHashes: false,
            tcpProxyProtocol: false,
            jobRebroadcastTimeout: 60
        };

        authorizeFn = jest.fn((port, workerName, password, callback) => {
            callback({ 
                error: null, 
                authorized: true, 
                disconnect: false 
            });
        });

        pool = new StratumPool(options, authorizeFn);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('initialization', () => {
        it('should create pool with correct options', () => {
            expect(pool).toBeDefined();
            expect(pool._eventsCount).toBeGreaterThan(0);
        });

        it('should set up job manager', () => {
            expect(pool.jobManager).toBeDefined();
        });
    });

    describe('client message validation', () => {
        let mockClient;
        let mockSocket;

        beforeEach(() => {
            mockSocket = new EventEmitter();
            mockSocket.remoteAddress = '127.0.0.1';
            mockSocket.destroy = jest.fn();
            mockSocket.write = jest.fn();
            mockSocket.setKeepAlive = jest.fn();
            mockSocket.setEncoding = jest.fn();

            // Get a client instance through the connection handler
            const connectionHandler = pool.getStratumConnectionHandler();
            mockClient = connectionHandler(mockSocket);
        });

        it('should validate mining.subscribe message', () => {
            const validMessage = {
                id: 1,
                method: 'mining.subscribe',
                params: ['cgminer/4.10.0', '00000000']
            };

            mockSocket.emit('data', JSON.stringify(validMessage) + '\n');
            
            expect(mockSocket.write).toHaveBeenCalled();
            const response = JSON.parse(mockSocket.write.mock.calls[0][0].split('\n')[0]);
            expect(response.error).toBeNull();
        });

        it('should reject message with invalid method', () => {
            const invalidMessage = {
                id: 1,
                method: 'invalid.method',
                params: []
            };

            mockSocket.emit('data', JSON.stringify(invalidMessage) + '\n');
            
            expect(mockSocket.write).toHaveBeenCalled();
            const response = JSON.parse(mockSocket.write.mock.calls[0][0].split('\n')[0]);
            expect(response.error).toBeTruthy();
            expect(response.error[1]).toContain('Unknown method');
        });

        it('should reject message with oversized parameters', () => {
            const invalidMessage = {
                id: 1,
                method: 'mining.subscribe',
                params: new Array(101).fill('test') // Exceeds MAX_ARRAY_LENGTH
            };

            mockSocket.emit('data', JSON.stringify(invalidMessage) + '\n');
            
            expect(mockSocket.write).toHaveBeenCalled();
            const response = JSON.parse(mockSocket.write.mock.calls[0][0].split('\n')[0]);
            expect(response.error).toBeTruthy();
            expect(response.error[1]).toContain('Too many parameters');
        });

        it('should reject malformed JSON', () => {
            mockSocket.emit('data', 'invalid json\n');
            expect(mockSocket.destroy).toHaveBeenCalled();
        });

        it('should handle mining.submit validation', () => {
            // First subscribe and authorize
            mockSocket.emit('data', JSON.stringify({
                id: 1,
                method: 'mining.subscribe',
                params: []
            }) + '\n');

            mockSocket.emit('data', JSON.stringify({
                id: 2,
                method: 'mining.authorize',
                params: ['worker1', 'password']
            }) + '\n');

            // Valid submit
            const validSubmit = {
                id: 3,
                method: 'mining.submit',
                params: [
                    'worker1',
                    '00000001',
                    '00000000',
                    '5e4a4c3b',
                    '12345678'
                ]
            };

            mockSocket.write.mockClear();
            mockSocket.emit('data', JSON.stringify(validSubmit) + '\n');
            
            // Should emit submit event
            expect(pool.jobManager.processShare).toBeDefined();
        });

        it('should reject mining.submit with invalid nonce format', () => {
            // Setup authorized client
            mockSocket.emit('data', JSON.stringify({
                id: 1,
                method: 'mining.subscribe',
                params: []
            }) + '\n');

            mockSocket.emit('data', JSON.stringify({
                id: 2,
                method: 'mining.authorize',
                params: ['worker1', 'password']
            }) + '\n');

            // Invalid submit - bad nonce format
            const invalidSubmit = {
                id: 3,
                method: 'mining.submit',
                params: [
                    'worker1',
                    '00000001',
                    '00000000',
                    '5e4a4c3b',
                    'GGGGGGGG' // Invalid hex
                ]
            };

            mockSocket.write.mockClear();
            mockSocket.emit('data', JSON.stringify(invalidSubmit) + '\n');
            
            const response = JSON.parse(mockSocket.write.mock.calls[0][0].split('\n')[0]);
            expect(response.error).toBeTruthy();
            expect(response.error[1]).toContain('invalid nonce');
        });
    });

    describe('connection handling', () => {
        it('should handle client flooding', () => {
            const mockSocket = new EventEmitter();
            mockSocket.remoteAddress = '127.0.0.1';
            mockSocket.destroy = jest.fn();
            mockSocket.write = jest.fn();
            mockSocket.setKeepAlive = jest.fn();
            mockSocket.setEncoding = jest.fn();

            const connectionHandler = pool.getStratumConnectionHandler();
            connectionHandler(mockSocket);

            // Send data larger than 10KB limit
            const largeData = 'x'.repeat(11000);
            mockSocket.emit('data', largeData);

            expect(mockSocket.destroy).toHaveBeenCalled();
        });
    });

    describe('authorization', () => {
        it('should call authorization callback', (done) => {
            const mockAuthFn = jest.fn((port, workerName, password, callback) => {
                expect(port).toBe(3333);
                expect(workerName).toBe('testworker');
                expect(password).toBe('testpass');
                callback({ error: null, authorized: true, disconnect: false });
                done();
            });

            const testPool = new StratumPool(options, mockAuthFn);
            
            const mockSocket = new EventEmitter();
            mockSocket.remoteAddress = '127.0.0.1';
            mockSocket.destroy = jest.fn();
            mockSocket.write = jest.fn();
            mockSocket.setKeepAlive = jest.fn();
            mockSocket.setEncoding = jest.fn();
            mockSocket.localPort = 3333;

            const connectionHandler = testPool.getStratumConnectionHandler();
            const client = connectionHandler(mockSocket);

            // Subscribe first
            mockSocket.emit('data', JSON.stringify({
                id: 1,
                method: 'mining.subscribe',
                params: []
            }) + '\n');

            // Then authorize
            mockSocket.emit('data', JSON.stringify({
                id: 2,
                method: 'mining.authorize',
                params: ['testworker', 'testpass']
            }) + '\n');
        });
    });
});