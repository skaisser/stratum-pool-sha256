# node-stratum-pool-sha256

High performance SHA-256 Stratum poolserver in Node.js - modernized for Node.js 18+ with zero vulnerabilities.

This is a SHA-256 optimized fork of the original [node-stratum-pool](https://github.com/zone117x/node-stratum-pool) that has been fully modernized with comprehensive security fixes, modern JavaScript features, complete test coverage, and zero native dependencies.

#### Notice
This is a module for Node.js that will do nothing on its own. Unless you're a Node.js developer who would like to
handle stratum authentication and raw share data then this module will not be of use to you. For a full featured portal
that uses this module, see [NOMP (Node Open Mining Portal)](https://github.com/zone117x/node-open-mining-portal). It
handles payments, website front-end, database layer, mutli-coin/pool support, auto-switching miners between coins/pools,
etc.. The portal also has an [MPOS](https://github.com/MPOS/php-mpos) compatibility mode so that the it can function as
a drop-in-replacement for [python-stratum-mining](https://github.com/Crypto-Expert/stratum-mining).

## Key Improvements in this Fork

### 🔒 Complete Modernization & Security
- **Zero vulnerabilities** - All security issues comprehensively fixed
- **Zero native dependencies** - Pure JavaScript implementation
- **SHA-256 only** - Optimized specifically for Bitcoin/Bitcoin Cash mining
- **Node.js 18+ support** - Fully compatible with modern Node.js versions
- **Replaced vulnerable packages**:
  - `bignum` → Native JavaScript BigInt with compatibility layer
  - `base58-native` → Pure JavaScript `bs58`
  - `multi-hashing` → Removed (uses Node.js built-in crypto)
- **Modern JavaScript features**:
  - Native BigInt for all large number operations
  - ES6+ syntax where appropriate
  - Built-in crypto module for SHA-256
- **Comprehensive JSDoc documentation** - Full IDE support with type definitions

### 🧪 Test Suite & Quality
- **129+ comprehensive unit tests** using Jest
- **30%+ test coverage** with focus on critical components
- **Mocked dependencies** for reliable testing
- **CI/CD ready** - Tests run on every commit
- **Test coverage highlights**:
  - bignum-compat.js: 96% coverage
  - blockTemplate.js: 78% coverage
  - merkleTree.js: 73% coverage
  - util.js: 69% coverage
  - transactions.js: 60% coverage
  - jobManager.js: 51% coverage
  - Full test suites for varDiff, algoProperties, and more

### ⚡ ASICBoost Support
- Full BIP320 version rolling implementation
- Supports modern ASIC miners with up to 20% power efficiency improvement
- Version range: `0x20000000` to `0x3FFFFFFF`
- Version mask: `0x1fffe000`
- Extended mining.submit with 6th parameter for version
- MiningRigRentals (MRR) compatibility with enhanced debugging

**Configuration Example:**
```javascript
// Bitcoin Cash with ASICBoost
var myCoin = {
    "name": "BitcoinCash",
    "symbol": "BCH",
    "algorithm": "sha256",
    "asicboost": true,  // Enable ASICBoost support
    "peerMagic": "e3e1f3e8",
    "peerMagicTestnet": "f4e5f3f4"
};

// Bitcoin (without ASICBoost)
var myCoin = {
    "name": "Bitcoin",
    "symbol": "BTC",
    "algorithm": "sha256",
    "asicboost": false,
    "peerMagic": "f9beb4d9",
    "peerMagicTestnet": "0b110907"
};
```

### 🚀 Performance & Compatibility
- **Native BigInt** for all large number calculations
- **No compilation required** - Pure JavaScript = instant installation
- **Cross-platform** - Works on Linux, macOS, Windows
- **SHA-256 optimized** - Focused implementation for Bitcoin/BCH mining
- **NOMP compatible** - Drop-in replacement for SHA-256 coins in NOMP
- **Production tested** - Running on multiple live Bitcoin Cash pools

### 📊 Code Quality Improvements
- **ESLint integration** - Consistent code style with automatic formatting
- **Prettier formatting** - Standardized code formatting
- **Git hooks** with Husky - Pre-commit linting and testing
- **Comprehensive error handling** - Graceful error recovery
- **Enhanced logging** - Debug modes for troubleshooting
- **Memory efficient** - Optimized for long-running processes

### 🎯 Solo Pool Optimizations
This fork is optimized for solo pool operations. For a complete solo pool setup, see [NOMP-BCH](https://github.com/skaisser/nomp-bch) which includes:
- Lightweight API server (no Express dependency)
- Simplified initialization without profit switching
- Minimal dependencies for better performance
- Pre-configured for Bitcoin Cash solo mining
- Per-miner coinbase signatures (shows "Mined by [username]" in blockchain)

### 💰 Enhanced Address Support
Full support for multiple address formats:
- **Legacy addresses** (e.g., `1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa`)
- **CashAddr format** (e.g., `bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a`)
- **Bech32 addresses** for SegWit coins
- **Automatic format detection and conversion**
- **Multi-coin address validation**

#### Why
This server was built to be more efficient and easier to setup, maintain and scale than existing stratum poolservers
which are written in python. Compared to the spaghetti state of the latest
[stratum-mining python server](https://github.com/Crypto-Expert/stratum-mining/), this software should also have a
lower barrier to entry for other developers to fork and add features or fix bugs.


Features
----------------------------------
* Daemon RPC interface
* Stratum TCP socket server
* Block template / job manager
* P2P to get block notifications as peer node
* Optimized generation transaction building
* Connecting to multiple daemons for redundancy
* Process share submissions
* Session managing for purging DDoS/flood initiated zombie workers
* Auto ban IPs that are flooding with invalid shares
* __POW__ (proof-of-work) & __POS__ (proof-of-stake) support
* Transaction messages support
* Vardiff (variable difficulty / share limiter)
* When started with a coin deamon that hasn't finished syncing to the network it shows the blockchain download progress and initializes once synced
* __ASICBoost__ support for version rolling (up to 20% efficiency improvement)

#### Supported Algorithms:

This fork supports **SHA-256 only**:
* ✓ __SHA256__ (Bitcoin [BTC], Bitcoin Cash [BCH], Bitcoin SV [BSV], Namecoin [NMC], Peercoin [PPC], and other SHA256 coins)
* ✓ __SHA256 with ASICBoost__ (Bitcoin Cash [BCH], Bitcoin [BTC] - with BIP320 version rolling support)

All other algorithms have been removed to maintain zero native dependencies and ensure cross-platform compatibility.


Requirements
------------
* node v18.0+
* coin daemon (preferably one with a relatively updated API and not some crapcoin :p)

Technical Details
-----------------
### Complete Modernization Overview
This fork represents a comprehensive modernization effort:

#### BigInt Compatibility Layer
The `bignum` package has been completely replaced with a custom BigInt compatibility layer (`lib/bignum-compat.js`) that provides:
- Drop-in replacement for all bignum operations
- Native JavaScript BigInt performance
- No compilation required
- Full compatibility with existing code
- Precise difficulty calculations without precision loss

#### Enhanced ASICBoost Implementation
Version rolling support with extensive improvements:
- `lib/blockTemplate.js` - Version mask and range configuration
- `lib/jobManager.js` - Version parameter validation with flexible acceptance
- `lib/stratum.js` - Extended mining.submit with 6th parameter
- `lib/pool.js` - Version parameter passed through to job manager
- Support for all major ASIC manufacturers
- MiningRigRentals (MRR) compatibility

#### Pure JavaScript Dependencies
All native dependencies have been completely removed:
- `bignum` → Native BigInt with compatibility layer
- `base58-native` → `bs58` (pure JavaScript)
- `multi-hashing` → **Removed** (SHA-256 uses Node.js built-in crypto)
- Result: Zero compilation, instant installation on all platforms

#### Testing Infrastructure
Comprehensive test suite implementation:
- **Jest test framework** with modern configuration
- **55+ unit tests** covering all major components
- **Mocked dependencies** for isolated testing
- **Test categories**:
  - `__tests__/lib/pool.test.js` - Pool initialization and lifecycle
  - `__tests__/lib/stratum.test.js` - Stratum protocol handling
  - `__tests__/lib/jobManager.test.js` - Share validation logic
  - `__tests__/lib/blockTemplate.test.js` - Block generation
  - `__tests__/lib/transactions.test.js` - Transaction building
  - `__tests__/lib/daemon.test.js` - RPC communication
  - `__tests__/lib/varDiff.test.js` - Difficulty adjustments
  - `__tests__/lib/bignum-compat.test.js` - BigInt operations
  - `__tests__/lib/util.test.js` - Utility functions
  - `__tests__/lib/algoProperties.test.js` - Algorithm configurations

#### Code Quality Tools
Modern development tooling:
- **ESLint** - JavaScript linting with custom rules
- **Prettier** - Automatic code formatting
- **Husky** - Git hooks for pre-commit checks
- **lint-staged** - Run linters on staged files only
- **JSDoc** - Comprehensive inline documentation

#### Enhanced Features
- **Share difficulty debugging** - Enhanced logging for troubleshooting
- **Precision improvements** - BigInt usage for exact calculations
- **Memory optimizations** - Efficient handling of large block templates
- **Error recovery** - Graceful handling of daemon disconnections
- **Extended compatibility** - Support for more mining software

Installation
------------
```bash
npm install git+https://github.com/skaisser/node-stratum-pool.git
```

Or add to your `package.json`:
```json
"dependencies": {
    "stratum-pool": "https://github.com/skaisser/node-stratum-pool.git"
}
```

Example Usage
-------------

#### Install as a node module by cloning repository

```bash
git clone https://github.com/zone117x/node-stratum-pool node_modules/stratum-pool
npm update
```

#### Module usage

Create the configuration for your coin:

This fork supports `algorithm`: **sha256** only.

```javascript
// Bitcoin Cash Configuration
var myCoin = {
    "name": "BitcoinCash",
    "symbol": "BCH",
    "algorithm": "sha256",
    "asicboost": true,      // Enable ASICBoost support for version rolling
    "txMessages": false,    // Optional - defaults to false

    /* Magic value only required for setting up p2p block notifications.
       Found in the daemon source code as the pchMessageStart variable. */
    "peerMagic": "e3e1f3e8",        // BCH mainnet magic
    "peerMagicTestnet": "f4e5f3f4"  // BCH testnet magic
};

// Bitcoin Configuration
var myCoin = {
    "name": "Bitcoin",
    "symbol": "BTC",
    "algorithm": "sha256",
    "asicboost": false,     // Bitcoin Core doesn't support ASICBoost by default
    "txMessages": false,
    "peerMagic": "f9beb4d9",
    "peerMagicTestnet": "0b110907"
};

// Other SHA-256 coins follow the same pattern
var myCoin = {
    "name": "Namecoin",
    "symbol": "NMC",
    "algorithm": "sha256",
    "peerMagic": "f9beb4fe"
};
```


Create and start new pool with configuration options and authentication function

```javascript
var Stratum = require('stratum-pool');

var pool = Stratum.createPool({

    "coin": myCoin,

    "address": "mi4iBXbBsydtcc5yFmsff2zCFVX4XG7qJc", //Address to where block rewards are given

    /* Block rewards go to the configured pool wallet address to later be paid out to miners,
       except for a percentage that can go to, for examples, pool operator(s) as pool fees or
       or to donations address. Addresses or hashed public keys can be used. Here is an example
       of rewards going to the main pool op, a pool co-owner, and NOMP donation. */
    "rewardRecipients": {
        "n37vuNFkXfk15uFnGoVyHZ6PYQxppD3QqK": 1.5, //1.5% goes to pool op
        "mirj3LtZxbSTharhtXvotqtJXUY7ki5qfx": 0.5, //0.5% goes to a pool co-owner

        /* 0.1% donation to NOMP. This pubkey can accept any type of coin, please leave this in
           your config to help support NOMP development. */
        "22851477d63a085dbc2398c8430af1c09e7343f6": 0.1
    },

    "blockRefreshInterval": 1000, //How often to poll RPC daemons for new blocks, in milliseconds


    /* Some miner apps will consider the pool dead/offline if it doesn't receive anything new jobs
       for around a minute, so every time we broadcast jobs, set a timeout to rebroadcast
       in this many seconds unless we find a new job. Set to zero or remove to disable this. */
    "jobRebroadcastTimeout": 55,

    //instanceId: 37, //Recommend not using this because a crypto-random one will be generated

    /* Some attackers will create thousands of workers that use up all available socket connections,
       usually the workers are zombies and don't submit shares after connecting. This features
       detects those and disconnects them. */
    "connectionTimeout": 600, //Remove workers that haven't been in contact for this many seconds

    /* Sometimes you want the block hashes even for shares that aren't block candidates. */
    "emitInvalidBlockHashes": false,

    /* Enable for client IP addresses to be detected when using a load balancer with TCP proxy
       protocol enabled, such as HAProxy with 'send-proxy' param:
       http://haproxy.1wt.eu/download/1.5/doc/configuration.txt */
    "tcpProxyProtocol": false,

    /* If a worker is submitting a high threshold of invalid shares we can temporarily ban their IP
       to reduce system/network load. Also useful to fight against flooding attacks. If running
       behind something like HAProxy be sure to enable 'tcpProxyProtocol', otherwise you'll end up
       banning your own IP address (and therefore all workers). */
    "banning": {
        "enabled": true,
        "time": 600, //How many seconds to ban worker for
        "invalidPercent": 50, //What percent of invalid shares triggers ban
        "checkThreshold": 500, //Check invalid percent when this many shares have been submitted
        "purgeInterval": 300 //Every this many seconds clear out the list of old bans
    },

    /* Each pool can have as many ports for your miners to connect to as you wish. Each port can
       be configured to use its own pool difficulty and variable difficulty settings. varDiff is
       optional and will only be used for the ports you configure it for. */
    "ports": {
        "3032": { //A port for your miners to connect to
            "diff": 32, //the pool difficulty for this port

            /* Variable difficulty is a feature that will automatically adjust difficulty for
               individual miners based on their hashrate in order to lower networking overhead */
            "varDiff": {
                "minDiff": 8, //Minimum difficulty
                "maxDiff": 512, //Network difficulty will be used if it is lower than this
                "targetTime": 15, //Try to get 1 share per this many seconds
                "retargetTime": 90, //Check to see if we should retarget every this many seconds
                "variancePercent": 30 //Allow time to very this % from target without retargeting
            }
        },
        "3256": { //Another port for your miners to connect to, this port does not use varDiff
            "diff": 256 //The pool difficulty
        }
    },

    /* Recommended to have at least two daemon instances running in case one drops out-of-sync
       or offline. For redundancy, all instances will be polled for block/transaction updates
       and be used for submitting blocks. Creating a backup daemon involves spawning a daemon
       using the "-datadir=/backup" argument which creates a new daemon instance with it's own
       RPC config. For more info on this see:
          - https://en.bitcoin.it/wiki/Data_directory
          - https://en.bitcoin.it/wiki/Running_bitcoind */
    "daemons": [
        {   //Main daemon instance
            "host": "127.0.0.1",
            "port": 19332,
            "user": "litecoinrpc",
            "password": "testnet"
        },
        {   //Backup daemon instance
            "host": "127.0.0.1",
            "port": 19344,
            "user": "litecoinrpc",
            "password": "testnet"
        }
    ],


    /* This allows the pool to connect to the daemon as a node peer to receive block updates.
       It may be the most efficient way to get block updates (faster than polling, less
       intensive than blocknotify script). It requires the additional field "peerMagic" in
       the coin config. */
    "p2p": {
        "enabled": false,

        /* Host for daemon */
        "host": "127.0.0.1",

        /* Port configured for daemon (this is the actual peer port not RPC port) */
        "port": 19333,

        /* If your coin daemon is new enough (i.e. not a shitcoin) then it will support a p2p
           feature that prevents the daemon from spamming our peer node with unnecessary
           transaction data. Assume its supported but if you have problems try disabling it. */
        "disableTransactions": true

    }

}, function(ip, port , workerName, password, callback){ //stratum authorization function
    console.log("Authorize " + workerName + ":" + password + "@" + ip);
    callback({
        error: null,
        authorized: true,
        disconnect: false
    });
});
```


Listen to pool events
```javascript
/*

'data' object contains:
    job: 4, //stratum work job ID
    ip: '71.33.19.37', //ip address of client
    port: 3333, //port of the client
    worker: 'matt.worker1', //stratum worker name
    height: 443795, //block height
    blockReward: 5000000000, //the number of satoshis received as payment for solving this block
    difficulty: 64, //stratum worker difficulty
    shareDiff: 78, //actual difficulty of the share
    blockDiff: 3349, //block difficulty adjusted for share padding
    blockDiffActual: 3349 //actual difficulty for this block


    //AKA the block solution - set if block was found
    blockHash: '110c0447171ad819dd181216d5d80f41e9218e25d833a2789cb8ba289a52eee4',

    //Exists if "emitInvalidBlockHashes" is set to true
    blockHashInvalid: '110c0447171ad819dd181216d5d80f41e9218e25d833a2789cb8ba289a52eee4'

    //txHash is the coinbase transaction hash from the block
    txHash: '41bb22d6cc409f9c0bae2c39cecd2b3e3e1be213754f23d12c5d6d2003d59b1d,

    error: 'low share difficulty' //set if share is rejected for some reason
*/
pool.on('share', function(isValidShare, isValidBlock, data){

    if (isValidBlock)
        console.log('Block found');
    else if (isValidShare)
        console.log('Valid share submitted');
    else if (data.blockHash)
        console.log('We thought a block was found but it was rejected by the daemon');
    else
        console.log('Invalid share submitted')

    console.log('share data: ' + JSON.stringify(data));
});



/*
'severity': can be 'debug', 'warning', 'error'
'logKey':   can be 'system' or 'client' indicating if the error
            was caused by our system or a stratum client
*/
pool.on('log', function(severity, logKey, logText){
    console.log(severity + ': ' + '[' + logKey + '] ' + logText);
});
```

Start pool
```javascript
pool.start();
```


Credits
-------
* [vekexasia](//github.com/vekexasia) - co-developer & great tester
* [LucasJones](//github.com/LucasJones) - got p2p block notify working and implemented additional hashing algos
* [TheSeven](//github.com/TheSeven) - answering an absurd amount of my questions, found the block 1-16 problem, provided example code for peer node functionality
* [pronooob](https://dogehouse.org) - knowledgeable & helpful
* [Slush0](//github.com/slush0/stratum-mining) - stratum protocol, documentation and original python code
* [viperaus](//github.com/viperaus/stratum-mining) - scrypt adaptions to python code
* [ahmedbodi](//github.com/ahmedbodi/stratum-mining) - more algo adaptions to python code
* [steveshit](//github.com/steveshit) - ported X11 hashing algo from python to node module


Development & Testing
--------------------
### Running Tests
```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Code Quality
```bash
# Run ESLint
npm run lint

# Auto-fix ESLint issues
npm run lint:fix

# Format code with Prettier
npm run format
```

### Contributing
1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Write tests for your changes
4. Ensure all tests pass (`npm test`)
5. Commit your changes (following conventional commit format)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

Changelog
---------
### v2.0.0 (This Fork) - SHA-256 Focused Modernization
- **Architecture Changes**
  - **SHA-256 only** - Removed all other algorithms for zero dependencies
  - Removed `multi-hashing` dependency completely
  - Uses Node.js built-in crypto module for SHA-256
  - Truly zero native dependencies

- **Security & Dependencies**
  - Zero security vulnerabilities (verified by npm audit)
  - Replaced `bignum` with native BigInt compatibility layer
  - Replaced `base58-native` with pure JavaScript `bs58`
  - Updated to Node.js 18+ minimum requirement
  - No compilation required on any platform

- **Testing & Quality**
  - Added comprehensive Jest test suite (129+ tests)
  - 30%+ test coverage focusing on critical components
  - Added ESLint and Prettier configuration
  - Added Husky pre-commit hooks
  - Comprehensive JSDoc documentation

- **Features & Improvements**
  - Full ASICBoost/version rolling support (BIP320)
  - MiningRigRentals (MRR) compatibility
  - Enhanced share difficulty debugging
  - Improved precision with BigInt calculations
  - Per-miner coinbase signatures
  - Enhanced error handling and recovery
  - Memory optimizations for large operations

- **Developer Experience**
  - Pure JavaScript - no compilation ever
  - Instant npm install on all platforms
  - Cross-platform compatibility (Linux, macOS, Windows)
  - Modern JavaScript features (ES6+)
  - Full IDE support with JSDoc

Donations
---------
To support development of this project feel free to donate :)

* BTC: `1KRotMnQpxu3sePQnsVLRy3EraRFYfJQFR`
* LTC: `LKfavSDJmwiFdcgaP1bbu46hhyiWw5oFhE`
* VTC: `VgW4uFTZcimMSvcnE4cwS3bjJ6P8bcTykN`
* MAX: `mWexUXRCX5PWBmfh34p11wzS5WX2VWvTRT`
* QRK: `QehPDAhzVQWPwDPQvmn7iT3PoFUGT7o8bC`
* DRK: `XcQmhp8ANR7okWAuArcNFZ2bHSB81jpapQ`
* DOGE: `DBGGVtwAAit1NPZpRm5Nz9VUFErcvVvHYW`
* Cryptsy Trade Key: `254ca13444be14937b36c44ba29160bd8f02ff76`

License
-------
Released under the MIT License. See [LICENSE](LICENSE) file for details.
