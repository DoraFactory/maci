const INTRODUCTION_ITEMS = {
  'what-is-maci': 'MACI 投票系统',
  'key-features': 'AMACI 核心特性',
  'quick-start': '快速开始'
};

const PROTOCOL_ITEMS = {
  overview: 'AMACI 协议概览',
  'core-concepts': '三种注册方式',
  'privacy-protection': '身份匿名化',
  'amaci-privacy': 'Operator 视角分析',
  'message-flow': '消息流程',
  cryptography: '密码学机制'
};

const CONTRACTS_ITEMS = {
  architecture: '架构设计',
  registry: 'Operator 网络',
  amaci: 'AMACI 合约',
  workflow: '完整工作流程'
};

const SDK_ITEMS = {
  installation: '安装 SDK',
  'client-setup': '客户端初始化',
  'create-round': '创建投票轮次',
  'voting-guide': '投票操作指南',
  'query-api': '查询 API',
  advanced: '高级功能'
};

const EXAMPLES_ITEMS = {
  'basic-voting': '基础投票示例',
  'pre-addnewkey-round': '匿名投票示例'
};

const DOCS_ITEMS = {
  index: '概览',
  '---introduction-separator': {
    type: 'separator',
    title: '入门指南'
  },
  introduction: {
    title: '入门指南',
    items: INTRODUCTION_ITEMS
  },
  '---protocol-separator': {
    type: 'separator',
    title: '协议详解'
  },
  protocol: {
    title: '协议详解',
    items: PROTOCOL_ITEMS
  },
  '---contracts-separator': {
    type: 'separator',
    title: '合约设计'
  },
  contracts: {
    title: '合约设计',
    items: CONTRACTS_ITEMS
  },
  '---sdk-separator': {
    type: 'separator',
    title: 'SDK 使用指南'
  },
  sdk: {
    title: 'SDK 使用指南',
    items: SDK_ITEMS
  },
  '---examples-separator': {
    type: 'separator',
    title: '示例代码'
  },
  examples: {
    title: '示例代码',
    items: EXAMPLES_ITEMS
  },
  '---resources-separator': {
    type: 'separator',
    title: '资源'
  },
  navigation: '导航指南',
  tips: '使用技巧'
};

export default {
  docs: {
    type: 'page',
    title: '文档',
    items: DOCS_ITEMS
  },
  github: {
    title: 'GitHub',
    type: 'menu',
    items: {
      repo: {
        title: 'MACI Repository',
        href: 'https://github.com/DoraFactory/maci'
      },
      issues: {
        title: 'Issues',
        href: 'https://github.com/DoraFactory/maci/issues'
      }
    }
  }
};
