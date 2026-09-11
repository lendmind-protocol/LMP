use anyhow::{bail, Context, Result};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use sha2::{Digest, Sha256};
use std::{convert::TryInto, fs, path::Path};

pub struct MindPackageVerifier;

fn normalized_key(value: &str) -> String {
    value.trim().trim_start_matches("0x").to_ascii_lowercase()
}

/// Check a newline-delimited, reviewable list of revoked public keys.
pub fn public_key_is_revoked(public_key_hex: &str, revocation_file: &Path) -> Result<bool> {
    let key = normalized_key(public_key_hex);
    let contents = fs::read_to_string(revocation_file).with_context(|| {
        format!(
            "failed to read revocation list {}",
            revocation_file.display()
        )
    })?;
    Ok(contents
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .any(|line| normalized_key(line) == key))
}

pub fn verify_package_signature_with_revocation(
    payload: &[u8],
    signature_hex: &str,
    public_key_hex: &str,
    revocation_file: Option<&Path>,
) -> Result<()> {
    if let Some(path) = revocation_file {
        if public_key_is_revoked(public_key_hex, path)? {
            bail!("🚨 [SECURITY REJECTION]: signing public key is revoked");
        }
    }
    MindPackageVerifier::verify_package_signature(payload, signature_hex, public_key_hex)
}

/// Returns the package's detached manifest signature state.
///
/// Unsigned packages remain usable in advisory workflows. A present but
/// malformed or non-verifying signature is never treated as unsigned.
pub fn package_signature_status(package_dir: &Path) -> Result<&'static str> {
    package_signature_status_with_revocation(package_dir, None)
}

pub fn package_signature_status_with_revocation(
    package_dir: &Path,
    revocation_file: Option<&Path>,
) -> Result<&'static str> {
    let manifest = package_dir.join("mind.json");
    let signature = package_dir.join("signatures/manifest.sig");
    if !signature.is_file() {
        return Ok("unsigned");
    }
    let signature_text = fs::read_to_string(&signature)?.trim().to_string();
    if signature_text.is_empty() || signature_text == "UNSIGNED" {
        return Ok("unsigned");
    }
    let key_path = package_dir.join("signatures/public-key.hex");
    if !key_path.is_file() {
        return Ok("invalid");
    }
    let key = fs::read_to_string(key_path)?.trim().to_string();
    Ok(
        if verify_package_signature_with_revocation(
            &fs::read(manifest)?,
            &signature_text,
            &key,
            revocation_file,
        )
        .and_then(|_| verify_key_rotation(package_dir, &key))
        .is_ok()
        {
            "verified"
        } else {
            "invalid"
        },
    )
}

fn verify_key_rotation(package_dir: &Path, current_key_hex: &str) -> Result<()> {
    let path = package_dir.join("signatures/key-rotation.json");
    if !path.is_file() {
        return Ok(());
    }
    let record: serde_json::Value = serde_json::from_slice(&fs::read(path)?)?;
    let previous = record
        .get("previousPublicKeyHex")
        .and_then(serde_json::Value::as_str)
        .context("key rotation is missing previousPublicKeyHex")?;
    let new_key = record
        .get("newPublicKeyHex")
        .and_then(serde_json::Value::as_str)
        .context("key rotation is missing newPublicKeyHex")?;
    let proof = record
        .get("proofHex")
        .and_then(serde_json::Value::as_str)
        .context("key rotation is missing proofHex")?;
    anyhow::ensure!(
        record.get("version") == Some(&serde_json::json!(1)),
        "unsupported key rotation version"
    );
    anyhow::ensure!(
        record.get("algorithm").and_then(serde_json::Value::as_str) == Some("Ed25519"),
        "unsupported key rotation algorithm"
    );
    anyhow::ensure!(
        normalized_key(new_key) == normalized_key(current_key_hex),
        "key rotation does not name the active public key"
    );
    let previous_bytes: [u8; 32] = hex::decode(previous)?
        .as_slice()
        .try_into()
        .context("invalid previous rotation key")?;
    let proof_bytes: [u8; 64] = hex::decode(proof)?
        .as_slice()
        .try_into()
        .context("invalid rotation proof")?;
    let verifying_key =
        VerifyingKey::from_bytes(&previous_bytes).context("invalid previous rotation key")?;
    verifying_key
        .verify(new_key.as_bytes(), &Signature::from_bytes(&proof_bytes))
        .context("key rotation proof does not verify")?;
    Ok(())
}

impl MindPackageVerifier {
    /// Generates a strict cryptographic SHA256 hash of a payload byte slice
    pub fn compute_sha256(payload: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(payload);
        format!("{:x}", hasher.finalize())
    }

    /// Verifies the authenticity of a downloaded mind manifest layer using Ed25519
    ///
    /// # Arguments
    /// * `payload` - The raw un-hashed bytes of the configuration file or binary layer
    /// * `signature_hex` - The hexadecimal string representing the Ed25519 signature
    /// * `public_key_hex` - The hexadecimal string representing the author's public identity key
    pub fn verify_package_signature(
        payload: &[u8],
        signature_hex: &str,
        public_key_hex: &str,
    ) -> Result<()> {
        // Decode hex parameters into lower-level binary byte spaces
        let public_key_bytes = hex::decode(public_key_hex)
            .with_context(|| "Failed to parse public key hex string representation.")?;

        let signature_bytes = hex::decode(signature_hex)
            .with_context(|| "Failed to parse signature hex string representation.")?;

        // Construct Dalek cryptosystem primitives from byte maps
        let public_key_array: [u8; 32] =
            public_key_bytes.as_slice().try_into().with_context(|| {
                "Invalid Ed25519 public key byte allocation length (must be 32 bytes)."
            })?;

        let verifying_key = VerifyingKey::from_bytes(&public_key_array)
            .with_context(|| "Failed to instantiate an Ed25519 VerifyingKey framework node.")?;

        let signature_array: [u8; 64] = signature_bytes
            .as_slice()
            .try_into()
            .with_context(|| "Invalid Ed25519 signature allocation length (must be 64 bytes).")?;

        let signature = Signature::from_bytes(&signature_array);

        // Perform clear algebraic verification directly across the signature payload
        match verifying_key.verify(payload, &signature) {
            Ok(_) => Ok(()),
            Err(_) => {
                bail!("🚨 [SECURITY REJECTION]: Cryptographic signature verification failed! This payload has been tampered with or is unsigned!");
            }
        }
    }
}

// Inline helper module to simulate hex encoding/decoding mechanics for standalone library compilation
mod hex {
    use anyhow::{bail, Result};

    pub fn decode(hex_str: &str) -> Result<Vec<u8>> {
        let clean_str = hex_str.strip_prefix("0x").unwrap_or(hex_str);
        if !clean_str.len().is_multiple_of(2) {
            bail!("Odd hex length");
        }
        (0..clean_str.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&clean_str[i..i + 2], 16).map_err(|e| anyhow::anyhow!(e)))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::{
        public_key_is_revoked, verify_key_rotation, verify_package_signature_with_revocation,
        MindPackageVerifier,
    };
    use ed25519_dalek::{Signer, SigningKey};
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn encode_hex(bytes: &[u8]) -> String {
        bytes.iter().map(|byte| format!("{byte:02x}")).collect()
    }

    #[test]
    fn rejects_any_payload_byte_tampering_including_trailing_space() {
        let signing_key = SigningKey::from_bytes(&[7u8; 32]);
        let verifying_key = signing_key.verifying_key();
        let payload = br#"{"name":"lending-mind"}"#;
        let signature = signing_key.sign(payload);
        let signature_hex = encode_hex(&signature.to_bytes());
        let public_key_hex = encode_hex(verifying_key.as_bytes());

        MindPackageVerifier::verify_package_signature(payload, &signature_hex, &public_key_hex)
            .expect("the original payload must verify");

        let mut changed_byte = payload.to_vec();
        changed_byte[2] = b'X';
        assert!(MindPackageVerifier::verify_package_signature(
            &changed_byte,
            &signature_hex,
            &public_key_hex,
        )
        .is_err());

        let mut trailing_space = payload.to_vec();
        trailing_space.push(b' ');
        assert!(MindPackageVerifier::verify_package_signature(
            &trailing_space,
            &signature_hex,
            &public_key_hex,
        )
        .is_err());
    }

    #[test]
    fn rejects_revoked_signing_keys_even_when_signature_is_valid() {
        let signing_key = SigningKey::from_bytes(&[8u8; 32]);
        let public_key = encode_hex(signing_key.verifying_key().as_bytes());
        let payload = br#"{\"id\":\"lmp:mind:test\"}"#;
        let signature = encode_hex(&signing_key.sign(payload).to_bytes());
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("lmp-revoked-{suffix}.keys"));
        fs::write(&path, format!("# compromised key\n0x{public_key}\n")).expect("write list");
        assert!(public_key_is_revoked(&public_key, &path).expect("read list"));
        assert!(verify_package_signature_with_revocation(
            payload,
            &signature,
            &public_key,
            Some(&path)
        )
        .is_err());
        fs::remove_file(path).expect("remove list");
    }

    #[test]
    fn verifies_authenticated_key_rotation_and_rejects_tampering() {
        let old = SigningKey::from_bytes(&[11u8; 32]);
        let next = SigningKey::from_bytes(&[12u8; 32]);
        let previous = encode_hex(old.verifying_key().as_bytes());
        let new_key = encode_hex(next.verifying_key().as_bytes());
        let proof = encode_hex(&old.sign(new_key.as_bytes()).to_bytes());
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let package = std::env::temp_dir().join(format!("lmp-rotation-{suffix}"));
        fs::create_dir_all(package.join("signatures")).expect("create package");
        let record = serde_json::json!({
            "version": 1,
            "algorithm": "Ed25519",
            "previousPublicKeyHex": previous,
            "newPublicKeyHex": new_key,
            "proofHex": proof
        });
        fs::write(
            package.join("signatures/key-rotation.json"),
            serde_json::to_vec(&record).expect("serialize rotation"),
        )
        .expect("write rotation");
        verify_key_rotation(&package, &new_key).expect("rotation should verify");
        let tampered = serde_json::json!({
            "version": 1,
            "algorithm": "Ed25519",
            "previousPublicKeyHex": previous,
            "newPublicKeyHex": new_key,
            "proofHex": format!("{proof}00")
        });
        fs::write(
            package.join("signatures/key-rotation.json"),
            serde_json::to_vec(&tampered).expect("serialize tampered rotation"),
        )
        .expect("write tampered rotation");
        assert!(verify_key_rotation(&package, &new_key).is_err());
        fs::remove_dir_all(package).expect("remove package");
    }
}
