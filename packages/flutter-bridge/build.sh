#!/bin/bash

echo "🚀 开始构建MACI Flutter桥接包..."

# 检查Node.js版本
node_version=$(node --version)
echo "Node.js版本: $node_version"

# 安装依赖
echo "📦 安装依赖..."
pnpm install

# 构建TypeScript桥接文件
echo "🔧 构建JavaScript桥接文件..."
pnpm run build

# 检查构建结果
if [ -f "dist/maci-bridge.js" ]; then
    echo "✅ 桥接文件构建成功: dist/maci-bridge.js"
    file_size=$(du -h dist/maci-bridge.js | cut -f1)
    echo "📊 文件大小: $file_size"
else
    echo "❌ 桥接文件构建失败"
    exit 1
fi

echo ""
echo "🎉 构建完成！"
echo ""
echo "下一步:"
echo "1. 将 dist/maci-bridge.js 复制到你的Flutter项目的 assets/maci/ 目录"
echo "2. 将 assets/maci-webview.html 复制到你的Flutter项目的 assets/maci/ 目录"
echo "3. 在Flutter项目的 pubspec.yaml 中添加 flutter_inappwebview 依赖"
echo "4. 参考 README.md 完成集成"
echo "" 