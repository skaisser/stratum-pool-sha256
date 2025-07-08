# Version Mask Configuration Guide

This guide explains how to configure version masks for ASICBoost/version rolling support in your stratum pool.

## Quick Start

To enable ASICBoost with maximum compatibility:

```javascript
const pool = Stratum.createPool({
    coin: {
        name: 'bitcoin',
        algorithm: 'sha256',
        asicboost: true  // Enable ASICBoost
    },
    versionMask: 0x3fffe000,  // Recommended for rental services
    // ... other options
});
```

## Understanding Version Masks

Version masks control which bits in the block version field miners can modify for ASICBoost optimization. The mask is a 32-bit hexadecimal value where:

- `1` bits = miners can modify these bits
- `0` bits = these bits must remain unchanged

### Common Version Masks

| Mask | Binary | Use Case |
|------|--------|----------|
| `0x3fffe000` | `0011 1111 1111 1111 1110 0000 0000 0000` | **Recommended** - Maximum compatibility with rental services |
| `0x1fffe000` | `0001 1111 1111 1111 1110 0000 0000 0000` | Standard BIP 320 mask |
| `0x0fffe000` | `0000 1111 1111 1111 1110 0000 0000 0000` | More restrictive |

## Configuration Options

### 1. Pool-Level Configuration

Set the default mask for your entire pool:

```javascript
const options = {
    versionMask: 0x3fffe000,  // Pool's allowed mask
    // ... other options
};
```

### 2. Per-Algorithm Configuration

Different algorithms might need different masks:

```javascript
const options = {
    coin: {
        name: 'bitcoin',
        algorithm: 'sha256',
        asicboost: true
    },
    versionMask: 0x3fffe000
};
```

## Troubleshooting Version Rolling Issues

### Issue: "version rolling outside allowed mask" errors

**Symptoms:**
- Shares rejected with error: `version rolling outside allowed mask`
- Errors show `invalid bits: 0x20000000` or similar

**Solution:**
Use a more permissive mask that includes bit 29 (0x20000000):

```javascript
versionMask: 0x3fffe000  // Includes bit 29 for MiningRigRentals compatibility
```

### Issue: "version too low" errors

**Symptoms:**
- Shares rejected with `version too low`
- Version shown as `0x0`

**Solution:**
The pool now automatically handles version 0x0 by using the job version. No configuration change needed.

## Mask Negotiation Process

1. **Pool sets allowed mask**: Your configured `versionMask`
2. **Miner requests mask**: Via `mining.configure` message
3. **Negotiation**: Pool uses intersection of both masks
4. **Result**: Miner can only use bits allowed by BOTH masks

Example:
- Pool mask: `0x3fffe000`
- Miner requests: `0x1fffe000`
- Negotiated: `0x1fffe000` (intersection)

## Best Practices

1. **Use `0x3fffe000` for public pools** - Maximum compatibility
2. **Monitor logs** - Check for version rolling errors
3. **Test with rental services** - Ensure MiningRigRentals/NiceHash work
4. **Document your mask** - Let miners know what's supported

## Advanced Configuration

### Custom Validation

For special requirements, you can modify the validation logic in `lib/jobManager.js`:

```javascript
// More lenient validation example
if (options.coin.asicboost && options.lenientVersionValidation) {
    // Custom validation logic
}
```

### Dynamic Mask Updates

Update miner masks on the fly:

```javascript
// In your pool management code
stratumServer.setVersionMask(clientId, newMask);
```

## Related Documentation

- [BIP 310 Compliance](../BIP_310_COMPLIANCE.md)
- [Custom Difficulty Configuration](../examples/difficulty-parser.js)