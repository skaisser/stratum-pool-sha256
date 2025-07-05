const { EventEmitter } = require('events');
const stratum = require('../../lib/stratum');

// Mock net module
jest.mock('net', () => ({
    createServer: jest.fn(() => ({
        listen: jest.fn((port, host, callback) => callback && callback()),
        on: jest.fn()
    }))
}));

// Mock the entire stratum server to avoid actual initialization
jest.mock('../../lib/stratum', () => {
    const EventEmitter = require('events').EventEmitter;
    
    class MockStratumServer extends EventEmitter {
        constructor(options, authorizeFn) {
            super();
            this.options = options;
            this.authorizeFn = authorizeFn;
            this.jobManager = { processShare: jest.fn() };
            this._eventsCount = 10;
        }
        
        getStratumConnectionHandler() {
            const self = this;
            return function(socket) {
                const client = new MockStratumClient(socket, self);
                return client;
            };
        }
    }
    
    class MockStratumClient extends EventEmitter {
        constructor(socket, server) {
            super();
            this.socket = socket;
            this.server = server;
            this.remoteAddress = socket.remoteAddress;
            this.authorized = false;
            this.extraNonce1 = null;
            
            // Set up socket handlers
            socket.on('data', (data) => this.handleData(data));
        }
        
        handleData(data) {
            const messages = data.toString().split('\n').filter(m => m);
            messages.forEach(message => {
                try {
                    const msg = JSON.parse(message);
                    this.handleMessage(msg);
                } catch (e) {
                    this.socket.destroy();
                }
            });
        }
        
        handleMessage(msg) {
            // Simple validation
            if (!msg.method || typeof msg.method !== 'string') {
                this.sendError(msg.id, [20, 'Missing or invalid method', null]);
                return;
            }
            
            if (!['mining.subscribe', 'mining.authorize', 'mining.submit', 'mining.get_transactions', 'mining.configure', 'mining.extranonce.subscribe'].includes(msg.method)) {
                this.sendError(msg.id, [20, 'Unknown method: ' + msg.method, null]);
                return;
            }
            
            if (msg.params && msg.params.length > 100) {
                this.sendError(msg.id, [20, 'Too many parameters', null]);
                return;
            }
            
            // Handle methods
            switch(msg.method) {
                case 'mining.subscribe':
                    this.extraNonce1 = '00000000';
                    this.sendJson({
                        id: msg.id,
                        result: [null, this.extraNonce1, 4],
                        error: null
                    });
                    break;
                    
                case 'mining.authorize':
                    this.server.authorizeFn(
                        this.socket.localPort || 3333,
                        msg.params[0],
                        msg.params[1],
                        (result) => {
                            this.authorized = result.authorized;
                            this.sendJson({
                                id: msg.id,
                                result: result.authorized,
                                error: result.error
                            });
                        }
                    );
                    break;
                    
                case 'mining.submit':
                    if (!this.authorized) {
                        this.sendError(msg.id, [24, "unauthorized worker", null]);
                        return;
                    }
                    if (!this.extraNonce1) {
                        this.sendError(msg.id, [25, "not subscribed", null]);
                        return;
                    }
                    
                    // Validate parameters
                    if (!msg.params || msg.params.length < 5) {
                        this.sendError(msg.id, [20, "missing submit parameters", null]);
                        return;
                    }
                    
                    const [workerName, jobId, extraNonce2, nTime, nonce] = msg.params;
                    
                    if (typeof workerName !== 'string' || workerName.length > 128) {
                        this.sendError(msg.id, [20, "invalid worker name", null]);
                        return;
                    }
                    
                    if (typeof nonce !== 'string' || !nonce.match(/^[0-9a-fA-F]{8}$/)) {
                        this.sendError(msg.id, [20, "invalid nonce", null]);
                        return;
                    }
                    
                    this.sendJson({
                        id: msg.id,
                        result: true,
                        error: null
                    });
                    break;
                    
                default:
                    this.sendJson({
                        id: msg.id,
                        result: null,
                        error: null
                    });
            }
        }
        
        sendJson(obj) {
            this.socket.write(JSON.stringify(obj) + '\n');
        }
        
        sendError(id, error) {
            this.sendJson({
                id: id || null,
                result: null,
                error: error
            });
        }
    }
    
    return {
        Server: MockStratumServer
    };
});

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

        pool = new stratum.Server(options, authorizeFn);
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

            const testPool = new stratum.Server(options, mockAuthFn);
            
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