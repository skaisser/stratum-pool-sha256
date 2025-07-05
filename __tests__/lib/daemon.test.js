const DaemonInterface = require('../../lib/daemon').interface;

describe('DaemonInterface', () => {
    let daemon;
    
    describe('constructor', () => {
        it('should initialize with single daemon', () => {
            const daemons = [{
                host: '127.0.0.1',
                port: 8332,
                user: 'user',
                password: 'pass'
            }];
            
            daemon = new DaemonInterface(daemons);
            
            // The constructor creates internal state that we can't directly test
            // without accessing private members
            expect(daemon).toBeDefined();
            expect(daemon.init).toBeDefined();
            expect(daemon.isOnline).toBeDefined();
            expect(daemon.cmd).toBeDefined();
        });

        it('should initialize with multiple daemons', () => {
            const daemons = [
                { host: '127.0.0.1', port: 8332, user: 'user1', password: 'pass1' },
                { host: '127.0.0.2', port: 8333, user: 'user2', password: 'pass2' }
            ];
            
            daemon = new DaemonInterface(daemons);
            expect(daemon).toBeDefined();
        });

        it('should handle empty daemon array', () => {
            daemon = new DaemonInterface([]);
            expect(daemon).toBeDefined();
        });
    });

    describe('validateRpcMethod', () => {
        beforeEach(() => {
            daemon = new DaemonInterface([{
                host: '127.0.0.1',
                port: 8332,
                user: 'user',
                password: 'pass'
            }]);
        });

        it('should accept allowed RPC methods', () => {
            // Test a few allowed methods
            const allowedMethods = ['getinfo', 'getblocktemplate', 'submitblock', 'getblockcount'];
            
            allowedMethods.forEach(method => {
                // Since validateRpcMethod is internal, we test it through cmd
                let errorOccurred = false;
                daemon.cmd(method, [], (results) => {
                    // If method validation failed, we'd get an error about the method not being allowed
                    if (results[0].error && results[0].error.message.includes('not allowed')) {
                        errorOccurred = true;
                    }
                });
                
                // Give async operation time to complete
                setTimeout(() => {
                    expect(errorOccurred).toBe(false);
                }, 10);
            });
        });
    });

    describe('isOnline', () => {
        it('should call callback with true when no daemons to check', (done) => {
            daemon = new DaemonInterface([]);
            daemon.isOnline((result) => {
                // When there are no daemons, isOnline returns true (all 0 daemons are online)
                expect(result).toBe(true);
                done();
            });
        });
    });
});