# Protocol fee v2.2 升级与验证

目标：`46 / 0.048 / 0.121` DORA（`deactivate_fee` 保持 10）。  
只改链上 storage，**不需要** wasm migrate、code_id 升级、maci-api / world-maci 发版。

工作目录：`maci/packages/sdk`  
脚本：`npx tsx scripts/update_fee_config.ts`

---

## 结论：只跑这个脚本就够改 fee

`--apply` 会发 **两笔** `UpdateFeeConfig`：

| 合约 | 改什么 | 谁签 |
|---|---|---|
| Registry | `base / signup / message`（`deactivate` 原样写回） | Registry operator **或** admin |
| Api-SaaS | 只改镜像的 `base_fee` | Api-SaaS **admin**（和 Registry 不是同一个地址） |

缺任何一边都不完整：只改 Registry，SaaS 仍按 30 DORA 付创建费，**新建 round 会失败**。

不要只设 `OPERATOR_PRIVATE_KEY`。测试网 / 正式网两边 admin 都不同，脚本现在会校验地址，缺 `ADMIN_PRIVATE_KEY` 会直接退出。

默认不加 `--apply` 是 dry-run，只查询不广播。

---

## 链上现状（2026-08-19 查询）

两边 Registry 都还是 v2.0：`30 / 0.03 / 0.06 / 10`。

| | Testnet | Mainnet |
|---|---|---|
| Chain | `vota-testnet` | `vota-ash` |
| Registry | `dora13c8aecstyxrhax9znvvh5zey89edrmd2k5va57pxvpe3fxtfsfeqlhsjnd` | `dora1smg5qp5trjdkcekdjssqpjehdjf6n4cjss0clyvqcud3t3u3948s8rmgg4` |
| Api-SaaS | `dora16xj2yrh3snq8f2qvma9uzjd5m2qgvzaqjcqmeuweh73t29c4rhusxm9hq6` | `dora18cp32d885mwadm6gg49qrrqqe8y3vcyn0khlan55ajmhaknt5cyqgqwjzh` |
| Registry operator | `dora18yad4hpyljv79x62svf0hmelhqupld5ulzv7fm` | `dora1l8ptlxavtum53gcdhzl3sju5k9m5xxszx2f8ht` |
| Registry admin | 同上 | `dora1yu80rw3edxzc70sjunr5l7d8y7me0tnc2k8n3x` |
| Api-SaaS admin | `dora1d9gz33agudk89rxxw6kyxa7r8hcfzytqj9dvyz` | `dora1phy2m0p7sed2est3rcx5gmev6ewq66t47genj0` |
| Api-SaaS 余额 | ~905,524 DORA | ~54,552 DORA |

SaaS 余额足够覆盖 46 DORA / 新 round。两个签名账号都要有 gas（peaka）。

`.env` 里：

```
OPERATOR_PRIVATE_KEY=<Registry operator 或 admin 的 hex，可带 0x>
ADMIN_PRIVATE_KEY=<Api-SaaS admin 的 hex，可带 0x>
```

测试网 / 正式网如果用不同钥匙，切换网络时一起换，不要混用。

---

## 1. 测试网

老 round 已建好（投票到 **18:35 UTC+8**，请在结束前测完）：

```
OLD_ROUND_ADDRESS=dora1ku35dy3e3udnca7m24lmz0vczlcc25cqfr4dp7n3snvg9val378qlzrtm2
```

ticket 已写在 `.env` / `legacy-round.env`。冻结费率应是 `0.03 / 0.06`。

### 1.1 Dry-run

```bash
cd maci/packages/sdk
npx tsx scripts/update_fee_config.ts --network testnet
```

确认输出：`30 → 46`、`0.03 → 0.048`、`0.06 → 0.121`，以及上面两行签名地址。

### 1.2 Apply

```bash
npx tsx scripts/update_fee_config.ts --network testnet --apply
```

记下两条 tx：`Registry UpdateFeeConfig`、`Api-SaaS UpdateFeeConfig`。  
脚本会再查一次 Registry；SaaS 没有 `get_fee_config`，以 tx 成功为准。

### 1.3 验证新老 round

cwd 需要 `add-new-key_v3/9-4-3-125/addKey.wasm` 和 `addKey.zkey`。  
`.env` 用 testnet 的 `ADMIN_SECRET` / `AMACI_CLAIM_KEY`。

只查费率：

```bash
SKIP_VOTER_FLOW=1 npx tsx scripts/test_fee_config_old_vs_new_round.ts
```

完整（老 round 投票 + 新建 round + 投票）：

```bash
npx tsx scripts/test_fee_config_old_vs_new_round.ts
```

期望：

- Registry 已是 v2.2
- 老 round 仍是 `0.03 / 0.06`，voter 成功，SaaS 扣费约 **0.09**
- 新 round 是 `0.048 / 0.121`，voter 成功，SaaS 扣费约 **0.169**

中途只测老 round：`SKIP_NEW_ROUND=1`。

---

## 2. 正式网

测试网通过后再做。正式网还没有为这次升级单独建老 round。

可选：apply **之前**先建一条短窗口 round，后面才能做同样的冻结对比：

```bash
# .env 改成 mainnet 的 ADMIN_SECRET / AMACI_CLAIM_KEY
NETWORK=mainnet DURATION_HOURS=3 npx tsx scripts/create_legacy_fee_round.ts
```

把打印出的 `OLD_ROUND_ADDRESS` / `OLD_ROUND_TICKET` 写进 `.env`。  
不建也可以：apply 后只测新 round，再抽一条已有生产 round 查 `get_fee_config` 是否仍是创建时的旧值。

### 2.1 Dry-run

```bash
npx tsx scripts/update_fee_config.ts --network mainnet
```

确认签名人是：

- `OPERATOR_PRIVATE_KEY` → `dora1l8ptlxavtum53gcdhzl3sju5k9m5xxszx2f8ht` 或 `dora1yu80rw3edxzc70sjunr5l7d8y7me0tnc2k8n3x`
- `ADMIN_PRIVATE_KEY` → `dora1phy2m0p7sed2est3rcx5gmev6ewq66t47genj0`

### 2.2 Apply

```bash
npx tsx scripts/update_fee_config.ts --network mainnet --apply
```

### 2.3 验证

```bash
NETWORK=mainnet SKIP_VOTER_FLOW=1 npx tsx scripts/test_fee_config_old_vs_new_round.ts
NETWORK=mainnet npx tsx scripts/test_fee_config_old_vs_new_round.ts
```

没有老 round 时脚本会 skip 老 round，仍会建新 round 并对照当前 Registry。

---

## 不需要做的事

- 不升级 Registry / Api-SaaS / AMACI code_id
- 不发 maci-api、world-maci（它们走 viaSaas，`funds: []`，费用由 SaaS 按 round 冻结配置付）
- 不改平台 2× / 3× / 5× / 10× markup
- 不改 `deactivate_fee`

## 如果只成功了一半

Registry 已是 46，SaaS 还是 30：新建 round 会失败。用同一条脚本再 `--apply` 一次即可（Registry 会显示 already at target，只补 SaaS）。

回滚要把脚本里的 `TARGET` 改回 `30 / 0.03 / 0.06` 再 `--apply`。已创建的 round 费率不会跟着变。
