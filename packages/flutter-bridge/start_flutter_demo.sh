#!/bin/bash

echo "🚀 启动 MACI Bridge Flutter 示例..."

# 检查是否在正确的目录
if [ ! -f "package.json" ]; then
    echo "❌ 请在 flutter-bridge 目录运行此脚本"
    exit 1
fi

# 构建 MACI Bridge
echo "📦 构建 MACI Bridge..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ MACI Bridge 构建失败"
    exit 1
fi

# 复制构建产物到 Flutter assets
echo "📋 复制文件到 Flutter assets..."
mkdir -p flutter_maci_example/assets
cp dist/maci-bridge.js flutter_maci_example/assets/

# 进入 Flutter 项目目录
cd flutter_maci_example

# 安装 Flutter 依赖
echo "📦 安装 Flutter 依赖..."
flutter pub get

# 询问运行平台
echo "🎯 选择运行平台:"
echo "1) Chrome (推荐用于调试)"
echo "2) iOS 模拟器"
echo "3) macOS 桌面"
echo -n "请选择 (1-3): "
read choice

case $choice in
    1)
        echo "🌐 在 Chrome 中启动应用..."
        flutter run -d chrome
        ;;
    2)
        echo "📱 在 iOS 模拟器中启动应用..."
        flutter run -d ios
        ;;
    3)
        echo "🖥️ 在 macOS 桌面启动应用..."
        flutter run -d macos
        ;;
    *)
        echo "🌐 默认在 Chrome 中启动应用..."
        flutter run -d chrome
        ;;
esac

echo "✅ 应用启动完成！" 