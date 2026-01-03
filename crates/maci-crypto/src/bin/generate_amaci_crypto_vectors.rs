use maci_crypto::hashing::poseidon;
use maci_crypto::keypair::Keypair;
use maci_crypto::{encrypt_odevity, gen_keypair, rerandomize_ciphertext};
use num_bigint::BigUint;
use serde_json::json;

fn biguint_to_hex(n: &BigUint) -> String {
    n.to_string()
}

fn main() {
    eprintln!("Generating AMACI core crypto test vectors...\n");

    // Test configuration (matching TypeScript test)
    let operator_seed = BigUint::from(12345u64);
    let coord_keypair = gen_keypair(Some(operator_seed.clone()));
    let static_random_salt = BigUint::from(20040u64);

    let mut vectors = Vec::new();

    // === Test 1: genStaticRandomKey ===
    eprintln!("Generating static random key vectors...");
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
    eprintln!("Generating encryptOdevity (even) vector...");
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
    eprintln!("Generating encryptOdevity (odd) vector...");
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
    eprintln!("Generating rerandomize (even) vectors...");
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
    eprintln!("Generating rerandomize (odd) vectors...");
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

    // === Test 6: genDeactivateRoot ===
    eprintln!("Generating genDeactivateRoot vectors...");

    // Create coordinator keypair for deactivate root generation
    let coordinator_seed = BigUint::from(54321u64);
    let coordinator_keypair = Keypair::from_priv_key(&coordinator_seed);

    // Create multiple account keypairs
    let account_seeds = vec![11111u64, 22222u64, 33333u64, 44444u64, 55555u64];
    let account_keypairs: Vec<_> = account_seeds
        .iter()
        .map(|&seed| gen_keypair(Some(BigUint::from(seed))))
        .collect();

    let accounts: Vec<_> = account_keypairs
        .iter()
        .map(|kp| kp.pub_key.clone())
        .collect();

    // Test with different state tree depths
    let test_depths = vec![2, 3, 4];

    for &state_tree_depth in &test_depths {
        eprintln!("  Testing with state_tree_depth={}", state_tree_depth);

        let (deactivates, root, leaves, tree) =
            coordinator_keypair.gen_deactivate_root(&accounts, state_tree_depth);

        // Serialize deactivates (Vec<Vec<BigUint>>)
        let deactivates_json: Vec<_> = deactivates
            .iter()
            .map(|deactivate| {
                json!({
                    "c1_x": biguint_to_hex(&deactivate[0]),
                    "c1_y": biguint_to_hex(&deactivate[1]),
                    "c2_x": biguint_to_hex(&deactivate[2]),
                    "c2_y": biguint_to_hex(&deactivate[3]),
                    "shared_key_hash": biguint_to_hex(&deactivate[4])
                })
            })
            .collect();

        // Serialize leaves
        let leaves_json: Vec<_> = leaves.iter().map(|leaf| biguint_to_hex(leaf)).collect();

        // Serialize account public keys
        let accounts_json: Vec<_> = accounts
            .iter()
            .map(|account| {
                json!({
                    "x": biguint_to_hex(&account[0]),
                    "y": biguint_to_hex(&account[1])
                })
            })
            .collect();

        vectors.push(json!({
            "name": format!("amaci_deactivate_root_depth_{}", state_tree_depth),
            "description": format!("Generate deactivate root with {} accounts and state_tree_depth={}", accounts.len(), state_tree_depth),
            "test_type": "amaci_deactivate_root",
            "data": {
                "coordinator_seed": biguint_to_hex(&coordinator_seed),
                "coordinator_pub_key": {
                    "x": biguint_to_hex(&coordinator_keypair.pub_key[0]),
                    "y": biguint_to_hex(&coordinator_keypair.pub_key[1])
                },
                "accounts": accounts_json,
                "state_tree_depth": state_tree_depth,
                "tree_depth": tree.depth,
                "tree_degree": tree.degree,
                "deactivates": deactivates_json,
                "leaves": leaves_json,
                "root": biguint_to_hex(&root)
            }
        }));
    }

    // === Test 7: genDeactivateRoot with single account ===
    eprintln!("Generating genDeactivateRoot with single account...");
    let single_account = vec![account_keypairs[0].pub_key.clone()];
    let (deactivates_single, root_single, leaves_single, tree_single) =
        coordinator_keypair.gen_deactivate_root(&single_account, 2);

    vectors.push(json!({
        "name": "amaci_deactivate_root_single_account",
        "description": "Generate deactivate root with single account",
        "test_type": "amaci_deactivate_root",
        "data": {
            "coordinator_seed": biguint_to_hex(&coordinator_seed),
            "coordinator_pub_key": {
                "x": biguint_to_hex(&coordinator_keypair.pub_key[0]),
                "y": biguint_to_hex(&coordinator_keypair.pub_key[1])
            },
            "accounts": vec![json!({
                "x": biguint_to_hex(&single_account[0][0]),
                "y": biguint_to_hex(&single_account[0][1])
            })],
            "state_tree_depth": 2,
            "tree_depth": tree_single.depth,
            "tree_degree": tree_single.degree,
            "deactivates": vec![json!({
                "c1_x": biguint_to_hex(&deactivates_single[0][0]),
                "c1_y": biguint_to_hex(&deactivates_single[0][1]),
                "c2_x": biguint_to_hex(&deactivates_single[0][2]),
                "c2_y": biguint_to_hex(&deactivates_single[0][3]),
                "shared_key_hash": biguint_to_hex(&deactivates_single[0][4])
            })],
            "leaves": vec![biguint_to_hex(&leaves_single[0])],
            "root": biguint_to_hex(&root_single)
        }
    }));

    // Output JSON
    let output = json!(vectors);
    println!("{}", serde_json::to_string_pretty(&output).unwrap());

    eprintln!("\n✓ Generated {} AMACI crypto test vectors", vectors.len());
}
