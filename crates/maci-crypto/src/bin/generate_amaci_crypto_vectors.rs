use maci_crypto::hashing::poseidon;
use maci_crypto::{encrypt_odevity, gen_keypair, rerandomize_ciphertext, Ciphertext};
use num_bigint::BigUint;
use serde_json::json;

fn biguint_to_hex(n: &BigUint) -> String {
    n.to_string()
}

fn main() {
    println!("Generating AMACI core crypto test vectors...\n");

    // Test configuration (matching TypeScript test)
    let operator_seed = BigUint::from(12345u64);
    let coord_keypair = gen_keypair(Some(operator_seed.clone()));
    let static_random_salt = BigUint::from(20040u64);

    let mut vectors = Vec::new();

    // === Test 1: genStaticRandomKey ===
    println!("Generating static random key vectors...");
    let indices = vec![1u64, 2u64, 100u64];
    let mut static_random_keys = serde_json::Map::new();

    for &index in &indices {
        let random_key = poseidon(&vec![
            coord_keypair.priv_key.clone(),
            static_random_salt.clone(),
            BigUint::from(index),
        ]);
        static_random_keys.insert(index.to_string(), json!(biguint_to_hex(&random_key)));
    }

    vectors.push(json!({
        "name": "amaci_static_random_keys",
        "description": "Static random key generation for AMACI deactivate flow",
        "test_type": "amaci_static_random_key",
        "data": {
            "operator_seed": biguint_to_hex(&operator_seed),
            "operator_priv_key": biguint_to_hex(&coord_keypair.priv_key),
            "operator_pub_key": {
                "x": biguint_to_hex(&coord_keypair.pub_key[0]),
                "y": biguint_to_hex(&coord_keypair.pub_key[1])
            },
            "operator_formatted_priv_key": biguint_to_hex(&coord_keypair.formated_priv_key),
            "salt": biguint_to_hex(&static_random_salt),
            "keys": static_random_keys
        }
    }));

    // === Test 2: encryptOdevity (even/active) ===
    println!("Generating encryptOdevity (even) vector...");
    let random_key_1 = poseidon(&vec![
        coord_keypair.priv_key.clone(),
        static_random_salt.clone(),
        BigUint::from(1u64),
    ]);

    let even_ct = encrypt_odevity(false, &coord_keypair.pub_key, Some(random_key_1.clone()))
        .expect("Encryption failed");

    vectors.push(json!({
        "name": "amaci_encrypt_even",
        "description": "encryptOdevity with isOdd=false (active status)",
        "test_type": "amaci_encrypt",
        "data": {
            "is_odd": false,
            "pub_key": {
                "x": biguint_to_hex(&coord_keypair.pub_key[0]),
                "y": biguint_to_hex(&coord_keypair.pub_key[1])
            },
            "random_key": biguint_to_hex(&random_key_1),
            "ciphertext": {
                "c1": {
                    "x": biguint_to_hex(&even_ct.c1[0]),
                    "y": biguint_to_hex(&even_ct.c1[1])
                },
                "c2": {
                    "x": biguint_to_hex(&even_ct.c2[0]),
                    "y": biguint_to_hex(&even_ct.c2[1])
                },
                "x_increment": biguint_to_hex(&even_ct.x_increment)
            }
        }
    }));

    // === Test 3: encryptOdevity (odd/deactivated) ===
    println!("Generating encryptOdevity (odd) vector...");
    let random_key_2 = poseidon(&vec![
        coord_keypair.priv_key.clone(),
        static_random_salt.clone(),
        BigUint::from(2u64),
    ]);

    let odd_ct = encrypt_odevity(true, &coord_keypair.pub_key, Some(random_key_2.clone()))
        .expect("Encryption failed");

    vectors.push(json!({
        "name": "amaci_encrypt_odd",
        "description": "encryptOdevity with isOdd=true (deactivated status)",
        "test_type": "amaci_encrypt",
        "data": {
            "is_odd": true,
            "pub_key": {
                "x": biguint_to_hex(&coord_keypair.pub_key[0]),
                "y": biguint_to_hex(&coord_keypair.pub_key[1])
            },
            "random_key": biguint_to_hex(&random_key_2),
            "ciphertext": {
                "c1": {
                    "x": biguint_to_hex(&odd_ct.c1[0]),
                    "y": biguint_to_hex(&odd_ct.c1[1])
                },
                "c2": {
                    "x": biguint_to_hex(&odd_ct.c2[0]),
                    "y": biguint_to_hex(&odd_ct.c2[1])
                },
                "x_increment": biguint_to_hex(&odd_ct.x_increment)
            }
        }
    }));

    // === Test 4: rerandomize (even) ===
    println!("Generating rerandomize (even) vectors...");
    let rerandom_vals = vec![77777u64, 88888u64, 99999u64];
    for &rerandom_val in &rerandom_vals {
        let rerandomized = rerandomize_ciphertext(
            &coord_keypair.pub_key,
            &even_ct,
            Some(BigUint::from(rerandom_val)),
        )
        .expect("Rerandomization failed");

        vectors.push(json!({
            "name": format!("amaci_rerandomize_even_{}", rerandom_val),
            "description": format!("Rerandomize even ciphertext with randomVal={}", rerandom_val),
            "test_type": "amaci_rerandomize",
            "data": {
                "pub_key": {
                    "x": biguint_to_hex(&coord_keypair.pub_key[0]),
                    "y": biguint_to_hex(&coord_keypair.pub_key[1])
                },
                "original_ciphertext": {
                    "c1": {
                        "x": biguint_to_hex(&even_ct.c1[0]),
                        "y": biguint_to_hex(&even_ct.c1[1])
                    },
                    "c2": {
                        "x": biguint_to_hex(&even_ct.c2[0]),
                        "y": biguint_to_hex(&even_ct.c2[1])
                    },
                    "x_increment": biguint_to_hex(&even_ct.x_increment)
                },
                "random_val": biguint_to_hex(&BigUint::from(rerandom_val)),
                "rerandomized": {
                    "d1": {
                        "x": biguint_to_hex(&rerandomized.c1[0]),
                        "y": biguint_to_hex(&rerandomized.c1[1])
                    },
                    "d2": {
                        "x": biguint_to_hex(&rerandomized.c2[0]),
                        "y": biguint_to_hex(&rerandomized.c2[1])
                    },
                    "x_increment": biguint_to_hex(&rerandomized.x_increment)
                }
            }
        }));
    }

    // === Test 5: rerandomize (odd) ===
    println!("Generating rerandomize (odd) vectors...");
    let rerandom_vals = vec![11111u64, 22222u64, 33333u64];
    for &rerandom_val in &rerandom_vals {
        let rerandomized = rerandomize_ciphertext(
            &coord_keypair.pub_key,
            &odd_ct,
            Some(BigUint::from(rerandom_val)),
        )
        .expect("Rerandomization failed");

        vectors.push(json!({
            "name": format!("amaci_rerandomize_odd_{}", rerandom_val),
            "description": format!("Rerandomize odd ciphertext with randomVal={}", rerandom_val),
            "test_type": "amaci_rerandomize",
            "data": {
                "pub_key": {
                    "x": biguint_to_hex(&coord_keypair.pub_key[0]),
                    "y": biguint_to_hex(&coord_keypair.pub_key[1])
                },
                "original_ciphertext": {
                    "c1": {
                        "x": biguint_to_hex(&odd_ct.c1[0]),
                        "y": biguint_to_hex(&odd_ct.c1[1])
                    },
                    "c2": {
                        "x": biguint_to_hex(&odd_ct.c2[0]),
                        "y": biguint_to_hex(&odd_ct.c2[1])
                    },
                    "x_increment": biguint_to_hex(&odd_ct.x_increment)
                },
                "random_val": biguint_to_hex(&BigUint::from(rerandom_val)),
                "rerandomized": {
                    "d1": {
                        "x": biguint_to_hex(&rerandomized.c1[0]),
                        "y": biguint_to_hex(&rerandomized.c1[1])
                    },
                    "d2": {
                        "x": biguint_to_hex(&rerandomized.c2[0]),
                        "y": biguint_to_hex(&rerandomized.c2[1])
                    },
                    "x_increment": biguint_to_hex(&rerandomized.x_increment)
                }
            }
        }));
    }

    // Output JSON
    let output = json!(vectors);
    println!("\n{}", serde_json::to_string_pretty(&output).unwrap());

    println!("\n✓ Generated {} AMACI crypto test vectors", vectors.len());
}
