# Vault Cryptographic Specification

## Overview

Vault uses a two-layer key derivation architecture to protect user data. The master password never directly encrypts data; instead, it derives intermediate keys that protect the Master Key (MK).

## Key Hierarchy

```
Password
  │
  ▼
Argon2id(password, salt) → Key Encryption Key (KEK)
  │
  ▼
AES-256-GCM(KEK, IV) → Master Key (MK) [encrypted]
  │
  ▼
HKDF-SHA256(MK, info) → Subkeys (file, thumb, db, counter, verify)
```

## Parameters

### Argon2id (KEK Derivation)
- **Memory Cost**: 256 MB (262144 KiB)
- **Time Cost**: 3 iterations
- **Parallelism**: 4 threads
- **Salt Length**: 16 bytes (random)
- **Output Length**: 32 bytes

### AES-256-GCM (MK Encryption)
- **Key Length**: 32 bytes
- **IV Length**: 12 bytes (random)
- **Auth Tag Length**: 16 bytes
- **AAD**: None (MK wrapped only)

### HKDF-SHA256 (Subkey Derivation)
- **IKM**: Master Key (32 bytes)
- **Salt**: `vault-subkey-salt` (fixed)
- **Info Strings**:
  - `vault-file-key` → File encryption
  - `vault-thumb-key` → Thumbnail encryption
  - `vault-db-key` → Database encryption
  - `vault-counter-sign-v2` → Anti-rollback counter signing
  - `vault-verify` → Password verification
  - `vault-backup-key` → Backup encryption

## File Formats

### Auth File (`auth.json`)

```json
{
  "version": 4,
  "algorithm": "argon2id",
  "argon2": {
    "memoryCost": 262144,
    "timeCost": 3,
    "parallelism": 4
  },
  "salt": "<hex:16 bytes>",
  "mk_iv": "<hex:12 bytes>",
  "mk_encrypted": "<hex:encrypted MK>",
  "mk_auth_tag": "<hex:16 bytes>",
  "mk_verify": "<hex:32 bytes>",
  "created_at": "<ISO 8601>",
  "lockout": {
    "failedAttempts": 0,
    "lockoutUntil": 0,
    "signature": "<hex:HMAC-SHA256>"
  }
}
```

### Encrypted Files (v2, version=4)

```
Offset  Length  Description
0       1       Version (0x04)
1       1       IV length (0x0C = 12)
2       12      IV
14      16      Auth Tag
30      ...     Encrypted data
```

### Database (`vault.db`)

Same format as encrypted files. The entire SQLite database is encrypted as a single blob.

### Anti-Rollback Counter (`.vault_version`)

```json
{
  "version": 4,
  "counter": 123,
  "signature": "<hex:HMAC-SHA256>",
  "updated_at": "<ISO 8601>"
}
```

The counter is signed with `HMAC-SHA256(deriveSubKey(MK, "vault-counter-sign-v2"), counter_bytes)`.

## Password Rotation

**Critical**: Password rotation does NOT change the Master Key. It only re-encrypts the same MK with a new KEK derived from the new password.

```
Old Password → Old KEK → decrypt MK
New Password → New KEK → encrypt MK (same key)
```

This means:
- No file re-encryption needed
- No data loss risk
- Instant operation

## Migration (v1 → v2)

v1 used PBKDF2 with a different key hierarchy. Migration:
1. Decrypt files with old password (PBKDF2)
2. Re-encrypt with new MK (Argon2id)
3. Update auth.json
4. Sign counter with new MK

## Memory Protection Limitations

### What Works
- `secureClear()`: Overwrites buffers before release
- Short-lived key exposure: Keys are cleared immediately after use
- Minimal key caching: MK is held in memory only during active operations

### What Cannot Be Guaranteed
- **V8 Garbage Collector**: May have copied buffers before clearing
- **Swap to Disk**: OS may page sensitive memory to disk
- **Cold Boot Attacks**: DRAM retention after power loss
- **Memory Dumps**: Process memory can be read by privileged users
- **Core Dumps**: Crash dumps may contain sensitive data

### Recommendations
- Use full-disk encryption (BitLocker, FileVault, LUKS)
- Disable core dumps on the system
- Use secure boot to prevent physical attacks
- Lock screen when leaving computer unattended
