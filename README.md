# node-stratum-pool-sha256

Pure JavaScript SHA-256 Stratum pool server for Node.js 18+ with zero native dependencies.

## 🚀 Features

- **SHA-256 Only** - Optimized for Bitcoin, Bitcoin Cash, and other SHA-256 coins
- **Zero Native Dependencies** - Pure JavaScript implementation using BigInt
- **ASICBoost Support** - Full BIP320 version rolling (up to 20% efficiency gain)
- **Modern JavaScript** - ES6+, native BigInt, built-in crypto
- **Production Ready** - Battle-tested on multiple mining pools
- **Comprehensive Tests** - 111+ tests with 30% coverage

## 📦 Installation

```bash
npm install git+https://github.com/skaisser/node-stratum-pool.git
```

Or add to `package.json`:
```json
"dependencies": {
    "stratum-pool-sha256": "github:skaisser/node-stratum-pool"
}
```

## 🔧 Quick Start

```javascript
const Stratum = require('stratum-pool-sha256');

// Configure your coin
const coin = {
    name: 'BitcoinCash',
    symbol: 'BCH',
    algorithm: 'sha256',
    asicboost: true,  // Enable ASICBoost
    peerMagic: 'e3e1f3e8',
    peerMagicTestnet: 'f4e5f3f4'
};

// Create pool
const pool = Stratum.createPool({
    coin: coin,
    address: 'bitcoincash:qr95sy3j9xwd2ap32xkykttr4cvcu7as4y0qverfuy', // Pool wallet
    
    ports: {
        3333: { diff: 16 },     // Low difficulty
        3334: { diff: 128 },    // Medium difficulty  
        3335: { diff: 1024 }    // High difficulty
    },
    
    daemons: [{
        host: '127.0.0.1',
        port: 8332,
        user: 'rpcuser',
        password: 'rpcpass'
    }]
}, (ip, port, workerName, password, callback) => {
    // Simple auth - accept all
    callback({ error: null, authorized: true, disconnect: false });
});

// Handle events
pool.on('share', (isValidShare, isValidBlock, data) => {
    if (isValidBlock) {
        console.log('🎉 Block found!');
    } else if (isValidShare) {
        console.log('✓ Valid share:', data.worker);
    }
});

// Start pool
pool.start();
```

## ⚡ Key Improvements

### Security & Modernization
- ✅ **Zero vulnerabilities** - All dependencies updated
- ✅ **No compilation** - Works on any platform instantly  
- ✅ **Native BigInt** - Precise difficulty calculations
- ✅ **Pure JavaScript** - No C++ addons needed

### Performance
- 🚀 Optimized for SHA-256 mining
- 🚀 Memory efficient for long-running processes
- 🚀 Support for multiple daemon instances
- 🚀 Automatic difficulty adjustment (vardiff)

### Developer Experience  
- 📝 Full JSDoc documentation
- 🧪 Comprehensive test suite
- 🛠️ Modern tooling (Jest, ESLint)
- 📦 Simple npm installation

## 🔌 Variable Difficulty

```javascript
ports: {
    3333: {
        diff: 16,
        varDiff: {
            minDiff: 8,
            maxDiff: 512,
            targetTime: 15,      // seconds per share
            retargetTime: 90,    // seconds between adjustments
            variancePercent: 30  // acceptable variance
        }
    }
}
```

## 🛡️ Security Features

- **Ban System** - Auto-ban IPs submitting invalid shares
- **Connection Limits** - Prevent DoS attacks
- **TCP Proxy Support** - Works behind load balancers
- **Share Validation** - Comprehensive share verification

## 📊 Supported Coins

Any SHA-256 based cryptocurrency:
- Bitcoin (BTC)
- Bitcoin Cash (BCH)  
- Bitcoin SV (BSV)
- Namecoin (NMC)
- Peercoin (PPC)
- And many more...

## 🧪 Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Write tests for your changes
4. Commit using conventional commits
5. Push and open a Pull Request

## 📜 License

MIT License - see [LICENSE](LICENSE) file

## 💰 Donations

If you find this project useful, consider supporting development:

🪙 **Bitcoin Cash (BCH)**:  
`bitcoincash:qq6avlec5l7769jhk5mk7rnsgz49wcx2kgxaklp9e8`

₿ **Bitcoin (BTC)**:  
`bc1q8ukjnlykdpzry9j72lf7ekmpnf2umna6jyxqhn`

🐕 **Dogecoin (DOGE)**:  
`DNU41AwyLba2rCzmjjr8SoYuzhjWkWTHpB`

☀️ **Solana (SOL)**:  
`CcnuMRpNapWboQYEGw3KKfC3Eum5JWosZeC9ktGr2oyQ`

🔷 **Ethereum (ETH)**:  
`0x79eb82Ee97Ce9D02534f7927F64C5BdC4F396301`

---

Built with ❤️ for the mining community