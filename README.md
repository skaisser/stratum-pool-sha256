# SHA-256 Stratum Pool with ASICBoost Support

High-performance Stratum pool server optimized for **SHA-256** and **SHA-256 ASICBoost** mining. Built specifically for NiceHash, MiningRigRentals, and modern ASIC miners.

## 🎯 Purpose

This is a **complete modernization** of the original node-stratum-pool, specifically engineered for:
- **NiceHash** compatibility with ASICBoost support
- **MiningRigRentals (MRR)** full compatibility
- **SHA-256 ASICBoost** (version rolling) for 20% power efficiency
- **Pure SHA-256** for standard mining operations

## ⚡ ASICBoost / Version Rolling

ASICBoost is a mining optimization that allows miners to find blocks ~20% more efficiently by rolling the version bits in the block header. This implementation supports:

- **Full BIP320 compliance** - Industry standard version rolling
- **Version mask**: `0x1fffe000` - Compatible with all major ASICs
- **Version range**: `0x20000000` to `0x3FFFFFFF`
- **Extended mining.submit** - 6-parameter support for version submission
- **NiceHash compatible** - Works with NiceHash's ASICBoost implementation
- **MRR compatible** - Full support for MiningRigRentals

### Why ASICBoost Matters
- ⚡ **20% power savings** - Same hashrate, less electricity
- 💰 **Higher profitability** - Lower operating costs
- 🌡️ **Cooler operation** - Less heat generation
- ✅ **Industry standard** - Supported by all modern SHA-256 ASICs

## 🚀 Features

- **SHA-256 & SHA-256AB** - Dual algorithm support
- **Zero Native Dependencies** - Pure JavaScript using BigInt
- **NiceHash Optimized** - Full extranonce and version rolling support
- **MiningRigRentals Ready** - Enhanced debugging and compatibility
- **Modern JavaScript** - Node.js 18+ with ES6+ features
- **Production Tested** - Running on multiple commercial pools

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

## 🔧 Configuration Examples

### Bitcoin Cash with ASICBoost (NiceHash/MRR)
```javascript
const Stratum = require('stratum-pool-sha256');

const pool = Stratum.createPool({
    coin: {
        name: 'BitcoinCash',
        symbol: 'BCH',
        algorithm: 'sha256',
        asicboost: true,  // ENABLE for NiceHash/MRR
        peerMagic: 'e3e1f3e8'
    },
    
    address: 'bitcoincash:qr95sy3j9xwd2ap32xkykttr4cvcu7as4y0qverfuy',
    
    ports: {
        // Standard ports
        3333: { diff: 16 },     // Low difficulty
        3334: { diff: 256 },    // Medium difficulty
        
        // NiceHash/MRR ports (with ASICBoost)
        3335: { 
            diff: 65536,        // High difficulty for rentals
            varDiff: {
                minDiff: 16384,
                maxDiff: 4294967296,
                targetTime: 10,
                retargetTime: 60,
                variancePercent: 20
            }
        }
    },
    
    daemons: [{
        host: '127.0.0.1',
        port: 8332,
        user: 'rpcuser',
        password: 'rpcpass'
    }]
}, (ip, port, workerName, password, callback) => {
    // Accept all miners
    callback({ error: null, authorized: true, disconnect: false });
});

// Monitor ASICBoost shares
pool.on('share', (isValidShare, isValidBlock, data) => {
    if (data.version) {
        console.log(`⚡ ASICBoost share from ${data.worker} with version ${data.version.toString(16)}`);
    }
    
    if (isValidBlock) {
        console.log('🎉 Block found!');
    }
});

pool.start();
```

### Standard Bitcoin (without ASICBoost)
```javascript
const pool = Stratum.createPool({
    coin: {
        name: 'Bitcoin',
        symbol: 'BTC',
        algorithm: 'sha256',
        asicboost: false,  // DISABLE for standard Bitcoin
        peerMagic: 'f9beb4d9'
    },
    // ... rest of config
});
```

## 🔌 Port Configuration for Rentals

When setting up for NiceHash or MiningRigRentals, use high difficulty ports:

```javascript
ports: {
    // Regular miners
    3333: { diff: 16 },
    
    // NiceHash / MiningRigRentals
    3335: {
        diff: 65536,  // Start with high difficulty
        varDiff: {
            minDiff: 16384,        // Minimum 16K
            maxDiff: 4294967296,   // Maximum 4G
            targetTime: 10,        // Share every 10 seconds
            retargetTime: 60,      // Adjust every minute
            variancePercent: 20    // 20% variance allowed
        }
    }
}
```

## 📊 Algorithm Support

| Algorithm | Description | ASICBoost | Use Case |
|-----------|-------------|-----------|----------|
| `sha256` | Standard SHA-256 | Optional | Bitcoin, Namecoin |
| `sha256` + `asicboost: true` | SHA-256 with version rolling | Yes | Bitcoin Cash, NiceHash |

## 🛡️ Key Improvements

- ✅ **NiceHash Extranonce** - Full extranonce.subscribe support
- ✅ **MRR Compatibility** - Enhanced share debugging
- ✅ **Version Rolling** - BIP320 compliant implementation
- ✅ **Zero Vulnerabilities** - All dependencies updated
- ✅ **Pure JavaScript** - No compilation needed
- ✅ **BigInt Precision** - Accurate difficulty calculations

## 🧪 Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage
```

## 📈 Performance

- Handles 100,000+ concurrent connections
- Processes millions of shares per minute
- Memory efficient for 24/7 operation
- Automatic difficulty adjustment

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Write tests for changes
4. Submit a Pull Request

## 📜 License

MIT License - see [LICENSE](LICENSE) file

## 💰 Donations

Support continued development:

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

Built for the professional mining community 🛠️⚡