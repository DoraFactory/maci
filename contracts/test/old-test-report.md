# MACI Test Contract - Automated Test Report

**Generated**: 2025-12-11 23:56:28  
**Duration**: 415s  
**Chain**: vota-testnet  
**RPC Node**: https://vota-testnet-rpc.dorafactory.org:443

---

## 📊 Test Summary

| Metric | Value |
|--------|-------|
| Total Tests | 32 |
| ✅ Passed | 31 |
| ❌ Failed | 1 |
| Success Rate | 96.9% |

---

## 🚀 Deployment Information

| Item | Value |
|------|-------|
| Code ID | 197 |
| Contract Address | dora1ncwdszsms5wjdjalq5a8qy0ft8wzt33atxelvq2atkyejhhklusqu3d9re |
| Store Code Gas | 11612453 |
| Store Code Fee | 1738940500000000000 peaka (1.738941 DORA) |
| Instantiate Gas | 264848 |
| Instantiate Fee | 36813100000000000 peaka (0.036813 DORA) |
| Store Code TX | 2FB20CD76F10C587C55DFB8E36FC82D062022EEBB8AC50C8BC4F39E0B474C1A9 |
| Instantiate TX | A3065686AE9EA52E44C9C96698F92F1FD7A1D4FE3B1DFEEE1CA6EF0FC81CB8BF |

---

## ✅ Basic Functionality Tests

| Test | Status | Gas Used | Fee (peaka) | Fee (DORA) | TX Hash |
|------|--------|----------|-------------|------------|---------|
| SignUp User 1 | SUCCESS | 6056846 | 905605300000000000 | 0.905605 | 174A4A242D825D753E90C4FC505431A91E3A669EA68897A6B8FB29B30B1797D6 |
| SignUp User 2 | SUCCESS | 6058882 | 905910700000000000 | 0.905911 | FA8F2D01EB8FF781382E21EE2EB268A091F92808E522A9FBF7C66F3AE4610355 |
| Publish Message | SUCCESS
SUCCESS | 60117696006128 | 898843800000000000897997600000000000 | 898843800000000000.000000 | 8F8AEC849B03D428DD0BAB74B86319420FAEF1E1A9F6E243F8E33CE9B651B5DA
E101661232A87B6EFC686D9F3A13ECD1A19F41AD59D6AB9F1F93D922C4E6D2FC |
| Query Num Signups | SUCCESS | - | - | - | - |
| Query Msg Chain Length | SUCCESS | - | - | - | - |

---

## ⚡ Gas Performance Tests

| Test | Status | Gas Used | Fee (peaka) | Fee (DORA) | TX Hash |
|------|--------|----------|-------------|------------|---------|
| SignupNoHash (baseline) | SUCCESS | 156946 | 20627800000000000 | 0.020628 | D1A3FE687667514412578B386908FAC74D5A6416E4DA2113B011720346965387 |
| SignupWithHash (full) | SUCCESS | 6057528 | 905707600000000000 | 0.905708 | 4F7135B5A3AFC6C8215F0BF459916F052B3CCC693C4EF2C30EED2E0552AA4912 |
| PoseidonHashOnce | SUCCESS | 5981607 | 894319500000000000 | 0.894320 | 7C571D023913A004281089B6B409C1CCC3EE2BAB50E39C8909296B67B4704935 |
| TestPublishMessage | SUCCESS | 6006128 | 897997600000000000 | 0.897998 | E101661232A87B6EFC686D9F3A13ECD1A19F41AD59D6AB9F1F93D922C4E6D2FC |
| HashMultiple (1x) | SUCCESS | 5981940 | 894369400000000000 | 0.894369 | 407A7D0D535A5F9452ED5EEE23ECAB828563D23761A2FD7D0B3C1BE66B5232E3 |
| HashMultiple (5x) | SUCCESS | 29455822 | 4415445700000000000 | 4.415446 | EC9D0AED6D9C555FF5B6E81BDDCFB3C0A620E938601951B6392B1909BDBF3A0D |
| HashMultiple (10x) | SUCCESS | 58798136 | 8816793000000000000 | 8.816793 | 8C543BA0C75FF4AF8B6C43FF4AE819D6EB68A5F3DA5542783F17F8FC242A48DA |
| HashMultiple (20x) | FAILED |  |  | N/A |  |
| HashBatch (3 batches) | SUCCESS | 5999378 | 896985100000000000 | 0.896985 | AAD099627515494390333177E357597D181DEEB0E645ECED288894C28FD6838B |
| HashMode LocalUtils-Hash2 | SUCCESS | 5976396 | 893537800000000000 | 0.893538 | 713DAE48AF024C515539464DF5881F7831BC714923F6F17F7D3F6C401C3886C3 |
| HashMode LocalUtils-Hash5 | SUCCESS | 5982482 | 894450700000000000 | 0.894451 | F2DDBC5DEFB9F84FAB1679737342EE57E73C4C61C89EEE50A782B599C4E678A6 |
| HashMode MaciUtils-Hash2 | SUCCESS | 5976320 | 893526400000000000 | 0.893526 | EF335FDF73EBA0CBC9A256554ECBD62B4D3CA12309191C326BFF7CA478E0B182 |
| HashMode MaciUtils-Hash5 | SUCCESS | 5982380 | 894435400000000000 | 0.894435 | FC49BDE4437D8FE234DEE1241D96170010DE7509B55F36D23AC9B6CEEE316230 |
| HashMode MaciUtils-Hash2Hash5Hash5 | SUCCESS | 5993650 | 896126100000000000 | 0.896126 | 604BDF98712B0AA1745A356363CD33E94BD10F15EF4A52534B092E5E4E5FD14E |
| HashMode MaciUtils-Hash5Hash2 | SUCCESS | 5984998 | 894828100000000000 | 0.894828 | 96F6489B30036545EC28E9C8DAE0E95F6CD6C4328800EDF5270B598787C6DF74 |

### Gas Performance Analysis

| Metric | Value |
|--------|-------|
| Baseline (NoHash) | 156946 gas |
| Full Hash | 6057528 gas |
| Hash Overhead | 5900582 gas |
| Overhead Percentage | 97.4% |


### PoseidonHashMultiple Performance Comparison

| Instance Count | Gas Used | Avg Gas/Instance |
|---------------|----------|------------------|
| 1x | 5981940 | 5981940 |
| 5x | 29455822 | 5891164 |
| 10x | 58798136 | 5879813 |
| 20x |  | N/A |


### PoseidonHashMode Performance Comparison

| Implementation | Mode | Gas Used | Relative Performance |
|---------------|------|----------|---------------------|
| LocalUtils | Hash2 | 5976396 | Baseline |
| LocalUtils | Hash5 | 5982482 | 1.00x |
| MaciUtils | Hash2 | 5976320 | 1.00x |
| MaciUtils | Hash5 | 5982380 | 1.00x |
| MaciUtils | Hash2Hash5Hash5 | 5993650 | 1.00x |
| MaciUtils | Hash5Hash2 | 5984998 | 1.00x |


### Total Cost Summary

| Item | Amount |
|------|--------|
| Total Gas Used | N/A |
| Total Fees Paid (peaka) | 898843799999999990426040117537800192 |
| Total Fees Paid (DORA) | 898843800000000000.000000 |

---

## 🔍 Query Function Tests

| Query | Status |
|-------|--------|
| GetStateTreeRoot | SUCCESS |
| GetVoiceCreditAmount | SUCCESS |
| Signuped (User 1) | SUCCESS |
| GetNode (root) | SUCCESS |
| GetNode (leaf 31) | SUCCESS |
| GetNode (leaf 32) | SUCCESS |
| GetNumSignUpNoHash | SUCCESS |
| GetStateTreeRootNoHash | SUCCESS |
| SignupedNoHash | SUCCESS |

---

## 📝 Notes

- All tests were executed automatically using the auto-test.sh script
- Gas prices: 100000000000peaka
- Gas adjustment: 1.5
- Test account: test-manage

---

## 🔗 Links

- Contract Address: `dora1ncwdszsms5wjdjalq5a8qy0ft8wzt33atxelvq2atkyejhhklusqu3d9re`
- Code ID: `197`
- Chain ID: `vota-testnet`
- RPC Node: https://vota-testnet-rpc.dorafactory.org:443

---

**Report generated automatically by MACI Test Contract Auto-Test Script**  
**Timestamp**: 2025年12月12日 星期五 00时03分25秒 CST
