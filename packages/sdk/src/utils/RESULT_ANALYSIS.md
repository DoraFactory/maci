# 投票结果分析工具

针对 Quadratic Voting (QV) 设计的完整投票结果分析工具集。

## 核心功能

### 1. 基础解码
```typescript
import { analyzeComprehensiveTallyResults, formatTallyResults } from './utils/result';

// 从合约获取编码结果
const encodedResults = await contract.getAllResult();

// 一键完整分析
const analysis = analyzeComprehensiveTallyResults(encodedResults);

// 格式化输出
console.log(formatTallyResults(analysis));
```

### 2. 核心分析维度

#### 📊 票数排名 (Democratic View)
按投票数量排名，反映广泛支持度。

#### 🔥 强度排名 (Passion View)
按 voice credits 排名，识别少数但热情的支持。

**强度公式**: `intensity = v² / v`
- **Low (< 5)**: 广泛但弱的偏好
- **High (> 15)**: 少数人的强烈偏好

#### 📈 分布分析 (Health Check)
统计学方法评估投票质量：

| 指标 | 含义 | 健康范围 |
|------|------|---------|
| **基尼系数** | 不平等度 | < 0.3 |
| **HHI** | 集中度 | < 0.2 |
| **熵** | 多样性 | > 0.7 |
| **健康分数** | 综合评分 | > 80 |

## 工作原理

### QV 编码机制

电路中使用公式 `v * (v + MAX_VOTES)` 编码投票：

```
encoded = v² + v * MAX_VOTES
        = v² + v * 10^24

例如：7 票
encoded = 49 + 7 * 10^24
```

**双重信息**：
- `v * 10^24` → 投票权重（决定获胜者）
- `v²` → 消耗积分（衡量支持强度）

### 解码提取

```typescript
vote = encoded / 10^24        // 票数
voiceCredit = encoded % 10^24  // 积分 (v²)
```

### 为什么需要强度？

**场景**：DAO 资金分配投票

```
选项 A: 100 票, 1000 积分 → 强度 = 10  (广泛但不强烈)
选项 B: 20 票, 800 积分 → 强度 = 40   (少数但极度关心)
```

- **只看票数**：A 获胜 → 可能忽略 B 的核心需求
- **结合强度**：识别 B 是少数群体的关键利益

**推荐策略**：70% 按票数分配，30% 按强度分配

## 快速上手

### 基础用法

```typescript
const analysis = analyzeComprehensiveTallyResults(encodedResults);

// 获胜者
console.log(`Winner: Option ${analysis.winner.index}`);
console.log(`Votes: ${analysis.winner.votes}`);
console.log(`Intensity: ${analysis.winner.intensity}`);

// 健康检查
if (analysis.summary.healthScore < 60) {
  console.warn('⚠️  投票质量问题:', analysis.distribution.alerts);
}
```

### 双重视角

```typescript
// 视角 1: 民主（票数）
const popular = analysis.rankedByVotes[0];
console.log(`Most votes: Option ${popular.index}`);

// 视角 2: 热情（强度）
const passionate = analysis.rankedByIntensity[0];
console.log(`Most passionate: Option ${passionate.index}`);

// 如果不同 → 需要权衡
if (popular.index !== passionate.index) {
  console.log('💡 考虑混合分配策略');
}
```

### 异常检测

```typescript
const { distribution, summary } = analysis;

// 自动警报
if (distribution.alerts.length > 0) {
  distribution.alerts.forEach(alert => console.warn(alert));
}

// 关键指标
console.log(`Gini: ${distribution.giniCoefficient.toFixed(3)}`);  // < 0.3 ✓
console.log(`HHI: ${distribution.herfindahlIndex.toFixed(3)}`);   // < 0.2 ✓
console.log(`Health: ${summary.healthScore}/100`);                // > 80 ✓
```

## 主要函数

```typescript
// 完整分析（推荐）
analyzeComprehensiveTallyResults(encodedResults): ComprehensiveTallyResult

// 格式化输出
formatTallyResults(result): string

// 步骤化处理
decodeResults(encoded): VoteData[]
calculateIntensities(votes): IntensityData[]
rankByVotes(votes, ...): RankedOption[]
rankByIntensity(votes, ...): RankedOption[]
analyzeDistribution(votes): DistributionMetrics
```

## 关键指标

### 基尼系数 (Gini)
衡量不平等度，0 = 完全平等，1 = 完全不平等。
```
G = (2Σ(i·xi)) / (n·Σxi) - (n+1)/n
```

### 赫芬达尔指数 (HHI)
衡量集中度，越低越分散。
```
HHI = Σ(share_i)²
```

### 标准化熵 (Entropy)
衡量多样性，越高越多样。
```
H = -Σ(pi·log2(pi)) / log2(n)
```

### 健康分数
综合评分，考虑以上三个指标 + 集中度。

## 实际应用

### DAO 治理投票
- 主要决策：看票数
- 少数权益保护：参考强度排名
- 质量监控：健康分数

### 资金分配
- 70% 按票数（民主原则）
- 30% 按强度（激励机制）
- 异常检测：防止操纵

### 功能优先级
- 高票数 + 低强度 → Nice to have
- 低票数 + 高强度 → 核心用户痛点
- 高票数 + 高强度 → 优先级最高

## 注意事项

1. **强度不代表权重** - 仍然按票数决定，强度只是辅助信息
2. **极端强度需警惕** - 可能是操纵信号（intensity > 50）
3. **健康分数是指导** - 不是绝对标准，需结合场景判断
4. **分布指标有延迟** - 投票进行中时不够准确

## License

Apache-2.0

