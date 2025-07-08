# Update Guide for NOMP-BCH

After upgrading to stratum-pool-sha256 v2.1.0, you need to update your NOMP-BCH configuration:

## 1. Update package.json

In your NOMP-BCH directory, update the dependency:

```bash
cd /Users/skaisser/Sites/nomp-bch
npm update stratum-pool-sha256@2.1.0
```

## 2. Remove Version Mask Configuration

### In pool_configs/bitcoincash.json:

Remove these lines if present:
```json
"versionMask": "0x3fffe000",
"enforcePoolVersionMask": true,
```

Your pool config should look like:
```json
{
    "enabled": true,
    "coin": "bitcoincash.json",
    
    "address": "YOUR_BCH_ADDRESS",
    
    "paymentProcessing": {
        "enabled": false
    },

    "ports": {
        "3008": {
            "diff": 8,
            "varDiff": {
                "minDiff": 8,
                "maxDiff": 512,
                "targetTime": 15,
                "retargetTime": 90,
                "variancePercent": 30
            }
        },
        "3009": {
            "diff": 64000
        },
        "3010": {
            "diff": 1000000
        }
    },

    "daemons": [
        {
            "host": "127.0.0.1",
            "port": 8332,
            "user": "bitcoinrpc",
            "password": "YOUR_RPC_PASSWORD"
        }
    ],

    "p2p": {
        "enabled": false
    },

    "mposMode": {
        "enabled": false
    }
}
```

### In coins/bitcoincash.json:

Remove the versionMask line if present:
```json
"versionMask": "0x3fffe000"
```

The coin config should have:
```json
{
    "name": "Bitcoin Cash",
    "symbol": "BCH",
    "algorithm": "sha256",
    "asicboost": true,    // Keep this - ASICBoost is still supported!
    // Remove: "versionMask": "0x3fffe000"
}
```

## 3. Restart NOMP

After making these changes:

```bash
# If using PM2
pm2 restart nomp

# If using systemctl
sudo systemctl restart nomp

# Or however you manage your NOMP process
```

## What Changed?

1. **No More BIP 310 Negotiation**: The pool now accepts version-rolling without strict mask negotiation
2. **Simple Version Validation**: Only checks that version >= 4 (Bitcoin protocol minimum)
3. **Better Compatibility**: Works with MiningRigRentals and other services that don't properly implement BIP 310
4. **ASICBoost Still Works**: Miners can still use version rolling for optimization

## Testing

After restarting, your pool should:
- Accept shares from MiningRigRentals without "version rolling outside allowed mask" errors
- Still support ASICBoost for compatible miners
- Work with both rental services and direct miners

## Logs

You should see simplified logs like:
```
[Stratum] Client username.worker enabled version-rolling (no mask negotiation)
```

Instead of the old complex mask negotiation logs.