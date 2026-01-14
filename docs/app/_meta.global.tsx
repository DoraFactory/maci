import {MetaRecord} from "nextra";

const INTRODUCTION_ITEMS: MetaRecord = {
    'what-is-maci': 'MACI 是什么',
    'key-features': '核心特性',
    'quick-start': '快速开始',
}

const PROTOCOL_ITEMS: MetaRecord = {
    'overview': '协议概览',
    'core-concepts': '核心概念',
    'message-flow': '消息流程',
    'cryptography': '密码学机制',
    'privacy-protection': '隐私保护机制',
}

const CONTRACTS_ITEMS: MetaRecord = {
    'architecture': '架构设计',
    'registry': 'Registry 合约',
    'amaci': 'AMACI 合约',
    'workflow': '工作流程',
}

const SDK_ITEMS: MetaRecord = {
    'installation': '安装',
    'client-setup': '客户端设置',
    'create-round': '创建轮次',
    'voting-guide': '投票指南',
    'query-api': '查询 API',
    'advanced': '高级功能',
}

const EXAMPLES_ITEMS: MetaRecord = {
    'basic-voting': '基础投票',
    'oracle-round': 'Oracle 轮次',
}

export default {
    index: {
        type: 'page',
        title: '首页',
        theme: {
            layout: 'full',
            toc: false,
            timestamp: false,
        }
    },
    introduction: {
        type: 'page',
        title: '入门指南',
        items: INTRODUCTION_ITEMS
    },
    protocol: {
        type: 'page',
        title: '协议详解',
        items: PROTOCOL_ITEMS
    },
    contracts: {
        type: 'page',
        title: '合约设计',
        items: CONTRACTS_ITEMS
    },
    sdk: {
        type: 'page',
        title: 'SDK 使用指南',
        items: SDK_ITEMS
    },
    examples: {
        type: 'page',
        title: '示例代码',
        items: EXAMPLES_ITEMS
    },
    github: {
        title: 'GitHub',
        type: 'menu',
        items: {
            repo: {
                title: 'MACI Repository',
                href: 'https://github.com/DoraFactory/maci',
            },
            issues: {
                title: 'Issues',
                href: 'https://github.com/DoraFactory/maci/issues'
            }
        }
    },
}