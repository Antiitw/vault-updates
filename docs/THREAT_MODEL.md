# Vault Threat Model

## Assets

1. **Encrypted Files**: Photos, videos, text stored in `~/.vault-data/files/`
2. **Database**: Metadata, notes, passwords in `~/.vault-data/vault.db`
3. **Master Key**: Derives all encryption keys
4. **User Password**: Protects the Master Key
5. **Thumbnails**: Preview images in `~/.vault-data/thumbnails/`

## Threat Actors

### 1. Remote Attacker (Network)
**Capability**: Exploit network services, man-in-the-middle
**Mitigation**: App runs offline, no network services exposed

### 2. Local Attacker (Same Machine)
**Capability**: Read files, run processes, access shared resources
**Mitigation**: File permissions 600/700, encrypted storage

### 3. Physical Attacker (Stolen Device)
**Capability**: Direct disk access, cold boot, hardware inspection
**Mitigation**: Full-disk encryption required (Vault does NOT encrypt the OS)

### 4. Malicious Software (Malware)
**Capability**: Execute code, read memory, keylog
**Mitigation**: Electron sandbox, input validation

### 5. Insider Threat (User Error)
**Capability**: Accidental deletion, weak password
**Mitigation**: Backups, lockout, minimum password length

## Threat Analysis

| # | Threat | Impact | Likelihood | Mitigation | Status |
|---|--------|--------|------------|------------|--------|
| 1 | Disk theft without FDE | HIGH | MEDIUM | Argon2id + AES-256-GCM | ✅ |
| 2 | Brute force password | HIGH | MEDIUM | Argon2id (256MB, 3 iter) + lockout (5 attempts, 5min) | ✅ |
| 3 | Password rollback attack | HIGH | LOW | HMAC-signed counter, monotonic | ✅ |
| 4 | Password change data loss | CRITICAL | HIGH | rotatePassword (same MK) | ✅ FIXED |
| 5 | XSS → Remote Code Execution | CRITICAL | MEDIUM | contextIsolation, sandbox, CSP | ✅ FIXED |
| 6 | Symlink path traversal | HIGH | LOW | validateFolderPath, resolved paths | ✅ |
| 7 | Race condition (TOCTOU) | MEDIUM | LOW | Atomic writes, validated paths | ✅ |
| 8 | Backup tampering | HIGH | LOW | Encrypted backups with derived key | ✅ |
| 9 | Lockout bypass | MEDIUM | HIGH | HMAC-signed state in auth.json | ✅ FIXED |
| 10 | Counter signature bypass | HIGH | LOW | HMAC-SHA256 with MK-derived key | ✅ FIXED |
| 11 | Memory extraction | HIGH | LOW | secureClear, minimal key lifetime | ⚠️ Limited by V8 |
| 12 | Swap to disk | MEDIUM | MEDIUM | OS-level FDE required | ⚠️ User responsibility |
| 13 | Core dump leak | HIGH | LOW | Disable core dumps | ⚠️ User responsibility |
| 14 | npm supply chain | HIGH | MEDIUM | npm audit, pinned versions | ⚠️ 20 vulns known |
| 15 | Electron CVE | HIGH | MEDIUM | Updated Electron, sandbox | ⚠️ Depends on updates |

## Security Properties

### Confidentiality
- All user data encrypted at rest with AES-256-GCM
- Key hierarchy prevents direct password-to-data derivation
- No plaintext secrets in logs or config files

### Integrity
- GCM auth tags detect tampering
- HMAC-signed counter detects rollback
- Atomic writes prevent partial corruption

### Availability
- Lockout prevents brute force (5 attempts, 5-minute cooldown)
- Anti-rollback prevents version downgrade
- Backup/restore capability

### Authentication
- Password-based with Argon2id key derivation
- WebAuthn optional (fingerprint)
- Lockout state signed to prevent manipulation

## Residual Risks

1. **V8 Memory Management**: Cannot guarantee secure buffer erasure
2. **Physical Attacks**: Requires full-disk encryption (not provided by Vault)
3. **Zero-Day Electron**: Sandbox mitigates but doesn't eliminate
4. **npm Dependencies**: 20 known vulnerabilities, requires regular audit
5. **User Password Quality**: Minimum 8 chars enforced, but no complexity rules

## Recommendations for Users

1. **Enable Full-Disk Encryption**: BitLocker (Windows), FileVault (macOS), LUKS (Linux)
2. **Use Strong Password**: 12+ characters with mixed case, numbers, symbols
3. **Regular Backups**: Use Vault's encrypted backup feature
4. **Keep Updated**: Install Vault updates promptly
5. **Lock Screen**: Always lock screen when leaving computer
6. **Disable Core Dumps**: `ulimit -c 0` on Linux, similar on other OS
