use anyhow::{bail, Context, Result};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use sha2::{Digest, Sha256};
use std::convert::TryInto;

pub struct MindPackageVerifier;

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
            Ok(_) => {
                println!("🔒 [CRYPTO PASS]: Mind signature verified successfully. Identity is authentic.");
                Ok(())
            }
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
        if clean_str.len() % 2 != 0 {
            bail!("Odd hex length");
        }
        (0..clean_str.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&clean_str[i..i + 2], 16).map_err(|e| anyhow::anyhow!(e)))
            .collect()
    }
}
